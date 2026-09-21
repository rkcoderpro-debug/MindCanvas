export type GuideCategory = "workspace" | "canvas" | "learning" | "documents" | "ai";

export type GuideDemo = "navigation" | "canvas" | "learning" | "lab" | "pdf" | "ai";

export type GuideStep = {
  target: string;
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
const STORAGE_PREFIX = "mindcanvas:feature-guides:v1";

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
    steps: [{
      target: ".workspace-nav-row > button:first-child",
      titleVi: "Bắt đầu tại Workspace",
      titleEn: "Start in Workspace",
      bodyVi: "Bấm Workspace để quay về danh sách project. Mở mũi tên bên phải để xem File gần đây, Yêu thích và Thùng rác.",
      bodyEn: "Click Workspace to return to your projects. Open the arrow on the right to reveal Recent, Favorites and Trash.",
    }],
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
    steps: [{
      target: ".drawing-toolbar",
      titleVi: "Thanh công cụ canvas",
      titleEn: "Canvas toolbar",
      bodyVi: "Bấm vào thanh công cụ để chọn V (trỏ/chọn), H (hand), P (bút), B (highlight) hoặc E (eraser). Giữ Space để pan và Ctrl + kéo bút để zoom tại vị trí trỏ.",
      bodyEn: "Open the toolbar to choose V (pointer/select), H (hand), P (pen), B (highlight) or E (eraser). Hold Space to pan and Ctrl + drag the pen to zoom around its starting point.",
    }],
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
    steps: [{
      target: ".learning-hub-nav",
      titleVi: "Chọn công cụ học",
      titleEn: "Choose a study tool",
      bodyVi: "Dùng các tab Flashcard, Quiz, Kế hoạch hoặc Lab. Trạng thái học được giữ lại trên thiết bị và tài khoản của bạn.",
      bodyEn: "Use the Flashcards, Quiz, Plan or Lab tabs. Your study state is kept with this browser and account.",
    }],
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
    steps: [{
      target: ".lab-run-card",
      titleVi: "Tải HTML và lưu Lab",
      titleEn: "Upload HTML and save the Lab",
      bodyVi: "Tải file .html do AI trả về, bấm Kiểm tra và chạy, sau đó dùng nút Lưu Lab ở thanh runner hoặc chân trang.",
      bodyEn: "Upload the .html file returned by AI, choose Check and run, then use Save lab in the runner or sticky footer.",
    }],
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
    steps: [{
      target: ".manager-documents",
      titleVi: "Mở lại file đã up",
      titleEn: "Reopen an uploaded file",
      bodyVi: "Trong Quản lý thư mục, cuộn tới Thư viện tài liệu và chọn một file. Viewer sẽ xuất hiện ngay bên dưới danh sách.",
      bodyEn: "In Folder Manager, scroll to Document library and select a file. Its viewer appears below the list.",
    }],
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
    steps: [{
      target: ".topbar .command-trigger",
      titleVi: "Mở thao tác nhanh",
      titleEn: "Open quick actions",
      bodyVi: "Bấm kính lúp để tìm nhanh tính năng AI, file hoặc cài đặt. Kết quả AI luôn cần được bạn xem lại trước khi áp dụng.",
      bodyEn: "Click the search icon to find AI actions, files or settings. AI results always remain reviewable before you apply them.",
    }],
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
