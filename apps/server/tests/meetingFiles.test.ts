import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import JSZip from "jszip";
import { meetingFileMime, meetingFiles } from "../src/meetingFiles.js";
import { config } from "../src/config.js";

test("recognizes supported meeting files by bytes rather than MIME supplied by a browser", async () => {
  assert.equal(meetingFileMime("test.pdf",Buffer.from("%PDF-1.7")),"application/pdf");
  assert.throws(() => meetingFileMime("test.pdf",Buffer.from("<html>")),/ONLINE_FILE_TYPE/);
  assert.throws(() => meetingFileMime("test.txt",Buffer.from([0xff,0,1])),/ONLINE_FILE_TYPE/);
  const zip = new JSZip();
  zip.file("[Content_Types].xml","<Types/>");
  zip.file("word/document.xml","<document/>");
  const word = await zip.generateAsync({ type:"nodebuffer",compression:"DEFLATE" });
  assert.match(meetingFileMime("test.docx",word),/wordprocessingml/);
  const large = new JSZip();
  large.file("[Content_Types].xml","<Types/>");
  large.file("word/document.xml",Buffer.alloc(25*1024*1024,65));
  const compressed = await large.generateAsync({ type:"nodebuffer",compression:"DEFLATE" });
  assert.throws(() => meetingFileMime("large.docx",compressed),/ONLINE_FILE_TYPE/);
});

test("attachment reads check the room session before fetching private content", async t => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = config;
  Object.assign(config,{ SUPABASE_URL:"https://storage.unit.test",SUPABASE_SERVICE_ROLE_KEY:"unit-service-key" });
  const actor = "71000000-0000-4000-8000-000000000001", room = "71000000-0000-4000-8000-000000000002";
  const client = "71000000-0000-4000-8000-000000000003", file = "71000000-0000-4000-8000-000000000004";
  const nativeFetch = globalThis.fetch;
  let permitted = false, reads = 0;
  t.mock.method(globalThis,"fetch",async (url,init) => {
    if (String(url).endsWith("/rest/v1/rpc/online_meeting_file")) {
      assert.deepEqual(JSON.parse(String(init?.body)),{ p_room:room,p_actor:actor,p_client:client,p_file:file,p_op:"read" });
      return permitted ? Response.json({ size:4,mime:"text/plain" }) : Response.json({ message:"ONLINE_MEDIA_DENIED" },{ status:400 });
    }
    assert.ok(String(url).endsWith(`/storage/v1/object/meeting-room-files/${room}/${file}`)); reads++;
    return new Response("test");
  });
  const app = express();
  app.use(express.json(),(req,_res,next) => { req.userId = actor; next(); });
  app.use("/:room/files",meetingFiles);
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => { const s = app.listen(0,"127.0.0.1",() => resolve(s)); });
  t.after(() => { server.close(); Object.assign(config,{ SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY }); });
  const addr = server.address();
  assert.ok(addr && typeof addr !== "string");
  const get = () => nativeFetch(`http://127.0.0.1:${addr.port}/${room}/files/${file}/content`,{
    method:"POST",headers:{ "Content-Type":"application/json" },body:JSON.stringify({ client }),
  });
  assert.equal((await get()).status,403);
  assert.equal(reads,0);
  permitted = true;
  const response = await get();
  assert.equal(response.status,200);
  assert.equal(response.headers.get("Content-Disposition"),"attachment");
  assert.equal(await response.text(),"test");
  assert.equal(reads,1);
});
