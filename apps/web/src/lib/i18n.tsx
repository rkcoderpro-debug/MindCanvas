import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const en = {
  copyElements: "Copy elements", pasteElements: "Paste elements",
  selectedElements: "elements selected", bringFront: "Bring to front", sendBack: "Send to back", bringForward: "Bring forward", sendBackward: "Send backward",
  group: "Group", ungroup: "Ungroup", addChild: "Add child", addSibling: "Add sibling", reparentHint: "Alt-drag one node onto another to change its parent. Shift+Enter edits the label.",
  fitCanvas: "Fit canvas", fitSelection: "Go to selection", minimap: "Minimap", favorites: "Favorites", trash: "Trash", restore: "Restore", favorite: "Add to favorites", unfavorite: "Remove favorite", moveToTrash: "Move to trash", projectActions: "Project actions", copySuffix: "copy", trashEmpty: "Trash is empty", trashHint: "Files here can be restored. They are not permanently deleted.",
  arrangeMap: "Arrange mind map",
  workspace: "Workspace", recent: "Recent files", folders: "Folders", manageFolders: "Manage folders", newFolder: "New folder", folderActions: "Folder actions", renameFolder: "Rename folder", deleteFolder: "Delete folder", deleteFolderHint: "Projects in this folder will be moved back to Workspace. The folder itself will be deleted.", copy: "Copy", paste: "Paste", fileActions: "File actions", emptyFolder: "This folder is empty", deleteFileHint: "Move this project to Trash?", theme: "Appearance", themeLight: "Light", themeDark: "Dark",
  newProject: "New project", projects: "Projects", untitled: "Untitled canvas", name: "Name",
  create: "Create", cancel: "Cancel", close: "Close", save: "Save", open: "Open",
  rename: "Rename", move: "Move to folder", noFolder: "No folder", search: "Search projects…",
  newest: "Last edited", alphabetical: "Name A–Z", empty: "Your ideas start here",
  emptyHint: "Create a blank canvas or import a MindCanvas file.", noResults: "No matching projects",
  local: "On this device", cloud: "Cloud workspace", guest: "Guest", login: "Sign in with Google",
  logout: "Sign out", checking: "Checking session…", loading: "Loading…", settings: "Settings",
  language: "Language", saved: "Saved to cloud", localSaved: "Saved on this device",
  saving: "Saving…", pending: "Waiting to sync", offline: "Offline · local copy kept",
  saveError: "Save failed", retry: "Retry", error: "Something went wrong", import: "Import file",
  export: "Download file", exportSvg: "Export SVG", exportPng: "Export PNG", exportSvgHint: "Download a scalable vector image of the canvas.", exportPngHint: "Download a PNG image of the canvas.", importError: "Invalid MindCanvas file (maximum 10 MB).",
  exportHint: "Download a private copy. Send the file to share; it does not grant cloud access.",
  select: "Select", hand: "Pan", text: "Text", pen: "Pen", highlighter: "Highlighter",
  rect: "Rectangle", ellipse: "Ellipse", connector: "Connector", node: "Mind-map node",
  newNode: "New idea", rootNode: "Main idea", newText: "Type here", editText: "Edit text",
  undo: "Undo", redo: "Redo", duplicate: "Duplicate", delete: "Delete", versionHistory: "Version history", versionHint: "Create an explicit checkpoint when you want a stable recovery point. Panning and zooming do not create history entries.", saveCheckpoint: "Save checkpoint", noVersions: "No checkpoints yet", cloudVersion: "Cloud", localVersion: "This device", restoreCreatesUndo: "Restoring creates one undoable change, and the current state is checkpointed first.", zoomIn: "Zoom in",
  zoomOut: "Zoom out", resetZoom: "Reset view", properties: "Properties", layers: "Elements", snap: "Snap to grid", alignLeft: "Align left", alignCenter: "Align center", alignRight: "Align right", alignTop: "Align top", alignMiddle: "Align middle", alignBottom: "Align bottom", distributeHorizontal: "Distribute horizontally", distributeVertical: "Distribute vertically", rotate: "Rotate", lock: "Lock", unlock: "Unlock", hide: "Hide", show: "Show",
  color: "Color", label: "Label", width: "Width", height: "Height", fontSize: "Font size", opacity: "Opacity",
  stroke: "Stroke width", collapse: "Collapse branch", expand: "Expand branch",
  canvasHint: "Drag empty space to select · Shift+click to add · Space+drag to pan",
  connectorHint: "Select a source node or shape, then a destination.",
  selectHint: "Select an element to change its position, size or color.",
  textHint: "Click anywhere to type. Escape cancels; Ctrl/⌘ + Enter finishes.",
  ai: "PDF → mind map", choosePdf: "Choose PDF", pdfHint: "Up to 10 MB. A text-based PDF is required.", pdfPreview: "PDF preview", pageRange: "Pages", allPages: "All pages", fromPage: "From", toPage: "To", applyTo: "Apply to", currentCanvas: "Current canvas", newCanvas: "New canvas", selectedPages: "Selected pages", previewChanges: "Review generated changes before applying.", rollbackHint: "Applying is one undoable canvas change.", noTextPages: "No readable text was found in the selected pages.",
  generate: "Generate preview", generating: "Reading PDF and generating…", apply: "Apply to canvas",
  aiHint: "Review and edit the labels below. Your existing canvas is preserved.",
  aiError: "Could not process the PDF. Check the API connection and model configuration.",
  aiDemo: "The server returned demo data. Configure a real AI provider before applying.",
  loginRequired: "Sign in to store PDFs and use AI.", nodes: "nodes", edges: "connections",
  page: "Page", help: "Shortcuts", helpText: "V select · H pan · T text · P pen · R rectangle · O ellipse · C connector · Ctrl/⌘+Z undo · Ctrl/⌘+D duplicate · Ctrl/⌘+S save",
  accountHint: "Cloud projects belong to the signed-in account. Local projects stay on this browser.",
  fileTooLarge: "This file exceeds 10 MB.", noFolders: "No folders yet", copied: "Copy downloaded",
  updated: "Updated", saveBeforeLeave: "Keep this tab open until saving finishes, or export a backup.",
  drawHint: "Drag to draw. Switch to Select to move individual strokes.",
  unsaved: "Unsynced changes", refresh: "Refresh",
} as const;
export type MessageKey = keyof typeof en;
export const vi: Record<MessageKey, string> = {
  copyElements: "Sao chép phần tử", pasteElements: "Dán phần tử",
  selectedElements: "phần tử đã chọn", bringFront: "Đưa lên trên cùng", sendBack: "Đưa xuống dưới cùng", bringForward: "Lên một lớp", sendBackward: "Xuống một lớp",
  group: "Gộp nhóm", ungroup: "Tách nhóm", addChild: "Thêm nhánh con", addSibling: "Thêm nhánh cùng cấp", reparentHint: "Giữ Alt rồi kéo một node lên node khác để đổi cha. Shift+Enter sửa nhãn.",
  fitCanvas: "Vừa màn hình", fitSelection: "Đến phần đã chọn", minimap: "Bản đồ nhỏ", favorites: "Yêu thích", trash: "Thùng rác", restore: "Khôi phục", favorite: "Thêm yêu thích", unfavorite: "Bỏ yêu thích", moveToTrash: "Đưa vào thùng rác", projectActions: "Thao tác project", copySuffix: "bản sao", trashEmpty: "Thùng rác trống", trashHint: "Bạn có thể khôi phục các file tại đây. File chưa bị xóa vĩnh viễn.",
  arrangeMap: "Sắp xếp mind map",
  workspace: "Workspace", recent: "File gần đây", folders: "Thư mục", manageFolders: "Quản lý thư mục", newFolder: "Thư mục mới", folderActions: "Thao tác thư mục", renameFolder: "Đổi tên thư mục", deleteFolder: "Xóa thư mục", deleteFolderHint: "Các project trong thư mục sẽ được chuyển về Workspace. Chỉ thư mục bị xóa.", copy: "Sao chép", paste: "Dán", fileActions: "Thao tác file", emptyFolder: "Thư mục này đang trống", deleteFileHint: "Đưa project này vào thùng rác?", theme: "Giao diện", themeLight: "Sáng", themeDark: "Tối",
  newProject: "Project mới", projects: "Project", untitled: "Canvas chưa đặt tên", name: "Tên",
  create: "Tạo", cancel: "Hủy", close: "Đóng", save: "Lưu", open: "Mở",
  rename: "Đổi tên", move: "Chuyển thư mục", noFolder: "Không có thư mục", search: "Tìm project…",
  newest: "Chỉnh sửa gần nhất", alphabetical: "Tên A–Z", empty: "Bắt đầu từ ý tưởng của bạn",
  emptyHint: "Tạo canvas trắng hoặc nhập file MindCanvas.", noResults: "Không có project phù hợp",
  local: "Trên thiết bị này", cloud: "Không gian đám mây", guest: "Khách", login: "Đăng nhập Google",
  logout: "Đăng xuất", checking: "Đang kiểm tra phiên…", loading: "Đang tải…", settings: "Cài đặt",
  language: "Ngôn ngữ", saved: "Đã lưu đám mây", localSaved: "Đã lưu trên máy",
  saving: "Đang lưu…", pending: "Chờ đồng bộ", offline: "Offline · giữ bản trên máy",
  saveError: "Lưu thất bại", retry: "Thử lại", error: "Đã xảy ra lỗi", import: "Nhập file",
  export: "Tải file về máy", exportSvg: "Xuất SVG", exportPng: "Xuất PNG", exportSvgHint: "Tải canvas dưới dạng ảnh vector có thể phóng to.", exportPngHint: "Tải canvas dưới dạng ảnh PNG.", importError: "File MindCanvas không hợp lệ (tối đa 10 MB).",
  exportHint: "Tải bản sao riêng tư. Gửi file để chia sẻ; không cấp quyền truy cập đám mây.",
  select: "Chọn", hand: "Di chuyển canvas", text: "Chữ", pen: "Bút", highlighter: "Bút đánh dấu",
  rect: "Chữ nhật", ellipse: "Elip", connector: "Đường nối", node: "Node sơ đồ tư duy",
  newNode: "Ý mới", rootNode: "Ý chính", newText: "Nhập nội dung", editText: "Sửa nội dung",
  undo: "Hoàn tác", redo: "Làm lại", duplicate: "Nhân đôi", delete: "Xóa", versionHistory: "Lịch sử phiên bản", versionHint: "Tạo mốc lưu rõ ràng khi bạn muốn có điểm khôi phục ổn định. Di chuyển và phóng to canvas không tạo thêm bước lịch sử.", saveCheckpoint: "Lưu mốc phiên bản", noVersions: "Chưa có mốc phiên bản", cloudVersion: "Đám mây", localVersion: "Thiết bị này", restoreCreatesUndo: "Khôi phục tạo một thay đổi có thể hoàn tác và trạng thái hiện tại sẽ được lưu mốc trước.", zoomIn: "Phóng to",
  zoomOut: "Thu nhỏ", resetZoom: "Đặt lại góc nhìn", properties: "Thuộc tính", layers: "Phần tử", snap: "Hít theo lưới", alignLeft: "Căn trái", alignCenter: "Căn giữa", alignRight: "Căn phải", alignTop: "Căn trên", alignMiddle: "Căn giữa dọc", alignBottom: "Căn dưới", distributeHorizontal: "Chia đều ngang", distributeVertical: "Chia đều dọc", rotate: "Xoay", lock: "Khóa", unlock: "Mở khóa", hide: "Ẩn", show: "Hiện",
  color: "Màu", label: "Nhãn", width: "Rộng", height: "Cao", fontSize: "Cỡ chữ", opacity: "Độ đậm",
  stroke: "Độ dày nét", collapse: "Thu nhánh", expand: "Mở nhánh",
  canvasHint: "Kéo vùng trống để chọn · Shift+bấm để chọn thêm · Space+kéo để di chuyển canvas",
  connectorHint: "Chọn node hoặc hình nguồn, sau đó chọn đích.",
  selectHint: "Chọn phần tử để thay đổi vị trí, kích thước hoặc màu.",
  textHint: "Bấm vị trí để nhập chữ. Escape hủy; Ctrl/⌘ + Enter hoàn tất.",
  ai: "PDF → sơ đồ tư duy", choosePdf: "Chọn PDF", pdfHint: "Tối đa 10 MB. Cần PDF có văn bản.", pdfPreview: "Xem trước PDF", pageRange: "Trang", allPages: "Tất cả trang", fromPage: "Từ trang", toPage: "Đến trang", applyTo: "Thêm vào", currentCanvas: "Canvas hiện tại", newCanvas: "Canvas mới", selectedPages: "Trang đã chọn", previewChanges: "Kiểm tra thay đổi do AI tạo trước khi áp dụng.", rollbackHint: "Thao tác áp dụng tạo một bước có thể hoàn tác.", noTextPages: "Không tìm thấy văn bản đọc được trong các trang đã chọn.",
  generate: "Tạo bản xem trước", generating: "Đang đọc PDF và tạo sơ đồ…", apply: "Thêm vào canvas",
  aiHint: "Kiểm tra và sửa nhãn bên dưới. Nội dung canvas hiện tại được giữ nguyên.",
  aiError: "Không xử lý được PDF. Kiểm tra kết nối API và cấu hình model.",
  aiDemo: "Server trả dữ liệu demo. Hãy cấu hình AI thật trước khi thêm vào canvas.",
  loginRequired: "Đăng nhập để lưu PDF và dùng AI.", nodes: "node", edges: "đường nối",
  page: "Trang", help: "Phím tắt", helpText: "V chọn · H di chuyển canvas · T chữ · P bút · R chữ nhật · O elip · C nối · Ctrl/⌘+Z hoàn tác · Ctrl/⌘+D nhân đôi · Ctrl/⌘+S lưu",
  accountHint: "Project đám mây thuộc tài khoản đã đăng nhập. Project local chỉ ở trình duyệt này.",
  fileTooLarge: "File vượt quá 10 MB.", noFolders: "Chưa có thư mục", copied: "Đã tải bản sao",
  updated: "Cập nhật", saveBeforeLeave: "Giữ tab mở đến khi lưu xong, hoặc tải bản sao dự phòng.",
  drawHint: "Kéo để vẽ. Đổi sang Chọn để di chuyển từng nét vẽ.",
  unsaved: "Thay đổi chưa đồng bộ", refresh: "Tải lại",
};
type Language = "vi" | "en";
export type Theme = "light" | "dark";
const ThemeContext = createContext({ theme: "light" as Theme, setTheme: (_: Theme) => {} });
const Context = createContext({ language: "vi" as Language, setLanguage: (_: Language) => {}, t: (key: MessageKey): string => vi[key] });
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => { try { return localStorage.getItem("mindcanvas:language") === "en" ? "en" : "vi"; } catch { return "vi"; } });
  const [theme, setTheme] = useState<Theme>(() => { try { return localStorage.getItem("mindcanvas:theme") === "dark" ? "dark" : "light"; } catch { return "light"; } });
  useEffect(() => { document.documentElement.lang = language; try { localStorage.setItem("mindcanvas:language", language); } catch {} }, [language]);
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem("mindcanvas:theme", theme); } catch {} }, [theme]);
  return <Context.Provider value={{ language, setLanguage, t: key => (language === "vi" ? vi : en)[key] }}><ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider></Context.Provider>;
}
export const useLanguage = () => useContext(Context);
export const useTheme = () => useContext(ThemeContext);
