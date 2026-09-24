// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, storageCopy, storageRemove } = vi.hoisted(() => ({
  rpc: vi.fn(), storageCopy: vi.fn(), storageRemove: vi.fn(),
}));

vi.mock("./supabase", () => ({
  getCurrentSession: async () => ({ user: { id: "recipient" } }),
  supabase: {
    rpc,
    storage: { from: () => ({ copy: storageCopy, remove: storageRemove }) },
  },
}));

import { saveSharedLearningCopy } from "./learningShare";

describe("saving shared learning copies", () => {
  beforeEach(() => {
    rpc.mockReset(); storageCopy.mockReset(); storageRemove.mockReset();
    storageCopy.mockResolvedValue({ data: { path: "recipient/copy-id.pdf" }, error: null });
    storageRemove.mockResolvedValue({ data: [], error: null });
    vi.stubGlobal("crypto", { randomUUID: () => "copy-id" });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns the existing Quiz copy without creating another copy", async () => {
    rpc.mockResolvedValue({ data: "existing-copy", error: null });
    await expect(saveSharedLearningCopy("quiz", "source-id")).resolves.toEqual({ copyId: "existing-copy", alreadySaved: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_saved_learning_copy", { p_kind: "quiz", p_source_id: "source-id" });
  });

  it("retries an idempotent registration and removes the object after a confirmed database failure", async () => {
    let saveCalls = 0;
    rpc.mockImplementation(async (name: string) => {
      if (name === "get_saved_learning_copy") return { data: null, error: null };
      if (name === "get_learning_shared_content") return { data: { file_path: "sender/original.pdf", file_name: "notes.pdf" }, error: null };
      if (name === "save_shared_document_copy") { saveCalls += 1; return { data: null, error: { code: "P0001", message: "DOCUMENT_COPY_NOT_FOUND" } }; }
      throw new Error(`Unexpected RPC ${name}`);
    });

    await expect(saveSharedLearningCopy("document", "source-id")).rejects.toThrow("DOCUMENT_COPY_NOT_FOUND");
    expect(storageCopy).toHaveBeenCalledWith("sender/original.pdf", "recipient/copy-id.pdf");
    expect(saveCalls).toBe(2);
    expect(storageRemove).toHaveBeenCalledWith(["recipient/copy-id.pdf"]);
  });

  it("preserves the copied object when the registration result stays uncertain", async () => {
    let saveCalls = 0;
    rpc.mockImplementation(async (name: string) => {
      if (name === "get_saved_learning_copy") return { data: null, error: null };
      if (name === "get_learning_shared_content") return { data: { file_path: "sender/original.pdf", file_name: "notes.pdf" }, error: null };
      if (name === "save_shared_document_copy") { saveCalls += 1; return { data: null, error: { message: "Failed to fetch" } }; }
      throw new Error(`Unexpected RPC ${name}`);
    });

    await expect(saveSharedLearningCopy("document", "source-id")).rejects.toThrow("Không thể kết nối");
    expect(saveCalls).toBe(2);
    expect(storageRemove).not.toHaveBeenCalled();
  });
});
