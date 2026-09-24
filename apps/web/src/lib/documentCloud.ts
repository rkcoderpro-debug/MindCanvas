import { getCurrentSession, requestTimeoutSignal, supabase } from "./supabase";
import { documentKindFor, fileToDataUrl, saveDocument, type DocumentKind, type UploadedDocument } from "./documentStore";

export type CloudDocumentDescriptor = {
  id: string;
  name: string;
  mimeType: string;
  kind: DocumentKind;
  size: number;
  updatedAt: string;
};

const MIME_BY_EXTENSION: Record<DocumentKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

async function clientFor(owner: string) {
  const session = await getCurrentSession();
  if (!supabase || !session || session.user.id !== owner) throw new Error("Phiên đăng nhập đã thay đổi. Hãy đăng nhập lại.");
  return supabase;
}

export async function listOwnedCloudDocuments(owner: string | null): Promise<CloudDocumentDescriptor[]> {
  if (!owner) return [];
  const client = await clientFor(owner);
  const { data, error } = await client.from("documents")
    .select("id,file_name,file_size_bytes,created_at")
    .eq("user_id", owner).order("created_at", { ascending: false }).limit(500)
    .abortSignal(requestTimeoutSignal(20000));
  if (error) throw error;
  return (data ?? []).flatMap(row => {
    const kind = documentKindFor(row.file_name);
    if (!kind) return [];
    return [{ id: row.id, name: row.file_name, mimeType: MIME_BY_EXTENSION[kind], kind,
      size: Number(row.file_size_bytes) || 0, updatedAt: row.created_at }];
  });
}

/** Hydrate a cloud document only when the learner opens it, avoiding a bulk
 * download of every file on initial sign-in. */
export async function downloadOwnedCloudDocument(owner: string, documentId: string): Promise<UploadedDocument> {
  const client = await clientFor(owner);
  const { data: row, error } = await client.from("documents")
    .select("id,file_path,file_name,file_size_bytes,created_at")
    .eq("user_id", owner).eq("id", documentId)
    .abortSignal(requestTimeoutSignal(20000)).maybeSingle();
  if (error) throw error;
  if (!row?.file_path) throw new Error("Không tìm thấy tệp tài liệu trên cloud.");
  const kind = documentKindFor(row.file_name);
  if (!kind) throw new Error("Định dạng tài liệu này chưa được hỗ trợ trong thư viện.");
  const signed = await client.storage.from("documents").createSignedUrl(row.file_path, 5 * 60);
  if (signed.error || !signed.data?.signedUrl) throw signed.error ?? new Error("Không tạo được liên kết tải tài liệu.");
  const response = await fetch(signed.data.signedUrl);
  if (!response.ok) throw new Error(`Không tải được tài liệu (HTTP ${response.status}).`);
  const blob = await response.blob();
  const file = new File([blob], row.file_name, { type: blob.type || MIME_BY_EXTENSION[kind] });
  return saveDocument(owner, {
    id: row.id, name: row.file_name, mimeType: file.type, kind, size: file.size,
    dataUrl: await fileToDataUrl(file), folderId: null, updatedAt: row.created_at,
  });
}
