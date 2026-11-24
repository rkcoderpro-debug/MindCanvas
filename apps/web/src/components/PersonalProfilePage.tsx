import { useEffect, useRef, useState } from "react";
import { ImagePlus, LockKeyhole, Save, UserRound } from "lucide-react";
import { ActivityViewport, BackButton, PageNavigation, useActivityFocus } from "./PageNavigation";
import { ProfileAvatar } from "./ProfileAvatar";
import { normalizedUsername, prepareAvatar, PROFILE_AVATAR_ACCEPT, safeAvatarFallback, savePersonalProfile, toProfileDraft, validateProfile, type AvatarChange, type Gender, type PersonalProfile, type ProfileDraft } from "../lib/accountProfile";
import { useLanguage } from "../lib/i18n";
import type { usePersonalProfile } from "../hooks/usePersonalProfile";

const copy = {
  vi: {
    title: "Hồ sơ cá nhân", back: "Về trang trước", subtitle: "Quản lý thông tin cá nhân và chọn tên bạn muốn hiển thị trên MindCanvas.",
    publicSection: "Tên và ảnh hiển thị", privateSection: "Thông tin riêng tư", privateHint: "Chỉ bạn xem được các thông tin trong mục này. Tất cả đều không bắt buộc.",
    fullName: "Họ và tên", username: "Tên người dùng", usernameHint: "3–24 ký tự: chữ không dấu, số hoặc dấu gạch dưới. Dùng để nhận diện, không dùng để đăng nhập.",
    nickname: "Biệt danh (không bắt buộc)", use: "Dùng biệt danh làm tên hiển thị", namingHint: "Tên và ảnh này hiển thị trên thanh trên và với người bạn đã kết nối trong chat.",
    age: "Tuổi", gender: "Giới tính", school: "Trường đang học", province: "Tỉnh/thành đang ở", blank: "Chưa chọn",
    female: "Nữ", male: "Nam", other: "Khác", prefer_not_to_say: "Không muốn trả lời",
    photo: "Chọn ảnh đại diện", resetPhoto: "Dùng lại ảnh mặc định", photoHint: "JPG, PNG hoặc WebP, tối đa 8 MB. Ảnh được cắt vuông ở giữa.",
    error: "Chưa lưu được hồ sơ. Hãy thử lại.", loadError: "Chưa tải được hồ sơ. Hãy thử tải lại.",
    save: "Lưu thay đổi", saved: "Đã lưu thay đổi.", retry: "Tải lại hồ sơ", loginHint: "Đăng nhập để xem và chỉnh sửa hồ sơ cá nhân.",
    usernameError: "Tên người dùng phải dài 3–24 ký tự và bắt đầu bằng chữ không dấu hoặc số.",
    nicknameError: "Nhập biệt danh để dùng làm tên hiển thị.", ageError: "Nhập tuổi là số nguyên từ 1 đến 120.",
    taken: "Tên người dùng này đã được sử dụng.", conflict: "Hồ sơ vừa thay đổi ở nơi khác. Tải bản mới trước khi sửa tiếp.",
    imageFormat: "Không đọc được ảnh. Hãy chọn JPG, PNG hoặc WebP.", imageSize: "Ảnh cần nhỏ hơn hoặc bằng 8 MB.",
    imageFailed: "Chưa thể tải ảnh lên. Hãy thử lại.", chooseDefault: "Người dùng MindCanvas",
  },
  en: {
    title: "Personal profile", back: "Back to previous page", subtitle: "Manage your personal details and choose how your name appears in MindCanvas.",
    publicSection: "Display name and photo", privateSection: "Private information", privateHint: "Only you can see the details in this section. All fields are optional.",
    fullName: "Full name", username: "Username", usernameHint: "3–24 letters, digits, or underscores. This identifies your profile and does not change your sign-in.",
    nickname: "Nickname (optional)", use: "Use my nickname as my display name", namingHint: "This name and photo appear in the top bar and to your connections in chat.",
    age: "Age", gender: "Gender", school: "School", province: "Province or city", blank: "Not selected",
    female: "Female", male: "Male", other: "Other", prefer_not_to_say: "Prefer not to say",
    photo: "Choose a profile photo", resetPhoto: "Use the default photo", photoHint: "JPG, PNG, or WebP, up to 8 MB. Photos are cropped to a centered square.",
    error: "Could not save your profile. Try again.", loadError: "Could not load your profile. Try refreshing.",
    save: "Save changes", saved: "Changes saved.", retry: "Reload profile", loginHint: "Sign in to see and edit your personal profile.",
    usernameError: "Use 3–24 characters, starting with a letter or digit.", nicknameError: "Enter a nickname to use it as your display name.",
    ageError: "Enter a whole number from 1 to 120.", taken: "This username is already taken.",
    conflict: "Your profile changed elsewhere. Reload the latest version before trying again.",
    imageFormat: "This image could not be opened. Choose JPG, PNG, or WebP.", imageSize: "Choose an image up to 8 MB.",
    imageFailed: "Could not upload the photo. Try again.", chooseDefault: "MindCanvas user",
  },
};

