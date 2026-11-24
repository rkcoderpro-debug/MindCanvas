import { IDBFactory } from "fake-indexeddb";
import { beforeEach, expect, it } from "vitest";
import { MAX_DOCUMENT_BYTES } from "./documentStore";
import { addWorkspaceFile, deleteWorkspaceFile, listWorkspaceFiles, moveWorkspaceFile, readWorkspaceFile } from "./workspaceFiles";

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });

it("stores uncommon file formats and their exact bytes, moves them between folders, and removes both metadata and content", async () => {
  const sample = new Uint8Array([10, 13, 13, 10, 0, 255, 58, 9]);
  const folderId = "65000000-0000-4000-8000-000000000001";
  const trace = await addWorkspaceFile(null,folderId,new File([sample],"Bài thực hành.pcapng"));
  const code = await addWorkspaceFile(null,null,new File(["int main() {}"],"bai.cpp",{ type:"text/plain" }));
  const asm = await addWorkspaceFile(null,folderId,new File([".text"],"chapter.asm"));
  expect((await listWorkspaceFiles(null)).map(file => file.name)).toEqual(expect.arrayContaining([trace.name,code.name,asm.name]));
  const blob = await readWorkspaceFile(null,trace.id);
  expect(blob.type).toBe("application/octet-stream");
  expect(new Uint8Array(await blob.arrayBuffer())).toEqual(sample);
  expect((await moveWorkspaceFile(null,code.id,folderId)).folderId).toBe(folderId);
  expect((await listWorkspaceFiles(null)).find(file => file.id === code.id)?.folderId).toBe(folderId);
  await deleteWorkspaceFile(null,trace.id);
  expect((await listWorkspaceFiles(null)).some(file => file.id === trace.id)).toBe(false);
  await expect(readWorkspaceFile(null,trace.id)).rejects.toThrow("WORKSPACE_FILE_MISSING");
});

it("rejects a file above the size cap before recording it", async () => {
  const oversized = new File(["data"],"trace.pcap");
  Object.defineProperty(oversized,"size",{ value:MAX_DOCUMENT_BYTES+1 });
  await expect(addWorkspaceFile(null,null,oversized)).rejects.toThrow("WORKSPACE_FILE_SIZE");
  expect(await listWorkspaceFiles(null)).toEqual([]);
});
