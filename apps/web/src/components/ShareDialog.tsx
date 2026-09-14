import { useEffect, useState } from "react";
import { ArrowLeft, Check, Clipboard, Mail, Shield, Trash2, UserPlus, Users } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import {
  createProjectInvitation,
  listProjectInvitations,
  listProjectMembers,
  removeProjectMember,
  revokeProjectInvitation,
  setProjectMemberRole,
  type ProjectInvitation,
  type ProjectMember,
} from "../lib/collaboration";

export default function ShareDialog({ projectId, title, onClose }: { projectId: string; title: string; onClose: () => void }) {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [nextMembers, nextInvitations] = await Promise.all([listProjectMembers(projectId), listProjectInvitations(projectId)]);
      setMembers(nextMembers);
      setInvitations(nextInvitations);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("shareLoadError"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [projectId]);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(t("shareCopyError"));
    }
  };

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setWorking(true);
    setError("");
    setInviteUrl("");
    try {
      const result = await createProjectInvitation(projectId, email, role);
      setInviteUrl(result.url);
      setEmail("");
      setInvitations(items => [result.invitation, ...items.filter(item => item.email !== result.invitation.email)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("shareInviteError"));
    } finally {
      setWorking(false);
    }
  };

  const updateRole = async (member: ProjectMember, nextRole: "editor" | "viewer") => {
    setWorking(true);
    setError("");
    try {
      await setProjectMemberRole(projectId, member.userId, nextRole);
      setMembers(items => items.map(item => item.userId === member.userId ? { ...item, role: nextRole } : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("shareUpdateError"));
    } finally {
      setWorking(false);
    }
  };

  const remove = async (member: ProjectMember) => {
    setWorking(true);
    setError("");
    try {
      await removeProjectMember(projectId, member.userId);
      setMembers(items => items.filter(item => item.userId !== member.userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("shareUpdateError"));
    } finally {
      setWorking(false);
    }
  };

  const revoke = async (invitation: ProjectInvitation) => {
    setWorking(true);
    setError("");
    try {
      await revokeProjectInvitation(invitation.id);
      setInvitations(items => items.map(item => item.id === invitation.id ? { ...item, status: "revoked" } : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("shareUpdateError"));
    } finally {
      setWorking(false);
    }
  };

  return <section className="share-page" aria-labelledby="share-page-title">
    <header className="share-page-header">
      <div className="share-page-title-group">
        <button type="button" className="secondary-button share-page-back" onClick={onClose}><ArrowLeft size={17}/>{t("workspace")}</button>
        <div>
          <p className="eyebrow">{t("shareProject")}</p>
          <h1 id="share-page-title">{t("shareProject")}</h1>
          <p>{t("shareProjectHint")}</p>
        </div>
      </div>
      <button type="button" className="secondary-button share-page-close" onClick={onClose}>{t("close")}</button>
    </header>
    <div className="share-dialog">
      <div className="share-project-heading"><Users size={22}/><div><strong>{title}</strong><small>{t("shareProjectHint")}</small></div></div>
      <form className="share-invite-form" onSubmit={invite}>
        <label><Mail size={16}/>{t("shareEmail")}<input type="email" required autoFocus value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com"/></label>
        <label><Shield size={16}/>{t("sharePermission")}<select value={role} onChange={event => setRole(event.target.value as "editor" | "viewer")}><option value="editor">{t("shareEditor")}</option><option value="viewer">{t("shareViewer")}</option></select></label>
        <button className="primary-button" disabled={working || !email.trim()}><UserPlus size={17}/>{working ? t("sharing") : t("sendInvite")}</button>
      </form>
      {inviteUrl && <div className="share-link-box"><div><strong>{t("shareLinkReady")}</strong><small>{t("shareLinkHint")}</small></div><input readOnly value={inviteUrl}/><button className="secondary-button" onClick={() => void copy(inviteUrl)}>{copied ? <Check size={16}/> : <Clipboard size={16}/>} {copied ? t("shareCopied") : t("copyLink")}</button></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <section className="share-list-section"><h2>{t("shareMembers")}</h2>{loading ? <p>{t("loading")}</p> : !members.length ? <p>{t("shareNoMembers")}</p> : <ul className="share-list">{members.map(member => <li key={member.userId}><span className="share-member-avatar">{member.avatarUrl ? <img src={member.avatarUrl} alt=""/> : (member.displayName[0] ?? "M").toUpperCase()}</span><span className="share-member-copy"><strong>{member.displayName}</strong><small>{member.email}</small></span><select disabled={working} value={member.role} onChange={event => void updateRole(member, event.target.value as "editor" | "viewer")}><option value="editor">{t("shareEditor")}</option><option value="viewer">{t("shareViewer")}</option></select><button type="button" className="icon-button danger" aria-label={t("removeMember")} title={t("removeMember")} disabled={working} onClick={() => void remove(member)}><Trash2 size={16}/></button></li>)}</ul>}</section>
      {!!invitations.length && <section className="share-list-section"><h2>{t("shareInvitations")}</h2><ul className="share-list">{invitations.map(invitation => <li key={invitation.id}><Mail size={17}/><span className="share-member-copy"><strong>{invitation.email}</strong><small>{t(invitation.status === "pending" ? "sharePending" : invitation.status === "accepted" ? "shareAccepted" : invitation.status === "expired" ? "shareExpired" : "shareRevoked")} · {new Date(invitation.expiresAt).toLocaleDateString()}</small></span><span className="share-role">{invitation.role === "editor" ? t("shareEditor") : t("shareViewer")}</span>{invitation.status === "pending" && <button type="button" className="icon-button danger" aria-label={t("revokeInvite")} title={t("revokeInvite")} disabled={working} onClick={() => void revoke(invitation)}><Trash2 size={16}/></button>}</li>)}</ul></section>}
      <footer className="actions share-page-actions"><button type="button" className="secondary-button" onClick={onClose}>{t("close")}</button></footer>
    </div>
  </section>;
}
