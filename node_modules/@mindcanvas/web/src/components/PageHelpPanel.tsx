import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlignLeft,
  BookOpen,
  CircleHelp,
  CircleUserRound,
  Crosshair,
  Eraser,
  FilePlus2,
  FileText,
  FolderCog,
  FolderPlus,
  Hand,
  Maximize2,
  MoreHorizontal,
  MousePointer2,
  Music2,
  PenLine,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Table2,
  Upload,
  X,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";
import { useLanguage } from "../lib/i18n";
import type { PageHelpScope } from "../lib/featureGuides";

/**
 * The help panel deliberately uses a fixed catalogue. It must never use
 * button text, input values, project names, file names, or document contents
 * as help copy. A selector only locates the real control to highlight.
 */
type HelpCatalogueEntry = {
  id: string;
  selector: string;
  icon: LucideIcon;
  vi: { name: string; description: string };
  en: { name: string; description: string };
  shortcut?: string;
};

type HelpControl = HelpCatalogueEntry & { element: HTMLElement };

const common: HelpCatalogueEntry[] = [
  { id: "topbar:command", selector: ".topbar .command-trigger", icon: Search, vi: { name: "Tìm nhanh", description: "Mở tìm kiếm nhanh cho tính năng và nội dung." }, en: { name: "Quick search", description: "Open quick search for features and content." }, shortcut: "Ctrl/⌘ K" },
  { id: "topbar:focus", selector: ".topbar .focus-mode-toggle", icon: Maximize2, vi: { name: "Chế độ tập trung", description: "Thu gọn phần phụ để tập trung vào vùng đang làm việc." }, en: { name: "Focus mode", description: "Reduce secondary UI while you work." }, shortcut: "Ctrl/⌘ Shift F" },
  { id: "topbar:account", selector: ".topbar .account-menu-trigger, .topbar .profile-menu-trigger", icon: CircleUserRound, vi: { name: "Tài khoản", description: "Mở cài đặt tài khoản và phiên làm việc." }, en: { name: "Account", description: "Open account and session settings." } },
];

