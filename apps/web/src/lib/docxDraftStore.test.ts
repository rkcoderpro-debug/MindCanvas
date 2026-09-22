// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { deleteDocxDraft, readDocxDraft, writeDocxDraft } from "./docxDraftStore";

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });

describe("DOCX draft store", () => {
  it("isolates drafts by owner and document and keeps the base revision", async () => {
    const model = { schemaVersion: 1 as const, blocks: [{ type: "paragraph" as const, style: "Normal" as const, runs: [{ text: "nháp" }] }], page: { size: "A4" as const, orientation: "portrait" as const, margins: { top: 2, right: 2, bottom: 2, left: 2 } }, warnings: [] };
    await writeDocxDraft("alice", "doc-1", "rev-1", model);
    const draft = await readDocxDraft("alice", "doc-1");
    expect(draft?.baseUpdatedAt).toBe("rev-1");
    expect(await readDocxDraft("bob", "doc-1")).toBeNull();
    await deleteDocxDraft("alice", "doc-1");
    expect(await readDocxDraft("alice", "doc-1")).toBeNull();
  });
});
