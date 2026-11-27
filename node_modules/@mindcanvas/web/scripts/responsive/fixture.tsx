import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { PDFDocument } from "pdf-lib";
import App from "../../src/App";
import ChatBubble from "../../src/components/ChatBubble";
import Dialog from "../../src/components/Dialog";
import DocumentViewer from "../../src/components/DocumentViewer";
import { blankBoard } from "../../src/lib/board";
import { newA4Layout, newA4Page } from "../../src/lib/a4Canvas";
import { addFolder, cacheProject, waitForProjectCache, upsertFlashcardDeck, upsertFlashcard } from "../../src/lib/projectStore";
import { createDeck, createFlashcard } from "../../src/lib/flashcards";
import { upsertQuizTest } from "../../src/lib/quizStore";
import { saveStoredLab } from "../../src/lib/labStorage";
import { emptyLabEditor } from "../../src/components/LabEditorDialog";
import { LanguageProvider } from "../../src/lib/i18n";
import { useEffect, useState } from "react";
import "../../src/styles.css";
import "../../src/studioPolish.css";
import "../../src/musicPolish.css";
import "../../src/documentReader.css";
import "../../src/responsiveLayout.css";

const projectId = "11111111-1111-4111-8111-111111111111";
const a4Id = "22222222-2222-4222-8222-222222222222";
const longName = "Bài ôn tập cấu trúc dữ liệu và giải thuật — " + "chuong_01_tai_lieu_thuc_hanh_".repeat(5);

function ChatFixture() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" id="open-dialog" onClick={() => setOpen(true)}>Open test form</button>
    {open && <Dialog title={longName} workspace onClose={() => setOpen(false)}
      footer={<button id="confirm-dialog" type="button" onClick={() => setOpen(false)}>Confirm</button>}>
      {Array.from({ length: 12 }, (_, index) => <label key={index}>Input {index + 1}<input/></label>)}
    </Dialog>}
    <ChatBubble owner="reader" request={null} onOpenShared={() => {}}/>
  </>;
}

function NavigationFixture() {
  const [shell, setShell] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const findShell = () => {
      const target = document.querySelector<HTMLElement>(".app-shell");
      if (target) {
        setShell(target);
        observer.disconnect();
      }
    };
    const observer = new MutationObserver(findShell);
    observer.observe(document.getElementById("root")!, { childList: true, subtree: true });
    findShell();
    return () => observer.disconnect();
  }, []);
  return <><App/>{shell && createPortal(
    <LanguageProvider><ChatBubble owner="reader" request={null} onOpenShared={() => {}}/></LanguageProvider>, shell,
  )}</>;
}

async function main() {
  const root = createRoot(document.getElementById("root")!);
  if (location.pathname === "/qa/chat") {
    root.render(<LanguageProvider><ChatFixture/></LanguageProvider>);
    return;
  }
  if (location.pathname === "/qa/pdf") {
    const pdf = await PDFDocument.create();
    for (let i = 1; i <= 2; i++) pdf.addPage([595, 842]).drawText("MindCanvas QA page " + i, { x: 36, y: 760 });
    const dataUrl = await pdf.saveAsBase64({ dataUri: true });
    root.render(<LanguageProvider><main className="app-shell"><div className="main-area">
      <DocumentViewer source={{ name: longName + ".pdf", kind: "pdf", mimeType: "application/pdf", dataUrl }} readOnly reader={{ actions: [] }}/>
    </div></main></LanguageProvider>);
    return;
  }
  if (!localStorage.getItem("mindcanvas:responsive-seeded")) {
    const folder = await addFolder(null, longName);
    await addFolder(null, longName + " con", folder.id);
    const board = { ...blankBoard(longName), id: projectId };
    const paper = newA4Layout();
    paper.pages.push(newA4Page("Trang hai"), newA4Page("Trang ba"));
    const a4 = { ...blankBoard(longName), id: a4Id, a4: paper };
    for (const item of [board, a4]) cacheProject(null, {
      board: item, id: item.id, title: item.title, updatedAt: item.updatedAt, folderId: null, pending: false,
    });
    await waitForProjectCache(null);
    const deck = createDeck(longName);
    await upsertFlashcardDeck(null, deck);
    await upsertFlashcard(null, createFlashcard(deck.id, "Câu hỏi " + "từ dài ".repeat(36), "Mặt sau"));
    const now = new Date().toISOString();
    await upsertQuizTest(null, {
      id: crypto.randomUUID(), title: longName, description: "Quiz mẫu kiểm thử bố cục", sourceDocumentId: null,
      createdAt: now, updatedAt: now, source: "local",
      questions: [0,1].map(index => ({
        id: crypto.randomUUID(), prompt: "Câu " + (index + 1) + " " + "Nội dung cần đọc ".repeat(6),
        options: ["Đáp án một ".repeat(8), "Đáp án hai", "Đáp án ba", "Đáp án bốn"],
        correctIndex: 0, explanation: "Giải thích", sourcePage: null,
      })),
    });
    await saveStoredLab(null, { ...emptyLabEditor(), title: longName,
      programHtml: "<html><body><p>Offline lab</p></body></html>" });
    localStorage.setItem("mindcanvas:responsive-seeded", "1");
  }
  root.render(location.pathname === "/qa/navigation" ? <NavigationFixture/> : <App/>);
}
void main();

