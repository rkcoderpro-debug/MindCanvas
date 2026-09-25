// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CloudConflictDialog from "./CloudConflictDialog";
import { LanguageProvider } from "../lib/i18n";
import { blankBoard } from "../lib/board";
import type { WorkspaceConflict } from "../hooks/useWorkspace";

let root: Root;
let host: HTMLDivElement;
const conflict = (error?: string): WorkspaceConflict => {
  const localBoard = blankBoard("Local draft");
  const remoteBoard = { ...localBoard, title: "Cloud version" };
  return {
    projectId: localBoard.id,
    local: { id: localBoard.id, title: localBoard.title, board: localBoard, folderId: null, updatedAt: localBoard.updatedAt, pending: true },
    remote: { id: remoteBoard.id, title: remoteBoard.title, board: remoteBoard, folderId: null, updatedAt: remoteBoard.updatedAt, pending: false, revision: 2 },
    error,
  };
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("CloudConflictDialog", () => {
  it("keeps alternate choices enabled and tries the queued choice after a failed resolution", async () => {
    let finish!: (resolved: boolean) => void;
    const onResolve = vi.fn()
      .mockImplementationOnce(() => new Promise<boolean>(resolve => { finish = resolve; }))
      .mockResolvedValueOnce(true);
    await act(async () => root.render(<LanguageProvider><CloudConflictDialog conflict={conflict()} onResolve={onResolve}/></LanguageProvider>));
    const overwrite = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Lưu bản thiết bị lên cloud"))!;

    await act(async () => { overwrite.click(); await Promise.resolve(); });
    expect(onResolve).toHaveBeenCalledWith("overwrite");
    expect(overwrite.disabled).toBe(true);
    expect(overwrite.textContent).toContain("Đang lưu");
    const useCloud = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Dùng bản cloud"))!;
    const saveCopy = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Lưu bản thiết bị thành bản sao"))!;
    expect(useCloud.disabled).toBe(false);
    expect(saveCopy.disabled).toBe(false);

    await act(async () => { useCloud.click(); });
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Dùng bản cloud");
    expect(onResolve).toHaveBeenCalledTimes(1);

    await act(async () => { finish(false); await Promise.resolve(); });
    expect(onResolve).toHaveBeenCalledTimes(2);
    expect(onResolve).toHaveBeenLastCalledWith("cloud");
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(useCloud.disabled).toBe(false);
    expect(saveCopy.disabled).toBe(false);
    expect(overwrite.disabled).toBe(false);
  });

  it("shows a write error and enables retry after a failed choice", async () => {
    const onResolve = vi.fn().mockResolvedValue(false);
    await act(async () => root.render(<LanguageProvider><CloudConflictDialog conflict={conflict()} onResolve={onResolve}/></LanguageProvider>));
    const overwrite = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Lưu bản thiết bị lên cloud"))!;
    await act(async () => { overwrite.click(); });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Bản nháp vẫn được giữ");
    expect(overwrite.disabled).toBe(false);
  });

  it("renders the conflict error inside the blocking dialog", async () => {
    await act(async () => root.render(<LanguageProvider><CloudConflictDialog conflict={conflict("42501: cloud write denied")} onResolve={async () => false}/></LanguageProvider>));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("42501");
  });
});