const canvasTools: HelpCatalogueEntry[] = [
  { id: "canvas:select", selector: '[data-tool="select"]', icon: MousePointer2, vi: { name: "Chọn", description: "Chọn, kéo hoặc khoanh vùng các phần tử trên canvas." }, en: { name: "Select", description: "Select, move, or marquee-select canvas elements." }, shortcut: "V" },
  { id: "canvas:hand", selector: '[data-tool="hand"]', icon: Hand, vi: { name: "Bàn tay", description: "Kéo để di chuyển góc nhìn canvas." }, en: { name: "Hand", description: "Drag to pan the canvas." }, shortcut: "Space" },
  { id: "canvas:text", selector: '[data-tool="text"]', icon: FileText, vi: { name: "Văn bản", description: "Bấm vào canvas để tạo hoặc sửa một đoạn chữ." }, en: { name: "Text", description: "Click the canvas to create or edit text." }, shortcut: "T" },
  { id: "canvas:pen", selector: '[data-tool="pen"]', icon: PenLine, vi: { name: "Bút", description: "Vẽ nét tự do bằng chuột, cảm ứng hoặc bút stylus." }, en: { name: "Pen", description: "Draw freehand with a mouse, touch, or stylus." }, shortcut: "P" },
  { id: "canvas:highlighter", selector: '[data-tool="highlighter"]', icon: PenLine, vi: { name: "Đánh dấu", description: "Tạo nét đánh dấu trong suốt với độ dày đã chọn." }, en: { name: "Highlighter", description: "Create a translucent highlight with the selected width." }, shortcut: "H" },
  { id: "canvas:eraser", selector: '[data-tool="eraser"]', icon: Eraser, vi: { name: "Tẩy", description: "Xóa phần nét vẽ chạm vào đầu tẩy." }, en: { name: "Eraser", description: "Erase drawing segments touched by the eraser." }, shortcut: "E" },
  { id: "canvas:line", selector: '[data-tool="line"]', icon: AlignLeft, vi: { name: "Đường thẳng", description: "Kéo trên canvas để tạo một đường thẳng." }, en: { name: "Line", description: "Drag on the canvas to create a straight line." }, shortcut: "L" },
  { id: "canvas:rect", selector: '[data-tool="rect"]', icon: Table2, vi: { name: "Chữ nhật", description: "Kéo trên canvas để tạo hình chữ nhật." }, en: { name: "Rectangle", description: "Drag on the canvas to create a rectangle." }, shortcut: "R" },
  { id: "canvas:ellipse", selector: '[data-tool="ellipse"]', icon: CircleHelp, vi: { name: "Elip", description: "Kéo trên canvas để tạo hình tròn hoặc elip." }, en: { name: "Ellipse", description: "Drag on the canvas to create a circle or ellipse." }, shortcut: "O" },
  { id: "canvas:triangle", selector: '[data-tool="triangle"]', icon: Plus, vi: { name: "Tam giác", description: "Kéo trên canvas để tạo hình tam giác." }, en: { name: "Triangle", description: "Drag on the canvas to create a triangle." }, shortcut: "G" },
  { id: "canvas:connector", selector: '[data-tool="connector"]', icon: Sparkles, vi: { name: "Đường nối", description: "Nối hai phần tử và giữ liên kết khi chúng di chuyển." }, en: { name: "Connector", description: "Connect two elements and keep the link as they move." }, shortcut: "C" },
  { id: "canvas:frame", selector: '[data-tool="frame"]', icon: Table2, vi: { name: "Frame", description: "Tạo một khung bố cục với kích thước mẫu A4, A5 hoặc B5." }, en: { name: "Frame", description: "Create a layout frame using an A4, A5, or B5 preset." }, shortcut: "F" },
  { id: "canvas:frame-a4", selector: '[data-help-id="canvas-frame-template-a4"]', icon: Table2, vi: { name: "Frame A4", description: "Chọn khung A4 dọc cho bố cục canvas." }, en: { name: "A4 frame", description: "Choose a portrait A4 canvas frame." } },
  { id: "canvas:frame-a5", selector: '[data-help-id="canvas-frame-template-a5"]', icon: Table2, vi: { name: "Frame A5", description: "Chọn khung A5 dọc cho bố cục canvas." }, en: { name: "A5 frame", description: "Choose a portrait A5 canvas frame." } },
  { id: "canvas:frame-b5", selector: '[data-help-id="canvas-frame-template-b5"]', icon: Table2, vi: { name: "Frame B5", description: "Chọn khung B5 dọc cho bố cục canvas." }, en: { name: "B5 frame", description: "Choose a portrait B5 canvas frame." } },
  { id: "canvas:toolbar", selector: ".editor-layout .toolbar-toggle", icon: MoreHorizontal, vi: { name: "Thanh công cụ", description: "Mở rộng hoặc thu gọn thanh công cụ canvas." }, en: { name: "Toolbar", description: "Expand or collapse the canvas toolbar." } },
  { id: "canvas:more-tools", selector: ".editor-layout .canvas-more-tools-trigger", icon: MoreHorizontal, vi: { name: "Thêm công cụ", description: "Mở các công cụ phụ trên màn hình nhỏ." }, en: { name: "More tools", description: "Open secondary tools on small screens." } },
  { id: "canvas:properties", selector: ".editor-layout .inspector-toggle", icon: SlidersHorizontal, vi: { name: "Thuộc tính", description: "Mở bảng thuộc tính của canvas hoặc phần tử đang chọn." }, en: { name: "Properties", description: "Open properties for the canvas or selected element." } },
  { id: "canvas:fullscreen", selector: ".editor-layout .canvas-fullscreen-toggle", icon: Maximize2, vi: { name: "Toàn màn hình", description: "Mở hoặc thoát chế độ toàn màn hình của canvas." }, en: { name: "Fullscreen", description: "Enter or exit canvas fullscreen mode." } },
  { id: "canvas:zoom", selector: ".editor-layout .zoom-control", icon: ZoomIn, vi: { name: "Thu phóng", description: "Điều chỉnh mức phóng to của canvas." }, en: { name: "Zoom", description: "Adjust the canvas zoom level." } },
];

