import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogIn, LogOut, ShieldCheck, UserRound } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { ProfileAvatar } from "./ProfileAvatar";
import { safeAvatarFallback } from "../lib/accountProfile";
import { useLanguage } from "../lib/i18n";

type Props = {
  user: User | null;
  accountName: string;
  customAvatarUrl?: string;
  onProfile?: () => void;
  working: boolean;
  canSignIn: boolean;
  onAuth: () => void;
  isAdmin?: boolean;
  onAdmin?: () => void;
};

export default function TopbarProfile({ user, accountName, customAvatarUrl, onProfile, working, canSignIn, onAuth, isAdmin = false, onAdmin }: Props) {
  const { language, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const avatarUrl = customAvatarUrl || safeAvatarFallback(typeof user?.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null);

  useEffect(() => {
    if (!open) return;
    const pointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", pointerDown);
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("pointerdown", pointerDown);
      document.removeEventListener("keydown", keydown);
    };
  }, [open]);

  const authenticate = () => {
    setOpen(false);
    onAuth();
  };

  return <div ref={root} className="topbar-profile">
    <button type="button" className="topbar-profile-button" aria-label={t("account")} aria-expanded={open} title={t("account")} onClick={() => setOpen(value => !value)}>
      <ProfileAvatar url={avatarUrl} name={accountName} className="topbar-avatar"/>
      <span className="topbar-profile-copy"><strong>{accountName}</strong><small>{user?.email ?? t("local")}</small></span>
      <ChevronDown size={15} aria-hidden="true"/>
    </button>
    {open && <div className="topbar-profile-menu" role="menu">
      <div className="topbar-profile-details"><strong>{accountName}</strong><small>{user?.email ?? t("local")}</small></div>
      {user && onProfile && <button type="button" role="menuitem" onClick={() => { setOpen(false); onProfile(); }}><UserRound size={16}/><span>{language === "vi" ? "Hồ sơ cá nhân" : "Personal profile"}</span></button>}
      {isAdmin && onAdmin && <button type="button" role="menuitem" onClick={() => { setOpen(false); onAdmin(); }}><ShieldCheck size={16}/><span>{t("adminDashboard")}</span></button>}
      <button type="button" role="menuitem" disabled={working || (!user && !canSignIn)} onClick={authenticate}>{user ? <LogOut size={16}/> : <LogIn size={16}/>}<span>{user ? t("logout") : t("login")}</span></button>
    </div>}
  </div>;
}
