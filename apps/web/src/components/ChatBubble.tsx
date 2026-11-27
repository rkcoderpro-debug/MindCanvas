import { createContext, useId, useLayoutEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import type { SharedLearningTarget } from "../lib/workspaceShareLinks";
import { observeVisualViewport } from "../lib/visualViewport";
import ConnectionsPage from "./ConnectionsPage";
import "./chatBubble.css";

export type ChatRequest = { peerId: string; version: number };
export const OpenChatContext = createContext<((peerId: string) => void) | undefined>(undefined);

export default function ChatBubble({ owner, request, onOpenShared, onOpenLink, suspended = false }: {
  owner: string; request: ChatRequest | null; onOpenShared: (item?: SharedLearningTarget, trigger?: HTMLElement) => void;
  onOpenLink?: (token: string, trigger: HTMLElement) => void;
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
  const lastRequest = useRef<number | undefined>(undefined);
  const returnFocus = useRef(false);
  const requestVersion = request?.version;
  const visible = open && !suspended;
  const label = vi ? "Tin nhắn" : "Messages";
  const minimizeLabel = vi ? "Thu nhỏ tin nhắn" : "Minimize messages";

  useLayoutEffect(() => {
    if (requestVersion === undefined || lastRequest.current === requestVersion) return;
    lastRequest.current = requestVersion;
    setOpen(true);
  }, [requestVersion]);
  useLayoutEffect(() => {
    if (open && !dock.current?.hidden) {
      (dock.current?.querySelector<HTMLElement>(".connection-profile-heading h3") ?? heading.current)?.focus({ preventScroll: true });
    }
    if (!open && returnFocus.current && toggle.current) toggle.current.focus({ preventScroll: true });
    returnFocus.current = false;
  }, [open]);
  useLayoutEffect(() => {
    if (visible && dock.current) return observeVisualViewport(dock.current);
  }, [visible]);

  const close = (focusLauncher = true) => {
    returnFocus.current = focusLauncher;
    setOpen(false);
  };

  return <div className="chat-bubble" ref={dock} data-open={open} hidden={suspended} inert={suspended} onKeyDown={event => {
    if (event.key === "Escape" && open && !event.defaultPrevented && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }}>
    <section className="chat-bubble-panel" id={panelId} hidden={!open} inert={!open} aria-labelledby={`${panelId}-heading`}>
      <header>
        <h2 id={`${panelId}-heading`} ref={heading} tabIndex={-1}><MessageCircle size={18} aria-hidden="true"/>{label}</h2>
      </header>
      <button type="button" className="icon-button chat-bubble-close" onClick={() => close()}
        onMouseDown={event => {
          // Keep the keyboard from shifting the panel before the click finishes.
          if (event.button === 0) event.preventDefault();
        }}
        aria-label={minimizeLabel} title={minimizeLabel}><X size={20} aria-hidden="true"/></button>
      <ConnectionsPage owner={owner} compact visible={visible} onUnread={setUnread}
        initialPeerId={request?.peerId} initialPeerVersion={request?.version} onOpenLink={onOpenLink}
        onOpenShared={(item, trigger) => { if (!item) close(false); onOpenShared(item, trigger); }}/>
    </section>
    {!open && <button type="button" className="chat-bubble-toggle" ref={toggle} title={label}
      aria-expanded={false} aria-controls={panelId}
      aria-label={unread ? `${label} · ${unread} ${vi ? "tin chưa đọc" : "unread"}` : label}
      onClick={() => setOpen(true)}>
      <MessageCircle size={25}/>
      {unread > 0 && <span aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
    </button>}
  </div>;
}
