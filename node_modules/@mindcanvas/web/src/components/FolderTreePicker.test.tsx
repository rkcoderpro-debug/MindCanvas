// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import FolderTreePicker from "./FolderTreePicker";

const folders = [
  { id: "parent", name: "DSA", parentId: null },
  { id: "child", name: "Thực hành", parentId: "parent" },
  { id: "leaf", name: "Danh sách liên kết", parentId: "child" },
];

function Picker() {
  const [selected, setSelected] = useState<string | null | undefined>();
  return <FolderTreePicker folders={folders} selected={selected} onSelect={setSelected} label="Thư mục đích"/>;
}

it("expands folder levels independently and accepts both folders and the root", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const click = async (selector: string) => act(async () => host.querySelector<HTMLButtonElement>(selector)!.click());
  try {
    await act(async () => root.render(<Picker/>));
    await click(".folder-tree-trigger");
    expect(host.textContent).not.toContain("Thực hành");
    await click(".folder-tree-expand");
    expect(host.textContent).toContain("Thực hành");
    expect(host.textContent).not.toContain("Danh sách liên kết");
    await click(".folder-tree-row li .folder-tree-expand, ul ul .folder-tree-expand");
    await click("ul ul ul .folder-tree-choice");
    expect(host.querySelector(".folder-tree-trigger")?.textContent).toContain("DSA › Thực hành › Danh sách liên kết");
    await click(".folder-tree-trigger");
    await click(".folder-tree-row > .folder-tree-choice");
    expect(host.querySelector(".folder-tree-trigger")?.textContent).toBe("DSA");
    await click(".folder-tree-trigger");
    await click(".folder-tree-root");
    expect(host.querySelector(".folder-tree-trigger")?.textContent).toBe("Ngoài thư mục");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
