import { useCallback, useEffect, useRef, useState } from "react";
import { loadPersonalProfile, type PersonalProfile } from "../lib/accountProfile";

export function usePersonalProfile(owner: string | null) {
  const [profile, setProfile] = useState<PersonalProfile | null>(null);
  const [error, setError] = useState(false), [loading, setLoading] = useState(!!owner);
  const active = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (!owner) return null;
    active.current?.abort();
    const request = new AbortController();
    active.current = request;
    setLoading(true); setError(false);
    const deadline = window.setTimeout(() => request.abort("timeout"), 12_000);
    try {
      const next = await loadPersonalProfile(owner, request.signal);
      if (request.signal.aborted) return null;
      setProfile(next);
      return next;
    } catch {
      if (!request.signal.aborted || request.signal.reason === "timeout") setError(true);
      return null;
    } finally {
      window.clearTimeout(deadline);
      if (active.current === request) { active.current = null; setLoading(false); }
    }
  }, [owner]);
  useEffect(() => {
    setProfile(null); setError(false); void refresh();
    if (!owner) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 480_000);
    return () => { window.clearInterval(timer); active.current?.abort(); active.current = null; };
  }, [refresh, owner]);

  const accept = (next: PersonalProfile) => {
    if (next.user_id !== owner) return;
    active.current?.abort(); active.current = null;
    setError(false); setLoading(false); setProfile(next);
  };
  return { profile: profile?.user_id === owner ? profile : null, error, loading, refresh, accept };
}
