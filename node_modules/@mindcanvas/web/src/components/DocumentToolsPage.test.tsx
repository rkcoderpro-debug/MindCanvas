// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import JSZip from "jszip";
import DocumentToolsPage, { buildDocx, type LibraryWorkspace } from "./DocumentToolsPage";
import { shouldHandleAnnotationMove, shouldRequestPdfGuide } from "./DocumentViewer";
import { LanguageProvider } from "../lib/i18n";
import * as files from "../lib/workspaceFiles";

describe("DOCX editor export", () => {
  it("writes a readable OOXML package instead of renaming HTML", async () => {
    const base64 = await buildDocx("<h1>Lesson</h1><p><strong>Bold</strong> <span style=\"background-color: rgb(255, 242, 168); font-size: 18px\">highlight</span> &amp; text</p><ul><li>One</li></ul>");
    const zip = await JSZip.loadAsync(base64, { base64: true });
    const documentXml = await zip.file("word/document.xml")?.async("text");
    expect(documentXml).toContain("<w:pStyle w:val=\"Heading1\"/>");
    expect(documentXml).toContain("<w:b/>");
    expect(documentXml).toContain("<w:shd w:fill=\"FFF2A8\"/>");
    expect(documentXml).toContain("<w:sz w:val=\"27\"/>");
    expect(documentXml).toContain("w:numId");
    expect(await zip.file("[Content_Types].xml")?.async("text")).toContain("wordprocessingml.document.main+xml");
    expect(await zip.file("word/numbering.xml")?.async("text")).toContain("w:numFmt w:val=\"bullet\"");
    expect(await zip.file("word/document.xml")?.async("text")).toContain("Lesson");
  });

  it("does not start the PDF guide for a DOCX that appears first", () => {
    const orderedKinds = ["docx", "pdf"] as const;
    expect(orderedKinds.map(kind => shouldRequestPdfGuide(kind))).toEqual([false, true]);
    expect(shouldRequestPdfGuide("pdf", true, true)).toBe(false);
    expect(shouldRequestPdfGuide("pdf", true, false, true)).toBe(false);
  });

  it("ignores hover moves and unrelated pointers while drawing a PDF", () => {
    expect(shouldHandleAnnotationMove(null, 1, 0, "mouse")).toBe(false);
    expect(shouldHandleAnnotationMove(7, 8, 1, "mouse")).toBe(false);
    expect(shouldHandleAnnotationMove(7, 7, 0, "mouse")).toBe(false);
    expect(shouldHandleAnnotationMove(7, 7, 1, "mouse")).toBe(true);
    expect(shouldHandleAnnotationMove(7, 7, 0, "pen")).toBe(false);
    expect(shouldHandleAnnotationMove(7, 7, 1, "pen")).toBe(true);
  });
});

describe("Document Tools localization", () => {
  it("uses the selected English language for labels and empty state", async () => {
    localStorage.setItem("mindcanvas:language", "en");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<LanguageProvider><DocumentToolsPage owner={null} documents={[]} onDocumentsChanged={() => {}}/></LanguageProvider>));
    expect(host.querySelector(".document-tools-heading-inline strong")?.textContent).toBe("Document viewer");
    expect(host.querySelector(".document-tools-upload")?.textContent).toBe("Upload document");
    expect(host.querySelector(".tool-empty-state h2")?.textContent).toBe("Choose a document to view");
    await act(async () => root.unmount());
    host.remove();
    localStorage.removeItem("mindcanvas:language");
  });
});

