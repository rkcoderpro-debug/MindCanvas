import { renderToStaticMarkup } from "react-dom/server";
import type { SavedExam } from "@mindcanvas/shared";
import { validateExamDraft } from "@mindcanvas/shared";
import ExamPaper from "../components/ExamPaper";
export const EXAM_PRINT_CSS = `@page{size:A4;margin:18mm 16mm}*{box-sizing:border-box}body{margin:0;color:#172033;font:11pt Arial,sans-serif;line-height:1.55}.exam-paper>header{text-align:center;border-bottom:1px solid #cbd5e1;padding-bottom:10px;margin-bottom:18px}h1{font-size:20pt;line-height:1.3}h2{font-size:14pt;margin:20px 0 10px}h3{font-size:11pt;margin:14px 0 5px}h3 span{font-weight:400}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0}.exam-options{padding-left:24px}.exam-options li{padding:3px 0;white-space:pre-wrap;overflow-wrap:anywhere}.exam-answer-paper{break-before:page;page-break-before:always}.exam-question{break-inside:avoid;page-break-inside:avoid}.exam-question p,.exam-rubric li{orphans:3;widows:3}.exam-writing-space{height:28mm;background:repeating-linear-gradient(white,white 8mm,#ddd 8mm,#ddd 8.2mm);margin:8px 0}.exam-writing-space.essay{height:50mm}blockquote{margin:5px 0 10px;color:#475569;font-size:9pt}.exam-references{font-size:9pt;border-top:1px solid #eee;padding-top:5px}.formula-display{display:block;text-align:center;margin:10px 0}.katex-display{overflow-wrap:normal}header,h2,h3{break-after:avoid;page-break-after:avoid}button{display:none}`;
export function examPrintMarkup(exam: SavedExam) { return renderToStaticMarkup(<><ExamPaper exam={exam}/><ExamPaper exam={exam} answers/></>); }
/** Native print-to-PDF preserves Unicode/KaTeX without an external converter. */
export async function exportExamPdf(exam: SavedExam): Promise<void> {
  if (exam.settings.format !== "paper") throw new Error("Quiz được lưu trong mục Quiz.");
  validateExamDraft(exam.draft, exam.blueprint, exam.sources, exam.settings.format);
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("Trình duyệt chặn cửa sổ xuất PDF. Hãy cho phép cửa sổ bật lên rồi thử lại.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const doc = popup.document; doc.open(); doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>'); doc.close();
    popup.opener = null; doc.title = exam.draft.title;
    const base = doc.createElement("base"); base.href = window.location.href; doc.head.append(base);
    const styles = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map(link => new Promise<void>((resolve, reject) => {
      const copy = doc.createElement("link"); copy.rel = "stylesheet"; copy.href = link.href;
      copy.onload = () => resolve(); copy.onerror = () => reject(new Error("Không thể tải font/CSS để xuất PDF. Hãy kiểm tra mạng rồi thử lại.")); doc.head.append(copy);
    }));
    document.querySelectorAll("style").forEach(style => doc.head.append(style.cloneNode(true)));
    const css = doc.createElement("style"); css.textContent = `${EXAM_PRINT_CSS}\nhtml,body{background:white!important;color:#172033!important}.exam-paper{background:white!important;color:#172033!important;box-shadow:none!important;padding:0!important;border:0!important;max-width:none!important;margin:0!important}.exam-paper *{color:inherit}`; doc.head.append(css);
    doc.body.innerHTML = examPrintMarkup(exam);
    const ready = async () => {
      await Promise.all(styles); void doc.body.offsetHeight; await doc.fonts?.ready;
    };
    await Promise.race([ready(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Tải giao diện PDF quá lâu. Hãy thử lại.")), 15000); })]);
    if (!popup.closed) { popup.focus(); popup.print(); }
  } catch (error) { if (!popup.closed) popup.close(); throw error; }
  finally { if (timer) clearTimeout(timer); }
}
