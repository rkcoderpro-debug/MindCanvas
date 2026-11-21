// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AutoResolveCloudConflict from "./AutoResolveCloudConflict";
import type { WorkspaceConflict } from "../hooks/useWorkspace";
import { blankBoard } from "../lib/board";

let root: Root;
let host: HTMLDivElement;

function conflict(projectId = "project-a"): WorkspaceConflict {
  const localBoard = { ...blankBoard("Local"), id: projectId };
  const remoteBoard = { ...blankBoard("Cloud"), id: projectId };
  return {
    projectId,
    local: { id: projectId, title: "Local", board: localBoard, updatedAt: localBoard.updatedAt, folderId: null, pending: true },
    remote: { id: projectId, title: "Cloud", board: remoteBoard, updatedAt: remoteBoard.updatedAt, folderId: null, pending: false },
  };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("AutoResolveCloudConflict", () => {
  it("selects cloud once and renders no popup", async () => {
    const onResolve = vi.fn().mockResolvedValue(true);
    await act(async () => root.render(<AutoResolveCloudConflict conflict={conflict()} onResolve={onResolve}/>));
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(host.querySelector("dialog")).toBeNull();
    expect(host.textContent).toBe("");

    await act(async () => root.render(<AutoResolveCloudConflict conflict={{ ...conflict(), error: "Cloud read failed" }} onResolve={onResolve}/>));
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it("does not retry a failed project automatically, but handles another project", async () => {
    const onResolve = vi.fn().mockResolvedValue(false);
    await act(async () => root.render(<AutoResolveCloudConflict conflict={conflict()} onResolve={onResolve}/>));
    await act(async () => root.render(<AutoResolveCloudConflict conflict={{ ...conflict(), error: "retry manually" }} onResolve={onResolve}/>));
    expect(onResolve).toHaveBeenCalledTimes(1);

    await act(async () => root.render(<AutoResolveCloudConflict conflict={conflict("project-b")} onResolve={onResolve}/>));
    expect(onResolve).toHaveBeenCalledTimes(2);
  });
});
