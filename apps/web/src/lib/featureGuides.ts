export type GuideCategory = "workspace" | "canvas" | "learning" | "documents" | "ai";

export type GuideDemo = "navigation" | "canvas" | "learning" | "lab" | "pdf" | "ai";

export type GuideStepKind = "target" | "practice";

export type GuideStep = {
  target?: string;
  kind?: GuideStepKind;
  titleVi: string;
  titleEn: string;
  bodyVi: string;
  bodyEn: string;
};

export type GuideDefinition = {
  id: string;
  trigger?: string;
  category: GuideCategory;
  titleVi: string;
  titleEn: string;
  summaryVi: string;
  summaryEn: string;
  gifSrc?: string;
  demo: GuideDemo;
  steps: GuideStep[];
  outcomeVi?: string;
  outcomeEn?: string;
};

export type GuideStatus = "unseen" | "active" | "completed" | "skipped";

export type GuideProgressEntry = {
  status: GuideStatus;
  startedAt?: string;
  completedAt?: string;
};

export type GuideProgress = Record<string, GuideProgressEntry>;

export const GUIDE_PROGRESS_EVENT = "mindcanvas:feature-guide-progress";
export const GUIDE_REQUEST_EVENT = "mindcanvas:feature-guide-request";
export const GUIDE_CONTENT_VERSION = "v2";
const STORAGE_PREFIX = `mindcanvas:feature-guides:${GUIDE_CONTENT_VERSION}`;

/**
 * The selectors deliberately point at stable semantic classes instead of
 * generated React structure. A guide can therefore survive a small layout
 * refactor and still focus the control that the user needs to click.
 */
