import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { htmlDocumentWarnings, htmlSandboxDocument, validateHtmlDocument } from "../lib/htmlDocument";
import { learningHubRevision, readLearningHub } from "../lib/learningHub";
import { loadHubProgress, saveHubProgressEvent } from "../lib/learningHubProgress";
import { emptyHubProgress, renderLearningHub } from "../../../../packages/shared/src/learningHub.js";

export default function HtmlDocumentViewer({ html, title, owner = null, onReady, controls = true }: { html: string; title: string; owner?: string | null; onReady?: () => void; controls?: boolean }) {
  const root = useRef<HTMLDivElement>(null), [expanded, setExpanded] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState<{ html: string; owner: string | null; src: string; error: string } | null>(null);
  const [storageError, setStorageError] = useState("");
  const prepared = useMemo(() => { try { const valid = validateHtmlDocument(html); return { src: htmlSandboxDocument(valid), hub: readLearningHub(valid), warnings: htmlDocumentWarnings(valid), error: "" }; } catch (cause) { return { src: "", hub: null, warnings: [], error: (cause as Error).message }; } }, [html]);
  useEffect(() => {
    let alive = true; setStorageError("");
    const hub = prepared.hub, token = crypto.randomUUID();
    let remove = () => {};
    if (!hub) { setReady({ html, owner, src: prepared.src, error: "" }); return; }
    void (async () => {
      try {
        const revision = await learningHubRevision(hub);
        let progress = emptyHubProgress();
        try { progress = await loadHubProgress(owner, revision, hub); }
        catch { if (alive) setStorageError("Chưa đọc được tiến độ đã lưu. Lượt học này vẫn hoạt động; hãy kiểm tra quyền lưu trữ của trình duyệt."); }
        if (!alive) return;
        const receive = (event: MessageEvent) => {
          if (!alive || event.source !== frame.current?.contentWindow || event.data?.type !== "mc-hub-event" || event.data?.token !== token) return;
          const value = event.data.event;
          if (!value || (value.kind === "read" ? typeof value.objectiveId !== "string" || value.objectiveId.length > 80 : value.kind === "answer" ? typeof value.questionId !== "string" || value.questionId.length > 80 || typeof value.answerId !== "string" || value.answerId.length > 80 : true)) return;
          void saveHubProgressEvent(owner, revision, hub, value).catch(() => { if (alive) setStorageError("Chưa lưu được tiến độ. Giữ tab này để tiếp tục lượt học hiện tại."); });
        };
        window.addEventListener("message", receive); remove = () => window.removeEventListener("message", receive);
        setReady({ html, owner, src: htmlSandboxDocument(renderLearningHub(hub, { token, progress })), error: "" });
      } catch (cause) { if (alive) setReady({ html, owner, src: "", error: (cause as Error).message }); }
    })();
    return () => { alive = false; remove(); };
  }, [prepared, html, owner]);
  if (prepared.error) return <p className="form-error" role="alert">{prepared.error}</p>;
  const current = ready?.html === html && ready.owner === owner ? ready : null;
  if (!current) return <p role="status">Đang mở Learning Hub…</p>;
  if (current.error) return <p className="form-error" role="alert">{current.error}</p>;
  return <div ref={root} className={`html-document-viewer ${expanded ? "is-expanded" : ""}`}>{controls && <div className="html-document-toolbar"><span>{prepared.hub ? "Learning Hub HTML" : "HTML tương tác"}</span><button className="text-button" onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}{expanded ? "Thu nhỏ" : "Toàn màn hình"}</button></div>}{prepared.hub && <details className="html-progress-info"><summary>Tiến độ lưu trên thiết bị này</summary><p>Tiến độ đọc và quiz được lưu riêng theo tài khoản. Nội dung thay đổi sẽ bắt đầu tiến độ mới. File HTML tải về học được offline; tiến độ trong file chỉ giữ cho lượt mở hiện tại.</p></details>}{storageError && <p role="alert" className="form-error">{storageError}</p>}{prepared.warnings.map(warning => <p className="field-hint" key={warning}>{warning}</p>)}<iframe ref={frame} title={title} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={current.src} onLoad={onReady}/></div>;
}