const workspace: HelpCatalogueEntry[] = [
  { id: "workspace:import", selector: ".workspace-home .home-heading .secondary-button", icon: Upload, vi: { name: "Nhập project", description: "Nhập project MindCanvas hoặc JSON từ thiết bị." }, en: { name: "Import project", description: "Import a MindCanvas project or JSON from this device." } },
  { id: "workspace:create", selector: ".workspace-home .workspace-create-button", icon: FilePlus2, vi: { name: "Project mới", description: "Tạo một project canvas mới." }, en: { name: "New project", description: "Create a new canvas project." } },
  { id: "workspace:search", selector: ".workspace-home .search-field", icon: Search, vi: { name: "Tìm project", description: "Lọc project theo tiêu đề hoặc nội dung đã lập chỉ mục." }, en: { name: "Search projects", description: "Filter projects by indexed title or content." } },
  { id: "workspace:sort", selector: ".workspace-home select", icon: AlignLeft, vi: { name: "Sắp xếp project", description: "Sắp xếp theo lần chỉnh sửa hoặc tên." }, en: { name: "Sort projects", description: "Sort by recent update or name." } },
  { id: "workspace:open", selector: ".workspace-home .project-open", icon: FileText, vi: { name: "Mở project", description: "Mở project trong canvas." }, en: { name: "Open project", description: "Open a project in the canvas." } },
  { id: "workspace:favorite", selector: ".workspace-home .project-card-favorite", icon: Star, vi: { name: "Yêu thích", description: "Thêm hoặc bỏ project khỏi danh sách yêu thích." }, en: { name: "Favorite", description: "Add or remove a project from Favorites." } },
  { id: "workspace:project-menu", selector: ".workspace-home .project-card-menu-trigger", icon: MoreHorizontal, vi: { name: "Thao tác project", description: "Mở Đổi tên, Chuyển thư mục, Nhân đôi hoặc Thùng rác." }, en: { name: "Project actions", description: "Open Rename, Move, Duplicate, or Trash actions." } },
];

const folders: HelpCatalogueEntry[] = [
  { id: "folders:new", selector: ".folder-manager .folder-manager-new-folder", icon: FolderPlus, vi: { name: "Thư mục mới", description: "Tạo một thư mục để sắp xếp project." }, en: { name: "New folder", description: "Create a folder to organize projects." } },
  { id: "folders:navigate", selector: ".folder-manager .manager-folder", icon: FolderCog, vi: { name: "Điều hướng thư mục", description: "Mở Workspace, thư mục hoặc thư viện tài liệu." }, en: { name: "Folder navigation", description: "Open Workspace, a folder, or the document library." } },
  { id: "folders:actions", selector: ".folder-manager .manager-folder-actions", icon: MoreHorizontal, vi: { name: "Thao tác thư mục", description: "Đổi tên hoặc xóa thư mục đã chọn." }, en: { name: "Folder actions", description: "Rename or delete the selected folder." } },
  { id: "folders:upload", selector: ".folder-manager .manager-toolbar-actions .primary-button", icon: Upload, vi: { name: "Tải tài liệu lên", description: "Lưu PDF, DOCX, PPTX hoặc XLSX vào thư viện cục bộ." }, en: { name: "Upload documents", description: "Store PDF, DOCX, PPTX, or XLSX in the local library." } },
  { id: "folders:search", selector: ".folder-manager .manager-document-search, .folder-manager input[placeholder*='ìm'], .folder-manager input[placeholder*='earch']", icon: Search, vi: { name: "Tìm tài liệu", description: "Lọc tài liệu trong thư viện theo tên." }, en: { name: "Search documents", description: "Filter library documents by name." } },
  { id: "folders:documents", selector: ".folder-manager .manager-documents", icon: FileText, vi: { name: "Tài liệu đã tải lên", description: "Mở thư viện tài liệu được lưu trên thiết bị." }, en: { name: "Uploaded documents", description: "Open documents stored on this device." } },
];