export const GUIDE_DEFINITIONS: GuideDefinition[] = [
  {
    id: "workspace-navigation",
    trigger: "workspace",
    category: "workspace",
    titleVi: "Làm quen Workspace",
    titleEn: "Meet your Workspace",
    summaryVi: "Mở file, lọc file và đi tới thư mục từ một thanh điều hướng gọn hơn.",
    summaryEn: "Open files, filter your workspace and jump to folders from one compact navigator.",
    gifSrc: "/guides/workspace-navigation.gif",
    demo: "navigation",
    outcomeVi: "Tự mở một project và tìm đến đúng thư mục của bạn.",
    outcomeEn: "Open a project and find the folder you want to work in.",
    steps: [
      { target: ".workspace-nav-row > button:first-child", titleVi: "Quay về Workspace", titleEn: "Return to Workspace", bodyVi: "Bấm Workspace để xem các project gần đây và trạng thái đồng bộ.", bodyEn: "Click Workspace to see recent projects and sync status." },
      { target: ".workspace-nav-row .workspace-expand", titleVi: "Mở nhóm điều hướng", titleEn: "Expand navigation", bodyVi: "Bấm mũi tên cạnh Workspace. Ba mục File gần đây, Yêu thích và Thùng rác sẽ xổ xuống ngay trong sidebar.", bodyEn: "Click the arrow beside Workspace. Recent, Favorites and Trash appear inside the sidebar." },
      { target: ".workspace-subnav button:nth-child(1)", titleVi: "Kiểm tra file gần đây", titleEn: "Check Recent files", bodyVi: "Bấm File gần đây để thấy những project bạn vừa mở. Số ở bên phải là số project còn hoạt động.", bodyEn: "Click Recent to see projects you opened lately. The number at the right is the active project count." },
      { target: ".workspace-subnav button:nth-child(2)", titleVi: "Lọc file yêu thích", titleEn: "Filter Favorites", bodyVi: "Bấm Yêu thích để chỉ giữ lại những project bạn đánh dấu sao.", bodyEn: "Click Favorites to show only projects you starred." },
      { target: ".workspace-subnav button:nth-child(3)", titleVi: "Kiểm tra thùng rác", titleEn: "Check Trash", bodyVi: "Bấm Thùng rác để khôi phục file đã xóa mềm. File trong đây chưa bị xóa vĩnh viễn.", bodyEn: "Click Trash to restore soft-deleted files. Items here are not permanently deleted." },
      { target: ".manage-folders-button", titleVi: "Mở quản lý thư mục", titleEn: "Open Folder Manager", bodyVi: "Bấm Quản lý thư mục để xem, di chuyển và đổi tên project hoặc mở lại tài liệu đã upload.", bodyEn: "Click Folder Manager to view, move or rename projects and reopen uploaded documents." },
      { target: ".folder-list .folder-open", titleVi: "Mở một thư mục", titleEn: "Open a folder", bodyVi: "Bấm vào một thư mục bất kỳ. Đây là nơi bạn sẽ quay lại để làm sản phẩm của mình.", bodyEn: "Click any folder. This is where you will return to build your own work." },
      { kind: "practice", titleVi: "Tự khám phá Workspace", titleEn: "Explore Workspace yourself", bodyVi: "Bây giờ hãy tự mở một project, thử ba bộ lọc và chọn một thư mục để tiếp tục. Khi xong, bấm nút bên dưới.", bodyEn: "Now open a project, try the three filters and choose a folder to continue. When you are done, use the button below." },
    ],
  },
  {
    id: "canvas-controls",
    trigger: "canvas",
    category: "canvas",
    titleVi: "Điều khiển canvas",
    titleEn: "Canvas controls",
    summaryVi: "Chọn, kéo, viết, highlight và phóng to canvas bằng chuột hoặc XP-Pen.",
    summaryEn: "Select, pan, draw, highlight and zoom the canvas with a mouse or XP-Pen.",
    gifSrc: "/guides/canvas-controls.gif",
    demo: "canvas",
    outcomeVi: "Tạo được một nét vẽ và di chuyển một phần tử trên canvas.",
    outcomeEn: "Draw a stroke and move an element on the canvas.",
    steps: [
      { target: ".drawing-toolbar", titleVi: "Mở thanh công cụ", titleEn: "Open the toolbar", bodyVi: "Đây là thanh công cụ chính. Bấm nút mở rộng nếu các tool đang được thu gọn.", bodyEn: "This is the main toolbar. Expand it if the tools are collapsed." },
      { target: '[data-tool="select"]', titleVi: "V — trỏ và chọn", titleEn: "V — pointer and select", bodyVi: "Bấm V để chọn một phần tử. Kéo từ vùng trống để tạo khung chọn nhiều phần tử; kéo phần đã chọn để di chuyển.", bodyEn: "Click V to select an element. Drag from empty space to marquee-select multiple elements, then drag the selection to move it." },
      { target: '[data-tool="pen"]', titleVi: "P — bút vẽ", titleEn: "P — pen", bodyVi: "Bấm P, sau đó kéo trên canvas để viết. Nét vẽ hiện ngay trong lúc kéo, kể cả với chuột hoặc bảng vẽ.", bodyEn: "Click P, then drag on the canvas to draw. The stroke renders while you drag with a mouse or tablet." },
      { target: '[data-tool="highlighter"]', titleVi: "H — highlight", titleEn: "H — highlighter", bodyVi: "Bấm H để đánh dấu trong suốt. Dùng thanh cỡ nét xuất hiện bên dưới toolbar để chỉnh độ dày.", bodyEn: "Click H for a translucent highlight. Use the size control below the toolbar to change its width." },
      { target: '[data-tool="eraser"]', titleVi: "E — eraser chính xác", titleEn: "E — precise eraser", bodyVi: "Bấm E hoặc giữ E trong lúc viết để xóa đúng phần nét chạm vào. Thả phím sẽ quay về tool trước nếu bạn đang dùng tạm.", bodyEn: "Click E or hold E while drawing to erase only the touched part. Releasing a held key returns to the previous tool." },
      { target: '[data-tool="hand"]', titleVi: "Space — hand để pan", titleEn: "Space — hand to pan", bodyVi: "Giữ Space rồi kéo để di chuyển canvas. Khi thả Space, tool trước đó tự khôi phục.", bodyEn: "Hold Space and drag to pan the canvas. Releasing Space restores the previous tool." },
      { target: ".zoom-control", titleVi: "Zoom đúng tâm nhìn", titleEn: "Zoom around the visible center", bodyVi: "Bấm −, 100% hoặc + để zoom. Tâm zoom là giữa khung canvas đang nhìn thấy; Ctrl + lăn chuột trong canvas cũng chỉ zoom canvas.", bodyEn: "Use −, 100% or + to zoom around the visible canvas center. Ctrl + wheel over the canvas zooms only the canvas." },
      { kind: "practice", titleVi: "Tự tạo một nét và di chuyển nó", titleEn: "Make a stroke and move it", bodyVi: "Hãy tự chọn P để vẽ một nét, chọn V để kéo nét sang vị trí mới, rồi thử giữ Space để pan. Khi hoàn tất, bấm nút bên dưới.", bodyEn: "Choose P to draw a stroke, choose V to move it, then hold Space to pan. When finished, use the button below." },
    ],
  },
  {
    id: "learning-hub",
    trigger: "learning",
    category: "learning",
    titleVi: "Trung tâm học tập",
    titleEn: "Learning Hub",
    summaryVi: "Tạo flashcard, quiz, kế hoạch học và Lab trong cùng một khu vực.",
    summaryEn: "Create flashcards, quizzes, study plans and Labs in one place.",
    gifSrc: "/guides/learning-hub.gif",
    demo: "learning",
    outcomeVi: "Chọn được một hoạt động học và bắt đầu phiên học đầu tiên.",
    outcomeEn: "Choose a study activity and start your first session.",
    steps: [
      { target: ".learning-hub-nav", titleVi: "Mở thanh công cụ học", titleEn: "Find the study tabs", bodyVi: "Thanh này chứa Overview, Flashcard, Quiz, Kế hoạch, Tiến độ và Lab. Trạng thái học được giữ lại trên thiết bị và tài khoản.", bodyEn: "This bar contains Overview, Flashcards, Quiz, Plan, Progress and Lab. Study state is kept on this browser and account." },
      { target: ".learning-hub-nav button:nth-child(2)", titleVi: "Mở Flashcard", titleEn: "Open Flashcards", bodyVi: "Bấm Flashcard để tạo bộ thẻ, liên kết project và ôn theo lịch lặp lại ngắt quãng.", bodyEn: "Click Flashcards to create decks, link a project and review with spaced repetition." },
      { target: ".learning-hub-nav button:nth-child(3)", titleVi: "Mở Quiz", titleEn: "Open Quiz", bodyVi: "Bấm Quiz để tạo hoặc làm bài bốn lựa chọn. Bạn có thể xem giải thích sau mỗi câu.", bodyEn: "Click Quiz to create or take four-choice tests. Explanations are available after each answer." },
      { target: ".learning-hub-nav button:nth-child(4)", titleVi: "Lập kế hoạch học", titleEn: "Plan a study path", bodyVi: "Bấm Kế hoạch để chọn nhiệm vụ, số thẻ và thời gian tập trung cho từng ngày.", bodyEn: "Click Plan to choose tasks, card targets and focus time for each day." },
      { target: ".learning-hub-nav button:nth-child(6)", titleVi: "Mở Lab", titleEn: "Open Lab", bodyVi: "Bấm Lab để tạo mô phỏng HTML tương tác; bước chạy luôn dùng file HTML hoàn chỉnh thay vì đoạn text rời.", bodyEn: "Click Lab to build an interactive HTML simulation. The runner uses a complete HTML file instead of loose text." },
      { kind: "practice", titleVi: "Tự bắt đầu một phiên học", titleEn: "Start a study session", bodyVi: "Hãy tự chọn Flashcard hoặc Quiz, tạo một nội dung nhỏ và mở phiên học đầu tiên. Khi xong, bấm nút bên dưới.", bodyEn: "Choose Flashcards or Quiz, create a small item and open your first study session. When finished, use the button below." },
    ],
  },
  {
    id: "lab-simulation",
    trigger: "lab",
    category: "ai",
    titleVi: "Tạo Lab tương tác",
    titleEn: "Build an interactive Lab",
    summaryVi: "Yêu cầu AI trả về file HTML, tải lên, chạy thử và lưu lại mô phỏng.",
    summaryEn: "Ask AI for an HTML file, upload it, run it safely and save the simulation.",
    gifSrc: "/guides/lab-simulation.gif",
    demo: "lab",
    outcomeVi: "Chạy thử và lưu được một mô phỏng HTML có thể tải xuống.",
    outcomeEn: "Run and save a downloadable HTML simulation.",
    steps: [
      { target: ".lab-step-card", titleVi: "Chuẩn bị yêu cầu", titleEn: "Prepare the request", bodyVi: "Điền tên Lab, môn học, nguồn và điều người học cần điều chỉnh. Bấm Tạo HTML prompt để yêu cầu AI trả về một file HTML tự chạy.", bodyEn: "Fill in the Lab title, subject, source and what the learner should adjust. Create an HTML prompt that asks AI for a self-contained file." },
      { target: ".lab-step-card .lab-actions .primary-button", titleVi: "Tạo prompt HTML", titleEn: "Create the HTML prompt", bodyVi: "Bấm nút này, sao chép prompt và gửi cho AI bạn chọn. Nhắc AI trả về file .html hoàn chỉnh để dễ tải xuống.", bodyEn: "Click this button, copy the prompt and send it to your AI provider. Ask for a complete .html file that can be downloaded." },
      { target: ".lab-run-card .lab-upload-field", titleVi: "Đưa file HTML vào runner", titleEn: "Bring the HTML file into the runner", bodyVi: "Chọn file .html AI trả về hoặc dán toàn bộ nội dung vào ô Simulation HTML. File được kiểm tra trước khi chạy.", bodyEn: "Choose the returned .html file or paste the complete document into Simulation HTML. It is checked before running." },
      { target: ".lab-run-card .lab-actions .primary-button", titleVi: "Kiểm tra và chạy", titleEn: "Check and run", bodyVi: "Bấm Kiểm tra và chạy để mở preview sandbox. Nếu có resource ngoài hoặc HTML không an toàn, runner sẽ báo để bạn sửa.", bodyEn: "Click Check and run to open the sandbox preview. Unsafe external resources are reported before execution." },
      { target: ".lab-runner-toolbar button", titleVi: "Lưu Lab", titleEn: "Save the Lab", bodyVi: "Nút Lưu Lab nằm ngay trên runner và còn có bản sticky ở chân trang, nên không biến mất khi bạn cuộn.", bodyEn: "Save lab is on the runner and repeated in the sticky footer, so it stays available while you scroll." },
      { target: ".lab-footer-actions", titleVi: "Kiểm tra trạng thái lưu", titleEn: "Check save status", bodyVi: "Chờ trạng thái chuyển sang đã lưu trên thiết bị trước khi rời trang. Nội dung vẫn giữ lại nếu lần lưu cloud gặp lỗi.", bodyEn: "Wait for the status to say it is saved on this device before leaving. Draft content is retained if cloud saving fails." },
      { kind: "practice", titleVi: "Tự tạo Lab của bạn", titleEn: "Build your own Lab", bodyVi: "Hãy tạo một prompt, chạy một file HTML nhỏ, thử một điều khiển trong preview và lưu Lab. Khi xong, bấm nút bên dưới.", bodyEn: "Create a prompt, run a small HTML file, try one control in the preview and save the Lab. When finished, use the button below." },
    ],
  },
  {
    id: "document-library",
    trigger: "documents",
    category: "documents",
    titleVi: "Thư viện tài liệu",
    titleEn: "Document library",
    summaryVi: "Xem lại PDF, DOCX, PPTX và Excel đã tải lên ngay trong Quản lý thư mục.",
    summaryEn: "Reopen uploaded PDF, DOCX, PPTX and Excel files from Folder Manager.",
    gifSrc: "/guides/document-library.gif",
    demo: "pdf",
    outcomeVi: "Mở lại một tài liệu đã upload và chọn đúng viewer.",
    outcomeEn: "Reopen an uploaded document in the right viewer.",
    steps: [
      { target: ".manager-documents", titleVi: "Mở thư viện tài liệu", titleEn: "Open the document library", bodyVi: "Trong Quản lý thư mục, bấm Tài liệu đã tải lên để xem lại các file PDF, DOCX, PPTX và Excel.", bodyEn: "In Folder Manager, click Uploaded documents to revisit PDF, DOCX, PPTX and Excel files." },
      { target: ".document-file-table", titleVi: "Chọn một file", titleEn: "Choose a file", bodyVi: "Bấm một dòng file hoặc nút con mắt để mở viewer. Tên, loại và ngày cập nhật giúp bạn nhận diện nhanh.", bodyEn: "Click a file row or its eye button to open the viewer. Name, type and updated date help you identify it." },
      { target: ".manager-document-viewer", titleVi: "Làm việc trong viewer", titleEn: "Work in the viewer", bodyVi: "PDF có nút toàn màn hình, vẽ và xuất PDF; DOCX/PPTX/Excel có viewer đọc lại ngay trong trang.", bodyEn: "PDF offers fullscreen, annotation and export; DOCX, PPTX and Excel reopen in an in-page viewer." },
      { target: ".manager-back-button", titleVi: "Quay lại danh sách", titleEn: "Return to the list", bodyVi: "Bấm Danh sách tài liệu để đổi file mà không rời Quản lý thư mục.", bodyEn: "Click Back to documents to switch files without leaving Folder Manager." },
      { kind: "practice", titleVi: "Tự xem lại tài liệu", titleEn: "Review a document yourself", bodyVi: "Hãy chọn một file đã upload, kéo viewer để đọc và quay lại danh sách. Khi xong, bấm nút bên dưới.", bodyEn: "Open an uploaded file, read it in the viewer and return to the list. When finished, use the button below." },
    ],
  },
  {
    id: "pdf-annotation",
    category: "documents",
    titleVi: "Vẽ trên PDF",
    titleEn: "Annotate a PDF",
    summaryVi: "Bật toàn màn hình để viết trực tiếp, đổi bút/highlight/eraser và xuất PDF mới.",
    summaryEn: "Enter fullscreen to draw directly, switch pen/highlighter/eraser and export a new PDF.",
    gifSrc: "/guides/pdf-annotation.gif",
    demo: "pdf",
    steps: [
      { target: ".document-fullscreen-toggle", titleVi: "Bật toàn màn hình", titleEn: "Enter fullscreen", bodyVi: "PDF chỉ cho viết trực tiếp khi viewer ở toàn màn hình. Bấm nút phóng to đang sáng.", bodyEn: "Direct PDF drawing is enabled in fullscreen. Click the highlighted maximize button." },
      { target: ".document-draw-toggle", titleVi: "Bật Vẽ trên PDF", titleEn: "Enable Draw on PDF", bodyVi: "Sau khi vào fullscreen, bật Vẽ trên PDF. Giữ Ctrl + kéo để zoom quanh vị trí bút.", bodyEn: "After entering fullscreen, enable Draw on PDF. Hold Ctrl and drag to zoom around the pen position." },
      { target: ".document-annotation-tools", titleVi: "Chọn bút, highlight hoặc eraser", titleEn: "Choose pen, highlighter or eraser", bodyVi: "Nét hiện ngay khi đang viết. E dùng để xóa chính xác, Ctrl + Z/Y hoàn tác/làm lại, rồi bấm Xuất PDF.", bodyEn: "Strokes render while you write. E erases precisely, Ctrl + Z/Y undo or redo, then choose Export PDF." },
      { target: ".document-pdf-body", titleVi: "Viết và kiểm tra nét", titleEn: "Draw and check the stroke", bodyVi: "Kéo trong vùng PDF để thấy nét xuất hiện tức thời. Giữ Space để pan, Ctrl + lăn để zoom tại vị trí con trỏ.", bodyEn: "Drag in the PDF to see the stroke immediately. Hold Space to pan and use Ctrl + wheel to zoom around the pointer." },
      { kind: "practice", titleVi: "Tự chú thích và xuất PDF", titleEn: "Annotate and export your PDF", bodyVi: "Hãy viết một nét, thử highlight và tẩy một đoạn, hoàn tác một lần rồi bấm Xuất PDF. Khi file mới tải xong, bấm nút bên dưới.", bodyEn: "Draw a stroke, try a highlight and erase part of it, undo once and export the PDF. When the new file downloads, use the button below." },
    ],
  },
  {
    id: "ai-workflow",
    category: "ai",
    titleVi: "Quy trình AI an toàn",
    titleEn: "Safe AI workflow",
    summaryVi: "Xem prompt, kiểm tra bản xem trước rồi mới áp dụng kết quả lên canvas.",
    summaryEn: "Review prompts and previews before applying AI output to your canvas.",
    gifSrc: "/guides/ai-workflow.gif",
    demo: "ai",
    outcomeVi: "Tìm được một thao tác AI, kiểm tra kết quả rồi mới áp dụng.",
    outcomeEn: "Find an AI action, review its result and apply it deliberately.",
    steps: [
      { target: ".topbar .command-trigger", titleVi: "Mở thao tác nhanh", titleEn: "Open quick actions", bodyVi: "Bấm kính lúp để tìm nhanh tính năng AI, file hoặc cài đặt.", bodyEn: "Click the search icon to find AI actions, files or settings." },
      { target: ".command-search", titleVi: "Tìm theo từ khóa", titleEn: "Search by keyword", bodyVi: "Gõ tên tính năng hoặc project. Kết quả cập nhật ngay khi bạn nhập.", bodyEn: "Type a feature or project name. Results update as you type." },
      { target: ".command-results button:first-child", titleVi: "Chọn một thao tác", titleEn: "Choose an action", bodyVi: "Bấm kết quả cần dùng. Palette sẽ đóng và mở đúng khu vực thay vì tạo thay đổi âm thầm.", bodyEn: "Click the action you need. The palette closes and opens the relevant area instead of changing things silently." },
      { target: ".topbar .focus-mode-toggle", titleVi: "Giữ sự tập trung", titleEn: "Keep focus", bodyVi: "Bật Focus mode khi cần làm việc không bị sidebar che. Bấm lại để quay về giao diện đầy đủ.", bodyEn: "Use Focus mode when you need an uncluttered canvas. Click again to restore the full interface." },
      { kind: "practice", titleVi: "Tự hoàn thành một quy trình AI", titleEn: "Complete an AI workflow", bodyVi: "Hãy tìm một thao tác, đọc prompt hoặc preview, kiểm tra kết quả và chỉ áp dụng khi bạn chắc chắn. Khi xong, bấm nút bên dưới.", bodyEn: "Find an action, read its prompt or preview, check the result and apply it only when you are ready. When finished, use the button below." },
    ],
  },
  {
    id: "tool-hold-shortcuts",
    category: "canvas",
    titleVi: "Tool tạm thời bằng nhấn giữ",
    titleEn: "Temporary tools with press-and-hold",
    summaryVi: "Bấm nhanh để chọn lâu dài; nhấn giữ tool hoặc phím tắt để dùng tạm rồi tự quay về tool trước.",
    summaryEn: "Click quickly to keep a tool; hold a tool or shortcut for a temporary mode that restores on release.",
    gifSrc: "/guides/canvas-controls.gif",
    demo: "canvas",
    outcomeVi: "Dùng nhanh bút, eraser, highlight và hand mà không mất tool đang chọn.",
    outcomeEn: "Use pen, eraser, highlight and hand without losing your selected tool.",
    steps: [
      { target: '[data-tool="pen"]', titleVi: "Bấm nhanh để chọn lâu dài", titleEn: "Click quickly to keep a tool", bodyVi: "Bấm nhanh nút Bút một lần. Bút vẫn được chọn sau khi thả; đây là cách chọn tool lâu dài.", bodyEn: "Click Pen once. It stays selected after release; this is a persistent tool choice." },
      { target: '[data-tool="eraser"]', titleVi: "Nhấn giữ để dùng tạm", titleEn: "Hold for a temporary tool", bodyVi: "Nhấn giữ E hoặc nút Tẩy trong lúc đang chọn Bút. Khi thả ra, MindCanvas tự trả về Bút.", bodyEn: "Hold E or the Eraser button while Pen is selected. On release, MindCanvas returns to Pen." },
      { target: '[data-tool="highlighter"]', titleVi: "Đổi tạm sang highlight", titleEn: "Temporarily highlight", bodyVi: "Giữ H hoặc nút Highlight để đánh dấu một đoạn, rồi thả ra để quay về tool trước.", bodyEn: "Hold H or Highlighter to mark a passage, then release to return to the previous tool." },
      { target: '[data-tool="hand"]', titleVi: "Giữ hand để pan", titleEn: "Hold hand to pan", bodyVi: "Giữ Space hoặc nút Hand và kéo canvas. Không cần đổi tool hiện tại chỉ để di chuyển khung nhìn.", bodyEn: "Hold Space or Hand and drag the canvas. You do not need to permanently switch tools just to pan." },
      { target: '[data-tool="select"]', titleVi: "V vẫn là trỏ chọn", titleEn: "V remains the pointer", bodyVi: "Giữ V để chọn tạm khi đang vẽ, kéo chọn nhiều phần tử bằng khung marquee, rồi thả để trở về tool trước.", bodyEn: "Hold V for temporary selection while drawing, marquee-select multiple elements, then release to restore the previous tool." },
      { kind: "practice", titleVi: "Tự luyện nhấn giữ", titleEn: "Practice press-and-hold", bodyVi: "Chọn Bút, giữ E để tẩy một đoạn, thả E và giữ Space để pan. Sau đó bấm nhanh Highlight để chọn nó lâu dài.", bodyEn: "Choose Pen, hold E to erase part of a stroke, release E and hold Space to pan. Then click Highlighter quickly to keep it selected." },
    ],
  },
];

