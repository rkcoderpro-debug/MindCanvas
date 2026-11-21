import { useRef, useState } from "react";
import { Bell, Check, LoaderCircle, X } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { useBackgroundRead } from "../hooks/useBackgroundRead";
import { acceptProjectInvitationById, declineProjectInvitation, listMyPendingProjectInvitations, type IncomingProjectInvitation } from "../lib/collaboration";

type Props = { owner: string; onAccepted?: (projectId: string, title: string, role: "editor" | "viewer") => void };

export default function ShareInbox({ owner, onAccepted }: Props) {
  const { t } = useLanguage();
  const [items, setItems] = useState<IncomingProjectInvitation[]>([]);
  const dismissed = useRef(new Set<string>());
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  useBackgroundRead(owner, listMyPendingProjectInvitations, rows => {
    setItems(rows.filter(item => !dismissed.current.has(item.id)));
  });
  const remove = (id: string) => {
    dismissed.current.add(id);
    setItems(current => current.filter(candidate => candidate.id !== id));
    setError("");
  };
  // This callout is reserved for actual invitations. A failed background
  // check neither creates a callout nor clears invitations already visible.
  if (!items.length) return null;
  return <section className="share-inbox" aria-labelledby="share-inbox-title">
    <header><div><span className="eyebrow"><Bell size={14}/>{t("shareInbox")}</span><h2 id="share-inbox-title">{t("shareInboxTitle")}</h2></div><button type="button" className="icon-button" aria-label={t("close")} onClick={() => { items.forEach(item => dismissed.current.add(item.id)); setItems([]); setError(""); }}><X size={16}/></button></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="share-inbox-list">{items.map(item => <article key={item.id}>
      <div className="share-inbox-copy"><strong>{item.projectTitle}</strong><small>{t("shareInboxFrom", { inviter: item.inviterName })} · {item.role === "editor" ? t("shareEditor") : t("shareViewer")}</small><small>{t("shareInboxExpires", { date: new Date(item.expiresAt).toLocaleDateString() })}</small></div>
      <div className="share-inbox-actions"><button type="button" className="primary-button" disabled={!!working} onClick={() => { setWorking(item.id); setError(""); void acceptProjectInvitationById(item.id).then(result => { remove(item.id); onAccepted?.(result.projectId, result.title || item.projectTitle, result.role); }).catch(() => setError(t("shareAcceptError"))).finally(() => setWorking(null)); }}>{working === item.id ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>} {t("shareAccept")}</button><button type="button" className="secondary-button" disabled={!!working} onClick={() => { setWorking(item.id); setError(""); void declineProjectInvitation(item.id).then(() => remove(item.id)).catch(() => setError(t("shareDeclineError"))).finally(() => setWorking(null)); }}><X size={16}/>{t("shareDecline")}</button></div>
    </article>)}</div>
  </section>;
}
