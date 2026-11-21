import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Users } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { subscribeToProjectPresence, type CollaborationRole, type ProjectPresence } from "../lib/collaboration";

const PRESENCE_COLORS = ["#2563eb", "#0f766e", "#be185d", "#c2410c", "#7c3aed", "#0891b2"];

function identityFromUser(user: User, role: CollaborationRole): ProjectPresence {
  const displayName = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? "Member");
  const avatarUrl = typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : undefined;
  let hash = 0;
  for (const char of user.id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return { userId: user.id, displayName, avatarUrl, role, color: PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length] };
}

export default function CollaboratorPresence({ projectId, user, role }: { projectId: string; user: User | null; role: CollaborationRole }) {
  const { t } = useLanguage();
  const [people, setPeople] = useState<ProjectPresence[]>([]);
  const identity = useMemo(() => user ? identityFromUser(user, role) : null, [user, role]);

  useEffect(() => {
    if (!identity) { setPeople([]); return; }
    return subscribeToProjectPresence(projectId, identity, setPeople);
  }, [projectId, identity]);

  if (!identity || !people.length) return null;
  const visible = people.slice(0, 4);
  const remaining = Math.max(0, people.length - visible.length);
  return <div className="collaborator-presence" role="status" aria-label={t("collaboratorsOnline", { count: people.length })} title={t("collaboratorPresenceHint")}>
    <Users size={15} aria-hidden="true" />
    <div className="collaborator-avatar-stack" aria-hidden="true">
      {visible.map(person => <span key={person.userId} className="collaborator-avatar" style={{ "--presence-color": person.color } as React.CSSProperties}>
        {person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : (person.displayName[0] ?? "M").toUpperCase()}
      </span>)}
      {remaining > 0 && <span className="collaborator-avatar collaborator-avatar-more">+{remaining}</span>}
    </div>
    <span className="collaborator-presence-label">{t("collaboratorsOnline", { count: people.length })}</span>
  </div>;
}
