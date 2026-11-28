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
import WorkspaceSharedPage from "../../src/components/WorkspaceSharedPage";
import { useSharedRoute } from "../../src/hooks/useSharedRoute";
import { workspaceShareUrl } from "../../src/lib/workspaceShareLinks";
import { isIOSDevice } from "../../src/lib/canvasInput";
import { blankBoard } from "../../src/lib/board";
import { newA4Layout, newA4Page } from "../../src/lib/a4Canvas";
import { saveDocument } from "../../src/lib/documentStore";
import { addFolder, cacheProject, waitForProjectCache, upsertFlashcardDeck, upsertFlashcard } from "../../src/lib/projectStore";
import { createDeck, createFlashcard } from "../../src/lib/flashcards";
import { finishGuide, GUIDE_DEFINITIONS } from "../../src/lib/featureGuides";
import { upsertQuizTest } from "../../src/lib/quizStore";
import { musicStore } from "../../src/lib/musicStorage";
import { saveStoredLab } from "../../src/lib/labStorage";
import { emptyLabEditor } from "../../src/components/LabEditorDialog";
import OnlineMusicRoom from "../../src/components/OnlineMusicRoom";
import { PageChromeProvider, ShellBack } from "../../src/components/PageNavigation";
import { LanguageProvider } from "../../src/lib/i18n";
import { useEffect, useRef, useState } from "react";
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
  const [request] = useState(() => new URLSearchParams(location.search).has("pending-close-race") ? { peerId: "peer", version: 1 } : null);
  return <>
    <button type="button" id="open-dialog" onClick={() => setOpen(true)}>Open test form</button>
    {open && <Dialog title={longName} workspace onClose={() => setOpen(false)}
      footer={<button id="confirm-dialog" type="button" onClick={() => setOpen(false)}>Confirm</button>}>
      {Array.from({ length: 12 }, (_, index) => <label key={index}>Input {index + 1}<input/></label>)}
    </Dialog>}
    <ChatBubble owner="reader" request={request} onOpenShared={() => {}}/>
  </>;
}

function SharedThreadFixture() {
  const area = useRef<HTMLElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const shared = useSharedRoute(area, backButton);
  return <div className={`app-shell${isIOSDevice() ? " ios-device" : ""}`}>
    <main ref={area} className="main-area">
      {shared.detail?.token ? <>
        <header className="topbar"><button ref={backButton} className="qa-shared-back" onClick={() => shared.back()}>Back to messages</button></header>
        <WorkspaceSharedPage token={shared.detail.token} signedIn onSignIn={() => {}} inWorkspace/>
      </> : <h1>Workspace</h1>}
    </main>
    <ChatBubble owner="reader" request={null} onOpenShared={() => {}} suspended={!!shared.detail}
      onOpenLink={(token, trigger) => shared.open(workspaceShareUrl(token), "chat", trigger)}/>
  </div>;
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

async function samplePdf() {
  const pdf = await PDFDocument.create();
  for (let page = 1; page <= 2; page++) pdf.addPage([595, 842]).drawText("MindCanvas QA page " + page, { x: 36, y: 760 });
  return pdf.saveAsBase64({ dataUri: true });
}

async function seedDocuments() {
  if (localStorage.getItem("mindcanvas:responsive-documents")) return;
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const pages = [1, 2, 3].map(page => (page === 1 ? "" : '<w:p><w:r><w:br w:type="page"/></w:r></w:p>') +
    Array.from({ length: 18 }, (_, row) => '<w:p><w:r><w:t>Sample page ' + page + ', line ' + row + '</w:t></w:r></w:p>').join("")).join("");
  zip.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + pages +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:bottom="1440" w:left="1440" w:right="1440"/></w:sectPr></w:body></w:document>');
  const xlsx = await import("xlsx");
  const book = xlsx.utils.book_new();
  for (const sheet of ["Sheet One", "Sheet Two"]) {
    const cellValues = Array.from({ length: 36 }, (_, row) => Array.from({ length: 14 }, (_, column) => sheet + " row " + row + " col " + column));
    xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet(cellValues), sheet);
  }
  const wordMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const sheetMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const docs = [
    { kind: "pdf", mimeType: "application/pdf", dataUrl: await samplePdf() },
    { kind: "docx", mimeType: wordMime, dataUrl: "data:" + wordMime + ";base64," + await zip.generateAsync({ type: "base64" }) },
    { kind: "xlsx", mimeType: sheetMime, dataUrl: "data:" + sheetMime + ";base64," + xlsx.write(book, { type: "base64", bookType: "xlsx" }) },
  ] as const;
  for (const doc of docs) await saveDocument(null, { ...doc, name: longName + "." + doc.kind, size: doc.dataUrl.length, folderId: null });
  localStorage.setItem("mindcanvas:responsive-documents", "1");
}

