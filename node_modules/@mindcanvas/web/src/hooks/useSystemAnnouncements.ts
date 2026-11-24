import { useEffect, useRef, useState } from "react";
import { listSystemAnnouncements, markSystemAnnouncementRead, SYSTEM_ANNOUNCEMENTS_UPDATED, type SystemAnnouncementFeed } from "../lib/systemAnnouncements";
import { useBackgroundRead } from "./useBackgroundRead";

type Item = SystemAnnouncementFeed["items"][number];

export function useSystemAnnouncements(owner: string | null) {
  const scope = useRef(owner);
  scope.current = owner;
  const [items, setItems] = useState<Item[]>([]), [unreadCount, setUnreadCount] = useState(0);
  const [hasMore, setHasMore] = useState(false), [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false), [actionError, setActionError] = useState<"read" | "more" | null>(null);
  const receipts = useRef(new Map<string, string>()), fetchMore = useRef<AbortController | null>(null);
  const paged = useRef(false), marking = useRef(new Set<string>());
  const applyReceipts = (page: Item[]) => page.map(item => ({ ...item, read_at: item.read_at ?? receipts.current.get(item.id) ?? null }));
  useEffect(() => {
    setItems([]); setUnreadCount(0); setHasMore(false); setLoadError(false); setActionError(null); setLoadingMore(false);
    paged.current = false; receipts.current.clear(); marking.current.clear();
    return () => { fetchMore.current?.abort(); fetchMore.current = null; };
  }, [owner]);
  const { loading, refresh } = useBackgroundRead(owner, listSystemAnnouncements, page => {
    const recent = applyReceipts(page.items), ids = new Set(recent.map(item => item.id));
    setItems(current => paged.current ? [...recent, ...current.filter(item => !ids.has(item.id))] : recent);
    if (!paged.current) setHasMore(page.hasMore);
    setUnreadCount(Math.max(0, Number(page.unreadCount) - page.items.filter(item => !item.read_at && receipts.current.has(item.id)).length));
    setLoadError(false);
  }, () => setLoadError(true), 60_000);

  useEffect(() => {
    if (!owner) return;
    const wake = () => void refresh(true);
    window.addEventListener(SYSTEM_ANNOUNCEMENTS_UPDATED, wake);
    return () => window.removeEventListener(SYSTEM_ANNOUNCEMENTS_UPDATED, wake);
  }, [owner, refresh]);

  const loadMore = async () => {
    const last = items.at(-1);
    if (!owner || !last || fetchMore.current) return;
    const request = new AbortController();
    fetchMore.current = request; setLoadingMore(true); setActionError(null);
    const deadline = window.setTimeout(() => request.abort("timeout"), 10_000);
    try {
      const page = await listSystemAnnouncements(request.signal, last);
      if (request.signal.aborted || scope.current !== owner) return;
      const next = applyReceipts(page.items);
      paged.current = true;
      setItems(current => [...current, ...next.filter(item => !current.some(known => known.id === item.id))]);
      setHasMore(page.hasMore);
    } catch {
      if ((!request.signal.aborted || request.signal.reason === "timeout") && scope.current === owner) setActionError("more");
    } finally {
      window.clearTimeout(deadline);
      if (fetchMore.current === request) { fetchMore.current = null; setLoadingMore(false); }
    }
  };

  const openItem = async (item: Item) => {
    setActionError(null);
    if (!owner || item.read_at || receipts.current.has(item.id) || marking.current.has(item.id)) return;
    marking.current.add(item.id);
    try {
      const readAt = await markSystemAnnouncementRead(item.id);
      if (scope.current !== owner) return;
      receipts.current.set(item.id, readAt);
      setItems(current => current.map(row => row.id === item.id ? { ...row, read_at: readAt } : row));
      setUnreadCount(current => Math.max(0, current - 1));
    } catch {
      if (scope.current === owner) setActionError("read");
    } finally {
      if (scope.current === owner) marking.current.delete(item.id);
    }
  };

  return { items, unreadCount, hasMore, loadError, actionError, loading, loadingMore, refresh, loadMore, openItem };
}
