import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Crosshair, Search, X } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import type { PageHelpScope } from "../lib/featureGuides";

type HelpControl = {
  element: HTMLElement;
  key: string;
  label: string;
  description: string;
  instruction: string;
  shortcut?: string;
};

const TOOL_HELP: Record<string, { vi: string; en: string; shortcut: string }> = {
  select: { vi: "Chọn một phần tử, kéo phần tử hoặc kéo từ vùng trống để chọn nhiều phần tử.", en: "Select or drag an element, or drag from empty space to select multiple elements.", shortcut: "V" },
  hand: { vi: "Kéo để di chuyển góc nhìn canvas. Giữ Space để dùng tạm rồi quay về tool trước.", en: "Drag to pan the canvas. Hold Space to use it temporarily and return to the previous tool.", shortcut: "Space" },
  text: { vi: "Bấm lên canvas để tạo và nhập nội dung chữ.", en: "Click the canvas to create and edit text.", shortcut: "T" },
  pen: { vi: "Vẽ tự do; nét xuất hiện ngay trong lúc kéo chuột hoặc bút.", en: "Draw freely; the stroke appears while the mouse or pen moves.", shortcut: "P" },
  highlighter: { vi: "Tạo nét đánh dấu trong suốt và có thể điều chỉnh độ dày.", en: "Create translucent highlights with an adjustable width.", shortcut: "H" },
  eraser: { vi: "Xóa chính xác phần nét vẽ chạm vào đầu tẩy.", en: "Precisely erase the part of a drawing touched by the eraser.", shortcut: "E" },
  line: { vi: "Nhấn và kéo để tạo một đường thẳng.", en: "Press and drag to create a straight line.", shortcut: "L" },
  rect: { vi: "Nhấn và kéo để tạo hình chữ nhật.", en: "Press and drag to create a rectangle.", shortcut: "R" },
  ellipse: { vi: "Nhấn và kéo để tạo hình tròn hoặc elip.", en: "Press and drag to create a circle or ellipse.", shortcut: "O" },
  triangle: { vi: "Nhấn và kéo để tạo hình tam giác.", en: "Press and drag to create a triangle.", shortcut: "G" },
  connector: { vi: "Nối hai phần tử và giữ liên kết khi phần tử di chuyển.", en: "Connect two elements and keep the link while they move.", shortcut: "C" },
};

const TAB_HELP: Record<string, { vi: string; en: string }> = {
  overview: { vi: "Xem kế hoạch hôm nay, mục tiêu, chuỗi học và lối tắt.", en: "See today's plan, goals, streak and shortcuts." },
  flashcards: { vi: "Tạo bộ thẻ, chỉnh sửa và bắt đầu phiên ôn tập.", en: "Create decks, edit cards and start a review session." },
  quiz: { vi: "Tạo Quiz, chọn chế độ học và xem kết quả.", en: "Create a Quiz, choose a study mode and review results." },
  plan: { vi: "Lập kế hoạch thủ công hoặc nhờ AI gợi ý lịch học.", en: "Build a manual plan or ask AI to suggest a schedule." },
  progress: { vi: "Theo dõi chuỗi học, số thẻ đã ôn và điểm Quiz.", en: "Track streaks, reviewed cards and Quiz scores." },
  lab: { vi: "Tạo, chạy thử, lưu và tải mô phỏng HTML.", en: "Create, run, save and download HTML simulations." },
  shared: { vi: "Mở học liệu mà người khác đã chia sẻ với bạn.", en: "Open learning material shared with you." },
  music: { vi: "Quản lý nhạc học tập và Dynamic Island.", en: "Manage study music and Dynamic Island." },
};

const ROOTS: Record<PageHelpScope, string[]> = {
  workspace: [".topbar", ".workspace-home"],
  canvas: [".topbar", ".canvas-editor-heading", ".editor-layout"],
  learning: [".topbar", ".learning-hub-page"],
  folders: [".topbar", ".folder-manager"],
};

function readableLabel(element: HTMLElement, language: string) {
  const input = element as HTMLInputElement;
  const raw = element.getAttribute("aria-label") || element.getAttribute("title") || input.placeholder || element.textContent || "";
  const label = raw.replace(/\s+/g, " ").trim();
  return label || (language === "vi" ? "Điều khiển" : "Control");
}

