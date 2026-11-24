import FilePicker from "./FilePicker";
import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Trash2, Eye, Search } from "lucide-react";
import type { UploadedDocument } from "../lib/documentStore";
import { deleteDocument, documentKindFor, fileToDataUrl, MAX_DOCUMENT_BYTES, saveDocument, DOCUMENT_ACCEPT, type DocumentKind } from "../lib/documentStore";
import { useLanguage } from "../lib/i18n";
import DocumentViewer from "./DocumentViewer";
import { emitGuideAction } from "../lib/featureGuides";

export default function FolderManager({ owner, documents, onDocumentsChanged }: { owner: string | null; documents: UploadedDocument[]; onDocumentsChanged: () => void }) {
  const { t, language } = useLanguage();
  const [selectedDocument,setSelectedDocument] = useState<UploadedDocument | null>(null);
  const [documentQuery, setDocumentQuery] = useState("");
  const [documentFilter, setDocumentFilter] = useState<DocumentKind | "all">("all");
  const [uploading, setUploading] = useState(false);
  const [documentError, setDocumentError] = useState("");
  const documentList = useMemo(() => documents.filter(file => (documentFilter === "all" || file.kind === documentFilter) && (!documentQuery.trim() || file.name.toLocaleLowerCase().includes(documentQuery.trim().toLocaleLowerCase()))), [documents, documentFilter, documentQuery]);
  const removeDocument = async (document: UploadedDocument) => { if (!window.confirm(language === "vi" ? `Xóa ${document.name} khỏi thư viện tài liệu?` : `Delete ${document.name} from the document library?`)) return; await deleteDocument(document.owner === "guest" ? null : document.owner, document.id); setSelectedDocument(null); onDocumentsChanged(); };
  const uploadDocuments = async (files: File[]) => {
    if (!files.length || uploading) return;
    setUploading(true); setDocumentError("");
    const errors: string[] = [];
    for (const file of files) {
      const kind = documentKindFor(file.name, file.type);
      if (!kind) { errors.push(`${file.name}: ${language === "vi" ? "định dạng không hỗ trợ" : "unsupported format"}`); continue; }
      if (file.size > MAX_DOCUMENT_BYTES) { errors.push(`${file.name}: ${language === "vi" ? "vượt quá 40 MB" : "over 40 MB"}`); continue; }
      try {
        const dataUrl = await fileToDataUrl(file);
        await saveDocument(owner, { name: file.name, mimeType: file.type || "application/octet-stream", kind, size: file.size, dataUrl, folderId: null });
        emitGuideAction("documents:uploaded", { name: file.name, kind });
      } catch (error) { errors.push(`${file.name}: ${error instanceof Error ? error.message : "upload failed"}`); }
    }
    if (errors.length) setDocumentError(errors.join(" · "));
    if (files.length !== errors.length) onDocumentsChanged();
    setUploading(false);
  };
  const downloadDocument = (file: UploadedDocument) => { const link = document.createElement("a"); link.href = file.dataUrl; link.download = file.name; link.click(); emitGuideAction("documents:download", { documentId: file.id, kind: file.kind }); };
  return <section className="workspace-home folder-library">
    <div className="folder-manager-main">
        <div className="manager-toolbar"><div><span className="eyebrow">{language === "vi" ? "THƯ VIỆN TÀI LIỆU" : "DOCUMENT LIBRARY"}</span><h1>{language === "vi" ? "Tài liệu đã tải lên" : "Uploaded documents"}</h1><p className="manager-local-storage-note">{language === "vi" ? "Lưu trên thiết bị này · PDF, DOCX, PPTX, XLSX" : "Stored on this device · PDF, DOCX, PPTX, XLSX"}</p></div><div className="manager-toolbar-actions"><span className="manager-count">{documentList.length}</span><FilePicker className="document-library-picker" layout="inline" label={uploading ? t("loading") : language === "vi" ? "Tải tài liệu lên" : "Upload documents"}
          accept={DOCUMENT_ACCEPT} multiple disabled={uploading} description="PDF, DOCX, PPTX, XLSX"
          onChange={event => { void uploadDocuments(Array.from(event.currentTarget.files ?? [])); }}/></div></div>
        <div className="document-library-controls"><label className="document-search"><Search size={16}/><input value={documentQuery} onChange={event => setDocumentQuery(event.target.value)} placeholder={language === "vi" ? "Tìm tài liệu…" : "Search documents…"}/></label><select value={documentFilter} onChange={event => setDocumentFilter(event.target.value as DocumentKind | "all")} aria-label={language === "vi" ? "Lọc loại tài liệu" : "Filter document type"}><option value="all">{language === "vi" ? "Tất cả loại" : "All types"}</option><option value="pdf">PDF</option><option value="docx">DOCX</option><option value="pptx">PPTX</option><option value="xlsx">XLSX</option></select></div>
        {documentError && <p className="form-error" role="alert">{documentError}</p>}
        {selectedDocument ? <div className="manager-document-viewer"><button className="secondary-button manager-back-button" onClick={()=>{setSelectedDocument(null);emitGuideAction("documents:back");}}>← {language === "vi" ? "Danh sách tài liệu" : "Back to documents"}</button><DocumentViewer source={selectedDocument} onReady={detail => emitGuideAction("documents:viewer-ready", { ...detail, documentId: selectedDocument.id, kind: selectedDocument.kind })}/><div className="document-viewer-footer-actions"><button type="button" className="secondary-button" onClick={() => downloadDocument(selectedDocument)}><Download size={15}/>{language === "vi" ? "Tải xuống" : "Download"}</button><button className="text-danger-button" onClick={()=>void removeDocument(selectedDocument)}><Trash2 size={15}/>{language === "vi" ? "Xóa tài liệu" : "Delete document"}</button></div></div> : !documentList.length ? <div className="empty-state"><FileSpreadsheet size={42}/><h2>{documents.length ? (language === "vi" ? "Không có tài liệu phù hợp" : "No matching documents") : (language === "vi" ? "Chưa có tài liệu đã tải lên" : "No uploaded documents")}</h2><p>{language === "vi" ? "Bấm Tải tài liệu lên để lưu PDF, DOCX, PPTX hoặc XLSX trên thiết bị này." : "Click Upload documents to store PDF, DOCX, PPTX or XLSX on this device."}</p></div> : <div className="file-table document-file-table">{documentList.map(document=><div className="file-row" data-document-id={document.id} data-document-kind={document.kind} key={document.id} onClick={()=>{setSelectedDocument(document);emitGuideAction(document.kind === "pdf" ? "documents:open:pdf" : "documents:open", { documentId: document.id, kind: document.kind });}} onDoubleClick={()=>{setSelectedDocument(document);emitGuideAction(document.kind === "pdf" ? "documents:open:pdf" : "documents:open", { documentId: document.id, kind: document.kind });}}><FileSpreadsheet size={19}/><span title={document.name}>{document.name}</span><small>{document.kind.toUpperCase()} · {new Date(document.updatedAt).toLocaleDateString(language === "vi" ? "vi-VN" : "en-US")}</small><div className="document-row-actions"><button className="icon-button" aria-label={`${language === "vi" ? "Tải xuống" : "Download"}: ${document.name}`} onClick={event=>{event.stopPropagation();downloadDocument(document);}}><Download size={16}/></button><button className="icon-button" aria-label={`${language === "vi" ? "Xem" : "View"}: ${document.name}`} onClick={event=>{event.stopPropagation();setSelectedDocument(document);emitGuideAction(document.kind === "pdf" ? "documents:open:pdf" : "documents:open", { documentId: document.id, kind: document.kind });}}><Eye size={17}/></button></div></div>)}</div>}
    </div>
  </section>;
}
