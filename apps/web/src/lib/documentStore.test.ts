// @vitest-environment jsdom
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { documentKindFor, listDocuments, saveDocument, deleteDocument } from "./documentStore";
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); localStorage.clear(); });
describe("document library", () => {
  it("recognizes supported office formats", () => { expect(documentKindFor("a.pdf")).toBe("pdf"); expect(documentKindFor("a.docx")).toBe("docx"); expect(documentKindFor("a.pptx")).toBe("pptx"); expect(documentKindFor("a.xlsx")).toBe("xlsx"); expect(documentKindFor("a.txt")).toBeNull(); });
  it("stores files per account and removes them", async () => {
    const saved = await saveDocument("alice", { name: "lesson.pdf", mimeType: "application/pdf", kind: "pdf", size: 4, dataUrl: "data:application/pdf;base64,AAAA", folderId: "folder" });
    expect((await listDocuments("alice"))).toHaveLength(1); expect(await listDocuments("bob")).toHaveLength(0);
    await deleteDocument("alice", saved.id); expect(await listDocuments("alice")).toHaveLength(0);
  });
});
