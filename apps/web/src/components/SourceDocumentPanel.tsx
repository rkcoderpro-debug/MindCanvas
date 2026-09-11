import { ExternalLink } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import Dialog from "./Dialog";

export type SourceDocumentView = { url: string; name: string; page: number };

export default function SourceDocumentPanel({ source, onClose }: { source: SourceDocumentView; onClose: () => void }) {
  const { t } = useLanguage();
  const pageUrl = `${source.url}#page=${Math.max(1, source.page)}`;
  return <Dialog title={`${source.name} · ${t("page")} ${source.page}`} onClose={onClose}>
    <div className="source-document-viewer"><iframe src={pageUrl} title={`${source.name}, ${t("page")} ${source.page}`}/></div>
    <footer className="actions"><button className="secondary-button" onClick={onClose}>{t("close")}</button><a className="primary-button" href={pageUrl} target="_blank" rel="noreferrer"><ExternalLink size={16}/>{t("openNewTab")}</a></footer>
  </Dialog>;
}
