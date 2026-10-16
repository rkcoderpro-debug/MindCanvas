import { useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { htmlDocumentWarnings, htmlSandboxDocument, validateHtmlDocument } from "../lib/htmlDocument";

export default function HtmlDocumentViewer({ html, title, onReady, controls = true }: { html: string; title: string; onReady?: () => void; controls?: boolean }) {
  const root = useRef<HTMLDivElement>(null), [expanded, setExpanded] = useState(false);
  const prepared = useMemo(() => { try { const valid = validateHtmlDocument(html); return { src: htmlSandboxDocument(valid), warnings: htmlDocumentWarnings(valid), error: "" }; } catch (cause) { return { src: "", warnings: [], error: (cause as Error).message }; } }, [html]);
  if (prepared.error) return <p className="form-error" role="alert">{prepared.error}</p>;
  return <div ref={root} className={`html-document-viewer ${expanded ? "is-expanded" : ""}`}>{controls && <div className="html-document-toolbar"><span>HTML tương tác</span><button className="text-button" onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}{expanded ? "Thu nhỏ" : "Toàn màn hình"}</button></div>}{prepared.warnings.map(warning => <p className="field-hint" key={warning}>{warning}</p>)}<iframe title={title} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={prepared.src} onLoad={onReady}/></div>;
}
