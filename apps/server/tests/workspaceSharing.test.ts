import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

process.env.SUPABASE_URL="https://share.unit.test";
process.env.SUPABASE_PUBLISHABLE_KEY="pk";
const { workspaceSharing }=await import("../src/workspaceSharing.js");
const { config }=await import("../src/config.js");
const uid="66000000-0000-4000-8000-000000000001";
const resource="66000000-0000-4000-8000-000000000002";
const token="a".repeat(48);

test("sharing gateway authenticates writes, streams only the authorized fixed Storage object, and validates mail destinations",async t=>{
  const backup={...config};
  Object.assign(config,{SUPABASE_SERVICE_ROLE_KEY:"internal-test",RESEND_API_KEY:"mail-test",SHARE_EMAIL_FROM:"Share <share@example.test>",SHARE_EMAIL_SECRET:"test-only-secret",WEB_ORIGIN:"https://front.example.test"});
  const request=globalThis.fetch;
  const rpc:Array<{url:string;args:Record<string,unknown>}>=[];
  const messages:Array<Record<string,unknown>>=[];
  let downloadAllowed=true;
  t.mock.method(globalThis,"fetch",async(input,init)=>{
    const url=String(input),auth=new Headers(init?.headers).get("Authorization");
    if(url.endsWith("/auth/v1/user")){
      return auth==="Bearer verified" ? Response.json({id:uid,email:"owner@example.test"}) : new Response(null,{status:401});
    }
    if(url==="https://api.resend.com/emails"){
      messages.push(JSON.parse(String(init?.body)));
      return Response.json({id:"test"});
    }
    if(url.includes("/rest/v1/rpc/")){
      assert.equal(auth,"Bearer internal-test");
      const args=JSON.parse(String(init?.body));rpc.push({url,args});
      if(url.endsWith("ws_share_mail"))return Response.json({email:"target@example.test",role:"viewer",title:"Lecture"});
      if(args.p_op==="download")return downloadAllowed ? Response.json({owner:uid,object:resource,title:"lecture.cpp",size:3}) : Response.json({message:"SHARE_FORBIDDEN"},{status:400});
      if(url.endsWith("ws_share_open"))return Response.json({state:"ok",kind:"file",id:resource,title:"Lecture",role:"viewer"});
      return Response.json({ok:true});
    }
    assert.equal(url,`https://share.unit.test/storage/v1/object/authenticated/workspace-files/${uid}/${resource}`);
    assert.equal(auth,"Bearer internal-test");
    return new Response(Uint8Array.from([0,42,255]));
  });
  const app=express();app.use(express.json(),workspaceSharing);
  const server=await new Promise<ReturnType<typeof app.listen>>(resolve=>{const listen=app.listen(0,"127.0.0.1",()=>resolve(listen));});
  t.after(()=>{Object.assign(config,backup);server.close();});
  const address=server.address();assert.ok(address&&typeof address==="object");
  const post=(path:string,body:unknown,bearer?:string)=>request(`http://127.0.0.1:${address.port}/${path}`,{method:"POST",headers:{
    "Content-Type":"application/json",...(bearer&&{Authorization:`Bearer ${bearer}`})},body:JSON.stringify(body)});
  const opened=await post("open",{token});
  assert.equal(opened.status,200);assert.equal(opened.headers.get("Cache-Control"),"private, no-store");
  assert.equal((await opened.json()).title,"Lecture");
  assert.equal(rpc.at(-1)?.args.p_actor,null);
  assert.equal((await post("open",{token},"verified")).status,200);
  assert.match(rpc.at(-1)?.url??"",/\/ws_share_open$/);
  assert.equal(rpc.at(-1)?.args.p_actor,uid);
  const change={token,kind:"file",id:resource,op:"rename",payload:{title:"new"}};
  assert.equal((await post("edit",change)).status,401);
  assert.equal((await post("edit",{...change,actor:uid},"verified")).status,400);
  assert.equal((await post("edit",change,"verified")).status,200);
  assert.equal(rpc.at(-1)?.args.p_actor,uid);
  const download=await post("download",{token});
  assert.equal(download.status,200);
  assert.equal(download.headers.get("Content-Type"),"application/octet-stream");
  assert.match(download.headers.get("Content-Disposition")??"",/attachment;.*lecture.cpp/);
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()),Uint8Array.from([0,42,255]));
  downloadAllowed=false;assert.equal((await post("download",{token})).status,404);
  assert.equal((await post("invite",{token,email:"other@example.test"},"verified")).status,400);
  assert.equal((await post("invite",{token},"verified")).status,200);
  assert.equal(messages.length,1);assert.deepEqual(messages[0].to,["target@example.test"]);
  assert.match(String(messages[0].text),new RegExp(`https://front.example.test/#share=${token}`));
  assert.equal((await post("challenge",{token})).status,200);
  assert.match(String(messages[1].text),/[0-9]{6}/);
  assert.match(String(rpc.at(-1)?.args.p_code),/^[a-f0-9]{64}$/);
});
