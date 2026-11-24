import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import Dialog from "./Dialog";
import DocxViewer from "./DocxViewer";
import { roomIssue, type MeetingRoomFile } from "../lib/onlineRooms";

const word = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
function dataUrl(blob: Blob) {
  return new Promise<string>((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
function RoomPdf({ file, vi }: { file: Blob; vi: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf,setPdf] = useState<PDFDocumentProxy|null>(null), [page,setPage] = useState(1), [error,setError] = useState(false);
  const [rendering,setRendering] = useState(true);
  useEffect(() => {
    let alive = true, task: PDFDocumentLoadingTask | undefined;
    void Promise.all([import("pdfjs-dist/legacy/build/pdf.mjs"),file.arrayBuffer()]).then(async ([api,bytes]) => {
      if (!alive) return;
      api.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      task = api.getDocument({ data:new Uint8Array(bytes), enableXfa:false, maxImageSize:16_000_000 });
      const document = await task.promise;
      if (alive) setPdf(document);
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; void task?.destroy().catch(() => {}); };
  },[file]);
  useEffect(() => {
    if (!pdf) return;
    let alive = true, task: RenderTask | undefined;
    setRendering(true);
    void pdf.getPage(page).then(async data => {
      const output = canvas.current;
      if (!alive || !output) return;
      const initial = data.getViewport({ scale:1 });
      const scale = Math.min(2, 1500 / Math.max(initial.width,initial.height));
      if (!Number.isFinite(scale) || scale <= 0) throw new Error("Invalid PDF page");
      const viewport = data.getViewport({ scale });
      output.width = Math.max(1,Math.ceil(viewport.width)); output.height = Math.max(1,Math.ceil(viewport.height));
      const context = output.getContext("2d");
      if (!context) throw new Error("Canvas not available");
      task = data.render({ canvas:output,canvasContext:context,viewport });
      await task.promise;
      if (alive) setRendering(false);
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; task?.cancel(); };
  },[pdf,page]);
  if (error) return <p role="alert">{vi ? "Không đọc được bản xem trước PDF. Bạn vẫn có thể tải tệp." : "Could not preview this PDF. You can still download it."}</p>;
  return <div className="meeting-pdf">
    {pdf && <div className="meeting-pdf-pages"><button type="button" className="icon-button" disabled={page <= 1} aria-label={vi ? "Trang trước" : "Previous page"} onClick={() => setPage(page-1)}><ChevronLeft size={17}/></button>
      <output>{page} / {pdf.numPages}</output>
      <button type="button" className="icon-button" disabled={page >= pdf.numPages} aria-label={vi ? "Trang sau" : "Next page"} onClick={() => setPage(page+1)}><ChevronRight size={17}/></button></div>}
    {rendering && <p role="status">{vi ? "Đang hiển thị trang PDF…" : "Rendering PDF page…"}</p>}
    <canvas ref={canvas} aria-label={vi ? `Trang PDF ${page}` : `PDF page ${page}`} hidden={rendering}/>
  </div>;
}

export default function MeetingFilePreview({ file,vi,load,onClose }: { file: MeetingRoomFile; vi: boolean; load:(id:string)=>Promise<Blob>; onClose:()=>void }) {
  const [body,setBody] = useState<{ blob:Blob; url:string; text?:string; office?:string }|null>(null);
  const [error,setError] = useState<unknown>(null), [imageError,setImageError] = useState(false);
  useEffect(() => {
    let alive = true, url: string | undefined;
    void load(file.id).then(async raw => {
      if (!alive) return;
      const blob = new Blob([raw],{ type:file.mime });
      const text = file.mime === "text/plain" ? await blob.slice(0,262144).text() : undefined;
      const office = file.mime === word ? await dataUrl(blob) : undefined;
      if (!alive) return;
      url = URL.createObjectURL(blob); setBody({ blob,url,text,office });
    }).catch(cause => { if (alive) setError(cause); });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  },[file.id,file.mime,load]);
  return <Dialog className="meeting-file-preview" workspace title={file.name} onClose={onClose}>
    {error != null ? <p role="alert">{roomIssue(error,vi)}</p> : !body ? <p role="status">{vi ? "Đang tải tệp từ phòng…" : "Loading file from the room…"}</p> : <>
      <div className="meeting-preview-actions"><a className="secondary-button" href={body.url} download={file.name}><Download size={16}/>{vi ? "Tải tệp" : "Download file"}</a></div>
      {file.mime === "application/pdf" ? <RoomPdf file={body.blob} vi={vi}/> :
        body.office ? <DocxViewer dataUrl={body.office}/> :
        body.text !== undefined ? <pre className="meeting-preview-text">{body.text}{body.blob.size > 262144 ? (vi ? "\n\n… Tải tệp để xem toàn bộ." : "\n\n… Download to read the rest.") : ""}</pre> :
        ["image/png","image/jpeg","image/webp"].includes(file.mime) && !imageError ? <img className="meeting-preview-image" src={body.url} alt={file.name} onError={() => setImageError(true)}/> :
        <p>{vi ? "Không xem trước được tệp này." : "This file cannot be previewed."}</p>}
    </>}
  </Dialog>;
}
