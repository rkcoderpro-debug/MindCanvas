// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { buildLabDesignPrompt, buildLabProgramPrompt, deleteLab, parseLabDesign, readLabs, saveLab, validateLabHtml, type LabDesign } from "./lab";

const design: LabDesign = {
  format: "mindcanvas-lab-design",
  version: 1,
  title: "Projectile motion",
  subject: "physics",
  learningObjective: "See how angle and speed change the trajectory.",
  variables: [{ id: "speed", label: "Initial speed", unit: "m/s", min: 1, max: 30, step: 1, default: 10 }],
  observations: ["Range and height"],
  equations: ["y = x tan(theta) - gx²/(2v²cos²(theta))"],
  assumptions: ["Ignore air resistance"],
  safetyNotes: ["This is a simplified model."],
  simulationNotes: "Use a responsive SVG plot and a reset button.",
};

beforeEach(() => localStorage.clear());

describe("interactive lab helpers", () => {
  it("builds a two-step Manual workflow from source and request", () => {
    const prompt = buildLabDesignPrompt({ language: "vi", subject: "physics", learnerLevel: "lớp 10", request: "Cho đổi góc bắn và vận tốc rồi xem quỹ đạo.", sourceFileName: "chapter.pdf" });
    expect(prompt).toContain("mindcanvas-lab-design.json");
    expect(prompt).toContain("chapter.pdf");
    expect(prompt).toContain("Cho đổi góc bắn");
    const program = buildLabProgramPrompt({ language: "vi", design });
    expect(program).toContain("sandbox=\"allow-scripts\"");
    expect(program).toContain('"Initial speed"');
    expect(program).toContain("external URLs");
  });

  it("accepts a valid design and rejects missing required fields", () => {
    expect(parseLabDesign(JSON.stringify(design))).toEqual(design);
    expect(() => parseLabDesign(JSON.stringify({ ...design, format: "other" }))).toThrow("invalidDesign");
    expect(() => parseLabDesign("not json")).toThrow("invalidJson");
  });

  it("blocks network and parent access while allowing self-contained HTML", () => {
    expect(validateLabHtml("<html><body><canvas></canvas><script>document.body.dataset.ready='yes'</script></body></html>")).toMatchObject({ ok: true });
    expect(validateLabHtml("<script src=\"https://example.com/app.js\"></script>")).toMatchObject({ ok: false, code: "unsafeHtml" });
    expect(validateLabHtml("<iframe src=\"https://example.com\"></iframe>")).toMatchObject({ ok: false, code: "unsafeHtml" });
    expect(validateLabHtml("<script>fetch('/data')</script>")).toMatchObject({ ok: false, code: "unsafeHtml" });
  });

  it("keeps saved labs isolated by account and supports deletion", () => {
    const saved = saveLab("alice", { id: "lab-a", title: design.title, subject: design.subject, learnerLevel: "10", sourceFileName: "", sourceText: "", request: "simulate", designPrompt: "prompt", design, programPrompt: "program", programHtml: "<html></html>" });
    expect(readLabs("alice")).toHaveLength(1);
    expect(readLabs("bob")).toHaveLength(0);
    expect(saved.createdAt).toBeTruthy();
    deleteLab("alice", "lab-a");
    expect(readLabs("alice")).toHaveLength(0);
  });
});
