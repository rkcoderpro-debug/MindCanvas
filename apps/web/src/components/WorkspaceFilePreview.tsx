import type { AccountPlan } from "../lib/account";
import { useEffect, useState } from "react";
import { Download, FileText, FolderOpen, Link2, Share2 } from "lucide-react";
import DocumentViewer from "./DocumentViewer";
import DocumentReaderBar, { type ReaderAction } from "./DocumentReaderBar";
import Dialog from "./Dialog";
import { WorkspaceShareSettings } from "./WorkspaceShareDialog";
import { documentKindFor, fileToDataUrl } from "../lib/documentStore";
import { isPlainTextDocument, readTextDocumentPreview } from "../lib/documentPreview";
import { workspaceFilePermalink } from "../lib/folderLinks";
import { useLanguage } from "../lib/i18n";
import { copyTextWithFallback } from "../lib/share";
import { downloadWorkspaceBlob, readWorkspaceFile, type WorkspaceFile } from "../lib/workspaceFiles";

type Props = {
  owner: string | null;
  accountPlan?: AccountPlan;
  file: WorkspaceFile;
  onFolder?: () => void;
  onLibrary?: () => void;
  onReady?: Parameters<typeof DocumentViewer>[0]["onReady"];
  dedicated?: boolean;
};
type Preview = { dataUrl: string } | { text: string; truncated: boolean } | { failed: true };

export default function WorkspaceFilePreview({ owner, accountPlan, file, onFolder, onLibrary, onReady, dedicated }: Props) {
  const { language, t } = useLanguage();
  const label = (vi: string, en: string) => language === "vi" ? vi : en;
  const kind = documentKindFor(file.name);
  const plain = !kind && isPlainTextDocument(file.name);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [linkState, setLinkState] = useState<"idle" | "copied" | "show">("idle");

  useEffect(() => {
    if (!file.ready || (!kind && !plain)) return;
    let alive = true;
    setPreview(null);
    void (async () => {
      try {
        const blob = await readWorkspaceFile(owner, file.id);
        if (!alive) return;
        const result = kind ? { dataUrl: await fileToDataUrl(blob) } : await readTextDocumentPreview(blob);
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
  const actions: ReaderAction[] = [
    { id: "download", label: downloading ? t("loading") : label("Tải tệp gốc", "Download original"), icon: Download, disabled: !file.ready || downloading, run: () => void download() },
    { id: "link", label: label("Sao chép link cá nhân", "Copy private link"), icon: Link2, run: () => void copyLink() },
    ...(file.ready ? [{ id: "share", label: label("Chia sẻ", "Share"), icon: Share2, run: () => setSharing(true) }] : []),
    ...(onFolder ? [{ id: "folder", label: label("Mở thư mục", "Open folder"), icon: FolderOpen, run: onFolder }] : []),
    ...(onLibrary ? [{ id: "library", label: label("Thư viện tài liệu", "Document library"), icon: FileText, run: onLibrary }] : []),
  ];
  const caption = label("Tệp Workspace", "Workspace file");
  const displayed = preview && "dataUrl" in preview && kind;

  return <div className="workspace-file-preview compact-file-preview">
    {displayed && preview && "dataUrl" in preview
      ? <DocumentViewer source={{ id: file.id, name: file.name, kind: displayed, mimeType: "application/octet-stream", dataUrl: preview.dataUrl }}
          owner={owner} dedicated={dedicated && displayed === "pdf"} reader={{ actions, caption }} onReady={onReady}/>
      : <div className="compact-file-reader">
        <DocumentReaderBar title={file.name} kind={kind ?? file.name.match(/\.([a-z0-9]{1,8})$/i)?.[1]} caption={caption} actions={actions}/>
        <div className={"compact-file-body" + (preview && "text" in preview ? " has-text" : "")}>
          {!file.ready ? <p role="status">{label("Tải lên chưa hoàn tất.", "Upload incomplete.")}</p>
          : !kind && !plain ? <><p>{label("Định dạng này chưa hỗ trợ xem trước.", "Preview is unavailable for this format.")}</p><button type="button" className="primary-button" disabled={downloading} onClick={() => void download()}><Download size={16}/>{label("Tải tệp gốc", "Download original")}</button></>
          : !preview ? <p role="status">{label("Đang mở tài liệu…", "Opening document…")}</p>
          : "failed" in preview ? <div role="alert"><p>{label("Không thể mở tài liệu. Hãy thử lại hoặc tải tệp xuống.", "Could not open the document. Try again or download it.")}</p><button type="button" className="secondary-button" onClick={() => setAttempt(value => value + 1)}>{t("retry")}</button></div>
          : "text" in preview && <>{preview.truncated && <p>{label("Đang xem 256 KB đầu tiên. Tải xuống để xem toàn bộ.", "Previewing the first 256 KB. Download to read the full file.")}</p>}<pre tabIndex={0}>{preview.text}</pre></>}
        </div>
      </div>}
    {linkState === "show" && <input aria-label={label("Link cá nhân", "Private link")} readOnly value={workspaceFilePermalink(file.id)} onFocus={event => event.currentTarget.select()}/>}
    {linkState === "copied" && <p className="reader-status" role="status">{t("shareCopied")}</p>}
    {downloadError && <p className="form-error reader-status" role="alert">{label("Không thể tải tệp xuống. Hãy thử lại.", "Could not download the file. Try again.")}</p>}
    {sharing && <Dialog workspace className="workspace-share-dialog" title={`${label("Chia sẻ", "Share")}: ${file.name}`} onClose={() => setSharing(false)}>
      <WorkspaceShareSettings item={{ kind: "file", id: file.id, title: file.name }} friends={{ plan: accountPlan }} available={!!owner}/>
    </Dialog>}
  </div>;
}