export function guideForId(id: string | null | undefined) {
  return id ? GUIDE_DEFINITIONS.find(guide => guide.id === id) ?? null : null;
}

export function guideForTrigger(trigger: string | null | undefined) {
  return trigger ? GUIDE_DEFINITIONS.find(guide => guide.trigger === trigger) ?? null : null;
}

function storageKey(ownerId: string | null | undefined) {
  return `${STORAGE_PREFIX}:${ownerId || "guest"}`;
}

function normalizeEntry(value: unknown): GuideProgressEntry | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<GuideProgressEntry>;
  if (candidate.status !== "active" && candidate.status !== "completed" && candidate.status !== "skipped" && candidate.status !== "unseen") return null;
  return {
    status: candidate.status,
    ...(typeof candidate.startedAt === "string" ? { startedAt: candidate.startedAt } : {}),
    ...(typeof candidate.completedAt === "string" ? { completedAt: candidate.completedAt } : {}),
  };
}

export function readGuideProgress(ownerId: string | null | undefined): GuideProgress {
  try {
    const raw = localStorage.getItem(storageKey(ownerId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([id, value]) => {
      const entry = normalizeEntry(value);
      return entry ? [[id, entry]] : [];
    }));
  } catch {
    return {};
  }
}

function writeGuideProgress(ownerId: string | null | undefined, progress: GuideProgress) {
  try { localStorage.setItem(storageKey(ownerId), JSON.stringify(progress)); } catch {}
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(GUIDE_PROGRESS_EVENT, { detail: { ownerId: ownerId || "guest" } }));
}

export function guideIsActivated(progress: GuideProgress, guideId: string) {
  return (progress[guideId]?.status ?? "unseen") !== "unseen";
}

export function markGuideStarted(ownerId: string | null | undefined, guideId: string) {
  const progress = readGuideProgress(ownerId);
  const current = progress[guideId];
  if (current?.status === "completed" || current?.status === "skipped") return progress;
  const entry: GuideProgressEntry = { status: "active", startedAt: current?.startedAt ?? new Date().toISOString() };
  const next = { ...progress, [guideId]: entry };
  writeGuideProgress(ownerId, next);
  return next;
}

export function finishGuide(ownerId: string | null | undefined, guideId: string, status: "completed" | "skipped") {
  const progress = readGuideProgress(ownerId);
  const next = { ...progress, [guideId]: { status, startedAt: progress[guideId]?.startedAt ?? new Date().toISOString(), completedAt: new Date().toISOString() } };
  writeGuideProgress(ownerId, next);
  return next;
}

export function resetGuideProgress(ownerId: string | null | undefined, guideId?: string) {
  const progress = readGuideProgress(ownerId);
  const next = guideId ? { ...progress, [guideId]: { status: "unseen" as const } } : {};
  writeGuideProgress(ownerId, next);
  return next;
}
