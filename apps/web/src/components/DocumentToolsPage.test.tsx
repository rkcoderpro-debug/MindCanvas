// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import JSZip from "jszip";
import DocumentToolsPage, { buildDocx, type LibraryWorkspace } from "./DocumentToolsPage";
import { shouldHandleAnnotationMove, shouldRequestPdfGuide } from "./DocumentViewer";
import { PageChromeProvider, ShellBack } from "./PageNavigation";
import { LanguageProvider } from "../lib/i18n";
import * as files from "../lib/workspaceFiles";

const pdf = vi.hoisted(() => ({ getPage: vi.fn() }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({ promise: Promise.resolve({ numPages: 3, getPage: pdf.getPage }) }),
}));

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
    expect(host.querySelector(".document-browse-header h2")?.textContent).toBe("Document library");
    expect(host.querySelector(".document-tools-upload")?.textContent).toBe("Upload document");
    expect(host.querySelector(".document-browse-empty h3")?.textContent).toBe("No documents yet");
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
  const button = (selector: string) => host.querySelector<HTMLButtonElement>(selector)!;
  await act(async () => root.render(<LanguageProvider><PageChromeProvider openQuickActions={() => {}}><ShellBack/><DocumentToolsPage owner={null} documents={documents} onDocumentsChanged={() => {}}/></PageChromeProvider></LanguageProvider>));
  await act(async () => button('[data-tool-tab="html"]').click());
  await act(async () => button('[data-document-id="html-1"]').click());
  expect(host.querySelector(".document-reading-view")).not.toBeNull();
  expect(host.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-scripts");
  expect(host.querySelector(".document-tools-tabs, .document-library-list, .reader-back")).toBeNull();
  expect(host.querySelector('.shell-back')?.textContent).toBe("Danh sách tài liệu");
  expect(host.querySelector('a[download="Lesson.html"]')).toBeNull();
  await act(async () => button(".reader-more-toggle").click());
  expect(host.querySelector('a[download="Lesson.html"]')).not.toBeNull();
  await act(async () => button(".reader-more-toggle").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(host.querySelector('a[download="Lesson.html"]')).toBeNull();
  await act(async () => button(".shell-back").click());
  expect(host.querySelector('[data-tool-tab="html"]')?.getAttribute("aria-pressed")).toBe("true");
  expect(document.activeElement).toBe(button('[data-document-id="html-1"]'));
  await act(async () => button('[data-tool-tab="docx"]').click());
  expect(host.querySelector("iframe")).toBeNull();
  expect(host.querySelector('[data-document-id="docx-1"]')).not.toBeNull();
  await act(async () => root.unmount()); host.remove();
});

it("keeps PDF paging visible while file actions and annotation controls are collapsed", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    clearRect: vi.fn(), save: vi.fn(), scale: vi.fn(), restore: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  pdf.getPage.mockResolvedValue({
    getViewport: () => ({ width: 480, height: 600 }),
    view: [0, 0, 480, 600],
    render: () => ({ promise: Promise.resolve() }),
  });
  try {
    const document = { id: "pdf-1", owner: "guest", name: "Notes.pdf", mimeType: "application/pdf", kind: "pdf" as const, dataUrl: "data:application/pdf;base64,AA==", folderId: null, size: 1, updatedAt: new Date().toISOString() };
    const button = (selector: string) => host.querySelector<HTMLButtonElement>(selector)!;
    const pageLabel = () => host.querySelector(".document-reader-footer [aria-live]")?.textContent;
    await act(async () => root.render(<LanguageProvider><DocumentToolsPage owner={null} documents={[document]} onDocumentsChanged={() => {}}/></LanguageProvider>));
    await act(async () => button('[data-document-id="pdf-1"]').click());
    for (let tries = 0; tries < 15 && !pageLabel(); tries++)
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    expect(pageLabel()).toBe("Trang 1 / 3");
    expect(host.querySelector(".document-reader .document-reader-bar .document-pdf-zoom-control")).not.toBeNull();
    expect(host.querySelector(".document-pdf-body .document-pager, .document-reader-annotation, .reader-more-panel")).toBeNull();
    await act(async () => button(".document-reader-footer button:last-child").click());
    expect(pageLabel()).toBe("Trang 2 / 3");
    expect(pdf.getPage).toHaveBeenLastCalledWith(2);
    await act(async () => button(".document-draw-toggle").click());
    expect(host.querySelector(".document-reader-annotation .document-export-pdf")).not.toBeNull();
    await act(async () => button(".document-draw-toggle").click());
    expect(host.querySelector(".document-reader-annotation")).toBeNull();
    await act(async () => button(".reader-more-toggle").click());
    expect(host.querySelector(".reader-more-panel")?.textContent).toContain("Xuất PDF có chú thích");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    context.mockRestore();
  }
});

