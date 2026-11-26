import { createContext, useEffect, useId, useRef, useState } from "react";
import { MessageCircle, Minus } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import type { SharedLearningTarget } from "../lib/workspaceShareLinks";
import ConnectionsPage from "./ConnectionsPage";
import "./chatBubble.css";

export type ChatRequest = { peerId: string; version: number };
export const OpenChatContext = createContext<((peerId: string) => void) | undefined>(undefined);

export default function ChatBubble({ owner, request, onOpenShared, onOpenLink, suspended = false }: {
  owner: string; request: ChatRequest | null; onOpenShared: (item?: SharedLearningTarget) => void;
  onOpenLink?: (token: string) => void;
  suspended?: boolean;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const toggle = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const lastRequest = useRef<ChatRequest | null>(null);
  const label = vi ? "Tin nhắn" : "Messages";

  useEffect(() => {
    if (request && lastRequest.current !== request) {
      lastRequest.current = request;
      setOpen(true);
    }
  }, [request]);
  useEffect(() => {
    if (open) (dock.current?.querySelector<HTMLElement>(".connection-profile-heading h3") ?? heading.current)?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const element = dock.current;
    if (!open || !viewport || !element) return;
    const adjust = () => {
      element.style.setProperty("--chat-keyboard-offset", `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`);
      element.style.setProperty("--chat-available-height", `${Math.max(140, viewport.height - 26)}px`);
    };
    adjust();
    viewport.addEventListener("resize", adjust);
    viewport.addEventListener("scroll", adjust);
    return () => {
      viewport.removeEventListener("resize", adjust);
      viewport.removeEventListener("scroll", adjust);
      element.style.removeProperty("--chat-keyboard-offset");
      element.style.removeProperty("--chat-available-height");
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => toggle.current?.focus({ preventScroll: true }));
  };

  return <div className="chat-bubble" ref={dock} data-open={open} hidden={suspended} inert={suspended} onKeyDown={event => {
    if (event.key === "Escape" && open && !event.defaultPrevented && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }}>
    <section className="chat-bubble-panel" id={panelId} hidden={!open} aria-labelledby={`${panelId}-heading`}>
      <header>
        <h2 id={`${panelId}-heading`} ref={heading} tabIndex={-1}><MessageCircle size={18} aria-hidden="true"/>{label}</h2>
        <button type="button" className="icon-button" onClick={close} title={vi ? "Thu nhỏ" : "Minimize"}
          aria-label={vi ? "Thu nhỏ tin nhắn" : "Minimize messages"}><Minus size={19}/></button>
      </header>
      <ConnectionsPage owner={owner} compact visible={open && !suspended} onUnread={setUnread} onMinimize={close}
        initialPeerId={request?.peerId} initialPeerVersion={request?.version} onOpenLink={onOpenLink} onOpenShared={item => { if (!item) close(); onOpenShared(item); }}/>
    </section>
    <button type="button" className="chat-bubble-toggle" ref={toggle} title={label}
      aria-expanded={open} aria-controls={panelId}
      aria-label={unread ? `${label} · ${unread} ${vi ? "tin chưa đọc" : "unread"}` : label}
      onClick={() => open ? close() : setOpen(true)}>
      <MessageCircle size={25}/>
      {unread > 0 && <span aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
    </button>
  </div>;
}