export default function PersonalProfilePage({ state, signedIn, onBack, onSignIn }: {
  state: ReturnType<typeof usePersonalProfile>; signedIn: boolean; onBack: () => void; onSignIn?: () => void;
}) {
  const { language, t } = useLanguage();
  const c = copy[language];
  const focus = useActivityFocus(true);
  return <ActivityViewport as="main" ref={focus} className="profile-screen">
    <PageNavigation title={c.title} back={<BackButton onClick={onBack}>{c.back}</BackButton>}/>
    <div className="profile-screen-scroll">
      <div className="profile-screen-content">
        <div className="profile-heading"><UserRound size={23}/><p>{c.subtitle}</p></div>
        {!signedIn ? <section className="phase-one-card"><p>{c.loginHint}</p>{onSignIn && <button type="button" className="primary-button" onClick={onSignIn}>{t("login")}</button>}</section> :
          state.profile ? <ProfileForm initial={state.profile} accept={state.accept} refresh={state.refresh}/> :
          state.error ? <section className="phase-one-card"><p className="form-error" role="alert">{c.loadError}</p><button className="secondary-button" type="button" onClick={() => void state.refresh()}>{t("retry")}</button></section> :
          <p role="status">{t("loading")}</p>}
      </div>
    </div>
  </ActivityViewport>;
}

