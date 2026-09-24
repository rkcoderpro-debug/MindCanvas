// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SharedLearningPage from "./SharedLearningPage";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { getSharedContent, listLearningShares, listMyLearningCopySources, listPendingLearningInvites } = vi.hoisted(() => ({
  getSharedContent: vi.fn(),
  listLearningShares: vi.fn(),
  listMyLearningCopySources: vi.fn(),
  listPendingLearningInvites: vi.fn(),
}));

vi.mock("../lib/learningShare", () => ({
  acceptPendingLearningInvite: vi.fn(),
  finishSharedQuiz: vi.fn(),
  getSharedCards: vi.fn(),
  getSharedContent,
  listLearningShares,
  listMyLearningCopySources,
  listPendingLearningInvites,
  rateSharedCard: vi.fn(),
  revealSharedQuizAnswer: vi.fn(),
  sharedLearningErrorMessage: (error: unknown) => String(error),
  saveSharedLearningCopy: vi.fn(),
  startSharedQuiz: vi.fn(),
  startSharedQuizImmediate: vi.fn(),
}));

describe("shared Lab CDN consent", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    listLearningShares.mockResolvedValue([{ kind: "lab", resource_id: "lab-1", owner_name: "Owner", title: "Shared CDN Lab", updated_at: "2026-09-24T00:00:00.000Z", status: "active" }]);
    listPendingLearningInvites.mockResolvedValue([]);
    listMyLearningCopySources.mockResolvedValue([]);
    getSharedContent.mockResolvedValue({ program_html: '<script src="https://unpkg.com/react"></script>', allow_external_resources: true });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.clearAllMocks();
  });

  it("does not load external scripts until the recipient consents", async () => {
    await act(async () => root.render(<SharedLearningPage owner="recipient"/>));
    const openButton = [...host.querySelectorAll("button")].find(button => button.textContent?.includes("Chạy Lab"));
    expect(openButton).toBeTruthy();
    await act(async () => { openButton!.click(); await Promise.resolve(); });
    expect(host.querySelector("iframe.shared-lab-frame")).toBeNull();

    const consentButton = [...host.querySelectorAll("button")].find(button => button.textContent?.includes("Cho phép tải thư viện"));
    expect(consentButton).toBeTruthy();
    await act(async () => consentButton!.click());
    const frame = host.querySelector("iframe.shared-lab-frame");
    expect(frame?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame?.getAttribute("srcdoc")).toContain("https://unpkg.com/react");
    expect(frame?.getAttribute("srcdoc")).toContain("connect-src 'none'");
  });
});
