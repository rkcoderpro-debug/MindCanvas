import { useCallback, useEffect, useState } from "react";
import { Bell, Check, LoaderCircle, X } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { acceptProjectInvitationById, declineProjectInvitation, listMyPendingProjectInvitations, type IncomingProjectInvitation } from "../lib/collaboration";

type Props = { onAccepted?: (projectId: string, title: string, role: "editor" | "viewer") => void };

export default function ShareInbox({ onAccepted }: Props) {
  const { t } = useLanguage();
  const [items, setItems] = useState<IncomingProjectInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await listMyPendingProjectInvitations()); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : t("shareInboxLoadError")); }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => {
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);
  if (loading && !items.length) return null;
  if (!items.length && !error) return null;
  return <section className="share-inbox" aria-labelledby="share-inbox-title">
    <header><div><span className="eyebrow"><Bell size={14}/>{t("shareInbox")}</span><h2 id="share-inbox-title">{t("shareInboxTitle")}</h2></div><button type="button" className="icon-button" aria-label={t("close")} onClick={() => { setItems([]); setError(""); }}><X size={16}/></button></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="share-inbox-list">{items.map(item => <article key={item.id}>
      <div className="share-inbox-copy"><strong>{item.projectTitle}</strong><small>{t("shareInboxFrom", { inviter: item.inviterName })} · {item.role === "editor" ? t("shareEditor") : t("shareViewer")}</small><small>{t("shareInboxExpires", { date: new Date(item.expiresAt).toLocaleDateString() })}</small></div>
      <div className="share-inbox-actions"><button type="button" className="primary-button" disabled={!!working} onClick={() => { setWorking(item.id); void acceptProjectInvitationById(item.id).then(result => { setItems(current => current.filter(candidate => candidate.id !== item.id)); onAccepted?.(result.projectId, result.title || item.projectTitle, result.role); }).catch(err => setError(err instanceof Error ? err.message : t("shareAcceptError"))).finally(() => setWorking(null)); }}>{working === item.id ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>} {t("shareAccept")}</button><button type="button" className="secondary-button" disabled={!!working} onClick={() => { setWorking(item.id); void declineProjectInvitation(item.id).then(() => setItems(current => current.filter(candidate => candidate.id !== item.id))).catch(err => setError(err instanceof Error ? err.message : t("shareDeclineError"))).finally(() => setWorking(null)); }}><X size={16}/>{t("shareDecline")}</button></div>
    </article>)}</div>
  </section>;
}