function explain(element: HTMLElement, label: string, language: string) {
  const vi = language === "vi";
  const tool = element.dataset.tool;
  if (tool && TOOL_HELP[tool]) return { description: TOOL_HELP[tool][vi ? "vi" : "en"], shortcut: TOOL_HELP[tool].shortcut };
  const tab = element.dataset.guideTab;
  if (tab && TAB_HELP[tab]) return { description: TAB_HELP[tab][vi ? "vi" : "en"] };
  const classes = element.className?.toString() ?? "";
  const value = `${label} ${classes}`.toLocaleLowerCase();
  const rules: Array<[RegExp, string, string]> = [
    [/search|tìm/, "Tìm nhanh nội dung đang có trên trang.", "Search the content available on this page."],
    [/workspace-create|project mới|new project/, "Tạo một project canvas mới và mở ngay sau khi lưu.", "Create a new canvas project and open it after saving."],
    [/import|nhập/, "Nhập project từ file MindCanvas hoặc JSON trên thiết bị.", "Import a MindCanvas or JSON project from this device."],
    [/favorite|yêu thích|ngôi sao/, "Thêm hoặc bỏ project khỏi danh sách Yêu thích.", "Add or remove the project from Favorites."],
    [/project-card-menu|thao tác project|project actions/, "Mở các thao tác Đổi tên, Chuyển thư mục, Nhân đôi và Thùng rác.", "Open Rename, Move, Duplicate and Trash actions."],
    [/project-open/, "Mở project này trong canvas.", "Open this project on the canvas."],
    [/newfolder|thư mục mới|tạo thư mục/, "Tạo một thư mục mới để sắp xếp project.", "Create a new folder to organize projects."],
    [/manager-documents|tài liệu đã tải|uploaded documents/, "Mở lại PDF, DOCX, PPTX và Excel đã tải lên từ canvas.", "Reopen PDF, DOCX, PPTX and Excel files uploaded from a canvas."],
    [/manager-folder/, "Chuyển vùng nội dung sang Workspace hoặc thư mục tương ứng.", "Switch the content area to Workspace or the selected folder."],
    [/learning-music|nhạc|music/, "Mở thư viện nhạc học tập và các điều khiển phát.", "Open the study music library and playback controls."],
    [/fullscreen|toàn màn hình|phóng to/, "Mở hoặc thoát chế độ toàn màn hình.", "Enter or exit fullscreen mode."],
    [/undo|hoàn tác/, "Quay lại thay đổi gần nhất trên canvas.", "Undo the most recent canvas change."],
    [/redo|làm lại/, "Khôi phục thay đổi vừa hoàn tác.", "Redo the most recently undone change."],
    [/save|lưu/, "Lưu trạng thái hiện tại.", "Save the current state."],
    [/share|chia sẻ/, "Mở thiết lập chia sẻ và quyền truy cập.", "Open sharing and access settings."],
    [/export|xuất|tải file/, "Xuất nội dung theo định dạng được ghi trên nút.", "Export content in the format named by the button."],
    [/duplicate|nhân đôi/, "Tạo một bản sao độc lập của mục đang chọn.", "Create an independent copy of the selected item."],
    [/move|chuyển/, "Chuyển mục đang chọn sang một thư mục khác.", "Move the selected item to another folder."],
    [/delete|xóa|thùng rác/, "Xóa mục hoặc đưa mục vào Thùng rác theo nội dung nút.", "Delete the item or move it to Trash as indicated."],
    [/ai|sparkle|tạo sơ đồ/, "Mở công cụ AI và xem trước kết quả trước khi áp dụng.", "Open AI tools and preview results before applying them."],
    [/toolbar-toggle|mở rộng|thu gọn/, "Mở rộng hoặc thu gọn khu vực công cụ.", "Expand or collapse the tool area."],
    [/zoom|100%|\+|−/, "Điều chỉnh mức phóng to của vùng đang xem.", "Adjust the zoom level of the current view."],
    [/properties|thuộc tính/, "Mở bảng chỉnh màu, độ dày và thuộc tính của phần tử.", "Open color, stroke and element properties."],
    [/copy|sao chép/, "Sao chép mục đang chọn.", "Copy the selected item."],
    [/paste|dán/, "Dán nội dung đã sao chép.", "Paste copied content."],
  ];
  const matched = rules.find(([pattern]) => pattern.test(value));
  return { description: matched ? (vi ? matched[1] : matched[2]) : vi ? `Thực hiện chức năng “${label}” trên trang hiện tại.` : `Use “${label}” on the current page.` };
}

function instructionFor(element: HTMLElement, language: string) {
  const vi = language === "vi";
  if (element instanceof HTMLSelectElement) return vi ? "Bấm để mở danh sách rồi chọn một giá trị." : "Open the list and choose a value.";
  if (element instanceof HTMLInputElement) {
    if (element.type === "range") return vi ? "Kéo thanh trượt để thay đổi giá trị." : "Drag the slider to change the value.";
    if (element.type === "file") return vi ? "Bấm để chọn file từ thiết bị." : "Click to choose a file from the device.";
    if (element.type === "checkbox") return vi ? "Bấm để bật hoặc tắt tùy chọn." : "Click to turn the option on or off.";
    return vi ? "Bấm vào ô rồi nhập nội dung." : "Click the field and enter text.";
  }
  return vi ? "Bấm một lần để sử dụng." : "Click once to use it.";
}

