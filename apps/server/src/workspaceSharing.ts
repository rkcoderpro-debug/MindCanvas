import { createHash, createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Router, raw, type Request, type Response } from "express";
import { z } from "zod";
import { requireUser } from "./auth.js";
import { config } from "./config.js";

const maxFile = 40*1024*1024, maxBoard = 32*1024*1024;
const tokenSchema = z.string().regex(/^[a-f0-9]{48}$/);
const id = z.string().uuid();
const kind = z.enum(["file","folder","canvas","quiz","flashcard"]);
const role = z.enum(["viewer","editor"]);
const email = z.string().trim().toLowerCase().email().max(254);
const otp = z.string().regex(/^[0-9]{6}$/);
const bodySchema = z.object({ token:tokenSchema, kind:kind.optional(), id:id.optional() }).strict()
  .refine(value => Boolean(value.kind) === Boolean(value.id));
const accessSchema = z.object({token:tokenSchema,kind,id}).strict();
const shareRef = z.object({kind,id}).strict();
const keyValue = () => randomBytes(24).toString("hex");
const digest = (input: string) => createHash("sha256").update(input).digest("hex");
const plain = (max: number) => z.string().trim().min(1).max(max);
const bucket = "workspace-files";
const emptyProof = (req: Request) => {
  const proof = tokenSchema.safeParse(req.header("X-Share-Proof"));
  return proof.success ? digest(proof.data) : null;
};
class ShareError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
function failure(res: Response,error: unknown) {
  if (res.headersSent) { res.destroy(); return; }
  if (error instanceof ShareError) return res.status(error.status).json({ error:error.code });
  if (error instanceof z.ZodError) return res.status(400).json({error:"SHARE_INVALID"});
  return res.status(503).json({error:"SHARE_UNAVAILABLE"});
}
const service = () => {
  const key = config.SUPABASE_SERVICE_ROLE_KEY?.trim(), url = config.SUPABASE_URL?.replace(/\/$/,"");
  if (!url || !key) throw new ShareError(503,"SHARE_UNAVAILABLE");
  return { url, key, headers: { apikey:key,...(key.startsWith("sb_secret_") ? {} : { Authorization:`Bearer ${key}` }) } };
};
type Route = (req: Request,res: Response) => unknown | Promise<unknown>;
const route = (handler: Route) => async (req: Request,res: Response) => {
  try { await handler(req,res); } catch (error) { failure(res,error); }
};
async function rpc<T>(name: string, args: Record<string,unknown>): Promise<T> {
  const {url,headers} = service();
  const response = await fetch(`${url}/rest/v1/rpc/${name}`,{
    method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify(args),signal:AbortSignal.timeout(25000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message = result?.message;
    if (message === "SHARE_FORBIDDEN") throw new ShareError(404,message);
    if (message === "SHARE_CONFLICT") throw new ShareError(409,message);
    if (message === "SHARE_RATE") throw new ShareError(429,message);
    if (message === "SHARE_INVALID" || message === "WORKSPACE_FOLDER_PARENT" || result?.code === "23514") throw new ShareError(400,"SHARE_INVALID");
    throw new ShareError(503,"SHARE_UNAVAILABLE");
  }
  return result as T;
}
const actors = (req: Request,token: string) => ({p_actor:req.userId ?? null,p_token:token,p_proof:emptyProof(req)});
const optionalUser = (req: Request,res: Response,next: () => void) => {
  if (req.header("Authorization")) return requireUser(req,res,next);
  next();
};
const storagePath = (owner: string, object: string) => `${id.parse(owner)}/${id.parse(object)}`;
async function removeObject(path: string) {
  const {url,headers} = service();
  await fetch(`${url}/storage/v1/object/${bucket}`,{method:"DELETE",headers:{...headers,"Content-Type":"application/json"},
    body:JSON.stringify({prefixes:[path]}),signal:AbortSignal.timeout(8000)}).catch(() => undefined);
}
async function storeObject(path: string, bytes: Buffer) {
  const {url,headers} = service();
  const response = await fetch(`${url}/storage/v1/object/${bucket}/${path}`,{method:"POST",headers:{...headers,
    "Content-Type":"application/octet-stream","Cache-Control":"no-store","x-upsert":"false"},
    body:bytes as unknown as BodyInit,signal:AbortSignal.timeout(60000)});
  if (!response.ok) throw new ShareError(503,"SHARE_FILE_STORAGE");
}
function mailConfig() {
  const key=config.RESEND_API_KEY?.trim(), from=config.SHARE_EMAIL_FROM?.trim();
  if (!key || !from || !config.WEB_ORIGIN || !config.SHARE_EMAIL_SECRET?.trim()) throw new ShareError(503,"SHARE_EMAIL_DISABLED");
  return {key,from,url:new URL(config.WEB_ORIGIN),secret:config.SHARE_EMAIL_SECRET.trim()};
}
type Mail = { email:string; title:string; role:"viewer"|"editor" };
async function sendMail(to: string, subject: string, text: string) {
  const {key,from} = mailConfig();
  const response = await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
    body:JSON.stringify({from,to:[to],subject,text}),signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw new ShareError(503,"SHARE_EMAIL_FAILED");
}
const codeHash = (token: string,code: string) => createHmac("sha256",mailConfig().secret).update(token).update(":").update(code).digest("hex");
const roleLabel = (value: Mail["role"]) => value === "editor" ? "Người chỉnh sửa" : "Người xem";
const uploadOps = z.enum(["replace","add-file","attach"]);
const quizQuestion = z.object({id:z.string().min(1).max(200).optional(),prompt:plain(8000),options:z.array(plain(2000)).length(4)
    .refine(options=>new Set(options.map(x=>x.toLowerCase())).size===4),
  correctIndex:z.number().int().min(0).max(3),explanation:z.string().max(8000).optional()}).strip();
const board = z.object({id,title:plain(120),viewport:z.object({x:z.number().finite(),y:z.number().finite(),scale:z.number().positive().finite()}),
  a4:z.object({mode:z.enum(["separate","continuous"]),paper:z.enum(["plain","ruled","grid"]),pages:z.array(z.object({id:z.string(),text:z.string().max(30000),flows:z.boolean().optional()})).min(1).max(200)}).optional(),
  nodes:z.array(z.record(z.unknown())).max(6000),texts:z.array(z.record(z.unknown())).max(6000),drawings:z.array(z.record(z.unknown())).max(6000),
  media:z.array(z.record(z.unknown())).max(1000),embeds:z.array(z.record(z.unknown())).max(1000),edges:z.array(z.record(z.unknown())).max(6000),
  shapes:z.array(z.record(z.unknown())).max(6000)}).passthrough();

let activeUploads=0;
function limitRaw(_req:Request,res:Response,next:()=>void) {
  if(activeUploads>=2){failure(res,new ShareError(429,"SHARE_BUSY"));return;}
  activeUploads++;
  let released=false;
  const release=()=>{if(!released){released=true;activeUploads--;}};
  res.once("finish",release);res.once("close",release);
  next();
}
export const workspaceSharing = Router();
workspaceSharing.use((_req,res,next)=>{res.set({"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"});next();});
workspaceSharing.post("/manage",requireUser,route(async(req,res)=>{
  const item=shareRef.extend({op:z.enum(["list","set","remove"]),email:z.union([email,z.literal("")]).optional(),role:role.optional()}).parse(req.body);
  res.json(await rpc("ws_share_manage",{p_actor:req.userId,p_kind:item.kind,p_id:item.id,p_op:item.op,
    p_email:item.email ?? "",p_role:item.role ?? "viewer",p_token:item.op==="set"?keyValue():null}));
}));
workspaceSharing.get("/received",requireUser,route(async(req,res)=>{res.json(await rpc("ws_share_received",{p_actor:req.userId}));}));
workspaceSharing.post("/open",optionalUser,route(async(req,res)=>{
  const input=bodySchema.parse(req.body);
  res.json(await rpc("ws_share_read",{...actors(req,input.token),p_kind:input.kind ?? null,p_id:input.id ?? null}));
}));
workspaceSharing.post("/submit",optionalUser,route(async(req,res)=>{
  const input=accessSchema.extend({revision:plain(64),answers:z.array(z.number().int().min(0).max(3).nullable()).max(100)}).parse(req.body);
  res.json(await rpc("ws_share_read",{...actors(req,input.token),p_kind:input.kind,p_id:input.id,p_op:"submit",p_payload:{revision:input.revision,answers:input.answers}}));
}));
workspaceSharing.post("/invite",requireUser,route(async(req,res)=>{
  const {token}=z.object({token:tokenSchema}).strict().parse(req.body);
  const {url}=mailConfig();
  const data=await rpc<Mail>("ws_share_mail",{p_token:token,p_actor:req.userId,p_op:"invite"});
  url.search=""; url.hash=`share=${token}`;
  await sendMail(data.email,"Lời mời chia sẻ MindCanvas",`Bạn được mời với quyền ${roleLabel(data.role)}: ${data.title}\n\n${url.href}\n\n${data.role==="editor"?"Đăng nhập bằng email nhận lời mời để chỉnh sửa.":"Mở liên kết và xác minh email để xem. Bạn không cần tạo tài khoản."}`);
  res.json({ok:true});
}));
workspaceSharing.post("/challenge",route(async(req,res)=>{
  const {token}=z.object({token:tokenSchema}).strict().parse(req.body);
  const code=randomInt(0,1_000_000).toString().padStart(6,"0");
  const data=await rpc<Mail>("ws_share_mail",{p_token:token,p_actor:null,p_op:"challenge",p_code:codeHash(token,code)});
  await sendMail(data.email,"Mã xác minh MindCanvas",`Mã để xem nội dung được chia sẻ: ${code}. Mã hết hạn sau 10 phút.`);
  res.json({ok:true});
}));
workspaceSharing.post("/verify",route(async(req,res)=>{
  const {token,code}=z.object({token:tokenSchema,code:otp}).strict().parse(req.body);
  const proof=keyValue();
  const data=await rpc<{ok:boolean}>("ws_share_mail",{p_token:token,p_actor:null,p_op:"verify",p_code:codeHash(token,code),p_proof:digest(proof)});
  if (!data.ok) throw new ShareError(400,"SHARE_CODE");
  res.json({proof});
}));
workspaceSharing.post("/attachments",requireUser,route(async(req,res)=>{
  const {id:canvas}=z.object({id}).strict().parse(req.body);
  res.json(await rpc("ws_share_attachments",{p_actor:req.userId,p_canvas:canvas}));
}));
workspaceSharing.post("/folder-attachments",requireUser,route(async(req,res)=>{
  const {id:folder}=z.object({id}).strict().parse(req.body);
  res.json(await rpc("ws_share_folder_attachments",{p_actor:req.userId,p_folder:folder}));
}));
workspaceSharing.post("/asset",optionalUser,route(async(req,res)=>{
  const input=accessSchema.extend({digest:z.string().regex(/^[a-f0-9]{64}$/)}).parse(req.body);
  if (input.kind!=="canvas") throw new ShareError(400,"SHARE_INVALID");
  const permission=await rpc<{ok?:boolean}>("ws_share_read",
    {...actors(req,input.token),p_kind:"canvas",p_id:input.id,p_op:"asset",p_payload:{digest:input.digest}});
  if (!permission.ok) throw new ShareError(404,"SHARE_FORBIDDEN");
  const {url,headers}=service();
  const upstream=await fetch(`${url}/storage/v1/object/authenticated/canvas-media-private/${input.id}/${input.digest}`,
    {headers,signal:AbortSignal.timeout(90000)});
  if (!upstream.ok || !upstream.body) throw new ShareError(404,"SHARE_FILE_MISSING");
  res.type("application/octet-stream");
  await pipeline(Readable.fromWeb(upstream.body as unknown as Parameters<typeof Readable.fromWeb>[0]),res);
}));
workspaceSharing.post("/download",optionalUser,route(async(req,res)=>{
  const input=bodySchema.parse(req.body);
  const object=await rpc<{owner?:string;object?:string;title?:string;size?:number}>("ws_share_read",
    {...actors(req,input.token),p_kind:input.kind ?? null,p_id:input.id ?? null,p_op:"download"});
  if (!object.owner || !object.object || !object.title) throw new ShareError(404,"SHARE_FORBIDDEN");
  const {url,headers}=service();
  const upstream=await fetch(`${url}/storage/v1/object/authenticated/${bucket}/${storagePath(object.owner,object.object)}`,
    {headers,signal:AbortSignal.timeout(90000)});
  if (!upstream.ok || !upstream.body) throw new ShareError(404,"SHARE_FILE_MISSING");
  res.type("application/octet-stream");
  res.attachment(object.title);
  res.type("application/octet-stream");
  await pipeline(Readable.fromWeb(upstream.body as unknown as Parameters<typeof Readable.fromWeb>[0]),res);
}));
workspaceSharing.post("/edit",requireUser,route(async(req,res)=>{
  const input=accessSchema.extend({op:z.enum(["mkdir","rename","card","quiz"]),payload:z.unknown()}).parse(req.body);
  let payload:unknown;
  if(input.op==="card") payload=z.object({id:id.optional(),revision:plain(64).optional(),front:plain(20000),back:plain(20000)}).strict().parse(input.payload);
  else if(input.op==="quiz") payload=z.object({title:plain(200),description:z.string().max(1000),revision:plain(64),questions:z.array(quizQuestion).min(1).max(100)}).strict().parse(input.payload);
  else payload=z.object({title:plain(input.kind==="file"?255:input.kind==="flashcard"?120:80)}).strict().parse(input.payload);
  res.json(await rpc("ws_share_write",{p_token:input.token,p_actor:req.userId,p_kind:input.kind,p_id:input.id,p_op:input.op,p:payload}));
}));
workspaceSharing.post("/canvas",requireUser,limitRaw,raw({limit:maxBoard,type:"application/octet-stream"}),route(async(req,res)=>{
  if (!Buffer.isBuffer(req.body)) throw new ShareError(400,"SHARE_INVALID");
  let content:unknown;
  try {content=JSON.parse(req.body.toString("utf8"));}catch{throw new ShareError(400,"SHARE_INVALID");}
  const input=z.object({token:tokenSchema,id,revision:plain(64),board}).strict().parse(content);
  res.json(await rpc("ws_share_write",{p_token:input.token,p_actor:req.userId,p_kind:"canvas",p_id:input.id,p_op:"canvas",p:{board:input.board,revision:input.revision}}));
}));
const header = (req: Request,key: string) => req.header(`X-Share-${key}`);
function filename(req: Request) {
  let value="";
  try {value=decodeURIComponent(header(req,"Filename") ?? "").replace(/[\u0000-\u001f\u007f/\\]/g,"_");}
  catch {throw new ShareError(400,"SHARE_INVALID");}
  return plain(255).parse(value);
}
async function allowUpload(req: Request,res: Response,next: () => void) {
  try {
    const op=uploadOps.parse(header(req,"Operation")), target=id.parse(header(req,"Resource"));
    let args:Record<string,unknown>, owner:string|undefined;
    const name=filename(req);
    if(op==="attach"){
      const embed=plain(200).parse(header(req,"Embed"));
      const row=await rpc<Array<{owner_id:string}>>("ws_share_resource",{p_kind:"canvas",p_id:target});
      if(!req.userId || row[0]?.owner_id!==req.userId) throw new ShareError(404,"SHARE_FORBIDDEN");
      owner=req.userId;
      args={p_actor:req.userId,p_token:null,p_kind:"canvas",p_id:target,p_op:op,embed,name};
    } else {
      const token=tokenSchema.parse(header(req,"Token")),k=op==="replace"?"file":"folder";
      const rights=await rpc<{owner?:string}>("ws_share_read",{...actors(req,token),p_proof:null,p_kind:k,p_id:target,p_op:"upload"});
      owner=rights.owner;
      args={p_actor:req.userId,p_token:token,p_kind:k,p_id:target,p_op:op,name,
        revision:op==="replace"?id.parse(header(req,"Revision")):undefined};
    }
    if(!owner) throw new ShareError(404,"SHARE_FORBIDDEN");
    res.locals.workspaceUpload={owner,args};
    next();
  } catch(error){failure(res,error);}
}
workspaceSharing.post("/upload",requireUser,allowUpload,limitRaw,raw({limit:maxFile,type:"application/octet-stream"}),route(async(req,res)=>{
  if(!Buffer.isBuffer(req.body)) throw new ShareError(400,"SHARE_INVALID");
  const {owner,args}=res.locals.workspaceUpload;
  const stage=randomUUID(),path=storagePath(owner,stage);
  const {embed,revision,name,...scope}=args;
  await storeObject(path,req.body);
  let result:{id:string;old?:string|null};
  try {
    result=await rpc("ws_share_write",{...scope,p:{object:stage,embed,revision,name,size:req.body.length}});
  } catch(error) {
    // Only delete on a definitive rejection; a response loss may occur after commit.
    if(error instanceof ShareError && error.status<500) await removeObject(path);
    throw error;
  }
  if(result.old) await removeObject(storagePath(owner,result.old));
  res.json(result);
}));
workspaceSharing.use((error: {status?:number},_req: Request,res: Response,_next: unknown)=>{
  if(error?.status===413) return res.status(413).json({error:"SHARE_FILE_SIZE"});
  return failure(res,error);
});
