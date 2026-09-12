import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogIn, LogOut } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { useLanguage } from "../lib/i18n";

type Props = {
  user: User | null;
  accountName: string;
  working: boolean;
  canSignIn: boolean;
  onAuth: () => void;
};

export default function TopbarProfile({ user, accountName, working, canSignIn, onAuth }: Props) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const avatarUrl = typeof user?.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : "";
  const initial = accountName.trim().charAt(0).toLocaleUpperCase() || "M";

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
      <span className="topbar-avatar">{avatarUrl ? <img src={avatarUrl} alt=""/> : initial}</span>
      <span className="topbar-profile-copy"><strong>{accountName}</strong><small>{user?.email ?? t("local")}</small></span>
      <ChevronDown size={15} aria-hidden="true"/>
    </button>
    {open && <div className="topbar-profile-menu" role="menu">
      <div className="topbar-profile-details"><strong>{accountName}</strong><small>{user?.email ?? t("local")}</small></div>
      <button type="button" role="menuitem" disabled={working || (!user && !canSignIn)} onClick={authenticate}>{user ? <LogOut size={16}/> : <LogIn size={16}/>}<span>{user ? t("logout") : t("login")}</span></button>
    </div>}
  </div>;
}
