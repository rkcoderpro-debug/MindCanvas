import type { ExamSource } from "@mindcanvas/shared";
import type { ManualExamWorkspace } from "../lib/examManual";
import { downloadManualFile, manualSourceBundle, readLocalBytes } from "../lib/examManualSource";
import { writeClipboardText } from "../lib/aiSource";
type Props = { value: ManualExamWorkspace; sources: ExamSource[]; originals: Map<string, File>; busy: boolean; owner: string | null; maxQuestions: number; onChange: (value: ManualExamWorkspace) => void; onPrompt: () => void; onImport: () => void; run: (label: string, job: (signal: AbortSignal) => Promise<void>) => Promise<void> };
export default function ExamManualPanel({ value, sources, originals, busy, owner, maxQuestions, onChange, onPrompt, onImport, run }: Props) {
  const attributes = value.attributes;
  const change = (patch: Partial<typeof attributes>) => onChange({ ...value, attributes: { ...attributes, ...patch } });
  const copy = (prompt: string) => void run("Đang sao chép prompt.", async () => { try { await writeClipboardText(prompt); } catch { throw new Error("Trình duyệt chưa cho phép sao chép. Hãy chọn nội dung trong ô prompt và sao chép thủ công, hoặc tải gói gửi AI."); } });
  const download = (prompt: string, input: ExamSource[]) => void run("Đang chuẩn bị gói gửi AI.", async signal => { const blob = await manualSourceBundle(prompt, input, originals); if (!signal.aborted) downloadManualFile(blob, "mindcanvas-ai-input.zip"); });
  return <fieldset className="exam-manual-panel" disabled={busy}>
    <legend>2. AI Manual</legend>
    <p>Chọn thuộc tính → lấy prompt → gửi AI bên ngoài → nhập kết quả → xem, chỉnh sửa và xuất đề.</p>
    <div className="exam-fields">
      <label>Số câu<input aria-label="Số câu Manual" type="number" min={1} max={maxQuestions} value={attributes.questionCount ?? ""} placeholder="Theo mẫu" onChange={event => change({ questionCount: event.target.value === "" ? null : Number(event.target.value) })}/></label>
      <label>Thời gian (phút)<input aria-label="Thời gian Manual" type="number" min={5} max={300} value={attributes.durationMinutes ?? ""} placeholder="Theo mẫu" onChange={event => change({ durationMinutes: event.target.value === "" ? null : Number(event.target.value) })}/></label>
      <label>Điểm mỗi câu<input aria-label="Điểm mỗi câu Manual" type="number" min={.01} max={100} step="any" value={attributes.pointsPerQuestion ?? ""} placeholder="Theo mẫu" onChange={event => change({ pointsPerQuestion: event.target.value === "" ? null : Number(event.target.value) })}/></label>
    </div>
    <label>Yêu cầu bổ sung<textarea aria-label="Yêu cầu bổ sung Manual" maxLength={2000} rows={3} value={attributes.instructions} onChange={event => change({ instructions: event.target.value })}/></label>
    <p className="exam-hint">Để trống số câu, thời gian hoặc điểm để AI giữ theo mẫu. Quiz luôn có 4 lựa chọn. Nội dung đề, đáp án và lời giải được nhập cùng một lần.</p>
    <button type="button" className="primary-button" disabled={!sources.length || !owner} onClick={onPrompt}>Lấy prompt tạo đề</button>
    {value.ocrPrompt && <details open className="exam-manual-source-prompt"><summary>Prompt đọc tài liệu / OCR</summary><p>Gửi prompt cùng file gốc cho AI bên ngoài. Dán bản chép đầy đủ vào ô nội dung nguồn, rà soát công thức và đánh dấu đã kiểm tra nguồn. File gốc được kèm trong gói nếu đã chọn trong lần mở trang này; sau khi mở lại, hãy đính kèm file gốc riêng cho AI.</p><textarea aria-label="Prompt OCR Manual" readOnly rows={6} value={value.ocrPrompt}/><div className="actions"><button type="button" className="secondary-button" onClick={() => copy(value.ocrPrompt!)}>Sao chép prompt OCR</button><button type="button" className="secondary-button" onClick={() => download(value.ocrPrompt!, sources)}>Tải gói OCR</button></div></details>}
    {value.session && <>
      <p className="exam-hint">Prompt dùng tài liệu và thuộc tính tại lúc bấm lấy prompt. Nếu thay đổi lựa chọn, hãy lấy prompt mới. {value.session.replacement ? "Đang thay thế một câu; các câu khác được giữ lại." : "Không cần xác nhận cấu trúc riêng."}</p>
      <label>Prompt gửi AI<textarea aria-label="Prompt đề Manual" readOnly rows={9} value={value.session.prompt}/></label>
      <div className="actions"><button type="button" className="secondary-button" onClick={() => copy(value.session!.prompt)}>Sao chép prompt</button><button type="button" className="secondary-button" onClick={() => download(value.session!.prompt, value.session!.sources)}>Tải gói gửi AI</button></div>
      <p>Gửi prompt và tài liệu cho ChatGPT, Gemini hoặc AI bạn chọn; yêu cầu trả về JSON. Sau đó dán hoặc chọn file kết quả bên dưới.</p>
      <label>Kết quả từ AI<textarea aria-label="Kết quả AI Manual" rows={10} maxLength={2000000} value={value.importText} onChange={event => onChange({ ...value, importText: event.target.value })}/></label>
      <label className="exam-upload">Chọn file JSON kết quả<input aria-label="File JSON Manual" type="file" accept=".json,application/json" onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
        void run("Đang đọc JSON kết quả.", async signal => { if (file.size > 2000000) throw new Error("File kết quả vượt 2 MB."); const text = new TextDecoder("utf-8", { fatal: true }).decode(await readLocalBytes(file)); if (!signal.aborted) onChange({ ...value, importText: text }); });
      }}/></label>
      <button type="button" className="primary-button" disabled={!value.importText.trim() || !owner} onClick={onImport}>Nhập kết quả & xem đề</button>
    </>}
    <p className="exam-hint">Manual không gửi tài liệu tới AI của MindCanvas. Nhập kết quả hợp lệ cần đăng nhập và dùng hạn mức AI Manual hiện có; kiểm tra cấu trúc không thay thế việc rà soát kiến thức và lời giải.</p>
  </fieldset>;
}
