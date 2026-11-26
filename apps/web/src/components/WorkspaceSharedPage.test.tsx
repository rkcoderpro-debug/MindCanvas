// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach,afterEach,it,expect,vi } from "vitest";
import { LanguageProvider } from "../lib/i18n";
import WorkspaceSharedPage from "./WorkspaceSharedPage";
import { workspaceShareToken,workspaceShareTarget,workspaceShareUrl,rememberWorkspaceShareSignIn,restoreWorkspaceShareSignIn } from "../lib/workspaceShareLinks";
const stubs=vi.hoisted(()=>({open:vi.fn(),submit:vi.fn(),challenge:vi.fn(),verify:vi.fn(),edit:vi.fn()}));
vi.mock("../lib/workspaceSharing",async(original)=>{
  const impl=await original<typeof import("../lib/workspaceSharing")>();
  return {...impl,shareOpen:stubs.open,shareSubmit:stubs.submit,shareChallenge:stubs.challenge,shareVerify:stubs.verify,shareEdit:stubs.edit};
});
const token="a".repeat(48),resource="66000000-0000-4000-8000-000000000001";
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
  sessionStorage.clear();vi.clearAllMocks();window.history.replaceState({},"","/");
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();window.history.replaceState({},"","/");});
const button=(title:string)=>[...host.querySelectorAll("button")].find(b=>b.textContent?.trim()===title)!;
it("lets a guest submit a public quiz without showing answers before submission",async()=>{
  stubs.open.mockResolvedValue({state:"ok",kind:"quiz",id:resource,title:"Abacus",role:"viewer",data:{questions:[{id:"a",prompt:"2+2?",options:["4","3","7","11"]}],description:"",revision:"r"}});
  stubs.submit.mockResolvedValue({score:1,total:1,answers:[{correct:0,explanation:"Answer explanation"}]});
  const login=vi.fn();
  await act(async()=>root.render(<LanguageProvider><WorkspaceSharedPage token={token} signedIn={false} onSignIn={login}/></LanguageProvider>));
  expect(host.textContent).toContain("Abacus");
  expect(host.textContent).not.toContain("Answer explanation");
  expect(button("Chỉnh sửa quiz")).toBeUndefined();
  expect(host.querySelector(".workspace-shared-study .quiz-question-card")).not.toBeNull();
  await act(async()=>host.querySelector<HTMLButtonElement>(".quiz-options button")!.click());
  await act(async()=>button("Nộp bài").click());
  expect(stubs.submit).toHaveBeenCalledWith(token,resource,"r",[0]);
  expect(host.textContent).toContain("Answer explanation");
  expect(login).not.toHaveBeenCalled();
});
it("asks for sign-in and withholds edit controls even on a public editor link",async()=>{
  stubs.open.mockResolvedValue({state:"ok",kind:"file",id:resource,title:"lecture.cpp",role:"viewer",signInToEdit:true,data:{size:123,revision:"r"}});
  const login=vi.fn();
  await act(async()=>root.render(<LanguageProvider><WorkspaceSharedPage token={token} signedIn={false} onSignIn={login}/></LanguageProvider>));
  expect(button("Tải xuống")).toBeTruthy();
  expect(host.querySelector("input[type=file]")).toBeNull();
  await act(async()=>button("Đăng nhập để chỉnh sửa").click());
  expect(login).toHaveBeenCalledOnce();
});
it("uses the Flashcard tab's review card when opening a shared deck link", async () => {
  stubs.open.mockResolvedValue({ state: "ok", kind: "flashcard", id: resource, title: "Study deck", role: "viewer",
    data: [{ id: "one", front: "First card", back: "First answer", revision: "r1" },
      { id: "two", front: "Second card", back: "Second answer", revision: "r2" }] });
  await act(async () => root.render(<LanguageProvider><WorkspaceSharedPage token={token} signedIn={false} onSignIn={vi.fn()}/></LanguageProvider>));
  const review = host.querySelector(".workspace-shared-study.activity-flashcards")!;
  expect(review.querySelector(".review-card-text")?.textContent).toBe("First card");
  await act(async () => review.querySelector<HTMLButtonElement>(".show-answer")!.click());
  expect(review.querySelector(".review-card-text")?.textContent).toBe("First answer");
  await act(async () => button("Thẻ sau").click());
  expect(review.querySelector(".review-card-text")?.textContent).toBe("Second card");
});
it("returns OAuth to the same scoped link without putting its token in the query sent to the server",()=>{
  window.history.replaceState({},"",workspaceShareUrl(token,{kind:"file",id:resource}));
  rememberWorkspaceShareSignIn();
  window.history.replaceState({},"","/");
  restoreWorkspaceShareSignIn();
  expect(window.location.search).toBe("");
  expect(workspaceShareToken()).toBe(token);
  expect(workspaceShareTarget()).toEqual({kind:"file",id:resource});
});

it("opens nested study folders and runs a Lab from the scoped share link", async () => {
  const child = "66000000-0000-4000-8000-000000000002";
  const lab = "66000000-0000-4000-8000-000000000003";
  stubs.open.mockResolvedValueOnce({ state: "ok", kind: "learning_folder", id: resource, title: "Study", role: "viewer",
    data: [{ kind: "learning_folder", id: child, title: "Practice" }] });
  stubs.open.mockResolvedValueOnce({ state: "ok", kind: "learning_folder", id: child, title: "Practice", role: "viewer",
    data: [{ kind: "lab", id: lab, title: "Vector Lab" }] });
  stubs.open.mockResolvedValueOnce({ state: "ok", kind: "lab", id: lab, title: "Vector Lab", role: "viewer",
    data: { html: "<!doctype html><html><body><p>Vector example</p></body></html>", allowExternalResources: true, viewerConfig: {} } });
  await act(async () => root.render(<LanguageProvider><WorkspaceSharedPage token={token} signedIn={false} onSignIn={vi.fn()}/></LanguageProvider>));
  await act(async () => button("Practice").click());
  await act(async () => {
    await import("./LabViewer");
    button("Vector Lab").click();
  });
  expect(workspaceShareTarget()).toEqual({ kind: "lab", id: lab });
  expect(host.querySelector("iframe")).toBeNull();
  await vi.waitFor(() => expect(button("Cho phép tải thư viện và chạy")).toBeTruthy());
  await act(async () => button("Cho phép tải thư viện và chạy").click());
  expect(host.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-scripts");
  expect(host.querySelector("iframe")?.getAttribute("srcdoc")).toContain("Vector example");
});
