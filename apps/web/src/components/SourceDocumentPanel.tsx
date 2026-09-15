import { Download, ExternalLink, FileText } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import Dialog from "./Dialog";

export type SourceDocumentView = { url: string; name: string; kind?: "pdf" | "docx" | "pptx" | "other"; page: number };

export default function SourceDocumentPanel({ source, onClose }: { source: SourceDocumentView; onClose: () => void }) {
  const { t } = useLanguage();
  const pageUrl = `${source.url}#page=${Math.max(1, source.page)}`;
  const isPdf = source.kind === "pdf" || !source.kind;
  return <Dialog title={`${source.name} · ${t("page")} ${source.page}`} onClose={onClose}>
    {isPdf ? <div className="source-document-viewer"><iframe src={pageUrl} title={`${source.name}, ${t("page")} ${source.page}`}/></div> : <div className="source-document-fallback"><FileText size={36}/><p>{t("documentPreviewUnavailable")}</p><a className="primary-button" href={source.url} target="_blank" rel="noreferrer" download={source.name}><Download size={16}/>{t("downloadOriginal")}</a></div>}
    <footer className="actions"><button className="secondary-button" onClick={onClose}>{t("close")}</button>{isPdf && <a className="primary-button" href={pageUrl} target="_blank" rel="noreferrer"><ExternalLink size={16}/>{t("openNewTab")}</a>}</footer>
  </Dialog>;
}
