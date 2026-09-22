// @vitest-environment jsdom
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { documentKindFor, listDocuments, readDocument, saveDocument, deleteDocument } from "./documentStore";
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); localStorage.clear(); });
describe("document library", () => {
  it("recognizes supported office formats", () => { expect(documentKindFor("a.pdf")).toBe("pdf"); expect(documentKindFor("a.docx")).toBe("docx"); expect(documentKindFor("a.pptx")).toBe("pptx"); expect(documentKindFor("a.xlsx")).toBe("xlsx"); expect(documentKindFor("a.txt")).toBeNull(); });
  it("stores files per account and removes them", async () => {
    const saved = await saveDocument("alice", { name: "lesson.pdf", mimeType: "application/pdf", kind: "pdf", size: 4, dataUrl: "data:application/pdf;base64,AAAA", folderId: "folder" });
    expect((await listDocuments("alice"))).toHaveLength(1); expect(await listDocuments("bob")).toHaveLength(0);
    await deleteDocument("alice", saved.id); expect(await listDocuments("alice")).toHaveLength(0);
  });
  it("migrates guest localStorage records into the versioned local store and isolates reads by owner", async () => {
    localStorage.setItem("mindcanvas:documents:guest", JSON.stringify([{ id: "legacy", owner: "guest", name: "legacy.pdf", mimeType: "application/pdf", kind: "pdf", size: 4, dataUrl: "data:application/pdf;base64,AAAA", folderId: null, updatedAt: new Date().toISOString() }]));
    expect((await listDocuments(null)).map(file => file.id)).toContain("legacy");
    const saved = await saveDocument("alice", { name: "private.pdf", mimeType: "application/pdf", kind: "pdf", size: 4, dataUrl: "data:application/pdf;base64,AAAA", folderId: null });
    expect(await readDocument("alice", saved.id)).not.toBeNull();
    expect(await readDocument("bob", saved.id)).toBeNull();
  });
});