const learning: HelpCatalogueEntry[] = [
  { id: "learning:overview", selector: '[data-guide-tab="overview"]', icon: BookOpen, vi: { name: "Tổng quan", description: "Xem kế hoạch hôm nay, mục tiêu và lối tắt học tập." }, en: { name: "Overview", description: "See today's plan, goals, and study shortcuts." } },
  { id: "learning:flashcards", selector: '[data-guide-tab="flashcards"]', icon: BookOpen, vi: { name: "Flashcard", description: "Tạo bộ thẻ và bắt đầu phiên ôn tập." }, en: { name: "Flashcards", description: "Create decks and start a review session." } },
  { id: "learning:quiz", selector: '[data-guide-tab="quiz"]', icon: FileText, vi: { name: "Quiz", description: "Tạo bài kiểm tra và xem kết quả." }, en: { name: "Quiz", description: "Create a quiz and review results." } },
  { id: "learning:plan", selector: '[data-guide-tab="plan"]', icon: AlignLeft, vi: { name: "Kế hoạch học", description: "Lập kế hoạch thủ công hoặc dùng gợi ý AI." }, en: { name: "Study plan", description: "Build a plan manually or use AI suggestions." } },
  { id: "learning:progress", selector: '[data-guide-tab="progress"]', icon: AlignLeft, vi: { name: "Tiến độ", description: "Theo dõi chuỗi học và kết quả ôn tập." }, en: { name: "Progress", description: "Track streaks and review results." } },
  { id: "learning:lab", selector: '[data-guide-tab="lab"]', icon: Sparkles, vi: { name: "Lab", description: "Tạo, chạy thử, lưu và tải mô phỏng HTML." }, en: { name: "Lab", description: "Create, run, save, and download HTML simulations." } },
  { id: "learning:tools", selector: '[data-guide-tab="tools"]', icon: FileText, vi: { name: "Công cụ", description: "Mở trình xem tài liệu và công cụ vẽ PDF." }, en: { name: "Tools", description: "Open document viewers and PDF drawing tools." } },
  { id: "learning:tools-upload", selector: ".document-tools-page .document-tools-upload", icon: Upload, vi: { name: "Tải tài liệu", description: "Thêm PDF, DOCX, PPTX hoặc XLSX vào thư viện cục bộ." }, en: { name: "Upload document", description: "Add a PDF, DOCX, PPTX, or XLSX to the local library." } },
  { id: "learning:tools-filter", selector: ".document-tools-page .document-tools-tabs", icon: FileText, vi: { name: "Lọc loại tài liệu", description: "Chọn nhóm file muốn hiển thị trong thư viện." }, en: { name: "Filter file type", description: "Choose which file type to show in the library." } },
  { id: "learning:shared", selector: '[data-guide-tab="shared"]', icon: CircleUserRound, vi: { name: "Được chia sẻ với tôi", description: "Mở học liệu người khác đã chia sẻ với bạn." }, en: { name: "Shared with me", description: "Open learning material shared with you." } },
  { id: "learning:music", selector: '[data-help-id="learning-music"]', icon: Music2, vi: { name: "Nhạc", description: "Mở thư viện nhạc học tập và điều khiển phát." }, en: { name: "Music", description: "Open study music and playback controls." } },
];

const ROOTS: Record<PageHelpScope, string[]> = {
  workspace: [".topbar", ".workspace-home"],
  canvas: [".topbar", ".canvas-editor-heading", ".editor-layout"],
  learning: [".topbar", ".learning-hub-page"],
  folders: [".topbar", ".folder-manager"],
};

