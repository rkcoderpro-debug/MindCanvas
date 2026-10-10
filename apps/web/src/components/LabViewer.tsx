import { useEffect, useMemo, useRef, useState } from "react";
import { Beaker, Maximize2, Minimize2, Play, RefreshCw } from "lucide-react";
import { labSandboxDocument, validateLabHtml } from "../lib/lab";
import { cleanLabViewer, type LabViewerConfig } from "../lib/labModes";
import { readLabBridgeMessage } from "../lib/labPreview";
import { useLanguage } from "../lib/i18n";

export default function LabViewer({ html, title, allowExternalResources = false, viewerConfig, onThumbnail, frameClassName }: {
  html: string; title: string; allowExternalResources?: boolean; viewerConfig?: LabViewerConfig; onThumbnail?: (image: string, manual: boolean) => void; frameClassName?: string;
}) {
  const { language } = useLanguage(); const vi = language === "vi";
  const shell = useRef<HTMLDivElement>(null), frame = useRef<HTMLIFrameElement>(null);
  const [consent, setConsent] = useState(false), [fullscreen, setFullscreen] = useState(false), [fallback, setFallback] = useState(false);
  const [height, setHeight] = useState(560), [session, setSession] = useState(0), [error, setError] = useState("");
  const token = useMemo(() => crypto.randomUUID(), [html, session, allowExternalResources]);
  const manualPreview = useRef(false), captureTimeout = useRef<number | undefined>(undefined);
  const previewRef = useRef(onThumbnail); previewRef.current = onThumbnail;
  const config = cleanLabViewer(viewerConfig);
  const check = useMemo(() => validateLabHtml(html, { allowExternalResources }), [html, allowExternalResources]);
  const runnable = check.ok && (!allowExternalResources || consent);
  const srcDoc = useMemo(() => runnable ? labSandboxDocument(html, { allowExternalResources, bridgeToken: token }) : "", [html, allowExternalResources, runnable, token]);
  useEffect(() => { setConsent(false); setHeight(560); setError(""); }, [html, allowExternalResources]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const data = readLabBridgeMessage(event, frame.current?.contentWindow ?? null, token);
      if (data?.height) setHeight(data.height);
      if (data?.thumbnail) { window.clearTimeout(captureTimeout.current); setError(""); previewRef.current?.(data.thumbnail, manualPreview.current); manualPreview.current = false; }
    };
    window.addEventListener("message", listener); return () => { window.clearTimeout(captureTimeout.current); window.removeEventListener("message", listener); };
  }, [token]);
  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
    const target = shell.current;
    const sync = () => setFullscreen((document.fullscreenElement ?? doc.webkitFullscreenElement) === target);
    document.addEventListener("fullscreenchange", sync); document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync); document.removeEventListener("webkitfullscreenchange", sync);
      if (target && (document.fullscreenElement ?? doc.webkitFullscreenElement) === target) void (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())?.catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!fallback) return;
    const old = document.body.style.overflow; document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setFallback(false); setFullscreen(false); } };
    window.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = old; window.removeEventListener("keydown", escape); };
  }, [fallback]);
  async function toggleFullscreen() {
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
    const target = shell.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> }) | null;
    try {
      if (fallback) { setFallback(false); setFullscreen(false); return; }
      if (target && (document.fullscreenElement ?? doc.webkitFullscreenElement) === target) { await (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.()); return; }
      if (!target) return;
      const request = target.requestFullscreen ?? target.webkitRequestFullscreen;
      if (!request) { setFallback(true); setFullscreen(true); return; }
      await request.call(target); setFullscreen(true);
    } catch { setFallback(true); setFullscreen(true); }
  }
  return <div className={`lab-player ${fallback ? "lab-player-fullscreen" : ""}`} ref={shell}>
    <div className="lab-player-toolbar"><span><span className="lab-live-dot"/>{vi ? "Khung Lab" : "Lab viewer"}</span><div>
      {onThumbnail && runnable && <button className="secondary-button" onClick={() => { manualPreview.current = true; window.clearTimeout(captureTimeout.current); frame.current?.contentWindow?.postMessage({ channel: "mindcanvas-lab-preview", token }, "*"); captureTimeout.current = window.setTimeout(() => { manualPreview.current = false; setError(vi ? "Lab chưa hỗ trợ tạo ảnh bìa. Bạn có thể chọn ảnh bìa trong phần tùy chọn." : "This Lab cannot generate a cover. Upload one in the options."); }, 4000); }}>{vi ? "Lấy ảnh bìa" : "Capture cover"}</button>}
      <button className="icon-button" disabled={!runnable} onClick={() => { if (window.confirm(vi ? "Chạy lại Lab từ đầu?" : "Restart the Lab?")) setSession(n => n + 1); }} aria-label={vi ? "Chạy lại Lab" : "Restart Lab"}><RefreshCw size={17}/></button>
      <button className="icon-button" disabled={!runnable} onClick={() => void toggleFullscreen()} aria-label={fullscreen ? (vi ? "Thoát toàn màn hình" : "Exit fullscreen") : (vi ? "Toàn màn hình" : "Fullscreen")}>{fullscreen ? <Minimize2 size={18}/> : <Maximize2 size={18}/>}</button>
    </div></div>
    {!check.ok ? <div className="lab-player-empty" role="alert"><Beaker size={32}/><p>{vi ? "Không thể chạy HTML này. Hãy chỉnh sửa Lab và kiểm tra tệp, dung lượng hoặc tài nguyên bên ngoài." : "This HTML cannot run. Edit the Lab and check the file, size or external resources."}</p><small>{check.warnings.join(" · ")}</small></div>
      : !runnable ? <div className="lab-player-empty"><Beaker size={32}/><p>{vi ? "Lab này cần tải thư viện từ CDN. Cho phép tải để bắt đầu; cần kết nối Internet." : "This Lab needs CDN libraries. Allow loading to start; Internet is required."}</p><button className="primary-button" onClick={() => setConsent(true)}><Play size={17}/>{vi ? "Cho phép tải thư viện và chạy" : "Allow libraries and run"}</button></div>
      : <div className={`lab-player-content lab-player-${config.presentation}`} style={config.presentation === "scene" ? { aspectRatio: config.aspectRatio.replace(":", "/") } : { height: config.presentation === "document" ? "72dvh" : `${height}px` }}><iframe className={frameClassName} ref={frame} title={title} sandbox="allow-scripts" srcDoc={srcDoc} onError={() => setError(vi ? "Không tải được Lab. Hãy thử chạy lại." : "Lab could not load. Try restarting.")}/></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
