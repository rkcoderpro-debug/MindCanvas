import { createContext, lazy, Suspense, useCallback, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "../lib/i18n";
import { forgetOnlineRoomInvite, onlineRoomUrl, readOnlineRoomLink, type OnlineRoomLink } from "../lib/onlineRoomRoutes";
import Dialog from "./Dialog";
import { MusicIsland } from "./MusicPlayer";
import "./activityIsland.css";

const OnlineMusicRoom = lazy(() => import("./OnlineMusicRoom"));
export const ROOM_ROUTE_CHANGED = "mindcanvas:online-room-route";
type RoomView = { link: OnlineRoomLink; fromClass: boolean };
type RoomState = { held: RoomView | null; foreground: boolean; pending: RoomView | null };
type RoomNavigation = {
  route: (view: RoomView | null) => void;
  state: RoomState;
  minimize: () => void;
  leave: () => void;
  restore: () => void;
};
const Context = createContext<RoomNavigation | null>(null);
export const useRoomSession = () => useContext(Context);

export function OnlineRoomSessionProvider({ owner, children, onRestore }: {
  owner: string | null; children: ReactNode; onRestore: (id: string) => void;
}) {
  const [state, setState] = useState<RoomState>({ held: null, foreground: false, pending: null });
  const { language } = useLanguage();
  const vi = language === "vi";
  const route = useCallback((value: RoomView | null) => {
    if (!owner) return;
    setState(old => {
      if (!value) return old.foreground || old.pending ? { ...old, foreground: false, pending: null } : old;
      if (!old.held) return { held: value, foreground: true, pending: null };
      if (value.link.id !== old.held.link.id) return { ...old, foreground: false, pending: value };
      return old.foreground && !old.pending ? old : { ...old, foreground: true, pending: null };
    });
  }, [owner]);
  const goLobby = () => {
    window.history.replaceState({}, "", onlineRoomUrl(null));
    window.dispatchEvent(new Event(ROOM_ROUTE_CHANGED));
  };
  const navigateAway = (id: string) => {
    if (readOnlineRoomLink()?.id !== id) return;
    if (window.history.state?.mindcanvasFromClass === id || window.history.state?.mindcanvasFromRoomLobby === id) window.history.back();
    else goLobby();
  };
  const minimize = () => {
    if (!state.held) return;
    setState(old => ({ ...old, foreground: false }));
    navigateAway(state.held.link.id);
  };
  const leave = () => {
    if (!state.held) return;
    const { id } = state.held.link;
    forgetOnlineRoomInvite(id);
    setState({ held: null, foreground: false, pending: null });
    navigateAway(id);
  };
  return <Context.Provider value={{ route, state, minimize, leave, restore: () => state.held && onRestore(state.held.link.id) }}>
    {children}
    {state.pending && <Dialog workspace title={vi ? "Rời phòng hiện tại?" : "Leave the current room?"} onClose={goLobby}>
      <p>{vi ? "MindCanvas giữ một phòng mỗi lần. Vào phòng mới sẽ ngắt cuộc gọi hoặc nhạc ở phòng hiện tại." : "MindCanvas keeps one room at a time. Joining another room ends the current room audio or call."}</p>
      <div className="actions"><button type="button" className="secondary-button" onClick={goLobby}>{vi ? "Ở lại phòng cũ" : "Keep current room"}</button>
        <button type="button" className="primary-button" onClick={() => {
          setState(old => old.pending ? { held: old.pending, foreground: true, pending: null } : old);
        }}>{vi ? "Rời phòng và chuyển" : "Leave and switch rooms"}</button></div>
    </Dialog>}
  </Context.Provider>;
}

export function OnlineRoomSessionHost({ owner }: { owner: string | null }) {
  const session = useRoomSession();
  const { language } = useLanguage();
  if (!owner || !session?.state.held) return null;
  const { link, fromClass } = session.state.held;
  const vi = language === "vi";
  return <Suspense fallback={session.state.foreground ? <p role="status">{vi ? "Đang mở phòng…" : "Opening room…"}</p> : null}>
    <OnlineMusicRoom key={link.id} link={link} owner={owner} vi={vi} fromClass={fromClass} foreground={session.state.foreground} onBack={session.leave} onMinimize={session.minimize} onRestore={session.restore}/>
  </Suspense>;
}

export function PersonalMusicIsland() {
  const session = useRoomSession();
  return createPortal(<MusicIsland suppressed={Boolean(session?.state.held && !session.state.foreground)}/>, document.body);
}
