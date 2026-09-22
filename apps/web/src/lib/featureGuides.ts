export type GuideCategory =
  "workspace" | "canvas" | "learning" | "documents" | "tools" | "ai";

export type GuideDemo =
  "navigation" | "canvas" | "learning" | "lab" | "pdf" | "ai";

export type GuideStepKind = "target" | "practice";

export type GuideRequiredAction = {
  id: string;
  labelVi: string;
  labelEn: string;
};

export type GuideStepCompletion =
  | { type: "click"; selector?: string }
  | { type: "input"; selector: string; minLength?: number }
  | { type: "state"; selector: string; attribute?: string; value?: string }
  | { type: "route"; route: string }
  | { type: "action"; actions: GuideRequiredAction[] }
  | { type: "manual"; actions?: GuideRequiredAction[] };

export type GuideStep = {
  target?: string;
  kind?: GuideStepKind;
  completion?: GuideStepCompletion;
  /** Let a navigation step be acknowledged when the requested route is already active. */
  skipWhenRoute?: string;
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

export type PageHelpScope = "workspace" | "canvas" | "learning" | "folders";

export const GUIDE_PROGRESS_EVENT = "mindcanvas:feature-guide-progress";
export const GUIDE_REQUEST_EVENT = "mindcanvas:feature-guide-request";
export const GUIDE_ACTION_EVENT = "mindcanvas:feature-guide-action";
export const GUIDE_CONTENT_VERSION = "v5.10";
const STORAGE_PREFIX = `mindcanvas:feature-guides:${GUIDE_CONTENT_VERSION}`;
let activeGuideSessionId: string | null = null;

function newSessionId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `guide-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function beginGuideSession() {
  activeGuideSessionId = newSessionId();
  return activeGuideSessionId;
}

export function endGuideSession(sessionId: string | null) {
  if (!sessionId || activeGuideSessionId === sessionId) activeGuideSessionId = null;
}

/**
 * Components publish meaningful user actions instead of letting a guide infer
 * completion from a random click. This keeps practice steps honest and also
 * makes the flow testable without coupling it to a particular layout.
 */
export function emitGuideAction(name: string, payload?: unknown) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(GUIDE_ACTION_EVENT, {
      detail: { name, payload, guideSessionId: activeGuideSessionId, at: Date.now() },
    }),
  );
}

export function practiceActionsForGuide(
  guideId: string,
): GuideRequiredAction[] {
  const actions: Record<string, GuideRequiredAction[]> = {
    "workspace-navigation": [
      {
        id: "workspace:project-created",
        labelVi: "Tạo project mới",
        labelEn: "Create a new project",
      },
      {
        id: "workspace:favorite",
        labelVi: "Thử nút Yêu thích",
        labelEn: "Try the Favorite button",
      },
      {
        id: "workspace:project-menu",
        labelVi: "Mở menu ba chấm",
        labelEn: "Open the three-dot menu",
      },
    ],
    "canvas-controls": [
      { id: "canvas:draw", labelVi: "Vẽ một nét", labelEn: "Draw a stroke" },
      {
        id: "canvas:pan",
        labelVi: "Pan canvas bằng Hand/Space",
        labelEn: "Pan the canvas with Hand/Space",
      },
      {
        id: "canvas:erase",
        labelVi: "Xóa một phần nét vẽ",
        labelEn: "Erase part of a stroke",
      },
      {
        id: "canvas:rectangle",
        labelVi: "Tạo hình chữ nhật",
        labelEn: "Create a rectangle",
      },
    ],
    "learning-hub": [
      {
        id: "learning:tab:flashcards",
        labelVi: "Mở Flashcard",
        labelEn: "Open Flashcards",
      },
      { id: "learning:tab:quiz", labelVi: "Mở Quiz", labelEn: "Open Quiz" },
      {
        id: "learning:tab:plan",
        labelVi: "Mở Kế hoạch học",
        labelEn: "Open Study plan",
      },
      {
        id: "learning:tab:progress",
        labelVi: "Mở Tiến độ",
        labelEn: "Open Progress",
      },
      { id: "learning:tab:lab", labelVi: "Mở Lab", labelEn: "Open Lab" },
      {
        id: "learning:tab:shared",
        labelVi: "Mở Được chia sẻ với tôi",
        labelEn: "Open Shared with me",
      },
      { id: "learning:tab:music", labelVi: "Mở Nhạc", labelEn: "Open Music" },
      { id: "learning:tab:tools", labelVi: "Mở Công cụ", labelEn: "Open Tools" },
    ],
    "folder-manager": [
      {
        id: "folder:created",
        labelVi: "Tạo thư mục mới",
        labelEn: "Create a new folder",
      },
      {
        id: "documents:library",
        labelVi: "Mở Tài liệu đã tải lên",
        labelEn: "Open Uploaded documents",
      },
    ],
    "lab-simulation": [
      {
        id: "lab:prompt",
        labelVi: "Tạo prompt HTML",
        labelEn: "Create the HTML prompt",
      },
      {
        id: "lab:html-input",
        labelVi: "Đưa HTML vào runner",
        labelEn: "Put HTML into the runner",
      },
      {
        id: "lab:run",
        labelVi: "Chạy thử mô phỏng",
        labelEn: "Run the simulation",
      },
      { id: "lab:save", labelVi: "Lưu Lab", labelEn: "Save the Lab" },
    ],
    "document-library": [
      {
        id: "documents:open",
        labelVi: "Mở một tài liệu",
        labelEn: "Open a document",
      },
      {
        id: "documents:back",
        labelVi: "Quay lại danh sách",
        labelEn: "Return to the list",
      },
    ],
    "document-tools": [
      { id: "pdf:draw", labelVi: "Vẽ một nét trên PDF", labelEn: "Draw on the PDF" },
      { id: "pdf:export", labelVi: "Xuất PDF mới", labelEn: "Export a new PDF" },
      { id: "docx:open", labelVi: "Mở tài liệu DOCX", labelEn: "Open the DOCX" },
      { id: "docx:focus", labelVi: "Bấm vào vùng soạn thảo", labelEn: "Focus the editor" },
      { id: "docx:text", labelVi: "Nhập hoặc sửa văn bản", labelEn: "Enter or edit text" },
      { id: "docx:selection", labelVi: "Chọn một đoạn văn", labelEn: "Select a passage" },
      { id: "docx:format", labelVi: "Áp dụng định dạng", labelEn: "Apply formatting" },
      { id: "docx:table", labelVi: "Chèn bảng", labelEn: "Insert a table" },
      { id: "docx:save", labelVi: "Lưu bản chỉnh sửa", labelEn: "Save the edited copy" },
      { id: "docx:export", labelVi: "Xuất một DOCX", labelEn: "Export a DOCX" },
    ],
    "pdf-annotation": [
      {
        id: "pdf:draw",
        labelVi: "Vẽ một nét trên PDF",
        labelEn: "Draw a stroke on the PDF",
      },
      {
        id: "pdf:export",
        labelVi: "Xuất PDF mới",
        labelEn: "Export a new PDF",
      },
    ],
    "ai-workflow": [
      {
        id: "ai:search",
        labelVi: "Tìm một thao tác AI",
        labelEn: "Search for an AI action",
      },
      {
        id: "ai:action",
        labelVi: "Mở kết quả AI",
        labelEn: "Open an AI result",
      },
    ],
    "tool-hold-shortcuts": [
      { id: "canvas:draw", labelVi: "Vẽ bằng Bút", labelEn: "Draw with Pen" },
      {
        id: "canvas:erase",
        labelVi: "Tẩy bằng Eraser",
        labelEn: "Erase with Eraser",
      },
      {
        id: "canvas:pan",
        labelVi: "Pan bằng Hand/Space",
        labelEn: "Pan with Hand/Space",
      },
    ],
  };
  return actions[guideId] ?? [];
}

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
    summaryVi:
      "Tìm project, tạo canvas và sử dụng các thao tác trên thẻ project.",
    summaryEn:
      "Find projects, create a canvas and use the actions on a project card.",
    gifSrc: "/guides/workspace-navigation.gif",
    demo: "navigation",
    outcomeVi:
      "Tạo được project và biết cách quản lý project ngay tại Workspace.",
    outcomeEn: "Create a project and manage it directly from Workspace.",
    steps: [
      {
        target: ".workspace-nav-row > button:first-child",
        skipWhenRoute: "workspace",
        titleVi: "Đi tới Workspace",
        titleEn: "Go to Workspace",
        bodyVi: "Bấm Workspace trên thanh bên để mở danh sách project của bạn.",
        bodyEn: "Click Workspace in the sidebar to open your project list.",
      },
      {
        target: ".home-controls .search-field",
        completion: { type: "manual" },
        titleVi: "Tìm project",
        titleEn: "Find a project",
        bodyVi:
          "Thanh tìm kiếm lọc project theo tên và cả nội dung chữ bên trong canvas. Bạn có thể nhập từ khóa bất kỳ khi cần tìm lại tài liệu.",
        bodyEn:
          "Search filters projects by title and by text stored inside a canvas. Enter any keyword when you need to find something again.",
      },
      {
        target: ".workspace-create-button",
        titleVi: "Tạo project mới",
        titleEn: "Create a new project",
        bodyVi: "Bấm Project mới để mở hộp tạo canvas.",
        bodyEn: "Click New project to open the canvas creation form.",
      },
      {
        target: ".guide-project-name-input",
        completion: {
          type: "input",
          selector: ".guide-project-name-input",
          minLength: 1,
        },
        titleVi: "Đặt tên project",
        titleEn: "Name the project",
        bodyVi:
          "Nhập tên cho canvas thực hành. Tên có thể đổi lại sau trong menu ba chấm.",
        bodyEn:
          "Enter a name for the practice canvas. You can rename it later from the three-dot menu.",
      },
      {
        target: ".guide-project-create-submit",
        completion: {
          type: "action",
          actions: [
            {
              id: "workspace:project-created",
              labelVi: "Tạo project mới",
              labelEn: "Create a new project",
            },
          ],
        },
        titleVi: "Bấm Tạo",
        titleEn: "Choose Create",
        bodyVi:
          "Bấm Tạo và chờ canvas mở thành công. Guide chỉ chuyển bước sau khi project thật sự được tạo.",
        bodyEn:
          "Click Create and wait for the canvas to open. The guide advances only after the project is really created.",
      },
      {
        target: ".topbar .breadcrumbs button",
        titleVi: "Quay lại Workspace",
        titleEn: "Return to Workspace",
        bodyVi: "Bấm Workspace trên thanh đầu để quay lại danh sách project.",
        bodyEn: "Click Workspace in the top bar to return to the project list.",
      },
      {
        target: ".project-card:first-child .project-card-favorite",
        completion: {
          type: "action",
          actions: [
            {
              id: "workspace:favorite",
              labelVi: "Thử nút Yêu thích",
              labelEn: "Try the Favorite button",
            },
          ],
        },
        titleVi: "Đánh dấu yêu thích",
        titleEn: "Mark as favorite",
        bodyVi:
          "Bấm ngôi sao để thêm project vào Yêu thích. Bấm lần nữa để bỏ đánh dấu.",
        bodyEn:
          "Click the star to add the project to Favorites. Click it again to remove the mark.",
      },
      {
        target: ".project-card:first-child .project-card-menu-trigger",
        completion: {
          type: "action",
          actions: [
            {
              id: "workspace:project-menu",
              labelVi: "Mở menu ba chấm",
              labelEn: "Open the three-dot menu",
            },
          ],
        },
        titleVi: "Mở menu project",
        titleEn: "Open project actions",
        bodyVi: "Bấm nút ba chấm để mở các thao tác quản lý project.",
        bodyEn:
          "Click the three-dot button to open project management actions.",
      },
      {
        target: ".project-card:first-child .project-menu button:nth-child(1)",
        completion: { type: "manual" },
        titleVi: "Đổi tên",
        titleEn: "Rename",
        bodyVi: "Đổi tên project mà không làm thay đổi nội dung canvas.",
        bodyEn: "Rename the project without changing its canvas content.",
      },
      {
        target: ".project-card:first-child .project-menu button:nth-child(2)",
        completion: { type: "manual" },
        titleVi: "Chuyển thư mục",
        titleEn: "Move to folder",
        bodyVi: "Chuyển project vào một thư mục khác để sắp xếp Workspace.",
        bodyEn: "Move the project to another folder to organize Workspace.",
      },
      {
        target: ".project-card:first-child .project-menu button:nth-child(3)",
        completion: { type: "manual" },
        titleVi: "Nhân đôi",
        titleEn: "Duplicate",
        bodyVi:
          "Tạo một bản sao độc lập để thử ý tưởng mới mà vẫn giữ bản gốc.",
        bodyEn:
          "Create an independent copy for a new idea while preserving the original.",
      },
      {
        target: ".project-card:first-child .project-menu button:nth-child(4)",
        completion: { type: "manual" },
        titleVi: "Đưa vào thùng rác",
        titleEn: "Move to Trash",
        bodyVi:
          "Đưa project vào Thùng rác để có thể khôi phục sau. Project vừa tạo vẫn được giữ lại khi bạn hoàn thành guide.",
        bodyEn:
          "Move a project to Trash so it can be restored later. The project you just created stays available after this guide.",
      },
    ],
  },
  {
    id: "canvas-controls",
    trigger: "canvas",
    category: "canvas",
    titleVi: "Điều khiển canvas",
    titleEn: "Canvas controls",
    summaryVi: "Tạo canvas thực hành rồi dùng Pen, Hand, Eraser và Rectangle.",
    summaryEn:
      "Create a practice canvas, then use Pen, Hand, Eraser and Rectangle.",
    gifSrc: "/guides/canvas-controls.gif",
    demo: "canvas",
    outcomeVi:
      "Vẽ, di chuyển góc nhìn, tẩy nét và tạo hình chữ nhật trên canvas.",
    outcomeEn: "Draw, pan, erase and create a rectangle on the canvas.",
    steps: [
      {
        target: ".workspace-nav-row > button:first-child",
        skipWhenRoute: "workspace",
        titleVi: "Đi tới Workspace",
        titleEn: "Go to Workspace",
        bodyVi: "Bấm Workspace để bắt đầu tạo một canvas thực hành mới.",
        bodyEn: "Click Workspace to start a new practice canvas.",
      },
      {
        target: ".workspace-create-button",
        titleVi: "Tạo canvas thực hành",
        titleEn: "Create a practice canvas",
        bodyVi:
          "Bấm Project mới. Sau guide, bạn tự quyết định giữ lại hoặc đưa canvas này vào Thùng rác.",
        bodyEn:
          "Click New project. After the guide, you decide whether to keep this canvas or move it to Trash.",
      },
      {
        target: ".guide-project-name-input",
        completion: {
          type: "input",
          selector: ".guide-project-name-input",
          minLength: 1,
        },
        titleVi: "Đặt tên canvas",
        titleEn: "Name the canvas",
        bodyVi: "Nhập một tên bất kỳ cho canvas thực hành.",
        bodyEn: "Enter any name for the practice canvas.",
      },
      {
        target: ".guide-project-create-submit",
        completion: {
          type: "action",
          actions: [
            {
              id: "canvas:practice-created",
              labelVi: "Tạo canvas thực hành",
              labelEn: "Create the practice canvas",
            },
          ],
        },
        titleVi: "Mở canvas mới",
        titleEn: "Open the new canvas",
        bodyVi: "Bấm Tạo. Guide sẽ chờ canvas và thanh công cụ tải xong.",
        bodyEn:
          "Click Create. The guide waits for the canvas and toolbar to finish loading.",
      },
      {
        target: '[data-tool="pen"]',
        titleVi: "Chọn Pen",
        titleEn: "Choose Pen",
        bodyVi:
          "Bấm Pen hoặc phím P để vẽ tự do. Nét bút xuất hiện ngay trong lúc kéo.",
        bodyEn:
          "Click Pen or press P to draw freely. The stroke appears while you drag.",
      },
      {
        target: ".canvas-svg",
        completion: {
          type: "action",
          actions: [
            {
              id: "canvas:draw",
              labelVi: "Vẽ một nét",
              labelEn: "Draw a stroke",
            },
          ],
        },
        titleVi: "Vẽ một nét",
        titleEn: "Draw a stroke",
        bodyVi:
          "Kéo trực tiếp trên canvas để tạo một nét. Bảng hướng dẫn không làm tối vùng thực hành.",
        bodyEn:
          "Drag directly on the canvas to create a stroke. The practice area stays fully usable.",
      },
      {
        target: '[data-tool="hand"]',
        titleVi: "Chọn Hand",
        titleEn: "Choose Hand",
        bodyVi:
          "Bấm Hand hoặc giữ Space để tạm chuyển sang chế độ di chuyển góc nhìn.",
        bodyEn: "Click Hand or hold Space to temporarily pan the view.",
      },
      {
        target: ".canvas-svg",
        completion: {
          type: "action",
          actions: [
            {
              id: "canvas:pan",
              labelVi: "Di chuyển canvas qua lại",
              labelEn: "Pan the canvas",
            },
          ],
        },
        titleVi: "Di chuyển canvas",
        titleEn: "Pan the canvas",
        bodyVi:
          "Kéo canvas qua lại. Khi giữ Space, thả phím sẽ quay về công cụ trước đó.",
        bodyEn:
          "Drag the canvas in either direction. When holding Space, release it to return to the previous tool.",
      },
      {
        target: '[data-tool="eraser"]',
        titleVi: "Chọn Eraser",
        titleEn: "Choose Eraser",
        bodyVi:
          "Bấm Eraser hoặc phím E để xóa chính xác phần nét bút chạm vào.",
        bodyEn:
          "Click Eraser or press E to precisely remove the touched part of a stroke.",
      },
      {
        target: ".canvas-svg",
        completion: {
          type: "action",
          actions: [
            {
              id: "canvas:erase",
              labelVi: "Xóa một phần nét vẽ",
              labelEn: "Erase part of a stroke",
            },
          ],
        },
        titleVi: "Tẩy nét vừa vẽ",
        titleEn: "Erase the stroke",
        bodyVi: "Kéo Eraser qua một phần nét Pen vừa tạo.",
        bodyEn: "Drag Eraser across part of the Pen stroke you just created.",
      },
      {
        target: '[data-tool="rect"]',
        titleVi: "Chọn Rectangle",
        titleEn: "Choose Rectangle",
        bodyVi: "Bấm Rectangle hoặc phím R để chuẩn bị tạo hình chữ nhật.",
        bodyEn: "Click Rectangle or press R to prepare a rectangle.",
      },
      {
        target: ".canvas-svg",
        completion: {
          type: "action",
          actions: [
            {
              id: "canvas:rectangle",
              labelVi: "Tạo hình chữ nhật",
              labelEn: "Create a rectangle",
            },
          ],
        },
        titleVi: "Vẽ hình chữ nhật",
        titleEn: "Draw a rectangle",
        bodyVi:
          "Nhấn và kéo trên canvas để tạo một hình chữ nhật có kích thước tùy ý.",
        bodyEn:
          "Press and drag on the canvas to create a rectangle of any size.",
      },
      {
        kind: "practice",
        completion: { type: "manual" },
        titleVi: "Hoàn tất thực hành",
        titleEn: "Finish practice",
        bodyVi:
          "Bạn đã thử đủ bốn công cụ. Chọn giữ canvas để tiếp tục làm việc hoặc đưa canvas thực hành vào Thùng rác.",
        bodyEn:
          "You have tried all four tools. Keep the canvas to continue working or move the practice canvas to Trash.",
      },
    ],
  },
  {
    id: "learning-hub",
    trigger: "learning",
    category: "learning",
    titleVi: "Trung tâm học tập",
    titleEn: "Learning Hub",
    summaryVi: "Mở từng tính năng học tập và xem chính khu vực vừa chọn.",
    summaryEn: "Open each learning feature and review the selected area.",
    gifSrc: "/guides/learning-hub.gif",
    demo: "learning",
    outcomeVi:
      "Biết vị trí và công dụng của mọi khu vực trong Trung tâm học tập.",
    outcomeEn: "Know where every Learning Hub area is and what it does.",
    steps: [
      {
        target: ".nav-learning",
        skipWhenRoute: "learning",
        titleVi: "Mở Trung tâm học tập",
        titleEn: "Open Learning Hub",
        bodyVi: "Bấm Trung tâm học tập trên thanh bên.",
        bodyEn: "Click Learning Hub in the sidebar.",
      },
      {
        target: ".learning-hub-overview",
        completion: { type: "manual" },
        titleVi: "Tổng quan",
        titleEn: "Overview",
        bodyVi:
          "Tổng quan hiển thị kế hoạch hôm nay, chuỗi học, mục tiêu và các lối tắt tới công cụ học.",
        bodyEn:
          "Overview shows today's plan, streak, goals and shortcuts to study tools.",
      },
      {
        target: '.learning-hub-nav button[data-guide-tab="flashcards"]',
        titleVi: "Mở Flashcard",
        titleEn: "Open Flashcards",
        bodyVi: "Bấm Flashcard để xem khu vực tạo bộ thẻ và ôn tập.",
        bodyEn: "Click Flashcards to open deck creation and review.",
      },
      {
        target: ".flashcards-page",
        completion: { type: "manual" },
        titleVi: "Flashcard",
        titleEn: "Flashcards",
        bodyVi:
          "Tại đây bạn có thể tạo bộ thẻ bằng file hoặc thủ công, chỉnh sửa thẻ và bắt đầu phiên ôn tập.",
        bodyEn:
          "Create decks from a file or manually, edit cards and start a review session here.",
      },
      {
        target: '.learning-hub-nav button[data-guide-tab="quiz"]',
        titleVi: "Mở Quiz",
        titleEn: "Open Quiz",
        bodyVi: "Bấm Quiz để xem khu vực bài kiểm tra.",
        bodyEn: "Click Quiz to open the test area.",
      },
      {
        target: ".quiz-page",
        completion: { type: "manual" },
        titleVi: "Quiz",
        titleEn: "Quiz",
        bodyVi:
          "Quiz hỗ trợ tạo câu hỏi, chọn chế độ học/luyện thi và xem giải thích sau khi trả lời.",
        bodyEn:
          "Quiz supports question creation, study or exam modes and answer explanations.",
      },
      {
        target: '.learning-hub-nav button[data-guide-tab="plan"]',
        titleVi: "Mở Kế hoạch học",
        titleEn: "Open Study plan",
        bodyVi: "Bấm Kế hoạch học để thiết kế lịch học theo ngày.",
        bodyEn: "Click Study plan to design a daily schedule.",
      },
      {
        target: ".study-planner-panel",
        completion: { type: "manual" },
        titleVi: "Kế hoạch học",
        titleEn: "Study plan",
        bodyVi:
          "Chọn bộ thẻ, nhiệm vụ, mục tiêu và ngày nghỉ; bạn cũng có thể nhờ AI gợi ý kế hoạch.",
        bodyEn:
          "Choose decks, tasks, targets and rest days, or ask AI to suggest a plan.",
      },
      {
        target: '.learning-hub-nav button[data-guide-tab="progress"]',
        titleVi: "Mở Tiến độ",
        titleEn: "Open Progress",
        bodyVi: "Bấm Tiến độ để xem kết quả học tập.",
        bodyEn: "Click Progress to review learning results.",
      },
      {
        target: ".progress-panel",
        completion: { type: "manual" },
        titleVi: "Tiến độ học",
        titleEn: "Learning progress",
        bodyVi:
          "Khu vực này tổng hợp chuỗi học, số thẻ đã ôn, điểm Quiz và lịch sử gần đây.",
        bodyEn:
          "This area summarizes streaks, reviewed cards, Quiz scores and recent history.",
      },
      {
        target: '.learning-hub-nav button[data-guide-tab="lab"]',
        titleVi: "Mở Lab",
        titleEn: "Open Lab",
        bodyVi: "Bấm Lab để tạo và chạy mô phỏng HTML tương tác.",
        bodyEn: "Click Lab to create and run interactive HTML simulations.",
      },
      {
        target: ".lab-page",
        completion: { type: "manual" },
        titleVi: "Lab tương tác",
        titleEn: "Interactive Lab",
        bodyVi:
          "Lab giúp tạo prompt, nhận file HTML, chạy thử trong sandbox, lưu và tải mô phỏng.",
        bodyEn:
          "Lab creates prompts, accepts HTML files, runs them in a sandbox, and saves or downloads simulations.",
      },
      {
        target: '.learning-hub-nav button[data-guide-tab="shared"]',
        titleVi: "Mở Được chia sẻ với tôi",
        titleEn: "Open Shared with me",
        bodyVi:
          "Bấm mục này để xem Flashcard, Quiz và Lab được người khác chia sẻ.",
        bodyEn:
          "Open this area to see Flashcards, Quizzes and Labs shared by other people.",
      },
      {
        target: ".shared-learning",
        completion: { type: "manual" },
        titleVi: "Học liệu được chia sẻ",
        titleEn: "Shared learning",
        bodyVi:
          "Bạn có thể mở và học nội dung được chia sẻ mà không sửa bản gốc của chủ sở hữu.",
        bodyEn:
          "Open and study shared content without changing the owner's original.",
      },
      {
        target: ".learning-music-launcher",
        completion: {
          type: "action",
          actions: [
            {
              id: "learning:tab:music",
              labelVi: "Mở Nhạc",
              labelEn: "Open Music",
            },
          ],
        },
        titleVi: "Mở Nhạc",
        titleEn: "Open Music",
        bodyVi: "Bấm Nhạc để mở thư viện âm thanh học tập.",
        bodyEn: "Click Music to open the study soundtrack library.",
      },
      {
        target: ".music-page",
        completion: { type: "manual" },
        titleVi: "Nhạc học tập",
        titleEn: "Study music",
        bodyVi:
          "Thêm file hoặc link YouTube, YouTube Music, Spotify, SoundCloud; sau đó dùng phát, tạm dừng, âm lượng, lặp và Dynamic Island.",
        bodyEn:
          "Add a file or YouTube, YouTube Music, Spotify or SoundCloud link, then use play, pause, volume, repeat and Dynamic Island.",
      },
      {
        target: '.learning-hub-nav button[data-guide-tab="tools"]',
        titleVi: "Mở Công cụ",
        titleEn: "Open Tools",
        bodyVi: "Bấm Công cụ để mở các editor tài liệu dùng chung thư viện đã tải lên.",
        bodyEn: "Click Tools to open the document editors backed by the shared uploaded library.",
      },
      {
        target: ".document-tools-page",
        completion: { type: "manual" },
        titleVi: "Bộ công cụ tài liệu",
        titleEn: "Document tools",
        bodyVi: "Vẽ trên PDF hoặc chọn DOCX để chỉnh sửa cơ bản và lưu thành bản sao.",
        bodyEn: "Annotate a PDF or choose a DOCX for basic editing and save it as a copy.",
      },
    ],
  },
  {
    id: "folder-manager",
    trigger: "documents",
    category: "documents",
    titleVi: "Quản lý thư mục",
    titleEn: "Folder Manager",
    summaryVi: "Tạo thư mục, sắp xếp project và mở lại tài liệu đã tải lên.",
    summaryEn:
      "Create folders, organize projects and reopen uploaded documents.",
    gifSrc: "/guides/document-library.gif",
    demo: "navigation",
    outcomeVi: "Tạo được thư mục và biết cách mở thư viện tài liệu.",
    outcomeEn: "Create a folder and know how to open the document library.",
    steps: [
      {
        target: ".manage-folders-button",
        skipWhenRoute: "documents",
        titleVi: "Mở Quản lý thư mục",
        titleEn: "Open Folder Manager",
        bodyVi:
          "Bấm Quản lý thư mục trên thanh bên để mở khu vực sắp xếp dữ liệu.",
        bodyEn:
          "Click Folder Manager in the sidebar to open the organization area.",
      },
      {
        target: ".folder-manager",
        completion: { type: "manual" },
        titleVi: "Quản lý thư mục",
        titleEn: "Folder Manager",
        bodyVi:
          "Cột trái chứa Workspace, các thư mục và Tài liệu đã tải lên. Khu vực phải hiển thị nội dung đang chọn.",
        bodyEn:
          "The left column contains Workspace, folders and Uploaded documents. The right area shows the selected content.",
      },
      {
        target: ".folder-manager-new-folder",
        titleVi: "Tạo thư mục mới",
        titleEn: "Create a folder",
        bodyVi: "Bấm dấu cộng cạnh tiêu đề Thư mục.",
        bodyEn: "Click the plus button beside the Folders heading.",
      },
      {
        target: ".guide-folder-name-input",
        completion: {
          type: "input",
          selector: ".guide-folder-name-input",
          minLength: 1,
        },
        titleVi: "Đặt tên thư mục",
        titleEn: "Name the folder",
        bodyVi: "Nhập tên cho thư mục mới.",
        bodyEn: "Enter a name for the new folder.",
      },
      {
        target: ".guide-folder-create-submit",
        completion: {
          type: "action",
          actions: [
            {
              id: "folder:created",
              labelVi: "Tạo thư mục mới",
              labelEn: "Create a new folder",
            },
          ],
        },
        titleVi: "Bấm Tạo",
        titleEn: "Choose Create",
        bodyVi: "Bấm Tạo và chờ thư mục xuất hiện trong danh sách.",
        bodyEn: "Click Create and wait for the folder to appear in the list.",
      },
      {
        target: ".manager-documents",
        completion: {
          type: "action",
          actions: [
            {
              id: "documents:library",
              labelVi: "Mở Tài liệu đã tải lên",
              labelEn: "Open Uploaded documents",
            },
          ],
        },
        titleVi: "Mở Tài liệu đã tải lên",
        titleEn: "Open Uploaded documents",
        bodyVi:
          "Bấm Tài liệu đã tải lên để xem PDF, DOCX, PPTX và Excel đã thêm từ canvas.",
        bodyEn:
          "Click Uploaded documents to see PDF, DOCX, PPTX and Excel files added from a canvas.",
      },
      {
        target: ".folder-manager-main",
        completion: { type: "manual" },
        titleVi: "Thư viện tài liệu",
        titleEn: "Document library",
        bodyVi:
          "Danh sách hiển thị tên, loại và ngày cập nhật. Bấm một dòng hoặc biểu tượng con mắt để mở viewer; sau đó có thể quay lại danh sách.",
        bodyEn:
          "The list shows name, type and update date. Click a row or the eye icon to open its viewer, then return to the list.",
      },
    ],
  },
  {
    id: "lab-simulation",
    trigger: "lab",
    category: "ai",
    titleVi: "Tạo Lab tương tác",
    titleEn: "Build an interactive Lab",
    summaryVi:
      "Yêu cầu AI trả về file HTML, tải lên, chạy thử và lưu lại mô phỏng.",
    summaryEn:
      "Ask AI for an HTML file, upload it, run it safely and save the simulation.",
    gifSrc: "/guides/lab-simulation.gif",
    demo: "lab",
    outcomeVi: "Chạy thử và lưu được một mô phỏng HTML có thể tải xuống.",
    outcomeEn: "Run and save a downloadable HTML simulation.",
    steps: [
      {
        target: ".nav-learning",
        skipWhenRoute: "lab",
        titleVi: "Đi tới Trung tâm học tập",
        titleEn: "Go to Learning Hub",
        bodyVi:
          "Bước này cần thao tác thật: bấm Trung tâm học tập ở sidebar. Guide sẽ chờ đến khi trang học tập mở, không tự nhảy qua.",
        bodyEn:
          "This step requires a real action: click Learning Hub in the sidebar. The guide waits until the study page opens.",
      },
      {
        target: '.learning-hub-nav button[data-guide-tab="lab"]',
        skipWhenRoute: "lab",
        titleVi: "Mở tab Lab",
        titleEn: "Open the Lab tab",
        bodyVi:
          "Trong Trung tâm học tập, bấm đúng tab Lab. Khi tab đã mở, bước tiếp theo mới xuất hiện.",
        bodyEn:
          "In Learning Hub, click the Lab tab. The next step appears only after the tab is actually open.",
      },
      {
        target: ".lab-step-card input",
        completion: {
          type: "input",
          selector: ".lab-step-card input",
          minLength: 2,
        },
        titleVi: "Chuẩn bị yêu cầu",
        titleEn: "Prepare the request",
        bodyVi:
          "Nhập tên Lab (ít nhất 2 ký tự), sau đó guide mới cho phép sang bước tạo prompt. Bạn vẫn có thể bổ sung môn học, nguồn và yêu cầu chi tiết.",
        bodyEn:
          "Enter a Lab name (at least 2 characters), then the guide allows the prompt step. You can also fill the subject, source and detailed request.",
      },
      {
        target: ".lab-step-card .lab-actions .primary-button",
        completion: {
          type: "action",
          actions: [
            {
              id: "lab:prompt",
              labelVi: "Tạo prompt HTML",
              labelEn: "Create the HTML prompt",
            },
          ],
        },
        titleVi: "Tạo prompt HTML",
        titleEn: "Create the HTML prompt",
        bodyVi:
          "Bấm nút này, sao chép prompt và gửi cho AI bạn chọn. Nhắc AI trả về file .html hoàn chỉnh để dễ tải xuống.",
        bodyEn:
          "Click this button, copy the prompt and send it to your AI provider. Ask for a complete .html file that can be downloaded.",
      },
      {
        target: ".lab-run-card textarea",
        completion: {
          type: "action",
          actions: [
            {
              id: "lab:html-input",
              labelVi: "Đưa HTML vào runner",
              labelEn: "Put HTML into the runner",
            },
          ],
        },
        titleVi: "Đưa file HTML vào runner",
        titleEn: "Bring the HTML file into the runner",
        bodyVi:
          "Chọn file .html AI trả về hoặc dán toàn bộ nội dung vào ô Simulation HTML. Guide chỉ qua khi hệ thống nhận được HTML thật.",
        bodyEn:
          "Choose the returned .html file or paste the complete document into Simulation HTML. The guide advances only after real HTML is received.",
      },
      {
        target: ".lab-run-card .lab-actions .primary-button",
        completion: {
          type: "action",
          actions: [
            {
              id: "lab:run",
              labelVi: "Chạy thử mô phỏng",
              labelEn: "Run the simulation",
            },
          ],
        },
        titleVi: "Kiểm tra và chạy",
        titleEn: "Check and run",
        bodyVi:
          "Bấm Kiểm tra và chạy để mở preview sandbox. Nếu có resource ngoài hoặc HTML không an toàn, runner sẽ báo để bạn sửa.",
        bodyEn:
          "Click Check and run to open the sandbox preview. Unsafe external resources are reported before execution.",
      },
      {
        target: ".lab-footer-actions .primary-button",
        completion: {
          type: "action",
          actions: [
            { id: "lab:save", labelVi: "Lưu Lab", labelEn: "Save the Lab" },
          ],
        },
        titleVi: "Lưu Lab",
        titleEn: "Save the Lab",
        bodyVi:
          "Bấm nút Lưu Lab ở chân trang hoặc trên runner. Guide chờ xác nhận lưu thành công, không chỉ chờ click.",
        bodyEn:
          "Click Save Lab in the footer or runner. The guide waits for a successful save confirmation, not just a click.",
      },
      {
        kind: "practice",
        titleVi: "Tự tạo Lab của bạn",
        titleEn: "Build your own Lab",
        bodyVi:
          "Hãy tạo một prompt, chạy một file HTML nhỏ, thử một điều khiển trong preview và lưu Lab. Khi xong, bấm nút bên dưới.",
        bodyEn:
          "Create a prompt, run a small HTML file, try one control in the preview and save the Lab. When finished, use the button below.",
      },
    ],
  },
  {
    id: "document-library",
    category: "documents",
    titleVi: "Thư viện tài liệu",
    titleEn: "Document library",
    summaryVi:
      "Xem lại PDF, DOCX, PPTX và Excel đã tải lên ngay trong Quản lý thư mục.",
    summaryEn:
      "Reopen uploaded PDF, DOCX, PPTX and Excel files from Folder Manager.",
    gifSrc: "/guides/document-library.gif",
    demo: "pdf",
    outcomeVi: "Mở lại một tài liệu đã upload và chọn đúng viewer.",
    outcomeEn: "Reopen an uploaded document in the right viewer.",
    steps: [
      {
        target: ".manager-documents",
        titleVi: "Mở thư viện tài liệu",
        titleEn: "Open the document library",
        bodyVi:
          "Trong Quản lý thư mục, bấm Tài liệu đã tải lên để xem lại các file PDF, DOCX, PPTX và Excel.",
        bodyEn:
          "In Folder Manager, click Uploaded documents to revisit PDF, DOCX, PPTX and Excel files.",
      },
      {
        target: ".document-file-table",
        titleVi: "Chọn một file",
        titleEn: "Choose a file",
        bodyVi:
          "Bấm một dòng file hoặc nút con mắt để mở viewer. Tên, loại và ngày cập nhật giúp bạn nhận diện nhanh.",
        bodyEn:
          "Click a file row or its eye button to open the viewer. Name, type and updated date help you identify it.",
      },
      {
        target: ".manager-document-viewer",
        titleVi: "Làm việc trong viewer",
        titleEn: "Work in the viewer",
        bodyVi:
          "PDF có nút toàn màn hình, vẽ và xuất PDF; DOCX/PPTX/Excel có viewer đọc lại ngay trong trang.",
        bodyEn:
          "PDF offers fullscreen, annotation and export; DOCX, PPTX and Excel reopen in an in-page viewer.",
      },
      {
        target: ".manager-back-button",
        titleVi: "Quay lại danh sách",
        titleEn: "Return to the list",
        bodyVi:
          "Bấm Danh sách tài liệu để đổi file mà không rời Quản lý thư mục.",
        bodyEn:
          "Click Back to documents to switch files without leaving Folder Manager.",
      },
      {
        kind: "practice",
        titleVi: "Tự xem lại tài liệu",
        titleEn: "Review a document yourself",
        bodyVi:
          "Hãy chọn một file đã upload, kéo viewer để đọc và quay lại danh sách. Khi xong, bấm nút bên dưới.",
        bodyEn:
          "Open an uploaded file, read it in the viewer and return to the list. When finished, use the button below.",
      },
    ],
  },
  {
    id: "document-tools",
    category: "tools",
    titleVi: "Công cụ tài liệu",
    titleEn: "Document tools",
    summaryVi: "Mở công cụ PDF hoặc DOCX và thực hành một thao tác thật.",
    summaryEn: "Open the PDF or DOCX tool and complete a real action.",
    // Reuse the shipped PDF annotation animation until a separate combined
    // PDF/DOCX recording is authored; this keeps the guide card free of a
    // broken image while the CSS demo communicates the two-tool flow.
    gifSrc: "/guides/pdf-annotation.gif",
    demo: "pdf",
    steps: [
      { target: ".learning-tools-tab", completion: { type: "action", actions: [{ id: "learning:tab:tools", labelVi: "Mở tab Công cụ", labelEn: "Open Tools" }] }, titleVi: "Mở tab Công cụ", titleEn: "Open Tools", bodyVi: "Trong Trung tâm học tập, bấm Công cụ để mở các editor tài liệu.", bodyEn: "In Learning Hub, click Tools to open the document editors." },
      { target: ".document-tools-tabs button:first-child", completion: { type: "click" }, titleVi: "Chọn Vẽ trên PDF", titleEn: "Choose PDF drawing", bodyVi: "Chọn Vẽ trên PDF để viết, highlight, tẩy và xuất bản mới.", bodyEn: "Choose PDF drawing to write, highlight, erase and export a new copy." },
      { target: ".document-tool-list button", completion: { type: "click" }, titleVi: "Mở PDF từ thư viện", titleEn: "Open a PDF from the library", bodyVi: "Chọn một PDF trong danh sách. Nếu chưa có, hãy tải file lên.", bodyEn: "Choose a PDF from the list. Upload one first if the list is empty." },
      { target: ".document-annotation-tools", titleVi: "Chọn công cụ annotation", titleEn: "Choose an annotation tool", bodyVi: "Bật Vẽ trên PDF rồi thử bút, highlight hoặc eraser. Nét hiển thị ngay khi kéo.", bodyEn: "Enable Draw on PDF and try pen, highlight or eraser. Strokes render while you drag." },
      { target: ".document-tools-tabs button:nth-child(2)", completion: { type: "click" }, titleVi: "Mở Soạn thảo DOCX", titleEn: "Open DOCX editor", bodyVi: "Chuyển sang tab DOCX để mở và sửa tài liệu Word ở mức cơ bản.", bodyEn: "Switch to the DOCX tab to open and edit a document with basic Word features." },
      { target: ".docx-editable", completion: { type: "action", actions: [{ id: "docx:focus", labelVi: "Bấm vào vùng soạn thảo", labelEn: "Focus the editor" }] }, titleVi: "Bắt đầu trong vùng giấy", titleEn: "Start in the page", bodyVi: "Bấm vào vùng giấy để đặt con trỏ. Guide sẽ nhận đúng phiên DOCX đang mở rồi mới sang bước nhập.", bodyEn: "Click the page to place the caret. The guide verifies the active DOCX session before moving to typing." },
      { target: ".docx-editable", completion: { type: "action", actions: [{ id: "docx:text", labelVi: "Nhập hoặc sửa văn bản", labelEn: "Enter or edit text" }] }, titleVi: "Nhập nội dung", titleEn: "Enter content", bodyVi: "Gõ thêm một câu hoặc sửa chữ trong tài liệu. Nội dung được giữ trong mô hình DOCX có cấu trúc.", bodyEn: "Type a sentence or edit text. The content is kept in the structured DOCX model." },
      { target: ".docx-editable", completion: { type: "action", actions: [{ id: "docx:selection", labelVi: "Chọn một đoạn văn", labelEn: "Select a passage" }] }, titleVi: "Chọn vùng chữ", titleEn: "Select text", bodyVi: "Kéo chọn một đoạn chữ trong vùng giấy để các công cụ định dạng áp dụng đúng selection.", bodyEn: "Drag across text in the page so formatting applies to the selection." },
      { target: '.docx-mark-group button[title="bold"]', completion: { type: "action", actions: [{ id: "docx:format", labelVi: "Áp dụng định dạng", labelEn: "Apply formatting" }] }, titleVi: "Định dạng vùng đã chọn", titleEn: "Format the selection", bodyVi: "Bấm nút B đậm đang sáng để áp dụng bold cho vùng chữ đã chọn.", bodyEn: "Click the highlighted B button to apply bold to the selected text." },
      { target: ".docx-ribbon-tabs button:nth-child(2)", completion: { type: "click" }, titleVi: "Mở nhóm Chèn", titleEn: "Open Insert", bodyVi: "Mở tab Chèn để thêm bảng hoặc ảnh vào tài liệu.", bodyEn: "Open Insert to add a table or image." },
      { target: '[data-docx-action="insert-table"]', completion: { type: "action", actions: [{ id: "docx:table", labelVi: "Chèn bảng", labelEn: "Insert a table" }] }, titleVi: "Chèn bảng", titleEn: "Insert a table", bodyVi: "Chọn số hàng/cột rồi bấm Bảng. Một bảng thật sẽ được thêm vào mô hình DOCX.", bodyEn: "Choose rows and columns, then click Table. A real table is added to the DOCX model." },
      { target: '[data-docx-action="save"]', completion: { type: "action", actions: [{ id: "docx:save", labelVi: "Lưu bản chỉnh sửa", labelEn: "Save the edited copy" }] }, titleVi: "Lưu bản chỉnh sửa", titleEn: "Save the edited copy", bodyVi: "Bấm Lưu để tạo/cập nhật bản chỉnh sửa riêng; file gốc không bị ghi đè.", bodyEn: "Click Save to create or update a separate edited copy; the original is not overwritten." },
      { target: '[data-docx-action="export"]', kind: "practice", completion: { type: "action", actions: [{ id: "docx:export", labelVi: "Xuất một DOCX", labelEn: "Export a DOCX" }] }, titleVi: "Xuất DOCX", titleEn: "Export DOCX", bodyVi: "Bấm Xuất DOCX để tải gói OOXML hợp lệ. Khi hoàn tất, bạn có thể giữ hoặc xóa tài liệu thực hành.", bodyEn: "Click Export DOCX to download a valid OOXML package. When done, you can keep or delete the practice document." },
    ],
  },
  {
    id: "pdf-annotation",
    category: "documents",
    titleVi: "Vẽ trên PDF",
    titleEn: "Annotate a PDF",
    summaryVi:
      "Bật toàn màn hình để viết trực tiếp, đổi bút/highlight/eraser và xuất PDF mới.",
    summaryEn:
      "Enter fullscreen to draw directly, switch pen/highlighter/eraser and export a new PDF.",
    gifSrc: "/guides/pdf-annotation.gif",
    demo: "pdf",
    steps: [
      {
        target: ".manager-documents",
        completion: {
          type: "action",
          actions: [
            {
              id: "documents:library",
              labelVi: "Mở thư viện tài liệu",
              labelEn: "Open the document library",
            },
          ],
        },
        titleVi: "Mở thư viện tài liệu",
        titleEn: "Open the document library",
        bodyVi:
          "Guide đưa bạn tới Quản lý thư mục trước. Bấm Tài liệu đã tải lên để chọn PDF cần chú thích.",
        bodyEn:
          "The guide takes you to Folder Manager first. Click Uploaded documents to choose the PDF you want to annotate.",
      },
      {
        target: '.document-file-table .file-row[data-document-kind="pdf"]',
        completion: {
          type: "action",
          actions: [
            {
              id: "documents:open:pdf",
              labelVi: "Mở một file PDF",
              labelEn: "Open a PDF file",
            },
          ],
        },
        titleVi: "Mở file PDF",
        titleEn: "Open the PDF",
        bodyVi:
          "Bấm đúng dòng PDF hoặc nút con mắt của PDF. DOCX, PPTX và XLSX không hoàn thành bước này.",
        bodyEn:
          "Click the PDF row or its eye button. DOCX, PPTX and XLSX do not complete this step.",
      },
      {
        target: ".document-fullscreen-toggle",
        titleVi: "Bật toàn màn hình",
        titleEn: "Enter fullscreen",
        bodyVi:
          "PDF chỉ cho viết trực tiếp khi viewer ở toàn màn hình. Bấm nút phóng to đang sáng.",
        bodyEn:
          "Direct PDF drawing is enabled in fullscreen. Click the highlighted maximize button.",
      },
      {
        target: ".document-draw-toggle",
        titleVi: "Bật Vẽ trên PDF",
        titleEn: "Enable Draw on PDF",
        bodyVi:
          "Sau khi vào fullscreen, bật Vẽ trên PDF. Giữ Ctrl + kéo để zoom quanh vị trí bút.",
        bodyEn:
          "After entering fullscreen, enable Draw on PDF. Hold Ctrl and drag to zoom around the pen position.",
      },
      {
        target: ".document-annotation-tools",
        titleVi: "Chọn bút, highlight hoặc eraser",
        titleEn: "Choose pen, highlighter or eraser",
        bodyVi:
          "Nét hiện ngay khi đang viết. E dùng để xóa chính xác, Ctrl + Z/Y hoàn tác/làm lại, rồi bấm Xuất PDF.",
        bodyEn:
          "Strokes render while you write. E erases precisely, Ctrl + Z/Y undo or redo, then choose Export PDF.",
      },
      {
        target: ".document-pdf-body",
        titleVi: "Viết và kiểm tra nét",
        titleEn: "Draw and check the stroke",
        bodyVi:
          "Kéo trong vùng PDF để thấy nét xuất hiện tức thời. Giữ Space để pan, Ctrl + lăn để zoom tại vị trí con trỏ.",
        bodyEn:
          "Drag in the PDF to see the stroke immediately. Hold Space to pan and use Ctrl + wheel to zoom around the pointer.",
      },
      {
        kind: "practice",
        titleVi: "Tự chú thích và xuất PDF",
        titleEn: "Annotate and export your PDF",
        bodyVi:
          "Hãy viết một nét, thử highlight và tẩy một đoạn, hoàn tác một lần rồi bấm Xuất PDF. Khi file mới tải xong, bấm nút bên dưới.",
        bodyEn:
          "Draw a stroke, try a highlight and erase part of it, undo once and export the PDF. When the new file downloads, use the button below.",
      },
    ],
  },
  {
    id: "ai-workflow",
    category: "ai",
    titleVi: "Quy trình AI an toàn",
    titleEn: "Safe AI workflow",
    summaryVi:
      "Xem prompt, kiểm tra bản xem trước rồi mới áp dụng kết quả lên canvas.",
    summaryEn:
      "Review prompts and previews before applying AI output to your canvas.",
    gifSrc: "/guides/ai-workflow.gif",
    demo: "ai",
    outcomeVi: "Tìm được một thao tác AI, kiểm tra kết quả rồi mới áp dụng.",
    outcomeEn:
      "Find an AI action, review its result and apply it deliberately.",
    steps: [
      {
        target: ".topbar .command-trigger",
        titleVi: "Mở thao tác nhanh",
        titleEn: "Open quick actions",
        bodyVi: "Bấm kính lúp để tìm nhanh tính năng AI, file hoặc cài đặt.",
        bodyEn: "Click the search icon to find AI actions, files or settings.",
      },
      {
        target: ".command-search",
        titleVi: "Tìm theo từ khóa",
        titleEn: "Search by keyword",
        bodyVi:
          "Gõ tên tính năng hoặc project. Kết quả cập nhật ngay khi bạn nhập.",
        bodyEn: "Type a feature or project name. Results update as you type.",
      },
      {
        target: ".command-results button:first-child",
        titleVi: "Chọn một thao tác",
        titleEn: "Choose an action",
        bodyVi:
          "Bấm kết quả cần dùng. Palette sẽ đóng và mở đúng khu vực thay vì tạo thay đổi âm thầm.",
        bodyEn:
          "Click the action you need. The palette closes and opens the relevant area instead of changing things silently.",
      },
      {
        target: ".topbar .focus-mode-toggle",
        titleVi: "Giữ sự tập trung",
        titleEn: "Keep focus",
        bodyVi:
          "Bật Focus mode khi cần làm việc không bị sidebar che. Bấm lại để quay về giao diện đầy đủ.",
        bodyEn:
          "Use Focus mode when you need an uncluttered canvas. Click again to restore the full interface.",
      },
      {
        kind: "practice",
        titleVi: "Tự hoàn thành một quy trình AI",
        titleEn: "Complete an AI workflow",
        bodyVi:
          "Hãy tìm một thao tác, đọc prompt hoặc preview, kiểm tra kết quả và chỉ áp dụng khi bạn chắc chắn. Khi xong, bấm nút bên dưới.",
        bodyEn:
          "Find an action, read its prompt or preview, check the result and apply it only when you are ready. When finished, use the button below.",
      },
    ],
  },
  {
    id: "tool-hold-shortcuts",
    category: "canvas",
    titleVi: "Tool tạm thời bằng nhấn giữ",
    titleEn: "Temporary tools with press-and-hold",
    summaryVi:
      "Bấm nhanh để chọn lâu dài; nhấn giữ tool hoặc phím tắt để dùng tạm rồi tự quay về tool trước.",
    summaryEn:
      "Click quickly to keep a tool; hold a tool or shortcut for a temporary mode that restores on release.",
    gifSrc: "/guides/canvas-controls.gif",
    demo: "canvas",
    outcomeVi:
      "Dùng nhanh bút, eraser, highlight và hand mà không mất tool đang chọn.",
    outcomeEn:
      "Use pen, eraser, highlight and hand without losing your selected tool.",
    steps: [
      {
        target: ".workspace-nav-row > button:first-child",
        titleVi: "Quay về Workspace",
        titleEn: "Return to Workspace",
        bodyVi:
          "Bấm Workspace để tới nơi tạo canvas thực hành. Guide sẽ chờ trang Workspace hiện ra trước khi chỉ tool.",
        bodyEn:
          "Click Workspace to open a practice canvas. The guide waits for the Workspace page before pointing to a tool.",
      },
      {
        target: ".workspace-create-button",
        titleVi: "Tạo canvas thực hành",
        titleEn: "Create a practice canvas",
        bodyVi:
          "Bấm Tạo project mới, đặt tên rồi mở canvas. Ở cuối guide bạn có thể giữ hoặc đưa canvas vào thùng rác.",
        bodyEn:
          "Create and name a new project, then open its canvas. At the end you can keep it or move it to Trash.",
      },
      {
        target: ".guide-project-name-input",
        completion: {
          type: "input",
          selector: ".guide-project-name-input",
          minLength: 1,
        },
        titleVi: "Đặt tên canvas",
        titleEn: "Name the canvas",
        bodyVi: "Nhập tên bất kỳ. Nút Tạo sẽ sáng khi tên hợp lệ.",
        bodyEn:
          "Enter any name. Create becomes available once the name is valid.",
      },
      {
        target: ".guide-project-create-submit",
        titleVi: "Mở canvas mới",
        titleEn: "Open the new canvas",
        bodyVi:
          "Bấm Tạo để mở thanh công cụ thật. Guide sẽ chờ canvas tải xong.",
        bodyEn:
          "Click Create to open the real toolbar. The guide waits for the canvas to load.",
      },
      {
        target: '[data-tool="pen"]',
        titleVi: "Bấm nhanh để chọn lâu dài",
        titleEn: "Click quickly to keep a tool",
        bodyVi:
          "Bấm nhanh nút Bút một lần. Bút vẫn được chọn sau khi thả; đây là cách chọn tool lâu dài.",
        bodyEn:
          "Click Pen once. It stays selected after release; this is a persistent tool choice.",
      },
      {
        target: '[data-tool="eraser"]',
        titleVi: "Nhấn giữ để dùng tạm",
        titleEn: "Hold for a temporary tool",
        bodyVi:
          "Nhấn giữ E hoặc nút Tẩy trong lúc đang chọn Bút. Khi thả ra, MindCanvas tự trả về Bút.",
        bodyEn:
          "Hold E or the Eraser button while Pen is selected. On release, MindCanvas returns to Pen.",
      },
      {
        target: '[data-tool="highlighter"]',
        titleVi: "Đổi tạm sang highlight",
        titleEn: "Temporarily highlight",
        bodyVi:
          "Giữ H hoặc nút Highlight để đánh dấu một đoạn, rồi thả ra để quay về tool trước.",
        bodyEn:
          "Hold H or Highlighter to mark a passage, then release to return to the previous tool.",
      },
      {
        target: '[data-tool="hand"]',
        titleVi: "Giữ hand để pan",
        titleEn: "Hold hand to pan",
        bodyVi:
          "Giữ Space hoặc nút Hand và kéo canvas. Không cần đổi tool hiện tại chỉ để di chuyển khung nhìn.",
        bodyEn:
          "Hold Space or Hand and drag the canvas. You do not need to permanently switch tools just to pan.",
      },
      {
        target: '[data-tool="select"]',
        titleVi: "V vẫn là trỏ chọn",
        titleEn: "V remains the pointer",
        bodyVi:
          "Giữ V để chọn tạm khi đang vẽ, kéo chọn nhiều phần tử bằng khung marquee, rồi thả để trở về tool trước.",
        bodyEn:
          "Hold V for temporary selection while drawing, marquee-select multiple elements, then release to restore the previous tool.",
      },
      {
        kind: "practice",
        titleVi: "Tự luyện nhấn giữ",
        titleEn: "Practice press-and-hold",
        bodyVi:
          "Chọn Bút, giữ E để tẩy một đoạn, thả E và giữ Space để pan. Sau đó bấm nhanh Highlight để chọn nó lâu dài.",
        bodyEn:
          "Choose Pen, hold E to erase part of a stroke, release E and hold Space to pan. Then click Highlighter quickly to keep it selected.",
      },
    ],
  },
];

export function guideForId(id: string | null | undefined) {
  return id
    ? (GUIDE_DEFINITIONS.find((guide) => guide.id === id) ?? null)
    : null;
}

export function guideForTrigger(trigger: string | null | undefined) {
  return trigger
    ? (GUIDE_DEFINITIONS.find((guide) => guide.trigger === trigger) ?? null)
    : null;
}

function storageKey(ownerId: string | null | undefined) {
  return `${STORAGE_PREFIX}:${ownerId || "guest"}`;
}

function normalizeEntry(value: unknown): GuideProgressEntry | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<GuideProgressEntry>;
  if (
    candidate.status !== "active" &&
    candidate.status !== "completed" &&
    candidate.status !== "skipped" &&
    candidate.status !== "unseen"
  )
    return null;
  return {
    status: candidate.status,
    ...(typeof candidate.startedAt === "string"
      ? { startedAt: candidate.startedAt }
      : {}),
    ...(typeof candidate.completedAt === "string"
      ? { completedAt: candidate.completedAt }
      : {}),
  };
}

export function readGuideProgress(
  ownerId: string | null | undefined,
): GuideProgress {
  try {
    const raw = localStorage.getItem(storageKey(ownerId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([id, value]) => {
        const entry = normalizeEntry(value);
        return entry ? [[id, entry]] : [];
      }),
    );
  } catch {
    return {};
  }
}

function writeGuideProgress(
  ownerId: string | null | undefined,
  progress: GuideProgress,
) {
  try {
    localStorage.setItem(storageKey(ownerId), JSON.stringify(progress));
  } catch {}
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent(GUIDE_PROGRESS_EVENT, {
        detail: { ownerId: ownerId || "guest" },
      }),
    );
}

export function guideIsActivated(progress: GuideProgress, guideId: string) {
  return (progress[guideId]?.status ?? "unseen") !== "unseen";
}

export function guideIdForHelpScope(scope: PageHelpScope) {
  return ({ workspace: "workspace-navigation", canvas: "canvas-controls", learning: "learning-hub", folders: "folder-manager" } as const)[scope];
}

export function pageHelpIsUnlocked(progress: GuideProgress, scope: PageHelpScope) {
  return progress[guideIdForHelpScope(scope)]?.status === "completed";
}

export function markGuideStarted(
  ownerId: string | null | undefined,
  guideId: string,
) {
  const progress = readGuideProgress(ownerId);
  const current = progress[guideId];
  if (current?.status === "completed" || current?.status === "skipped")
    return progress;
  const entry: GuideProgressEntry = {
    status: "active",
    startedAt: current?.startedAt ?? new Date().toISOString(),
  };
  const next = { ...progress, [guideId]: entry };
  writeGuideProgress(ownerId, next);
  return next;
}

export function finishGuide(
  ownerId: string | null | undefined,
  guideId: string,
  status: "completed" | "skipped",
) {
  const progress = readGuideProgress(ownerId);
  const next = {
    ...progress,
    [guideId]: {
      status,
      startedAt: progress[guideId]?.startedAt ?? new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
  };
  writeGuideProgress(ownerId, next);
  return next;
}

export function resetGuideProgress(
  ownerId: string | null | undefined,
  guideId?: string,
) {
  const progress = readGuideProgress(ownerId);
  const next = guideId
    ? { ...progress, [guideId]: { status: "unseen" as const } }
    : {};
  writeGuideProgress(ownerId, next);
  return next;
}