it("browses nested folders in the library and returns from an opened file to its folder", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const parent = { id: "65000000-0000-4000-8000-000000000003", name: "DSA" };
  const folder = { id: "65000000-0000-4000-8000-000000000001", name: "Thực hành", parentId: parent.id };
  const otherFolder = { id: "65000000-0000-4000-8000-000000000002", name: "Mạng" };
  const html = { id: "65000000-0000-4000-8000-000000000010", folderId: folder.id, name: "Notes.html", size: 75, ready: true, createdAt: new Date().toISOString() };
  const trace = { ...html, id: "65000000-0000-4000-8000-000000000011", folderId: otherFolder.id, name: "Sample.pcapng" };
  const openFolder = vi.fn();
  const read = vi.spyOn(files, "readWorkspaceFile").mockResolvedValue(new Blob(["<main><h1>DSA Notes</h1></main>"], { type: "application/octet-stream" }));
  const refresh = vi.fn();
  const upload = vi.spyOn(files, "addWorkspaceFile").mockImplementation(async (_owner, folderId, file) => ({ ...html, id: "65000000-0000-4000-8000-000000000012", folderId, name: file.name }));
  function Library() {
    const [rows, setFiles] = useState<files.WorkspaceFile[]>([html, trace]);
    const workspace: LibraryWorkspace = { repository: { files: rows, setFiles, refresh, loading: false, error: null }, folders: [parent, folder, otherFolder], openFolder };
    return <DocumentToolsPage owner={null} documents={[]} onDocumentsChanged={() => {}} workspace={workspace}/>;
  }
  try {
    await act(async () => root.render(<LanguageProvider><Library/></LanguageProvider>));
    expect(host.querySelector(`[data-document-id="${trace.id}"]`)).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>(`[data-document-id="${trace.id}"]`)!.click());
    expect(read).not.toHaveBeenCalled();
    expect(host.querySelector(".workspace-file-preview button.primary-button")).not.toBeNull();

    await act(async () => host.querySelector<HTMLButtonElement>(".reader-back")!.click());
    const picker = host.querySelector(".document-browse-scope .folder-tree-picker")!;
    await act(async () => picker.querySelector<HTMLButtonElement>(".folder-tree-trigger")!.click());
    expect(picker.textContent).not.toContain(folder.name);
    await act(async () => picker.querySelector<HTMLButtonElement>('button[aria-label="Mở rộng DSA"]')!.click());
    const choose = [...picker.querySelectorAll<HTMLButtonElement>(".folder-tree-choice")].find(button => button.textContent === folder.name)!;
    await act(async () => choose.click());
    expect(host.querySelector('.document-library-crumbs [aria-current="page"]')?.textContent).toBe(folder.name);
    expect(host.querySelector(`[data-document-id="${trace.id}"]`)).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>(`[data-document-id="${html.id}"]`)!.click());
    await vi.waitFor(() => {
      const iframe = host.querySelector("iframe");
      expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts");
      expect(iframe?.getAttribute("srcdoc")).toContain("DSA Notes");
    });
    expect(read).toHaveBeenCalledWith(null, html.id);
    expect(upload).not.toHaveBeenCalled();
    await act(async () => host.querySelector<HTMLButtonElement>(".reader-more-toggle")!.click());
    const openFolderAction = [...host.querySelectorAll<HTMLButtonElement>(".reader-more-panel button")].find(button => button.textContent === "Mở thư mục");
    await act(async () => openFolderAction!.click());
    expect(openFolder).not.toHaveBeenCalled();
    expect(host.querySelector('.document-library-crumbs [aria-current="page"]')?.textContent).toBe(folder.name);
    expect(host.querySelector(`[data-document-id="${html.id}"]`)).not.toBeNull();
    const parentCrumb = [...host.querySelectorAll<HTMLButtonElement>(".document-library-crumbs button")].find(button => button.textContent === parent.name)!;
    await act(async () => parentCrumb.click());
    const childTile = host.querySelector<HTMLButtonElement>(".document-library-folder-list button")!;
    expect(childTile.textContent).toBe(folder.name);
    await act(async () => childTile.click());
    await act(async () => host.querySelector<HTMLButtonElement>(".document-browse-scope .secondary-button")!.click());
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
