import { lazy, Suspense, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { documentKindFor, fileToDataUrl } from "../lib/documentStore";
import { isPlainTextDocument, readTextDocumentPreview } from "../lib/documentPreview";
import { useLanguage } from "../lib/i18n";
import { downloadWorkspaceBlob } from "../lib/workspaceFiles";
import DocumentReaderBar, { type ReaderAction } from "./DocumentReaderBar";

const DocumentViewer = lazy(() => import("./DocumentViewer"));
type Preview = { dataUrl: string; mimeType: string } | Awaited<ReturnType<typeof readTextDocumentPreview>> | { failed: true };

export default function SharedDocumentReader({ id, name, load }: { id: string; name: string; load: (signal?: AbortSignal) => Promise<Blob> }) {
  const { language, t } = useLanguage();
  const tr = (vi: string, en: string) => language === "vi" ? vi : en;
  const detected = documentKindFor(name);
  const kind = detected === "html" ? null : detected;
  const plain = !detected && isPlainTextDocument(name);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);

  useEffect(() => {
    if (!kind && !plain) return;
    const abort = new AbortController();
    setPreview(null);
    void (async () => {
      try {
        const blob = await load(abort.signal);
        if (abort.signal.aborted) return;
        const result = kind ? { dataUrl: await fileToDataUrl(blob), mimeType: blob.type } : await readTextDocumentPreview(blob);
        if (!abort.signal.aborted) setPreview(result);
      } catch { if (!abort.signal.aborted) setPreview({ failed: true }); }
    })();
    return () => abort.abort();
  }, [kind, plain, attempt, load]);

  const download = async () => {
    setDownloading(true); setDownloadError(false);
    try { downloadWorkspaceBlob(await load(), name); }
    catch { setDownloadError(true); }
    finally { setDownloading(false); }
  };
  const caption = tr("Tài liệu chia sẻ · Chỉ xem", "Shared file · View only");
  const downloadLabel = tr("Tải xuống", "Download");
  const actions: ReaderAction[] = [
    { id: "download", label: downloading ? t("loading") : downloadLabel, icon: Download, prominent: true, disabled: downloading, run: () => void download() },
  ];

  return <div className="workspace-file-preview compact-file-preview shared-document-reader">
    {kind && preview && "dataUrl" in preview
      ? <Suspense fallback={<p role="status">{t("loading")}</p>}><DocumentViewer
          source={{ id, name, kind, mimeType: preview.mimeType, dataUrl: preview.dataUrl }} readOnly enableGuide={false} reader={{ caption, actions }}/></Suspense>
      : <div className="compact-file-reader">
        <DocumentReaderBar title={name} kind={kind ?? name.match(/\.([a-z0-9]{1,8})$/i)?.[1]} caption={caption} actions={actions}/>
        <div className={`compact-file-body${preview && "text" in preview ? " has-text" : ""}`}>
          {!kind && !plain ? <p>{tr("Định dạng này cần tải xuống để mở.", "Download this file to open it.")}</p>
            : !preview ? <p role="status">{tr("Đang mở tài liệu…", "Opening document…")}</p>
            : "failed" in preview ? <div role="alert"><p>{tr("Không mở được bản xem trước.", "Could not load the preview.")}</p><button
                type="button" className="secondary-button" onClick={() => setAttempt(value => value + 1)}>{t("retry")}</button></div>
            : "text" in preview && <>{preview.truncated && <p>{tr("Đang xem 256 KB đầu tiên. Tải xuống để đọc toàn bộ.", "Previewing the first 256 KB. Download to read the full file.")}</p>}<pre tabIndex={0}>{preview.text}</pre></>}
        </div>
      </div>}
    {downloadError && <p className="form-error reader-status" role="alert">{tr("Không tải được tài liệu. Hãy thử lại.", "Could not download the file. Try again.")}</p>}
  </div>;
}