function MusicRoomFixture() {
  const [foreground, setForeground] = useState(true);
  return <main className="app-shell"><div className="main-area">
    <header className="topbar"><ShellBack/></header>
    <div className="workspace-route-content" style={{ minHeight: 180 }}/>
    <OnlineMusicRoom link={{ id: "60000000-0000-4000-8000-000000000001" }} owner="host" vi foreground={foreground}
      onBack={() => {}} onMinimize={() => setForeground(false)} onRestore={() => setForeground(true)}/>
    {foreground && <div aria-hidden="true" style={{ flex: "0 0 100dvh" }}/>}
  </div></main>;
}

async function main() {
  const root = createRoot(document.getElementById("root")!);
  if (location.pathname === "/qa/music-room") {
    const player = {
      playing: false, starts: 0, pauses: 0,
      getDuration: () => 195, getCurrentTime: () => 0, setVolume() {}, seekTo() {}, destroy() {},
      playVideo() { this.playing = true; this.starts++; },
      pauseVideo() { this.playing = false; this.pauses++; },
    };
    Object.assign(window, { qaRoomPlayer: player, YT: { Player: function (_iframe: HTMLIFrameElement, config: {
      events: { onReady: (event: { target: typeof player }) => void };
    }) {
      queueMicrotask(() => config.events.onReady({ target: player }));
      return player;
    } } });
    root.render(<LanguageProvider><PageChromeProvider openQuickActions={() => {}}><MusicRoomFixture/></PageChromeProvider></LanguageProvider>);
    return;
  }
  const qaMusic = new URLSearchParams(location.search).get("qa-music");
  if (qaMusic === "local") {
    const sampleRate = 8000, sampleCount = 8 * sampleRate;
    const audio = new ArrayBuffer(44 + sampleCount * 2), data = new DataView(audio);
    const ascii = (offset: number, value: string) => [...value].forEach((ch, index) => data.setUint8(offset + index, ch.charCodeAt(0)));
    ascii(0, "RIFF"); data.setUint32(4, audio.byteLength - 8, true); ascii(8, "WAVEfmt ");
    data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
    data.setUint32(24, sampleRate, true); data.setUint32(28, sampleRate * 2, true);
    data.setUint16(32, 2, true); data.setUint16(34, 16, true); ascii(36, "data");
    data.setUint32(40, audio.byteLength - 44, true);
    for (let i = 0; i < sampleCount; i++) data.setInt16(44 + i * 2, Math.sin(i / sampleRate * 2 * Math.PI * 220) * 300, true);
    await musicStore("guest", "put", { id: "qa-local", owner: "guest", title: "Âm thanh QA", source: "local", blob: new Blob([audio], { type: "audio/wav" }) });
  } else if (qaMusic) {
    await musicStore("guest", "put", { id: "qa-youtube", owner: "guest", title: "Piano QA", source: "youtube", url: "https://www.youtube.com/watch?v=abcdefghijk" });
    const player = {
      time: 0, playing: false, destroy() { this.playing = false; }, setVolume() {},
      getDuration() { return 195; }, getCurrentTime() { return this.time; }, seekTo(value: number) { this.time = value; },
      getPlaylist() { return undefined; }, getPlaylistIndex() { return -1; }, playVideoAt() {},
      playVideo() {}, pauseVideo() {},
    };
    Object.assign(window, { qaMusicPlayer: player, YT: { Player: function (_iframe: HTMLIFrameElement, config: {
      events: { onReady: (event: { target: typeof player }) => void; onStateChange: (event: { data: number }) => void };
    }) {
      player.playVideo = () => { player.playing = true; config.events.onStateChange({ data: 1 }); };
      player.pauseVideo = () => { player.playing = false; config.events.onStateChange({ data: 2 }); };
      queueMicrotask(() => config.events.onReady({ target: player }));
      return player;
    } } });
  }
  if (location.pathname === "/qa/topbar") {
    root.render(<LanguageProvider><TopbarFixture/></LanguageProvider>);
    return;
  }
  if (location.pathname === "/qa/chat") {
    root.render(<LanguageProvider><ChatFixture/></LanguageProvider>);
    return;
  }
  if (location.pathname === "/qa/shared-thread") {
    root.render(<LanguageProvider><SharedThreadFixture/></LanguageProvider>);
    return;
  }
  if (location.pathname === "/qa/pdf") {
    const dataUrl = await samplePdf();
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
  await seedDocuments();
  root.render(location.pathname === "/qa/navigation" ? <NavigationFixture/> : <App/>);
}
void main();

