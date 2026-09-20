// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { buildLabPlanPrompt, buildLabProgramPrompt, deleteLab, FLAPPY_BIRD_STARTER_LAB, parseLabDesign, readLabs, saveLab, STARTER_LAB_ID, validateLabHtml, validateLabPlanPrompt, type LabDesign } from "./lab";

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
  it("builds one direct prompt that asks an external AI for the finished HTML", () => {
    const prompt = buildLabPlanPrompt({ language: "vi", subject: "physics", learnerLevel: "lớp 10", request: "Cho đổi góc bắn và vận tốc rồi xem quỹ đạo.", sourceFileName: "chapter.pdf" });
    expect(prompt).toContain("chapter.pdf");
    expect(prompt).toContain("Cho đổi góc bắn");
    expect(prompt).toContain("Create a real downloadable UTF-8 file");
    expect(prompt).toContain("mindcanvas-lab.html");
    expect(prompt).toContain("deterministic test plan");
    expect(prompt).toContain("in-page validation/test panel");
    const program = buildLabProgramPrompt({ language: "vi", design });
    expect(program).toContain("sandbox=\"allow-scripts\"");
    expect(program).toContain('"Initial speed"');
    expect(program).toContain("external URLs");
  });

  it("checks the returned implementation prompt without requiring JSON", () => {
    expect(validateLabPlanPrompt("A short prompt")).toMatchObject({ ok: true, warnings: ["short", "tests", "science", "html"] });
    expect(validateLabPlanPrompt("Detailed science equation and HTML JavaScript CSS implementation. Include deterministic test cases, kiểm thử, initial conditions, reset behavior, expected values and tolerance for the learner simulation."))
      .toMatchObject({ ok: true, warnings: [] });
    expect(validateLabPlanPrompt("   ")).toMatchObject({ ok: false, warnings: ["empty"] });
  });

  it("accepts a valid design and rejects missing required fields", () => {
    expect(parseLabDesign(JSON.stringify(design))).toEqual(design);
    expect(() => parseLabDesign(JSON.stringify({ ...design, format: "other" }))).toThrow("invalidDesign");
    expect(() => parseLabDesign("not json")).toThrow("invalidJson");
  });

  it("blocks network and parent access while allowing self-contained HTML", () => {
    expect(validateLabHtml("<html><body><canvas></canvas><script>document.body.dataset.ready='yes'</script></body></html>")).toMatchObject({ ok: true });
    expect(validateLabHtml("<html><body><svg xmlns=\"http://www.w3.org/2000/svg\"></svg><script>document.createElementNS('http://www.w3.org/2000/svg', 'svg')</script></body></html>")).toMatchObject({ ok: true });
    expect(validateLabHtml("<script src=\"https://example.com/app.js\"></script>")).toMatchObject({ ok: false, code: "unsafeHtml" });
    expect(validateLabHtml("<iframe src=\"https://example.com\"></iframe>")).toMatchObject({ ok: false, code: "unsafeHtml" });
    expect(validateLabHtml("<script>fetch('/data')</script>")).toMatchObject({ ok: false, code: "unsafeHtml" });
  });

  it("keeps saved labs isolated by account and supports deletion", () => {
    const saved = saveLab("alice", { id: "lab-a", title: design.title, subject: design.subject, learnerLevel: "10", sourceFileName: "", sourceText: "", request: "simulate", designPrompt: "prompt", planPrompt: "implementation plan", design, programPrompt: "implementation plan", programHtml: "<html></html>" });
    expect(readLabs("alice")).toHaveLength(2);
    expect(readLabs("bob")).toHaveLength(1);
    expect(saved.createdAt).toBeTruthy();
    expect(readLabs("alice").find(lab => lab.id === "lab-a")?.planPrompt).toBe("implementation plan");
    deleteLab("alice", "lab-a");
    expect(readLabs("alice")).toHaveLength(1);
    expect(readLabs("alice")[0].id).toBe(STARTER_LAB_ID);
  });

  it("maps a v4.8.0 saved program prompt into the new plan prompt field", () => {
    localStorage.setItem("mindcanvas:labs:v1:legacy", JSON.stringify([{ id: "legacy", title: "Legacy", subject: "physics", request: "simulate", programPrompt: "returned implementation plan", programHtml: "" }]));
    const legacy = readLabs("legacy").find(lab => lab.id === "legacy")!;
    expect(legacy.planPrompt).toBe("returned implementation plan");
    expect(legacy.programPrompt).toBe("returned implementation plan");
  });

  it("exposes one immutable Flappy Bird starter Lab and saves edits as a personal copy", () => {
    const initial = readLabs("alice");
    expect(initial.filter(lab => lab.id === STARTER_LAB_ID)).toHaveLength(1);
    expect(initial[0].programHtml).toBe(FLAPPY_BIRD_STARTER_LAB.programHtml);
    expect(initial[0].programHtml).toContain("Mô phỏng game Flappy Bird");
    const copy = saveLab("alice", initial[0]);
    expect(copy.id).not.toBe(STARTER_LAB_ID);
    expect(copy.systemDemo).toBe(false);
    expect(copy.title).toBe("Flappy Bird — Bản sao");
    expect(readLabs("alice").filter(lab => lab.id === STARTER_LAB_ID)).toHaveLength(1);
    deleteLab("alice", STARTER_LAB_ID);
    expect(readLabs("alice")[0].id).toBe(STARTER_LAB_ID);
  });

});
