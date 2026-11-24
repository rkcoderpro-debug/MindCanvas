import { getCurrentSession, requestTimeoutSignal, supabase } from "./supabase";

export const PROFILE_AVATAR_BUCKET = "profile-avatars";
const SIGNED_AVATAR_SECONDS = 600;
const MIN_REMAINING_MS = 120_000;
const originalLimit = 8 * 1024 * 1024;
export const PROFILE_AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";
const avatarTypes = new Set(PROFILE_AVATAR_ACCEPT.split(","));

async function withDeadline<T>(request: Promise<T>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([request, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("PROFILE_REQUEST_TIMEOUT")), ms);
    })]);
  } finally { clearTimeout(timer); }
}

export type Gender = "female" | "male" | "other" | "prefer_not_to_say";
type AvatarReference = { avatar_url?: string | null; avatar_slot?: number | null; avatar_revision?: string | null };
export type PersonalProfile = Required<AvatarReference> & {
  user_id: string; revision: string | null; full_name: string | null; username: string | null;
  nickname: string | null; use_nickname: boolean; age: number | null; gender: Gender | null;
  school: string | null; province: string | null; display_name: string; signedAvatarUrl?: string;
};
export type ProfileDraft = {
  fullName: string; username: string; nickname: string; useNickname: boolean; age: string;
  gender: Gender | ""; school: string; province: string;
};
export type AvatarChange = { kind: "keep" | "remove" } | { kind: "replace"; image: Blob };
type ProfileIssue = "username" | "nickname" | "age";
const signedCache = new Map<string, { url: string; expiresAt: number }>();

export function toProfileDraft(profile: PersonalProfile): ProfileDraft {
  return {
    fullName: profile.full_name ?? "", username: profile.username ?? "", nickname: profile.nickname ?? "",
    useNickname: profile.use_nickname, age: profile.age === null ? "" : String(profile.age),
    gender: profile.gender ?? "", school: profile.school ?? "", province: profile.province ?? "",
  };
}

export function normalizedUsername(value: string) { return value.trim().toLowerCase(); }

export function validateProfile(draft: ProfileDraft): ProfileIssue[] {
  const issues: ProfileIssue[] = [];
  const username = normalizedUsername(draft.username);
  if (username && !/^[a-z0-9][a-z0-9_]{2,23}$/.test(username)) issues.push("username");
  if (draft.useNickname && !draft.nickname.trim()) issues.push("nickname");
  const age = draft.age.trim();
  if (age && (!/^\d{1,3}$/.test(age) || Number(age) < 1 || Number(age) > 120)) issues.push("age");
  return issues;
}

