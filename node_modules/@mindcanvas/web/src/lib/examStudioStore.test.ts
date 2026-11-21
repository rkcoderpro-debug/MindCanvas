// @vitest-environment jsdom
import "fake-indexeddb/auto";
import JSZip from "jszip";
import { afterEach, expect, it } from "vitest";
import { buildStudioBundle, deleteStudioItem, emptyStudioWorkspace, getStudioOriginal, listStudioItems, loadOnlineAttempt, loadStudioWorkspace, persistStudioWorkspace, saveOnlineAttempt, saveStudioItem, saveStudioOriginal, saveStudioOriginalBatch, validateOnlineAttempt } from "./examStudioStore";
import { createStudioPrompt, emptyStudioConfig } from "./examStudioPrompt";
import { readLocalBytes } from "./examManualSource";
import { studioExam, studioSource } from "./examStudioTestData";
afterEach(() => localStorage.clear());
it("bundles only prompt and bit-identical originals, preserving names, styles and duplicate names", async () => {
  const docx = new JSZip(); docx.file("word/document.xml", '<w:document><w:p>Original font and table properties</w:p></w:document>'); docx.file("word/styles.xml", '<w:style><w:rFonts w:ascii="Times New Roman"/></w:style>');
  const bytes = await docx.generateAsync({ type: "arraybuffer" });
  const files = [new File([bytes], "Đề mẫu.docx"), new File([new Uint8Array([0, 1, 255, 2])], "Đề mẫu.docx")];
  const sources = await saveStudioOriginalBatch("bundle-owner", files, "material"); sources[0].role = "template";
  const session = createStudioPrompt(emptyStudioConfig(), sources, 50), blob = await buildStudioBundle("bundle-owner", session), zip = await JSZip.loadAsync(await readLocalBytes(blob));
  const names = Object.keys(zip.files).filter(name => !zip.files[name].dir); expect(names.sort()).toEqual(["originals/1/Đề mẫu.docx", "originals/2/Đề mẫu.docx", "prompt.txt"]);
  expect(await zip.file("originals/1/Đề mẫu.docx")!.async("uint8array")).toEqual(new Uint8Array(bytes)); expect(await zip.file("originals/2/Đề mẫu.docx")!.async("uint8array")).toEqual(new Uint8Array([0, 1, 255, 2]));
  expect(await zip.file("prompt.txt")!.async("text")).not.toContain("Original font and table properties"); expect(names.some(name => /sources|\.json$|README/.test(name))).toBe(false);
  const restored = await getStudioOriginal("bundle-owner", sources[0].id); expect(restored?.name).toBe("Đề mẫu.docx"); expect(new Uint8Array(await readLocalBytes(restored!))).toEqual(new Uint8Array(bytes));
});
it("reports missing originals and never substitutes extracted text", async () => { const source = { ...studioSource(), role: "template" as const }; const session = createStudioPrompt(emptyStudioConfig(), [source], 50); await expect(buildStudioBundle("missing-owner", session)).rejects.toThrow(/Thiếu file gốc/); });
it("does not create source files for separately supplied text", async () => { const config = { ...emptyStudioConfig(), output: "online" as const }; const session = createStudioPrompt(config, [{ ...studioSource(), textOnly: true, size: 0 }], 50); const zip = await JSZip.loadAsync(await readLocalBytes(await buildStudioBundle("text-owner", session))); expect(Object.keys(zip.files)).toEqual(["prompt.txt"]); });
it("isolates original files and saved items by owner", async () => {
  const info = await saveStudioOriginal("owner-a", new File(["Original source bytes"], "source.pdf"), "material"); expect(await getStudioOriginal("owner-b", info.id)).toBeNull();
  const exam = studioExam(), item = { id: exam.id, owner: "owner-a", title: exam.title, updatedAt: exam.createdAt, kind: "online" as const, exam };
  await saveStudioItem("owner-a", item); expect(await listStudioItems("owner-b")).toEqual([]); await deleteStudioItem("owner-b", item.id); expect((await listStudioItems("owner-a")).map(item => item.id)).toContain(item.id); await expect(saveStudioItem("owner-b", item)).rejects.toThrow();
});
it("restores responses after reopening, isolates revisions and removes only the owner's attempt", async () => {
  const exam = studioExam(), attempt = { examId: exam.id, revision: exam.revision, startedAt: 1000, endsAt: null, submittedAt: null, responses: { "mcq-1": { choice: 0 } }, selfScores: {} };
  await saveOnlineAttempt("attempt-owner", exam, attempt); expect(await loadOnlineAttempt("attempt-owner", exam)).toEqual(attempt); expect(await loadOnlineAttempt("another-owner", exam)).toBeNull(); expect(await loadOnlineAttempt("attempt-owner", { ...exam, revision: "new-version" })).toBeNull();
  await deleteStudioItem("another-owner", exam.id); expect(await loadOnlineAttempt("attempt-owner", exam)).not.toBeNull(); await deleteStudioItem("attempt-owner", exam.id); expect(await loadOnlineAttempt("attempt-owner", exam)).toBeNull();
});
it("rejects corrupt deadlines, responses and scores rather than revealing a false submitted result", () => {
  const exam = studioExam(), attempt = { examId: exam.id, revision: exam.revision, startedAt: 1000, endsAt: null, submittedAt: null, responses: {}, selfScores: {} };
  expect(() => validateOnlineAttempt(exam, { ...attempt, endsAt: 2000 })).toThrow(); expect(() => validateOnlineAttempt(exam, { ...attempt, responses: { "mcq-1": { choice: 10 } } })).toThrow(); expect(() => validateOnlineAttempt(exam, { ...attempt, selfScores: { "essay-1": 1 } })).toThrow(); expect(() => validateOnlineAttempt(exam, { ...attempt, submittedAt: 2000, selfScores: { "essay-1": 5 } })).toThrow();
});
it("restores pending metadata-only prompts and JSON for the right account", () => {
  const work = emptyStudioWorkspace(); work.sources = [{ ...studioSource(), role: "template" }]; work.session = createStudioPrompt(work.config, work.sources, 50); work.importText = "{unfinished"; persistStudioWorkspace("workspace-owner", work);
  expect(loadStudioWorkspace("workspace-owner").session?.prompt).toBe(work.session.prompt); expect(loadStudioWorkspace("other-owner").sources).toEqual([]);
});
it("rejects invalid edited exams without overwriting the saved item", async () => {
  const exam = studioExam(), item = { id: "edited-exam", owner: "edited-owner", title: exam.title, updatedAt: exam.createdAt, kind: "online" as const, exam: { ...exam, id: "edited-exam" } }; await saveStudioItem("edited-owner", item);
  item.exam.questions[0].answer = "Wrong answer"; await expect(saveStudioItem("edited-owner", item)).rejects.toThrow(); expect((await listStudioItems("edited-owner"))[0].kind).toBe("online");
});
