// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { PersonalProfile } from "../lib/accountProfile";
const { publish, history, save } = vi.hoisted(() => ({ publish: vi.fn(), history: vi.fn(), save: vi.fn() }));
vi.mock("../lib/api", () => ({ listAdminSystemAnnouncements: history, publishAdminSystemAnnouncement: publish }));
vi.mock("../lib/accountProfile", async original => ({ ...await original<typeof import("../lib/accountProfile")>(), savePersonalProfile: save }));
import AdminAnnouncements from "./AdminAnnouncements";
import PersonalProfilePage from "./PersonalProfilePage";
import TopbarProfile from "./TopbarProfile";
import { LanguageProvider } from "../lib/i18n";
import type { User } from "@supabase/supabase-js";

let host: HTMLDivElement, root: Root;
const existing: PersonalProfile = {
  user_id: "owner", revision: "revision-a", full_name: "Họ tên ban đầu", username: "ban_hoc", nickname: null, use_nickname: false,
  age: null, gender: null, school: null, province: null, avatar_url: null, avatar_slot: null, avatar_revision: null, display_name: "Họ tên ban đầu",
};
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); history.mockReset().mockResolvedValue({ items: [], hasMore: false }); publish.mockReset(); save.mockReset();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open",""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function type(el: Element | null, value: string) {
  if (!el) throw new Error("Missing input");
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function click(area: Element, label: string) {
  const button = Array.from(area.querySelectorAll("button")).find(item => item.textContent?.trim() === label);
  expect(button, label).toBeTruthy();
  await act(async () => button!.click());
}

it("previews a broadcast without sending, retries the same request, and adds it to sent history", async () => {
  const item = { id: "broadcast", title: "Bảo trì", body: "Dừng máy tối nay.", published_at: "2026-11-24T11:00:00Z" };
  publish.mockRejectedValueOnce(new Error("aggregate timeout")).mockResolvedValueOnce({ item });
  history.mockResolvedValueOnce({ items: [], hasMore: false }).mockResolvedValue({ items: [item], hasMore: false });
  await act(async () => root.render(<LanguageProvider><AdminAnnouncements/></LanguageProvider>));
  await type(host.querySelector(".broadcast-form input"), item.title);
  await type(host.querySelector(".broadcast-form textarea"), item.body);
  await click(host,"Xem trước");
  expect(host.querySelector("dialog[open] .announcement-preview")?.textContent).toContain(item.body);
  expect(publish).not.toHaveBeenCalled();
  await click(host, "Gửi toàn bộ người dùng");
  expect(host.querySelector("dialog[open] [role='alert']")?.textContent).toContain("Chưa xác nhận");
  await click(host, "Gửi toàn bộ người dùng");
  expect(publish).toHaveBeenCalledTimes(2);
  expect(publish.mock.calls[0][0]).toEqual(publish.mock.calls[1][0]);
  expect(host.querySelector("dialog[open]")).toBeNull();
  expect(host.querySelector(".broadcast-history summary")?.textContent).toContain(item.title);
});

it("saves a nickname and private details from the profile page, then updates the displayed identity", async () => {
  save.mockResolvedValue({ ...existing, revision: "revision-b", nickname: "Cá nhỏ", use_nickname: true, school: "Trường mới", display_name: "Cá nhỏ" });
  const accept = vi.fn(), back = vi.fn();
  await act(async () => root.render(<LanguageProvider><PersonalProfilePage state={{ profile: existing, loading: false, error: false, accept, refresh: async () => existing }} signedIn onBack={back}/></LanguageProvider>));
  const page = document.body.querySelector(".profile-screen")!;
  const label = (name: string) => Array.from(page.querySelectorAll("label")).find(item => item.textContent?.startsWith(name))!;
  await act(async () => label("Dùng biệt danh").querySelector("input")!.click());
  await click(page,"Lưu thay đổi");
  expect(save).not.toHaveBeenCalled();
  expect(page.textContent).toContain("Nhập biệt danh để dùng");
  await type(label("Biệt danh").querySelector("input"), "Cá nhỏ");
  await type(label("Trường đang học").querySelector("input"), "Trường mới");
  await click(page,"Lưu thay đổi");
  expect(save.mock.calls[0][1]).toMatchObject({ nickname: "Cá nhỏ", school: "Trường mới", useNickname: true });
  expect(accept).toHaveBeenCalledWith(expect.objectContaining({ display_name: "Cá nhỏ" }));
  expect(page.querySelector("[role=status]")?.textContent).toContain("Đã lưu thay đổi");
  await click(page, "Về trang trước"); expect(back).toHaveBeenCalledOnce();
});

it("offers the personal-profile page in the signed-in account menu", async () => {
  const open = vi.fn();
  const user = { id: "owner", email: "a@example.test", user_metadata: {} } as User;
  await act(async () => root.render(<LanguageProvider><TopbarProfile user={user} accountName="Cá nhỏ" canSignIn working={false} onAuth={() => {}} onProfile={open}/></LanguageProvider>));
  await act(async () => host.querySelector<HTMLButtonElement>(".topbar-profile-button")!.click());
  await click(host, "Hồ sơ cá nhân");
  expect(open).toHaveBeenCalledOnce();
  expect(host.querySelector(".topbar-profile-menu")).toBeNull();
});
