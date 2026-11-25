import { useEffect, useState } from "react";
import { Download, FileText, FolderOpen, Link2 } from "lucide-react";
import DocumentViewer from "./DocumentViewer";
import { WorkspaceShareButton } from "./WorkspaceShareDialog";
import { documentKindFor, fileToDataUrl } from "../lib/documentStore";
import { workspaceFilePermalink } from "../lib/folderLinks";
import { useLanguage } from "../lib/i18n";
import { copyTextWithFallback } from "../lib/share";
import { downloadWorkspaceBlob, readWorkspaceFile, type WorkspaceFile } from "../lib/workspaceFiles";

const textLimit = 256 * 1024;
const isPlainText = (name: string) => /\.(txt|md|csv|tsv|c|cc|cpp|cxx|h|hh|hpp|s|asm|mips|java|py|js|ts|json|sql|log)$/i.test(name);

type Props = {
  owner: string | null;
  file: WorkspaceFile;
  onClose?: () => void;
  onFolder?: () => void;
  onReady?: Parameters<typeof DocumentViewer>[0]["onReady"];
  dedicated?: boolean;
};
type Preview = { dataUrl: string } | { text: string; truncated: boolean } | { failed: true };

export default function WorkspaceFilePreview({ owner, file, onClose, onFolder, onReady, dedicated }: Props) {
  const { language, t } = useLanguage();
  const label = (vi: string, en: string) => language === "vi" ? vi : en;
  const kind = documentKindFor(file.name);
  const plain = !kind && isPlainText(file.name);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const [linkState, setLinkState] = useState<"idle" | "copied" | "show">("idle");

  useEffect(() => {
    if (!file.ready || (!kind && !plain)) return;
    let alive = true;
    setPreview(null);
    void (async () => {
      try {
        const blob = await readWorkspaceFile(owner, file.id);
        if (!alive) return;
        const result = kind ? { dataUrl: await fileToDataUrl(blob) } : {
          text: await blob.slice(0, textLimit).text(),
          truncated: blob.size > textLimit,
        };
        if (alive) setPreview(result);
      } catch { if (alive) setPreview({ failed: true }); }
    })();
    return () => { alive = false; };
  }, [owner, file.id, file.ready, kind, plain, attempt]);

  const download = async () => {
    setDownloading(true); setDownloadError(false);
    try { downloadWorkspaceBlob(await readWorkspaceFile(owner, file.id), file.name); }
    catch { setDownloadError(true); }
    finally { setDownloading(false); }
  };
  const copyLink = async () => setLinkState(await copyTextWithFallback(workspaceFilePermalink(file.id)) ? "copied" : "show");

  return <div className="workspace-file-preview">
    <header className="workspace-file-preview-header">
      <div className="workspace-file-preview-title"><FileText size={20} aria-hidden="true"/><h2>{file.name}</h2></div>
      <div className="actions">
        {onFolder && <button type="button" className="secondary-button" onClick={onFolder}><FolderOpen size={16}/>{label("Mở thư mục", "Open folder")}</button>}
        <button type="button" className="secondary-button" onClick={() => void copyLink()}><Link2 size={16}/>{linkState === "copied" ? t("shareCopied") : label("Link cá nhân", "Private link")}</button>
        {file.ready && <WorkspaceShareButton item={{ kind: "file", id: file.id, title: file.name }} available={!!owner}/>}
        <button type="button" className="primary-button" disabled={!file.ready || downloading} onClick={() => void download()}><Download size={16}/>{downloading ? t("loading") : label("Tải xuống", "Download")}</button>
      </div>
    </header>
    {linkState === "show" && <input aria-label={label("Link cá nhân", "Private link")} readOnly value={workspaceFilePermalink(file.id)} onFocus={event => event.currentTarget.select()}/>}
    {downloadError && <p className="form-error" role="alert">{label("Không thể tải tệp xuống. Hãy thử lại.", "Could not download the file. Try again.")}</p>}
    {!file.ready ? <p role="status">{label("Tải lên chưa hoàn tất.", "Upload incomplete.")}</p>
      : !kind && !plain ? <p role="status">{label("Tệp này chưa có trình xem. Hãy tải xuống để mở bằng ứng dụng phù hợp.", "No preview for this format. Download the file to open it in a compatible app.")}</p>
      : !preview ? <p role="status">{label("Đang mở tài liệu…", "Opening document…")}</p>
      : "failed" in preview ? <div role="alert"><p>{label("Không thể mở tài liệu. Hãy thử lại hoặc tải tệp xuống.", "Could not open the document. Try again or download it.")}</p><button type="button" className="secondary-button" onClick={() => setAttempt(value => value + 1)}>{t("retry")}</button></div>
      : "text" in preview ? <>{preview.truncated && <p>{label("Đang xem 256 KB đầu tiên. Tải xuống để xem toàn bộ.", "Previewing the first 256 KB. Download to read the full file.")}</p>}<pre tabIndex={0}>{preview.text}</pre></>
      : kind && <DocumentViewer source={{ id: file.id, name: file.name, kind, mimeType: "application/octet-stream", dataUrl: preview.dataUrl }} owner={owner} dedicated={dedicated && kind === "pdf"} onClose={onClose} onReady={onReady}/>}
  </div>;
}
