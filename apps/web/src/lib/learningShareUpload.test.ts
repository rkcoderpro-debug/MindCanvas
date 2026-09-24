// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FLAPPY_BIRD_STARTER_LAB, readLabs, saveLab } from "./lab";
import { publishLab } from "./learningShare";

vi.mock("./supabase", () => ({
  getCurrentSession: async () => ({ user: { id: "owner" } }),
  supabase: { from: () => ({ upsert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "Network unavailable" } }) }) }) }) },
}));

describe("explicit Lab cloud upload", () => {
  beforeEach(() => localStorage.clear());
  it("leaves the saved local Lab intact when cloud upload fails", async () => {
    const lab = saveLab("owner", { id: "lab-local", title: "Motion", subject: "physics", learnerLevel: "11", sourceFileName: "private.pdf", sourceText: "private notes", request: "simulation", designPrompt: "private prompt", planPrompt: "", design: null, programPrompt: "", programHtml: "<html><body><script>document.body.textContent='Lab'</script></body></html>", allowExternalResources: false });
    await expect(publishLab(lab, "owner")).rejects.toThrow("Network unavailable");
    expect(readLabs("owner")).toEqual([FLAPPY_BIRD_STARTER_LAB, lab]);
  });
  it("does not reject an opted-in Lab solely for using the approved CDN", async () => {
    const lab = saveLab("owner", { id: "lab-cdn", title: "CDN Lab", subject: "other", learnerLevel: "", sourceFileName: "", sourceText: "", request: "", designPrompt: "", planPrompt: "", design: null, programPrompt: "", programHtml: '<html><head><script src="https://unpkg.com/react@18/umd/react.production.min.js"></script></head><body><div id="root"></div><script>fetch("https://generativelanguage.googleapis.com/v1beta/models/x")</script></body></html>', allowExternalResources: true });
    await expect(publishLab(lab, "owner")).rejects.toThrow("Network unavailable");
  });
});
