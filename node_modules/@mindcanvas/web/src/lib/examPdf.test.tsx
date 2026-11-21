// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import ExamPaper from "../components/ExamPaper";
import { EXAM_PRINT_CSS, examPrintMarkup, exportExamPdf } from "./examPdf";
import { examFixture } from "./examTestData";
afterEach(() => vi.restoreAllMocks());
it("keeps model answers out of the question view and prints answers after the entire exam", () => {
  const exam = examFixture(), questionView = renderToStaticMarkup(<ExamPaper exam={exam}/>), print = examPrintMarkup(exam);
  expect(questionView).not.toContain("MODEL ANSWER ONLY"); expect(questionView).not.toContain("WORKED EXPLANATION ONLY");
  const host = document.createElement("div"); host.innerHTML = print;
  expect(host.querySelectorAll("article.exam-paper")).toHaveLength(2);
  expect(host.querySelectorAll("article.exam-paper")[0].textContent).not.toContain("WORKED EXPLANATION ONLY");
  expect(host.querySelectorAll("article.exam-paper")[1].textContent).toContain("WORKED EXPLANATION ONLY");
  expect(EXAM_PRINT_CSS).toContain("page-break-before:always");
});
it("preserves Vietnamese and math markup, escapes hostile text and disables trusted KaTeX", () => {
  const exam = examFixture(); exam.draft.title = "Đề thi Hóa học"; exam.draft.sections[0].questions[0].prompt = 'Tính $\\frac{1}{2}$ và $\\ce{H2O}$. <img src=x onerror=alert(1)>';
  const host = document.createElement("div"); host.innerHTML = examPrintMarkup(exam);
  expect(host.textContent).toContain("Đề thi Hóa học"); expect(host.querySelector(".katex")).not.toBeNull(); expect(host.querySelector("img,script")).toBeNull();
});
it("reports a blocked PDF popup before doing any asynchronous work", async () => {
  vi.spyOn(window, "open").mockReturnValue(null); await expect(exportExamPdf(examFixture())).rejects.toThrow("chặn cửa sổ");
});
it("opens the print window synchronously and includes both sections", async () => {
  const frame = document.createElement("iframe"); document.body.append(frame);
  const popup = frame.contentWindow!; const print = vi.fn(), focus = vi.fn();
  Object.defineProperty(popup, "print", { configurable: true, value: print }); Object.defineProperty(popup, "focus", { configurable: true, value: focus });
  vi.spyOn(window, "open").mockReturnValue(popup);
  await exportExamPdf(examFixture());
  expect(print).toHaveBeenCalledTimes(1); expect(popup.document.querySelectorAll("article.exam-paper")).toHaveLength(2); expect(popup.opener).toBeNull(); frame.remove();
});