it("opens HTML in a focused sandbox and restores the library when changing format", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const documents = [
    { id: "html-1", owner: "guest", name: "Lesson.html", kind: "html" as const, mimeType: "text/html", dataUrl: "data:text/html;charset=utf-8," + encodeURIComponent("<main><h1>Interactive lesson</h1><button>Try</button></main>"), folderId: null, size: 100, updatedAt: new Date().toISOString() },
    { id: "docx-1", owner: "guest", name: "Lesson.docx", kind: "docx" as const, mimeType: "application/octet-stream", dataUrl: "", folderId: null, size: 100, updatedAt: new Date().toISOString() },
  ];
  await act(async () => root.render(<LanguageProvider><DocumentToolsPage owner={null} documents={documents} onDocumentsChanged={() => {}}/></LanguageProvider>));
  await act(async () => host.querySelector<HTMLButtonElement>('[data-document-id="html-1"]')!.click());
  expect(host.querySelector(".html-reading")).not.toBeNull(); expect(host.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-scripts"); expect(host.querySelector('a[download="Lesson.html"]')).not.toBeNull();
  await act(async () => host.querySelector<HTMLButtonElement>('[data-tool-tab="docx"]')!.click());
  expect(host.querySelector(".html-reading")).toBeNull(); expect(host.querySelector(".library-collapsed")).toBeNull(); expect(host.querySelector('[data-document-id="docx-1"]')).not.toBeNull();
  await act(async () => root.unmount()); host.remove();
});

it("opens an existing folder file in the sandbox, keeps the original ID, and lets users navigate to its folder", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const folder = { id: "65000000-0000-4000-8000-000000000001", name: "DSA" };
  const otherFolder = { id: "65000000-0000-4000-8000-000000000002", name: "Mạng" };
  const html = { id: "65000000-0000-4000-8000-000000000010", folderId: folder.id, name: "Notes.html", size: 75, ready: true, createdAt: new Date().toISOString() };
  const trace = { ...html, id: "65000000-0000-4000-8000-000000000011", folderId: otherFolder.id, name: "Sample.pcapng" };
  const openFolder = vi.fn();
  const read = vi.spyOn(files, "readWorkspaceFile").mockResolvedValue(new Blob(["<main><h1>DSA Notes</h1></main>"], { type: "application/octet-stream" }));
  const refresh = vi.fn();
  const upload = vi.spyOn(files, "addWorkspaceFile").mockImplementation(async (_owner, folderId, file) => ({ ...html, id: "65000000-0000-4000-8000-000000000012", folderId, name: file.name }));
  function Library() {
    const [rows, setFiles] = useState<files.WorkspaceFile[]>([html, trace]);
    const workspace: LibraryWorkspace = { repository: { files: rows, setFiles, refresh, loading: false, error: null }, folders: [folder, otherFolder], openFolder };
    return <DocumentToolsPage owner={null} documents={[]} onDocumentsChanged={() => {}} workspace={workspace}/>;
  }
  try {
    await act(async () => root.render(<LanguageProvider><Library/></LanguageProvider>));
    expect(host.querySelector(`[data-document-id="${trace.id}"]`)).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>(`[data-document-id="${trace.id}"]`)!.click());
    expect(read).not.toHaveBeenCalled();
    expect(host.querySelector(".workspace-file-preview button.primary-button")).not.toBeNull();

    const location = host.querySelector<HTMLSelectElement>("#document-library-scope")!;
    await act(async () => { location.value = folder.id; location.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(host.querySelector(`[data-document-id="${trace.id}"]`)).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>(`[data-document-id="${html.id}"]`)!.click());
    await vi.waitFor(() => {
      const iframe = host.querySelector("iframe");
      expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts");
      expect(iframe?.getAttribute("srcdoc")).toContain("DSA Notes");
    });
    expect(read).toHaveBeenCalledWith(null, html.id);
    expect(upload).not.toHaveBeenCalled();
    await act(async () => host.querySelector<HTMLButtonElement>(".workspace-file-preview .actions button")!.click());
    expect(openFolder).toHaveBeenCalledWith(folder.id);

    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    const zip = new File(["data"], "Homework.zip");
    expect(input.hasAttribute("accept")).toBe(false);
    Object.defineProperty(input, "files", { value: [zip] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(upload).toHaveBeenCalledWith(null, folder.id, zip);
    expect(host.querySelector(".workspace-file-preview h2")?.textContent).toBe(zip.name);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    read.mockRestore(); upload.mockRestore();
  }
});
