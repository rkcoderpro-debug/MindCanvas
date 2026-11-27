import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { PDFDocument } from "pdf-lib";
import type { User } from "@supabase/supabase-js";
import { CircleHelp, Crown, Focus, Gift, RefreshCw, Search } from "lucide-react";
import NotificationBell from "../../src/components/NotificationBell";
import TopbarProfile from "../../src/components/TopbarProfile";
import { BackButton } from "../../src/components/PageNavigation";
import App from "../../src/App";
import ChatBubble from "../../src/components/ChatBubble";
import Dialog from "../../src/components/Dialog";
import DocumentViewer from "../../src/components/DocumentViewer";
import { blankBoard } from "../../src/lib/board";
import { newA4Layout, newA4Page } from "../../src/lib/a4Canvas";
import { addFolder, cacheProject, waitForProjectCache, upsertFlashcardDeck, upsertFlashcard } from "../../src/lib/projectStore";
import { createDeck, createFlashcard } from "../../src/lib/flashcards";
import { finishGuide, GUIDE_DEFINITIONS } from "../../src/lib/featureGuides";
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

const accountName = "Người dùng " + "TênDài".repeat(24);
const profileUser: User = {
  id: "reader", aud: "authenticated", email: "ten-dai".repeat(19) + "@example.com",
  app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z",
};

function TopbarFixture() {
  const [selected, setSelected] = useState("");
  const [mobile, setMobile] = useState(() => matchMedia("(max-width: 620px)").matches);
  useEffect(() => {
    const query = matchMedia("(max-width: 620px)");
    const update = () => setMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return <div className="app-shell web-background-active">
    <div className="qa-topbar-desktop-rail" aria-hidden="true"/>
    <main className="main-area" data-topbar-pinned={new URLSearchParams(location.search).has("pinned")}>
      <header className="topbar">
        <div className="topbar-location"><BackButton className="shell-back" onClick={() => setSelected("back")}>{longName}</BackButton></div>
        <div className="actions">
          <button className="icon-button command-trigger" aria-label="Tìm nhanh"><Search size={18}/></button>
          <button className="icon-button focus-mode-toggle" aria-label="Tập trung"><Focus size={18}/></button>
          <button className="icon-button" aria-label="Làm mới"><RefreshCw size={18}/></button>
          <NotificationBell owner={profileUser.id} onNavigate={item => setSelected(item.source_id)}/>
          <button className="icon-button page-help-trigger" aria-label="Trợ giúp"><CircleHelp size={19}/></button>
          <div className="topbar-account-actions">
            <button className="topbar-trial-button" aria-label="Dùng thử Plus"><Gift size={15}/><span>3 ngày Plus</span></button>
            <button className="topbar-plan-button" aria-label="Gói hiện tại"><Crown size={15}/><span>Free</span></button>
            <TopbarProfile user={profileUser} accountName={accountName} working={false} canSignIn
              onProfile={() => setSelected("profile")} onAuth={() => setSelected("auth")}/>
          </div>
        </div>
      </header>
      <output id="qa-topbar-selection">{selected}</output>
      <div style={{ flex: "0 0 1000px" }} aria-hidden="true"/>
    </main>
    {mobile && <nav className="mobile-compact-nav" aria-label="Workspace">{["Workspace", "Canvas", "Học tập", "Thêm"].map(label => <button key={label}>{label}</button>)}</nav>}
    <style>{'.qa-topbar-desktop-rail { flex: 0 0 210px; } @media (max-width: 620px) { .qa-topbar-desktop-rail { flex-basis: 80px; } } @media (max-width: 480px) { .qa-topbar-desktop-rail { display: none; } }'}</style>
  </div>;
}

async function main() {
  const root = createRoot(document.getElementById("root")!);
  if (location.pathname === "/qa/topbar") {
    root.render(<LanguageProvider><TopbarFixture/></LanguageProvider>);
    return;
  }
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
    for (const guide of GUIDE_DEFINITIONS) finishGuide(null, guide.id, "skipped");
    localStorage.setItem("mindcanvas:responsive-seeded", "1");
  }
  root.render(location.pathname === "/qa/navigation" ? <NavigationFixture/> : <App/>);
}
void main();

