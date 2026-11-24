import { useCallback, useEffect, useRef, useState } from "react";
import { actOnlineRoom, controlOnlineMeeting, fetchMeetingToken, type MeetingCommand, joinOnlineRoom, OnlineRoomError, pingOnlineRoom, readOnlineRoom, readOnlineRoomChat, watchOnlineRoom, type RoomAction, type RoomMessage, type RoomSnapshot, type RoomStatus } from "../lib/onlineRooms";
import { forgetOnlineRoomInvite, type OnlineRoomLink } from "../lib/onlineRoomRoutes";

type Phase = RoomStatus | "connecting" | "failed";
type Activity = "room" | "chat";
type Session = {
  action: (action: RoomAction) => ReturnType<typeof actOnlineRoom>;
  token: () => ReturnType<typeof fetchMeetingToken>;
  command: (command: MeetingCommand) => ReturnType<typeof controlOnlineMeeting>;
  close: () => void;
};
export function useOnlineRoom(link: OnlineRoomLink) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [roomName, setRoomName] = useState("");
  const [problem, setProblem] = useState<unknown>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const session = useRef<Session | null>(null);
  const clockOffset = useRef(0);
  const serverNow = useCallback(() => Date.now() + clockOffset.current, []);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const act = useCallback((action: RoomAction) => {
    if (!session.current) return Promise.reject(new OnlineRoomError("ONLINE_NETWORK"));
    return session.current.action(action);
  }, []);
  const meetingToken = useCallback(() => session.current?.token() ?? Promise.reject(new OnlineRoomError("ONLINE_MEDIA_DENIED")), []);
  const meetingCommand = useCallback((command: MeetingCommand) => session.current?.command(command) ?? Promise.reject(new OnlineRoomError("ONLINE_MEDIA_DENIED")), []);
  const leave = useCallback(() => session.current?.close(), []);

  useEffect(() => {
    const client = crypto.randomUUID();
    const { id } = link;
    const controller = new AbortController();
    let alive = true, joined = false, joining = false, releasing = false, live = false, renewing = false;
    let currentPhase: Phase = "connecting";
    let lastRoomRead = 0, lastChatRead = 0;
    let epoch = 0;
    let scheduled: number | undefined;
    const running = new Set<Activity>();
    const dirty = new Set<Activity>();
    let disconnect: (() => void) | undefined;
    const setState = (value: Phase) => {
      if (!alive) return;
      currentPhase = value;
      setPhase(value);
      if (value !== "active") {
        disconnect?.(); disconnect = undefined; live = false;
        setSnapshot(null); setMessages([]);
      }
    };
    setState("connecting"); setProblem(null); setIsReconnecting(false);
    function end(next: RoomStatus) {
      if (next === "active" || !alive || !joined) return;
      joined = false;
      epoch++;
      if (next === "expired" && document.visibilityState !== "hidden") {
        setState("connecting");
        void join();
      } else setState(next);
    }

    function refresh(area: Activity) {
      if (!alive || !joined) return;
      dirty.add(area);
      if (scheduled !== undefined) return;
      scheduled = window.setTimeout(() => {
        scheduled = undefined;
        for (const part of dirty) if (!running.has(part)) void read(part);
      }, 100);
    }
    async function read(area: Activity) {
      if (!alive || !joined) return;
      const readEpoch = epoch;
      dirty.delete(area);
      running.add(area);
      try {
        if (area === "room") {
          const start = Date.now();
          const value = await readOnlineRoom(id, client, controller.signal);
          if (!alive || !joined || readEpoch !== epoch) return;
          if (value.state !== "active") { end(value.state); return; }
          const time = Date.parse(value.server_time);
          if (Number.isFinite(time)) clockOffset.current = time - (start + Date.now()) / 2;
          lastRoomRead = Date.now();
          setSnapshot(value);
          setIsReconnecting(false);
        } else {
          const value = await readOnlineRoomChat(id, client, controller.signal);
          if (!alive || !joined || readEpoch !== epoch) return;
          if (value.state !== "active") { end(value.state); return; }
          lastChatRead = Date.now();
          setMessages(value.messages);
        }
      } catch { if (alive && joined && readEpoch === epoch && area === "room") setIsReconnecting(true); }
      finally {
        running.delete(area);
        if (dirty.has(area)) refresh(area);
      }
    }

    async function join() {
      if (!alive || joining) return;
      joining = true;
      try {
        const result = await joinOnlineRoom(id, client, link.invite);
        if (!alive) {
          if (result.state === "active") release();
          return;
        }
        if (result.name) setRoomName(result.name);
        if (result.state === "waiting" || result.state === "active") forgetOnlineRoomInvite(id);
        joined = result.state === "active";
        setProblem(null); setState(result.state);
        if (joined) {
          disconnect?.();
          disconnect = watchOnlineRoom(id, refresh, connected => {
            live = connected;
            if (connected) { refresh("room"); refresh("chat"); }
          });
          refresh("room"); refresh("chat");
        }
      } catch (err) {
        if (alive) { setProblem(err); if (currentPhase !== "waiting") setState("failed"); }
      } finally { joining = false; }
    }

    async function heartbeat() {
      if (!alive || !joined || renewing) return;
      renewing = true;
      try { end(await pingOnlineRoom(id, client)); }
      catch { if (alive && joined) setIsReconnecting(true); }
      finally { renewing = false; }
    }
    function release() {
      if (releasing) return;
      releasing = true;
      void pingOnlineRoom(id, client, true).catch(() => undefined);
    }
    function close() {
      alive = false;
      if (joined || currentPhase === "waiting") release();
      disconnect?.();
      controller.abort();
    }
    const openSession: Session = { close, token: () => {
      if (!alive || !joined) return Promise.reject(new OnlineRoomError("ONLINE_MEDIA_DENIED"));
      return fetchMeetingToken(id, client, controller.signal);
    }, command: async command => {
      if (!alive || !joined) throw new OnlineRoomError("ONLINE_MEDIA_DENIED");
      try {
        const result = await controlOnlineMeeting(id, client, command, controller.signal);
        if (alive && result.state === "closed") end(result.state);
        return result;
      } finally { refresh("room"); }
    }, action: async action => {
      if (!alive || !joined) throw new OnlineRoomError("ONLINE_NETWORK");
      const result = await actOnlineRoom(id, client, action);
      if (alive) {
        if (result.state === "active") refresh(action.name === "chat" || action.name === "chat_delete" ? "chat" : "room");
        else end(result.state);
      }
      return result;
    } };
    session.current = openSession;
    const first = window.setTimeout(() => void join(), 0);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (currentPhase === "waiting") void join();
      if (!joined) return;
      if (Date.now() - lastRoomRead >= (live ? 12000 : 3500)) refresh("room");
      if (Date.now() - lastChatRead >= (live ? 26000 : 3500)) refresh("chat");
    }, 4000);
    const renew = window.setInterval(() => void heartbeat(), 20000);
    const resume = () => {
      if (document.visibilityState === "hidden") return;
      if (currentPhase === "waiting") void join();
      if (joined) { void heartbeat(); refresh("room"); refresh("chat"); }
    };
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      close(); window.clearTimeout(first); window.clearTimeout(scheduled);
      window.clearInterval(poll); window.clearInterval(renew);
      window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume);
      if (session.current === openSession) session.current = null;
    };
  }, [link.id, link.invite, attempt]);

  return { phase, snapshot, messages, roomName, problem, isReconnecting, serverNow, act, meetingToken, meetingCommand, retry, leave };
}