export function safeAvatarFallback(value?: string | null) {
  if (!value || value.length > 2048) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

const objectPath = (owner: string, slot: number) => `${owner}/avatar-${slot}.jpg`;

export async function signProfileAvatars(requests: Array<AvatarReference & { id: string }>, accountId?: string, signal?: AbortSignal) {
  const urls = new Map<string, string>();
  for (const request of requests) urls.set(request.id, safeAvatarFallback(request.avatar_url));
  const custom = requests.filter(row => (row.avatar_slot === 1 || row.avatar_slot === 2) && !!row.avatar_revision);
  if (!supabase || !custom.length || signal?.aborted) return urls;
  // Cached signed URLs are scoped to the viewing account and expire quickly.
  let viewer = accountId;
  if (!viewer) {
    try { viewer = (await getCurrentSession())?.user.id; } catch { return urls; }
  }
  if (!viewer || signal?.aborted) return urls;
  const now = Date.now();
  const need = new Map<string, { id: string; key: string }>();
  for (const row of custom) {
    const path = objectPath(row.id, row.avatar_slot!);
    const key = `${viewer}:${path}:${row.avatar_revision}`;
    const cached = signedCache.get(key);
    if (cached && cached.expiresAt - now > MIN_REMAINING_MS) urls.set(row.id, cached.url);
    else {
      if (cached && cached.expiresAt > now) urls.set(row.id, cached.url);
      need.set(path, { id: row.id, key });
    }
  }
  if (!need.size) return urls;
  for (const [key, cached] of signedCache) if (cached.expiresAt <= now) signedCache.delete(key);
  try {
    const { data } = await withDeadline(supabase.storage.from(PROFILE_AVATAR_BUCKET)
      .createSignedUrls([...need.keys()], SIGNED_AVATAR_SECONDS), 4_000);
    if (signal?.aborted) return urls;
    for (const signed of data ?? []) {
      const row = signed.path ? need.get(signed.path) : undefined;
      if (!row || !signed.signedUrl) continue;
      const url = new URL(signed.signedUrl);
      url.searchParams.set("v", row.key.slice(row.key.lastIndexOf(":") + 1));
      urls.set(row.id, url.href);
      if (signedCache.size >= 600 && !signedCache.has(row.key)) signedCache.delete(signedCache.keys().next().value!);
      signedCache.set(row.key, { url: url.href, expiresAt: now + SIGNED_AVATAR_SECONDS * 1000 });
    }
  } catch { /* Profile photos are optional; text and saved data remain available. */ }
  return urls;
}

export async function loadPersonalProfile(owner: string, signal?: AbortSignal): Promise<PersonalProfile> {
  if (!supabase || (await getCurrentSession())?.user.id !== owner || signal?.aborted) throw new Error("AUTH_REQUIRED");
  const { data, error } = await supabase.rpc("get_personal_profile").abortSignal(signal ?? requestTimeoutSignal(10_000));
  if (error || !data || data.user_id !== owner) throw new Error("PROFILE_LOAD_FAILED");
  const profile = data as PersonalProfile;
  const avatar = await signProfileAvatars([{ ...profile, id: owner }], owner, signal);
  return { ...profile, signedAvatarUrl: avatar.get(owner) };
}

export async function savePersonalProfile(profile: PersonalProfile, draft: ProfileDraft, avatar: AvatarChange) {
  const owner = profile.user_id;
  if (!supabase || (await getCurrentSession())?.user.id !== owner) throw new Error("AUTH_REQUIRED");
  if (validateProfile(draft).length) throw new Error("PROFILE_INVALID");
  const expectedSlot = profile.avatar_slot === 1 ? 2 : 1;
  if (avatar.kind === "replace") {
    const result = await withDeadline(supabase.storage.from(PROFILE_AVATAR_BUCKET).upload(objectPath(owner, expectedSlot), avatar.image, {
      upsert: true, contentType: "image/jpeg", cacheControl: "60",
    }), 12_000).catch(() => { throw new Error("AVATAR_UPLOAD_FAILED"); });
    if (result.error) throw new Error("AVATAR_UPLOAD_FAILED");
  }
  if ((await getCurrentSession())?.user.id !== owner) throw new Error("AUTH_REQUIRED");
  const { data, error } = await supabase.rpc("save_personal_profile", {
    p_full_name: draft.fullName.trim(), p_username: normalizedUsername(draft.username),
    p_nickname: draft.nickname.trim(), p_use_nickname: draft.useNickname,
    p_age: draft.age.trim() ? Number(draft.age) : null, p_gender: draft.gender || null,
    p_school: draft.school.trim(), p_province: draft.province.trim(), p_avatar_action: avatar.kind,
    p_expected_revision: profile.revision, p_expected_owner: owner,
  }).abortSignal(requestTimeoutSignal(12_000));
  if (error?.code === "23505") throw new Error("USERNAME_TAKEN");
  if (error?.code === "40001") throw new Error("PROFILE_CHANGED");
  if (error || !data || data.user_id !== owner) throw new Error("PROFILE_SAVE_FAILED");
  const updated = data as PersonalProfile;
  const urls = await signProfileAvatars([{ ...updated, id: owner }], owner);
  return { ...updated, signedAvatarUrl: urls.get(owner) };
}

export async function prepareAvatar(file: File) {
  if (!avatarTypes.has(file.type)) throw new Error("AVATAR_FORMAT");
  if (!file.size || file.size > originalLimit) throw new Error("AVATAR_SIZE");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("AVATAR_FORMAT"));
      img.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error("AVATAR_FORMAT");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("AVATAR_FORMAT");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 256, 256);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", .85));
    if (!blob || blob.size > 262_144) throw new Error("AVATAR_SIZE");
    return blob;
  } finally { URL.revokeObjectURL(url); }
}