function catalogueFor(scope: PageHelpScope) {
  if (scope === "canvas") return [...common, ...canvasTools];
  if (scope === "workspace") return [...common, ...workspace];
  if (scope === "folders") return [...common, ...folders];
  return [...common, ...learning];
}

function isVisible(element: HTMLElement) {
  if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
  if (element.closest(".page-help-root, .feature-guide-root, .feature-guide-celebration-root")) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function inScope(element: HTMLElement, scope: PageHelpScope) {
  return ROOTS[scope].some(root => element.closest(root));
}

function scanControls(scope: PageHelpScope): HelpControl[] {
  const seen = new Set<string>();
  const controls: HelpControl[] = [];
  for (const item of catalogueFor(scope)) {
    const element = [...document.querySelectorAll<HTMLElement>(item.selector)].find(candidate => isVisible(candidate) && inScope(candidate, scope));
    if (!element || seen.has(item.id)) continue;
    seen.add(item.id);
    controls.push({ ...item, element });
  }
  return controls;
}

function IconPreview({ icon: Icon }: { icon: LucideIcon }) {
  return <span className="page-help-icon-preview" aria-hidden="true"><Icon size={18}/></span>;
}

export default function PageHelpPanel({ scope, onClose }: { scope: PageHelpScope; onClose: () => void }) {
  const { language } = useLanguage();
  const [query, setQuery] = useState("");
  const [controls, setControls] = useState<HelpControl[]>([]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setControls(scanControls(scope)));
    return () => window.cancelAnimationFrame(frame);
  }, [scope, language]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    return value ? controls.filter(item => `${item.vi.name} ${item.en.name} ${item.vi.description} ${item.en.description}`.toLocaleLowerCase().includes(value)) : controls;
  }, [controls, query]);
  const vi = language === "vi";
  const title = vi ? "Trợ giúp trang này" : "Help for this page";
  const locate = (control: HelpControl) => {
    onClose();
    window.setTimeout(() => {
      control.element.scrollIntoView?.({ behavior: "smooth", block: "center", inline: "center" });
      control.element.classList.add("page-help-locate-target");
      window.setTimeout(() => control.element.classList.remove("page-help-locate-target"), 2400);
    }, 80);
  };
  return createPortal(<div className="page-help-root" role="dialog" aria-modal="true" aria-label={title}>
    <button className="page-help-backdrop" aria-label={vi ? "Đóng trợ giúp" : "Close help"} onClick={onClose}/>
    <aside className="page-help-panel">
      <header><div><span>{vi ? "MINDCANVAS · HƯỚNG DẪN" : "MINDCANVAS · GUIDE"}</span><h2>{title}</h2><p>{vi ? "Chỉ hiển thị công cụ của trang đang mở. Nội dung tài liệu, tên project và tên file không được đưa vào đây." : "Only tools from the open page are shown. Document contents, project names, and file names are never included."}</p></div><button type="button" className="icon-button" aria-label={vi ? "Đóng" : "Close"} onClick={onClose}><X size={19}/></button></header>
      <label className="page-help-search"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={vi ? "Tìm công cụ…" : "Find a tool…"}/></label>
      <div className="page-help-list">{filtered.map(control => { const Icon = control.icon; const copy = vi ? control.vi : control.en; return <article className="page-help-row" key={control.id}>
        <IconPreview icon={Icon}/>
        <div className="page-help-copy"><div><strong>{copy.name}</strong>{control.shortcut && <kbd>{control.shortcut}</kbd>}</div><p>{copy.description}</p></div>
        <button type="button" className="secondary-button page-help-locate" onClick={() => locate(control)}><Crosshair size={15}/>{vi ? "Chỉ vị trí" : "Show me"}</button>
      </article>; })}{!filtered.length && <div className="page-help-empty">{vi ? "Không có công cụ nào đang hiển thị trên trang này." : "No tools from this page are visible."}</div>}</div>
    </aside>
  </div>, document.body);
}
