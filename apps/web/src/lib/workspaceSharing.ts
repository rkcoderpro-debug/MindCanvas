import type { BoardState } from "@mindcanvas/shared";
import { getCurrentSession } from "./supabase";
import { readShareProof, storeShareProof } from "./workspaceShareLinks";

export type ShareKind = "folder"|"canvas"|"file"|"quiz"|"flashcard"|"learning_folder"|"lab";
export type ShareRole = "viewer"|"editor";
export type ShareItem = {kind:ShareKind;id:string;title:string;embed?:string};
export type ShareGrant = {email:string;role:ShareRole;token:string};
export type ShareReceived = Omit<ShareItem,"id"> & Pick<ShareGrant,"role"|"token">;
export type SharedCard = {id:string;front:string;back:string;revision:string};
export type SharedQuestion = {id:string;prompt:string;options:string[];correctIndex?:number;explanation?:string};
export type ShareView = {state:"verify"} | {state:"sign-in";audience?:"friend"} | ({
  state:"ok";id:string;title:string;role:ShareRole|"owner";signInToEdit?:boolean;
} & (
  | {kind:"folder";data:ShareItem[]}
  | {kind:"learning_folder";data:ShareItem[]}
  | {kind:"lab";data:{html:string;allowExternalResources:boolean;viewerConfig:unknown}}
  | {kind:"canvas";data:{board:unknown;revision:string;version:number;files:ShareItem[]}}
  | {kind:"file";data:{size:number;revision:string}}
  | {kind:"quiz";data:{questions:SharedQuestion[];description:string;revision:string}}
  | {kind:"flashcard";data:SharedCard[]}
));
const origin = String(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787").replace(/\/$/,"")+"/api/workspace-shares";
export class WorkspaceShareError extends Error {
  constructor(readonly code:string,readonly status:number){super(code);}
}
async function request(path:string,{ body,token,requireLogin=false,signal,headers={},asBlob=false,raw=false }: {
  body?: unknown; token?:string; requireLogin?:boolean;signal?:AbortSignal;headers?:Record<string,string>;asBlob?:boolean;raw?:boolean;
}){
  const session=await getCurrentSession().catch(()=>null);
  if(requireLogin && !session) throw new WorkspaceShareError("SHARE_LOGIN",401);
  const proof=token ? readShareProof(token) : null;
  const response=await fetch(origin+path,{method:body===undefined?"GET":"POST",cache:"no-store",credentials:"omit",referrerPolicy:"no-referrer",signal,
    headers:{...(session && {Authorization:`Bearer ${session.access_token}`}),...(proof && {"X-Share-Proof":proof}),
      ...(body!==undefined && {"Content-Type":raw?"application/octet-stream":"application/json"}),...headers},
    body:body===undefined?undefined:raw?body as BodyInit:JSON.stringify(body)});
  if(!response.ok){
    const result=await response.json().catch(()=>null);
    throw new WorkspaceShareError(result?.error && /^[A-Z_]+$/.test(result.error)?result.error:
      response.status===401?"SHARE_LOGIN":response.status===413?"SHARE_FILE_SIZE":"SHARE_UNAVAILABLE",response.status);
  }
  return asBlob?response.blob():response.json();
}
const targetBody=(token:string,item?:Pick<ShareItem,"kind"|"id">|null)=>({token,...(item && {kind:item.kind,id:item.id})});
export const shareManage=(item:Pick<ShareItem,"kind"|"id">,op:"list"|"set"|"remove",email="",role:ShareRole="viewer",signal?:AbortSignal):Promise<ShareGrant[]> =>
  request("/manage",{body:{kind:item.kind,id:item.id,op,email,role},requireLogin:true,signal});
export const shareOpen=(token:string,item?:Pick<ShareItem,"kind"|"id">|null,signal?:AbortSignal):Promise<ShareView> =>
  request("/open",{body:targetBody(token,item),token,signal});
export const shareReceived=(signal?:AbortSignal):Promise<ShareReceived[]>=>request("/received",{requireLogin:true,signal});
export const shareInvite=(token:string)=>request("/invite",{body:{token},requireLogin:true});
export const shareChallenge=(token:string)=>request("/challenge",{body:{token}});
export async function shareVerify(token:string,code:string){
  const {proof}=await request("/verify",{body:{token,code}});
  storeShareProof(token,proof);
}
export const shareDownload=(token:string,item:Pick<ShareItem,"kind"|"id">):Promise<Blob>=>
  request("/download",{body:targetBody(token,item),token,asBlob:true});
export const shareCanvasAsset=(token:string,id:string,digest:string,signal?:AbortSignal):Promise<Blob>=>
  request("/asset",{body:{token,kind:"canvas",id,digest},token,asBlob:true,signal});
export const shareEdit=(token:string,item:Pick<ShareItem,"kind"|"id">,op:"rename"|"mkdir"|"quiz"|"card",payload:unknown)=>
  request("/edit",{body:{...targetBody(token,item),op,payload},requireLogin:true,token});
export const shareSaveCanvas=(token:string,id:string,revision:string,board:BoardState)=>
  request("/canvas",{body:new Blob([JSON.stringify({token,id,revision,board})]),raw:true,requireLogin:true,token});
export const shareSubmit=(token:string,id:string,revision:string,answers:Array<number|null>):Promise<{score:number;total:number;answers:{correct:number;explanation?:string}[]}> =>
  request("/submit",{body:{token,kind:"quiz",id,revision,answers},token});
export const listShareAttachments=(id:string):Promise<{id:string;embed:string;title:string}[]>=>
  request("/attachments",{body:{id},requireLogin:true});
export const listMissingFolderAttachments=(id:string):Promise<{canvas:string;embed:string;name:string;document:string|null}[]>=>
  request("/folder-attachments",{body:{id},requireLogin:true});
export const shareUpload=(op:"replace"|"add-file"|"attach",id:string,blob:Blob,name:string,options:{token?:string;revision?:string;embed?:string}={}):Promise<{id:string}>=>{
  if(blob.size>40*1024*1024) throw new WorkspaceShareError("SHARE_FILE_SIZE",413);
  return request("/upload",{body:blob,raw:true,requireLogin:true,token:options.token,headers:{
    "X-Share-Operation":op,"X-Share-Resource":id,"X-Share-Filename":encodeURIComponent(name),
    ...(options.token && {"X-Share-Token":options.token}),...(options.revision && {"X-Share-Revision":options.revision}),...(options.embed && {"X-Share-Embed":options.embed}),
  }});
};

export function shareErrorText(error:unknown,vi:boolean){
  const code=error instanceof WorkspaceShareError ? error.code:"";
  const dict:Record<string,[string,string]>={
    SHARE_FORBIDDEN:["Không tìm thấy nội dung hoặc bạn không có quyền mở.","Content was removed or you do not have access."],
    SHARE_CONFLICT:["Nội dung vừa được cập nhật. Hãy mở lại trước khi lưu.","Content has changed. Reopen it before saving."],
    SHARE_BUSY:["Máy chủ đang nhận nhiều tệp. Hãy thử tải lên lại sau ít giây.","The server is busy. Try uploading again in a moment."],
    SHARE_RATE:["Đã đạt giới hạn gửi. Hãy thử lại sau.","Too many requests. Try again later."],
    SHARE_CODE:["Mã không đúng hoặc đã hết hạn.","The code is incorrect or expired."],
    SHARE_LOGIN:["Hãy đăng nhập để thực hiện thao tác này.","Sign in to continue."],
    SHARE_EMAIL_DISABLED:["Máy chủ chưa cấu hình gửi email chia sẻ.","Sharing email is not configured."],
    SHARE_EMAIL_FAILED:["Chưa gửi được email. Bạn có thể gửi lại từ danh sách.","Email could not be sent. Retry from the access list."],
    SHARE_FILE_SIZE:["Tệp vượt giới hạn dung lượng.","The file exceeds the size limit."],
    SHARE_FILE_MISSING:["Không tìm thấy tệp trong kho.","Could not find the stored file."],
    SHARE_INVALID:["Dữ liệu chưa hợp lệ. Hãy kiểm tra và thử lại.","Check the input and try again."],
    ATTACH_MISSING:["Chưa tìm thấy bản gốc của tài liệu. Hãy mở trên thiết bị đã đính kèm tệp.","The attachment is missing. Open the device that originally attached it."],
  };
  return (dict[code]??["Không thể kết nối dịch vụ chia sẻ. Hãy thử lại.","Sharing is unavailable. Try again."])[vi?0:1];
}
