import { useId, useRef, type ReactNode } from "react";
import { ChevronDown, DoorOpen, Maximize2, Music2, Video } from "lucide-react";
import { createPortal } from "react-dom";

export default function RoomIsland({ name, meeting = false, status, live, expanded, setExpanded, onRestore, onLeave, vi, indicators, children }: {
  name: string; meeting?: boolean; status: string; live?: boolean; expanded: boolean; setExpanded: (value: boolean) => void;
  onRestore: () => void; onLeave: () => void; vi: boolean; indicators?: ReactNode; children?: ReactNode;
}) {
  const details = useId(), toggle = useRef<HTMLButtonElement>(null);
  const Icon = meeting ? Video : Music2;
  return createPortal(<aside data-study-island className={`music-island room-island ${expanded ? "expanded" : ""}`} aria-label={vi ? "Phòng đang mở" : "Open room"}
    onKeyDown={event => { if (event.key === "Escape" && expanded) { event.stopPropagation(); setExpanded(false); toggle.current?.focus(); } }}>
    <button className="music-island-open" type="button" ref={toggle} aria-expanded={expanded} aria-controls={expanded ? details : undefined} onClick={() => setExpanded(!expanded)}>
      <Icon size={16} aria-hidden="true"/><span className="room-island-name">{name}</span><span className="room-island-indicators">{indicators}<span data-live={live} className="room-island-dot" title={status} aria-label={status}/></span><ChevronDown size={14} aria-hidden="true"/>
    </button>
    {expanded && <div className="room-island-details" id={details}>
      <div className="room-island-status" role="status">{status}</div>
      {children}
      <div className="room-island-actions">
        <button type="button" className="secondary-button" onClick={onRestore}><Maximize2 size={14}/>{vi ? "Quay lại phòng" : "Return to room"}</button>
        <button type="button" className="text-button room-island-leave" onClick={onLeave}><DoorOpen size={15}/>{vi ? "Rời phòng" : "Leave room"}</button>
      </div>
    </div>}
  </aside>, document.body);
}
