import { Component, lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import type { LearningKind } from "../lib/learningShare";

export class InboxBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error("Shared learning view failed", error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function SharedLearningTab({ owner, onSaved }: { owner: string | null; onSaved?: (kind: LearningKind) => void }) {
  const { language } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  // React.lazy remembers a rejected load. A retry must use a new lazy type.
  const Page = useMemo(() => lazy(() => import("./SharedLearningPage")), [attempt]);
  const vi = language === "vi";
  return <InboxBoundary key={`${owner}:${attempt}`} fallback={<section className="shared-learning" role="alert">
    <h2>{vi ? "Không thể mở mục chia sẻ" : "Could not open shared learning"}</h2>
    <p>{vi ? "Hãy kiểm tra kết nối và thử lại. Nếu ứng dụng vừa cập nhật, hãy tải lại trang." : "Check your connection and try again. If the app was just updated, reload the page."}</p>
    <div className="actions"><button className="primary-button" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={16}/>{vi ? "Thử lại" : "Retry"}</button>
      <button className="secondary-button" onClick={() => window.location.reload()}>{vi ? "Tải lại trang" : "Reload page"}</button></div>
  </section>}>
    <Suspense fallback={<section className="shared-learning" role="status">{vi ? "Đang tải mục chia sẻ…" : "Loading shared learning…"}</section>}>
      <Page owner={owner} onSaved={onSaved}/>
    </Suspense>
  </InboxBoundary>;
}