function ProfileForm({ initial, accept, refresh }: {
  initial: PersonalProfile; accept: (profile: PersonalProfile) => void; refresh: () => Promise<PersonalProfile | null>;
}) {
  const { t, language } = useLanguage();
  const c = copy[language];
  const [loaded, setLoaded] = useState(initial), [draft, setDraft] = useState(() => toProfileDraft(initial));
  const [avatar, setAvatar] = useState<AvatarChange>({ kind: "keep" });
  const [preview, setPreview] = useState("");
  const [preparing, setPreparing] = useState(false), [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(""), [notice, setNotice] = useState(false), [submitted, setSubmitted] = useState(false);
  const photoSequence = useRef(0), submitLock = useRef(false), mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; photoSequence.current++; }; }, []);
  useEffect(() => {
    if (avatar.kind !== "replace") { setPreview(""); return; }
    const url = URL.createObjectURL(avatar.image);
    setPreview(url); return () => URL.revokeObjectURL(url);
  }, [avatar]);
  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => {
    setNotice(false);
    if (formError !== "PROFILE_CHANGED") setFormError("");
    setDraft(current => ({ ...current, [key]: value }));
  };
  async function selectPhoto(file: File) {
    const sequence = ++photoSequence.current;
    setNotice(false); setPreparing(true); setFormError("");
    try {
      const image = await prepareAvatar(file);
      if (sequence === photoSequence.current) setAvatar({ kind: "replace", image });
    } catch (err) {
      if (sequence === photoSequence.current) setFormError(err instanceof Error ? err.message : "AVATAR_FORMAT");
    } finally { if (sequence === photoSequence.current) setPreparing(false); }
  }
  const problems = submitted ? validateProfile(draft) : [];
  const photo = avatar.kind === "replace" ? preview : avatar.kind === "remove" ? safeAvatarFallback(loaded.avatar_url)
    : initial.avatar_revision === loaded.avatar_revision ? initial.signedAvatarUrl : loaded.signedAvatarUrl;
  const username = normalizedUsername(draft.username);
  const displayName = (draft.useNickname && draft.nickname.trim()) || draft.fullName.trim() || (username ? `@${username}` : c.chooseDefault);
  const errorText = formError === "USERNAME_TAKEN" ? c.taken : formError === "PROFILE_CHANGED" ? c.conflict :
    formError === "AVATAR_FORMAT" ? c.imageFormat : formError === "AVATAR_SIZE" ? c.imageSize : formError === "AVATAR_UPLOAD_FAILED" ? c.imageFailed : c.error;
  return <form className="profile-form" onSubmit={async event => {
    event.preventDefault();
    setSubmitted(true);
    if (submitLock.current || preparing || formError === "PROFILE_CHANGED" || validateProfile(draft).length) return;
    submitLock.current = true; setBusy(true); setFormError(""); setNotice(false);
    try {
      const updated = await savePersonalProfile(loaded, draft, avatar);
      accept(updated);
      if (mounted.current) { setLoaded(updated); setDraft(toProfileDraft(updated)); setAvatar({ kind: "keep" }); setNotice(true); }
    } catch (err) {
      if (mounted.current) setFormError(err instanceof Error ? err.message : "PROFILE_SAVE_FAILED");
    } finally {
      submitLock.current = false;
      if (mounted.current) setBusy(false);
    }
  }}>
    <fieldset className="phase-one-card profile-section" disabled={busy}>
      <legend>{c.publicSection}</legend>
      <div className="profile-photo-entry">
        <ProfileAvatar url={photo} name={displayName} className="profile-large-avatar"/>
        <div><strong>{displayName}</strong>{username && displayName !== `@${username}` && <small>@{username}</small>}
          <div className="profile-photo-actions">
            <label className="secondary-button profile-photo-pick"><ImagePlus size={16}/>{preparing ? t("loading") : c.photo}
              <input type="file" className="sr-only" aria-label={c.photo} accept={PROFILE_AVATAR_ACCEPT} onChange={event => {
                const file = event.target.files?.[0]; event.target.value = ""; if (file) void selectPhoto(file);
              }}/>
            </label>
            {(avatar.kind === "replace" || loaded.avatar_slot && avatar.kind !== "remove") && <button type="button" className="text-button" onClick={() => {
              photoSequence.current++; setPreparing(false); setAvatar({ kind: "remove" }); setNotice(false);
            }}>{c.resetPhoto}</button>}
          </div>
          <small>{c.photoHint}</small><small>{c.namingHint}</small>
        </div>
      </div>
      <div className="profile-fields">
        <label>{c.fullName}<input maxLength={100} autoComplete="name" value={draft.fullName} onChange={event => set("fullName", event.target.value)}/></label>
        <label>{c.username}<input maxLength={24} autoCapitalize="none" spellCheck={false} autoComplete="off" aria-invalid={problems.includes("username") || formError === "USERNAME_TAKEN"}
          value={draft.username} placeholder="mindcanvas_user" onChange={event => set("username", event.target.value)}/>
          <small>{problems.includes("username") ? c.usernameError : c.usernameHint}</small></label>
        <label>{c.nickname}<input maxLength={60} value={draft.nickname} aria-invalid={problems.includes("nickname")} onChange={event => set("nickname", event.target.value)}/>
          {problems.includes("nickname") && <small>{c.nicknameError}</small>}</label>
        <label className="profile-check"><input type="checkbox" checked={draft.useNickname} onChange={event => set("useNickname", event.target.checked)}/>{c.use}</label>
      </div>
    </fieldset>
    <fieldset className="phase-one-card profile-section" disabled={busy}>
      <legend><LockKeyhole size={15}/>{c.privateSection}</legend><p>{c.privateHint}</p>
      <div className="profile-fields">
        <label>{c.age}<input inputMode="numeric" maxLength={3} value={draft.age} aria-invalid={problems.includes("age")} onChange={event => set("age", event.target.value)}/>
          {problems.includes("age") && <small>{c.ageError}</small>}</label>
        <label>{c.gender}<select value={draft.gender} onChange={event => set("gender", event.target.value as Gender | "")}>
          <option value="">{c.blank}</option>{(["female", "male", "other", "prefer_not_to_say"] as const).map(option => <option value={option} key={option}>{c[option]}</option>)}
        </select></label>
        <label>{c.school}<input maxLength={120} value={draft.school} onChange={event => set("school", event.target.value)}/></label>
        <label>{c.province}<input maxLength={80} value={draft.province} onChange={event => set("province", event.target.value)}/></label>
      </div>
    </fieldset>
    <footer className="profile-save-row">
      <div>{formError && <p className="form-error" role="alert">{errorText}</p>}{notice && <p className="form-success" role="status">{c.saved}</p>}</div>
      {formError === "PROFILE_CHANGED" ? <button type="button" className="secondary-button" disabled={busy} onClick={async () => {
        setBusy(true);
        const fresh = await refresh();
        if (!mounted.current) return;
        if (fresh) { setLoaded(fresh); setDraft(toProfileDraft(fresh)); setAvatar({ kind: "keep" }); setFormError(""); setSubmitted(false); }
        setBusy(false);
      }}>{c.retry}</button> :
        <button className="primary-button" disabled={busy || preparing}><Save size={17}/>{busy ? t("saving") : c.save}</button>}
    </footer>
  </form>;
}
