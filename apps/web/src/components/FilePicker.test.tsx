// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import FilePicker from "./FilePicker";
import { LanguageProvider } from "../lib/i18n";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

async function choose(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, "files", { configurable: true, value: files });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}

it("uses the native picker contract and retains the original selection after the app resets the input", async () => {
  const read = vi.fn();
  await act(async () => root.render(<LanguageProvider><FilePicker aria-label="Tài liệu nguồn" accept=".pdf,.docx" multiple description="10 MB/tệp" onChange={event => {
    read(Array.from(event.currentTarget.files ?? []));
    event.currentTarget.value = "";
  }}/></LanguageProvider>));
  const input = host.querySelector<HTMLInputElement>('input[aria-label="Tài liệu nguồn"]')!;
  expect(input.type).toBe("file");
  expect(input.accept).toBe(".pdf,.docx");
  expect(input.multiple).toBe(true);
  const files = [new File(["pdf"], "bai-tap.pdf"), new File(["doc"], "bai-giai.docx")];
  await choose(input, files);
  expect(read).toHaveBeenCalledWith(files);
  expect(host.querySelector(".file-picker-selection")?.textContent).toContain("Đã chọn 2 tệp");
  expect([...host.querySelectorAll(".file-picker-names li")].map(line => line.textContent)).toEqual(files.map(item => item.name));
  await choose(input, files);
  expect(read).toHaveBeenCalledTimes(2);
});

it("shows an externally staged file and allows clearing its name when the feature resets", async () => {
  const render = async (names: string[]) => act(async () => root.render(<LanguageProvider><FilePicker accept=".json" fileNames={names} onChange={() => {}}/></LanguageProvider>));
  await render(["ket-qua.json"]);
  expect(host.querySelector(".file-picker-selection")?.textContent).toContain("ket-qua.json");
  await render([]);
  expect(host.querySelector(".file-picker-selection")?.textContent).toContain("Chưa chọn tệp");
});

it("routes a drop through the feature handler and blocks a drop inside a disabled fieldset", async () => {
  const addFiles = vi.fn();
  const render = async (disabled: boolean) => act(async () => root.render(<LanguageProvider>
    <fieldset disabled={disabled}><FilePicker accept=".json" onChange={() => {}} onDropFiles={addFiles}/></fieldset>
  </LanguageProvider>));
  const files = [new File(["{}"], "a.json"), new File(["{}"], "b.json")];
  const drop = async () => {
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { files, types: ["Files"] } });
    await act(async () => host.querySelector(".file-picker")!.dispatchEvent(event));
    return event;
  };
  await render(false);
  expect((await drop()).defaultPrevented).toBe(true);
  expect(addFiles).toHaveBeenCalledWith([files[0]]);
  await render(true);
  expect((await drop()).defaultPrevented).toBe(true);
  expect(addFiles).toHaveBeenCalledTimes(1);
});