function scanControls(scope: PageHelpScope, language: string): HelpControl[] {
  const candidates = ROOTS[scope].flatMap(selector => [...document.querySelectorAll<HTMLElement>(`${selector} button, ${selector} input:not([type=hidden]), ${selector} select, ${selector} a[href]`)]);
  const seen = new Set<string>();
  const controls: HelpControl[] = [];
  for (const element of candidates) {
    if (element.closest(".page-help-root, .feature-guide-root, .feature-guide-celebration-root")) continue;
    if (element.hidden || element.getAttribute("aria-hidden") === "true") continue;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const label = readableLabel(element, language);
    const semantic = `${element.tagName}:${element.dataset.tool ?? ""}:${element.dataset.guideTab ?? ""}:${label.replace(/:\s.+$/, "").toLocaleLowerCase()}`;
    if (seen.has(semantic)) continue;
    seen.add(semantic);
    const info = explain(element, label, language);
    controls.push({ element, key: `${semantic}:${controls.length}`, label, description: info.description, instruction: instructionFor(element, language), shortcut: info.shortcut });
    if (controls.length >= 60) break;
  }
  return controls;
}

function copyVisualStyle(source: HTMLElement, target: HTMLElement) {
  const style = window.getComputedStyle(source);
  const properties = ["color", "background", "backgroundColor", "border", "borderColor", "borderRadius", "boxShadow", "font", "fontSize", "fontWeight", "lineHeight", "padding", "minWidth", "minHeight", "height", "display", "alignItems", "justifyContent", "gap", "opacity"];
  for (const property of properties) target.style.setProperty(property, style.getPropertyValue(property));
  target.style.maxWidth = "210px";
  target.style.pointerEvents = "none";
  target.style.margin = "0";
}

function ControlPreview({ element }: { element: HTMLElement }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const clone = element.cloneNode(true) as HTMLElement;
    clone.removeAttribute("id");
    clone.removeAttribute("name");
    clone.setAttribute("aria-hidden", "true");
    clone.setAttribute("tabindex", "-1");
    if (clone instanceof HTMLButtonElement || clone instanceof HTMLInputElement || clone instanceof HTMLSelectElement) clone.disabled = true;
    copyVisualStyle(element, clone);
    host.replaceChildren(clone);
    return () => host.replaceChildren();
  }, [element]);
  return <div className="page-help-control-preview" ref={root}/>;
}

export default function PageHelpPanel({ scope, onClose }: { scope: PageHelpScope; onClose: () => void }) {
  const { language } = useLanguage();
  const [query, setQuery] = useState("");
  const [controls, setControls] = useState<HelpControl[]>([]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setControls(scanControls(scope, language)));
    return () => window.cancelAnimationFrame(frame);
  }, [language, scope]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    return value ? controls.filter(item => `${item.label} ${item.description}`.toLocaleLowerCase().includes(value)) : controls;
  }, [controls, query]);
  const title = language === "vi" ? "Trợ giúp trang này" : "Help for this page";
  const locate = (control: HelpControl) => {
    onClose();
    window.setTimeout(() => {
      control.element.scrollIntoView?.({ behavior: "smooth", block: "center", inline: "center" });
      control.element.classList.add("page-help-locate-target");
      window.setTimeout(() => control.element.classList.remove("page-help-locate-target"), 2400);
    }, 80);
  };
  return createPortal(<div className="page-help-root" role="dialog" aria-modal="true" aria-label={title}>
    <button className="page-help-backdrop" aria-label={language === "vi" ? "Đóng trợ giúp" : "Close help"} onClick={onClose}/>
    <aside className="page-help-panel">
      <header><div><span>{language === "vi" ? "MINDCANVAS · HƯỚNG DẪN" : "MINDCANVAS · GUIDE"}</span><h2>{title}</h2><p>{language === "vi" ? "Chỉ hiển thị những điều khiển thuộc trang hoặc tab đang mở. Hình minh họa dùng đúng kiểu và màu hiện tại." : "Only controls from the current page or tab are shown. Previews use the current shape and colors."}</p></div><button type="button" className="icon-button" aria-label={language === "vi" ? "Đóng" : "Close"} onClick={onClose}><X size={19}/></button></header>
      <label className="page-help-search"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={language === "vi" ? "Tìm công cụ hoặc nút…" : "Find a tool or button…"}/></label>
      <div className="page-help-list">{filtered.map(control => <article className="page-help-row" key={control.key}>
        <ControlPreview element={control.element}/>
        <div className="page-help-copy"><div><strong>{control.label}</strong>{control.shortcut && <kbd>{control.shortcut}</kbd>}</div><p>{control.description}</p><small>{control.instruction}</small></div>
        <button type="button" className="secondary-button page-help-locate" onClick={() => locate(control)}><Crosshair size={15}/>{language === "vi" ? "Chỉ vị trí" : "Show me"}</button>
      </article>)}{!filtered.length && <div className="page-help-empty">{language === "vi" ? "Không tìm thấy điều khiển phù hợp trên trang này." : "No matching control is visible on this page."}</div>}</div>
    </aside>
  </div>, document.body);
}
