import { BarChart3, Beaker, BookOpen, CalendarDays, ClipboardList, FileText, GraduationCap, Layers3, Music2, Users } from "lucide-react";
import type { useLanguage } from "./i18n";
import type { HubTab } from "./learningNavigation";

export function normalizeQuickSearch(value: string) {
  return value.toLocaleLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").trim();
}

export function learningCommands(t: ReturnType<typeof useLanguage>["t"], language: string) {
  const vi = language === "vi";
  const commands = {
    overview: [t("learningHub"), Layers3, "không gian học tập study tools learning space"],
    flashcards: [t("flashcards"), BookOpen, "flashcard thẻ ghi nhớ ôn tập bộ thẻ deck"],
    quiz: [t("quiz"), ClipboardList, "quiz trắc nghiệm bài kiểm tra câu hỏi"],
    exams: [vi ? "Tạo tài liệu" : "Create documents", FileText, "tạo đề kiểm tra takenote exam create documents"],
    plan: [t("studyPlan"), CalendarDays, "lịch học kế hoạch lịch ôn study plan schedule"],
    progress: [t("progress"), BarChart3, "tiến độ lịch sử thống kê history results"],
    lab: [t("labNav"), Beaker, "lab mô phỏng thí nghiệm simulations"],
    tools: [vi ? "Tài liệu" : "Documents", FileText, "thư viện tài liệu pdf document library"],
    shared: [vi ? "Được chia sẻ với tôi" : "Shared with me", BookOpen, "chia sẻ học liệu shared resources"],
    connections: [vi ? "Bạn bè & tin nhắn" : "Friends & messages", Users, "kết nối bạn bè nhắn tin friends messages"],
    classrooms: [vi ? "Lớp học" : "Classrooms", GraduationCap, "lớp học bài tập classroom assignments"],
    music: [vi ? "Nhạc tập trung" : "Focus music", Music2, "nhạc tập trung music audio"],
  } satisfies Record<HubTab, [string, typeof BookOpen, string]>;
  return commands;
}
