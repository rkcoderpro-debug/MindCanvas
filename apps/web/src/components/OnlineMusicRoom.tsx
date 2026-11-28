import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { Armchair, ArrowDown, ArrowUp, BookOpen, Check, Copy, Crown, DoorOpen, Headphones, Link2, Lock, Maximize2, MessageCircle, Minimize2, Music2, Plus, Radio, Send, SkipForward, Trash2, Users, Paperclip, FileText, Eye, Download, Flag, MicOff, ScreenShare, Video, Volume2, VolumeX, X } from "lucide-react";
import { useOnlineRoom } from "../hooks/useOnlineRoom";
import { OFFICIAL_PIANO_VIDEO, type MeetingCommand, loadRoomAvatars, deleteOnlineRoom, OnlineRoomError, roomIssue, prepareRoomMusicTrack, type RoomAction, type RoomAttendee, type RoomLayout, type RoomMessage, type RoomSnapshot, type RoomReportReason, type MeetingRoomFile, MEETING_FILE_ACCEPT, MEETING_FILE_LIMIT } from "../lib/onlineRooms";
import { onlineRoomUrl, type OnlineRoomLink } from "../lib/onlineRoomRoutes";
import { copyTextWithFallback } from "../lib/share";
import { PageBack } from "./PageNavigation";
import { ProfileAvatar } from "./ProfileAvatar";
import OnlineRoomYouTube from "./OnlineRoomYouTube";
import RoomMusicFields from "./RoomMusicFields";
import RoomBackgroundAudio from "./RoomBackgroundAudio";
import RoomIsland from "./RoomIsland";
import { useRoomAudioPriority } from "./MusicPlayer";
import Dialog from "./Dialog";

type Tab = "chat" | "queue" | "people";
type Labels = (vi: string, en: string) => string;
type Run = (action: RoomAction) => Promise<{ state: string; invite?: string } | undefined>;
type Confirm = { action: RoomAction | { name: "delete" }; title: string; text: string };
const MeetingBoard = lazy(() => import("./OnlineMeetingBoard"));
const MeetingFilePreview = lazy(() => import("./MeetingFilePreview"));
const layoutKey = (meeting: boolean) => meeting ? "mindcanvas:online-meeting-layout:v1" : "mindcanvas:online-room-layout:v1";
function storedLayout(meeting: boolean): RoomLayout | null {
  try { const value = localStorage.getItem(layoutKey(meeting)); return value === "compact" || value === (meeting ? "table" : "classroom") ? value : null; }
  catch { return null; }
}

export default function OnlineMusicRoom({ link, owner, onBack, vi, fromClass = false, foreground = true, onMinimize, onRestore }: {
  link: OnlineRoomLink; owner: string; onBack: () => void; vi: boolean; fromClass?: boolean; foreground?: boolean;
  onMinimize: () => void; onRestore: () => void;
}) {
  const session = useOnlineRoom(link);
  const label: Labels = (vn, en) => vi ? vn : en;
  const exit = () => { session.leave(); onBack(); };
  const [password, setPassword] = useState("");
  const [submittingPassword, setSubmittingPassword] = useState(false);
  const askingPassword = ["password_required", "password_invalid", "password_rate"].includes(session.phase);
  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || submittingPassword) return;
    setSubmittingPassword(true);
    const entered = password;
    setPassword("");
    try { await session.enterPassword(entered); }
    finally { setSubmittingPassword(false); }
  };
  const snapshot = session.snapshot;
  const [statusExpanded, setStatusExpanded] = useState(false);
  return <section className="online-rooms online-room-session" hidden={!foreground} inert={!foreground}>
    <PageBack active={foreground} onBack={onMinimize}>{label("Thu nhỏ phòng", "Minimize room")}</PageBack>
    {!snapshot && !foreground && <RoomIsland name={session.roomName || label("Phòng Online", "Online Rooms")} vi={vi}
      status={session.phase === "waiting" ? label("Đang chờ duyệt", "Waiting for approval")
        : session.phase === "closed" ? label("Phòng đã đóng", "Room closed")
        : session.phase === "removed" ? label("Chủ phòng đã mời bạn rời phòng", "The host removed you")
        : session.phase === "connecting" || session.phase === "active" ? label("Đang kết nối…", "Connecting…")
        : label("Phiên phòng chưa kết nối", "Room is not connected")}
      expanded={statusExpanded} setExpanded={setStatusExpanded} onRestore={onRestore} onLeave={exit}/>}
    {!snapshot ? <div className="online-room-state">
      <span className="online-room-card-symbol">{session.phase === "waiting" ? <Users size={26}/> : <DoorOpen size={26}/>}</span>
      <h1>{session.roomName || label("Phòng Online", "Online Rooms")}</h1>
      <p role="status">{
        session.phase === "waiting" ? label("Đang chờ chủ phòng duyệt. Bạn sẽ vào phòng ngay khi được chấp nhận.", "Waiting for the host. You will join as soon as they admit you.")
        : session.phase === "full" ? label("Phòng đã đủ 20 người. Chọn phòng khác hoặc thử lại khi có ghế trống.", "All 20 seats are taken. Choose another room or try again when a seat opens.")
        : session.phase === "waiting_full" ? label("Đã có nhiều yêu cầu đang chờ. Hãy thử lại sau.", "The waiting list is full. Try again later.")
        : session.phase === "removed" ? label("Chủ phòng chưa cấp quyền hoặc đã mời bạn rời phòng.", "The host declined your request or removed you from the room.")
        : session.phase === "closed" ? label("Phòng này đã đóng hoặc không còn mở.", "This room is closed or no longer available.")
        : session.phase === "password_required" ? label("Nhập mật khẩu do chủ phòng cung cấp.", "Enter the password provided by the host.")
        : session.phase === "password_invalid" ? label("Sai mật khẩu phòng. Hãy kiểm tra và nhập lại.", "Incorrect room password. Check it and try again.")
        : session.phase === "password_rate" ? label("Bạn đã thử quá nhiều lần. Hãy chờ một phút trước khi thử lại.", "Too many attempts. Wait a minute before trying again.")
        : session.phase === "class_required" ? label("Phòng chỉ dành cho giáo viên và học sinh đang tham gia lớp.", "This room is only for the teacher and currently enrolled students.")
        : session.phase === "invite_required" ? label("Bạn cần mã phòng hoặc liên kết mời còn hạn để vào phòng riêng này.", "You need the room code or a current invitation link to join this private room.")
        : session.phase === "other_tab" ? label("Bạn đang ngồi ở phòng này trong tab khác. Có thể chuyển ghế sang tab này.", "You have this seat in another tab. You can move the session to this tab.")
        : session.phase === "expired" ? label("Phiên đã hết hạn. Bấm kết nối lại để tìm ghế.", "Your session expired. Reconnect to find a seat.")
        : session.phase === "failed" ? roomIssue(session.problem, vi) : label("Đang kết nối và tìm ghế cho bạn…", "Connecting and finding a seat…")
      }</p>
      {askingPassword && <form className="online-room-code-lookup online-room-password" onSubmit={event => void submitPassword(event)}>
        <label>{label("Mật khẩu phòng", "Room password")}<input autoFocus type="password" autoComplete="off" required maxLength={64} value={password} onChange={event => setPassword(event.target.value)} disabled={submittingPassword}/></label>
        <button type="submit" className="primary-button" disabled={!password || submittingPassword}><Lock size={16}/>{submittingPassword ? label("Đang kiểm tra…", "Checking…") : label("Vào phòng", "Join room")}</button>
      </form>}
      {(session.phase === "waiting" || askingPassword) && session.problem != null && <p role="status">{roomIssue(session.problem, vi)}</p>}
      <div className="online-room-actions"><button type="button" className="secondary-button" onClick={exit}>{fromClass ? label("Về lớp học","Back to class") : label("Về sảnh", "Back to lobby")}</button>
        {["failed","full","waiting_full","expired","other_tab"].includes(session.phase) && <button type="button" className="primary-button" onClick={session.retry}>{session.phase === "other_tab" ? label("Dùng tab này", "Use this tab") : label("Thử lại", "Try again")}</button>}
      </div>
    </div> : <RoomInterior snapshot={snapshot} messages={session.messages} owner={owner} vi={vi} serverNow={session.serverNow} reconnecting={session.isReconnecting} action={session.act} meetingToken={session.meetingToken} meetingCommand={session.meetingCommand} canvas={session.canvas} canvasSignal={session.canvasSignal} upload={session.upload} download={session.download} exit={exit} foreground={foreground} minimize={onMinimize} restore={onRestore}/>}
  </section>;
}

function RoomInterior({ snapshot, messages, owner, vi, action, meetingToken, meetingCommand, canvas, canvasSignal, upload, download, serverNow, exit, reconnecting, foreground, minimize, restore }: {
  snapshot: RoomSnapshot; messages: RoomMessage[]; owner: string; vi: boolean;
  action: ReturnType<typeof useOnlineRoom>["act"];
  canvas: ReturnType<typeof useOnlineRoom>["canvas"]; canvasSignal: number; upload: ReturnType<typeof useOnlineRoom>["upload"]; download: ReturnType<typeof useOnlineRoom>["download"];
  meetingToken: ReturnType<typeof useOnlineRoom>["meetingToken"]; meetingCommand: ReturnType<typeof useOnlineRoom>["meetingCommand"]; serverNow: () => number; exit: () => void; reconnecting: boolean; foreground: boolean; minimize: () => void; restore: () => void;
}) {
  const label: Labels = (vn, en) => vi ? vn : en;
  const { room, playback, members, can_manage, suggestions, waiting, queue } = snapshot;
  const isMeeting = room.kind === "meeting";
  const classRoom = !!room.classroom_id;
  const canDelete = room.host_id === owner && !room.official;
  const legacyInvite = room.visibility === "private" && !classRoom && (!room.entry_mode || room.entry_mode === "link");
  const primaryLayout = isMeeting ? "table" : "classroom";
  const [layout, setLayout] = useState<RoomLayout | null>(() => storedLayout(isMeeting));
  const [panel, setPanel] = useState<Tab>("chat");
  const [av, setAv] = useState<Map<string,string>>(new Map());
  const [background, setBackground] = useState(false);
  const [volume, setVolume] = useState(.65);
  const [muted, setMuted] = useState(false);
  const [trackName, setTrackName] = useState<{ revision: number; title: string }>();
  const [islandExpanded, setIslandExpanded] = useState(false);
  const [inlinePlayer, setInlinePlayer] = useState<HTMLDivElement | null>(null);
  const [miniPlayer, setMiniPlayer] = useState<HTMLDivElement | null>(null);
  const [inlineActions, setInlineActions] = useState<HTMLDivElement | null>(null);
  const [miniActions, setMiniActions] = useState<HTMLDivElement | null>(null);
  const [wide, setWide] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [invite, setInvite] = useState("");
  const [shareShown, setShareShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [note, setNote] = useState("");
  const [report,setReport] = useState<{ message?: RoomMessage } | null>(null);
  const openReport = (message?: RoomMessage) => { setProblem(""); setNote(""); setReport({ message }); };
  const inputRef = useRef<HTMLInputElement>(null);
  const operation = useRef(false);
  const lastEnded = useRef<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const self = members.find(person => person.id === owner);
  const roomLayout = layout ?? room.layout;
  const mayControl = can_manage && !room.official && room.music_enabled;
  const showQueue = room.music_enabled && !room.official;
  const current = room.music_enabled && (playback.video_id || playback.playlist_id) ? playback : null;
  const displayedTitle = trackName?.revision === playback.revision ? trackName.title : playback.title;
  const backgroundAvailable = room.official && room.music_enabled && current?.video_id === OFFICIAL_PIANO_VIDEO;
  const audioOnly = Boolean(backgroundAvailable && background);
  const youtubeRequested = Boolean(current && !audioOnly);
  const localVolume = muted ? 0 : volume;
  const playerSlot = foreground ? inlinePlayer : miniPlayer;
  const actionsSlot = foreground ? inlineActions : miniActions;
  const projectedRoomAudio = !isMeeting && !!current && playback.playing && localVolume > 0 && (audioOnly || foreground || islandExpanded);
  useRoomAudioPriority(projectedRoomAudio);
  useEffect(() => {
    if (foreground) {
      setIslandExpanded(false);
    } else {
      setIslandExpanded(isMeeting || youtubeRequested);
      setShareShown(false); setConfirm(null); setReport(null);
    }
  // Choosing to collapse the player remains effective until the next change of screen.
  }, [foreground]);
  const volumeControl = <>
    <button type="button" className="secondary-button" aria-pressed={localVolume === 0}
      onClick={() => { if (!volume) setVolume(.65); setMuted(localVolume > 0); }}>
      {localVolume > 0 ? <Volume2 size={16}/> : <VolumeX size={16}/>}
      {localVolume > 0 ? label("Tắt tiếng", "Mute") : label("Bật tiếng", "Unmute")}
    </button>
    <label className="room-island-volume">{label("Âm lượng của bạn", "Your volume")}
      <input aria-label={label("Âm lượng trong phòng", "Room volume")} type="range" min="0" max="1" step=".01"
        value={localVolume} onChange={event => { setVolume(Number(event.target.value)); setMuted(false); }}/>
    </label>
  </>;
  const sourceControl = backgroundAvailable && <button className="secondary-button" type="button" onClick={() => setBackground(!audioOnly)}>
    <Music2 size={14}/>{audioOnly ? label("Đổi sang YouTube", "Switch to YouTube") : label("Nghe piano nền", "Play background piano")}
  </button>;
  const readyTracks = queue.filter(track => track.status === "queued");
  const pendingTracks = queue.filter(track => track.status === "pending");
  const avatarSignature = JSON.stringify(members.map(person => [person.id, person.avatar_url, person.avatar_slot, person.avatar_revision]));

  useEffect(() => { if (foreground) heading.current?.focus({ preventScroll: true }); }, [foreground]);
  useEffect(() => {
    const controller = new AbortController();
    void loadRoomAvatars(members, owner, controller.signal).then(urls => {
      if (!controller.signal.aborted) setAv(urls);
    }).catch(() => {});
    return () => controller.abort();
  }, [avatarSignature, owner]);
  useEffect(() => {
    if (!can_manage) { setInvite(""); setShareShown(false); setConfirm(null); }
  }, [can_manage]);

  const run: Run = async request => {
    if (operation.current) return;
    operation.current = true; setBusy(true); setProblem("");
    try {
      if (isMeeting && request.name === "close") return await meetingCommand({ name: "close" });
      if (isMeeting && (request.name === "remove_member" || request.name === "transfer")) {
        return await meetingCommand({ name: request.name === "remove_member" ? "remove" : "transfer", target: request.id });
      }
      return await action(request);
    }
    catch (err) { setProblem(roomIssue(err, vi)); }
    finally { operation.current = false; setBusy(false); }
  };
  const manageMeeting = async (command: MeetingCommand) => {
    if (operation.current) return;
    operation.current = true; setBusy(true); setProblem(""); setNote("");
    try {
      await meetingCommand(command);
      if (command.name === "mute") setNote(label("Đã gửi yêu cầu tắt mic.", "The microphone mute request was sent."));
    } catch (err) { setProblem(roomIssue(err, vi)); }
    finally { operation.current = false; setBusy(false); }
  };
  const changeLayout = (value: RoomLayout) => {
    setLayout(value);
    try { localStorage.setItem(layoutKey(isMeeting), value); } catch { /* device preference is optional */ }
  };
  const share = async (renew: boolean) => {
    setCopied(false);
    setShareShown(true);
    let value = legacyInvite ? invite : onlineRoomUrl(room.id, undefined, undefined, room.code ?? undefined).toString();
    if (legacyInvite && renew) {
      const result = await run({ name: "invite" });
      if (!result?.invite) return;
      value = onlineRoomUrl(room.id, result.invite).toString();
    }
    if (value) { setInvite(value); setCopied(await copyTextWithFallback(value)); }
  };
  const copyCode = async () => {
    if (!room.code) return;
    setProblem("");
    const ok = await copyTextWithFallback(room.code);
    setNote(ok ? label("Đã sao chép mã phòng.", "Room code copied.") : label("Không sao chép được. Bạn có thể đọc mã trên màn hình.", "Could not copy. You can read the code on screen."));
  };
  const deleteRoom = () => {
    setProblem("");
    setConfirm({ action: { name: "delete" }, title: label("Xóa phòng?", "Delete this room?"),
      text: label("Mọi người sẽ rời phòng. Mã phòng, liên kết mời, tin nhắn, tệp và bảng Canvas trong phòng sẽ không còn dùng được.", "Everyone will be removed. The room code, invitation links, messages, files and in-room Canvas will no longer be available.") });
  };
  const removeRoom = async () => {
    if (operation.current || !canDelete) return;
    operation.current = true; setBusy(true); setProblem("");
    try { await deleteOnlineRoom(room.id); setConfirm(null); exit(); }
    catch (err) { setProblem(roomIssue(err, vi)); }
    finally { operation.current = false; setBusy(false); }
  };
  const onEnded = async (revision: number, index: number, hasNext: boolean) => {
    if (lastEnded.current === revision) return;
    lastEnded.current = revision;
    try { await action({ name: "music_ended", revision, index, has_next: hasNext }); }
    catch (err) {
      if (!(err instanceof OnlineRoomError && err.issue === "ONLINE_PLAYBACK_CHANGED")) {
        lastEnded.current = null;
        setProblem(roomIssue(err, vi));
        throw err;
      }
    }
  };
  const closeRoom = () => setConfirm({ action: { name: "close" }, title: label("Kết thúc phòng?", "End the room?"),
    text: isMeeting ? label("Cuộc gọi và chat sẽ dừng cho mọi người. Liên kết mời sẽ hết hiệu lực.", "The call and chat will end for everyone. The invitation link will expire.") : label("Nhạc và chat sẽ dừng cho mọi người. Liên kết mời của phòng này sẽ hết hiệu lực.", "Music and chat will stop for everyone. This room's invitation link will stop working.") });

  return <div className="online-room-interior" data-layout={roomLayout} data-wide={wide} data-room-kind={room.kind}>
    {!isMeeting && !foreground && <RoomIsland name={audioOnly ? label("Bình minh · Piano MindCanvas", "Daybreak · MindCanvas Piano") : displayedTitle || room.name} vi={vi} expanded={islandExpanded} setExpanded={setIslandExpanded}
      onRestore={restore} onLeave={exit} live={!reconnecting}
      status={reconnecting ? label("Đang kết nối lại…", "Reconnecting…") : current && playback.playing
        ? audioOnly ? label("Đang nghe piano nền", "Background piano playing") : label("YouTube · đang nghe cùng phòng", "YouTube · listening with the room")
        : label("Vẫn ở trong phòng", "Still in the room")}>
      {current && <>
        {youtubeRequested && <div ref={setMiniPlayer} className="room-youtube-slot"/>}
        <div ref={setMiniActions}/>
        <div className="room-island-controls">{volumeControl}{sourceControl}</div>
        {backgroundAvailable && <small>{label("Piano nền là bản khác video YouTube.", "Background piano is a separate track from the YouTube video.")}</small>}
      </>}
    </RoomIsland>}
    {!isMeeting && current && youtubeRequested && <OnlineRoomYouTube key={current.playlist_id ?? current.video_id} playback={current} serverNow={serverNow}
      onEnded={onEnded}
      onTitle={(revision, title) => setTrackName(old => old?.revision === revision && old.title === title ? old : { revision, title })}
      vi={vi} slot={playerSlot} compact={!foreground} volume={localVolume} controlSlot={actionsSlot}/>}
    {!isMeeting && current && audioOnly && <RoomBackgroundAudio playback={current} serverNow={serverNow} volume={localVolume} slot={actionsSlot} vi={vi}/>}
    <header className="online-room-header">
      <div><span className="online-room-live-tag">{isMeeting ? <Video size={15}/> : <Radio size={15}/>} {isMeeting ? label("PHÒNG HỌC / HỌP", "STUDY / MEETING") : label("PHÒNG NGHE NHẠC", "MUSIC ROOM")}{room.visibility === "private" && <Lock size={13} aria-label={label("Phòng riêng", "Private room")}/>}</span>
        <h1 ref={heading} tabIndex={-1}>{room.name}</h1><p>{room.topic || `${label("Chủ phòng:", "Host:")} ${room.host_name}`}</p></div>
      <div className="online-room-actions">
        {room.code && <button type="button" className="secondary-button online-room-code-tag" aria-label={`${label("Sao chép mã phòng", "Copy room code")}: ${room.code}`} onClick={() => void copyCode()}><Copy size={15}/>{label("Mã phòng", "Room code")}: <strong>{room.code}</strong></button>}
        <div className="online-room-segment" role="group" aria-label={label("Kiểu hiển thị", "Room layout")}>
          <button type="button" aria-pressed={roomLayout === primaryLayout} onClick={() => changeLayout(primaryLayout)}><Armchair size={15}/>{isMeeting ? label("Bàn họp", "Meeting table") : label("Lớp học", "Classroom")}</button>
          <button type="button" aria-pressed={roomLayout === "compact"} onClick={() => changeLayout("compact")}><Users size={15}/>{label("Gọn", "Compact")}</button>
        </div>
        {(can_manage || room.visibility === "public") && <button type="button" className="secondary-button" disabled={busy} onClick={() => void share(false)}><Link2 size={16}/>{label("Chia sẻ phòng", "Share room")}</button>}
        {canDelete && <button type="button" className="secondary-button online-room-delete" disabled={busy} onClick={deleteRoom}><Trash2 size={16}/>{label("Xóa phòng", "Delete room")}</button>}
        <button type="button" className="secondary-button" onClick={minimize}><Minimize2 size={16}/>{label("Thu nhỏ phòng", "Minimize room")}</button>
        <button type="button" className="secondary-button" onClick={exit}><DoorOpen size={16}/>{label("Rời phòng", "Leave room")}</button>
      </div>
    </header>
    {reconnecting && <p className="online-room-feedback" role="status">{label("Đang tìm lại kết nối với phòng…", "Reconnecting to the room…")}</p>}
    {problem && <p className="online-room-feedback" role="alert">{problem}</p>}
    {note && <p className="online-room-feedback" role="status">{note}</p>}
    <div className="online-room-workspace">
      {isMeeting ? <Suspense fallback={<p className="online-room-feedback" role="status">{label("Đang tải bàn họp…", "Loading the meeting table…")}</p>}>
        <MeetingBoard layout={roomLayout} room={room} owner={owner} members={members} avatars={av} presenter={snapshot.presenter_id ?? room.host_id}
          vi={vi} busy={busy} token={meetingToken} run={run} serverNow={serverNow} canvas={canvas} canvasSignal={canvasSignal}
          foreground={foreground} reconnecting={reconnecting} islandExpanded={islandExpanded} setIslandExpanded={setIslandExpanded} onRestore={restore} onLeave={exit}/>
      </Suspense> : <section className="online-room-stage-zone" aria-label={label("Không gian học chung", "Shared study space")}>
        {roomLayout === "classroom" && <div className="online-room-classroom-windows" aria-hidden="true"><span/><span/><span/></div>}
        <div className="online-room-stage-tools"><span>{label("Bảng chung", "Shared board")}</span>
          <button type="button" className="text-button" aria-pressed={wide} onClick={() => setWide(value => !value)}>{wide ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}
            {wide ? label("Thu nhỏ bảng", "Shrink board") : label("Phóng to bảng", "Expand board")}</button></div>
        <div className="online-room-board">
          <span className="online-room-board-label">{room.music_enabled ? label("ĐANG PHÁT TRONG PHÒNG", "PLAYING IN THE ROOM") : label("GÓC YÊN LẶNG", "QUIET CORNER")}</span>
          {current ? <>
            <strong className="online-room-track-title">{displayedTitle || label("Video YouTube", "YouTube video")}</strong>
            {current.attribution && <small className="online-room-credit">{current.attribution}</small>}
            {youtubeRequested ? <div ref={setInlinePlayer} className="room-youtube-slot in-room"/>
              : <div className="online-room-board-invite"><Headphones size={31}/><p>
                  {label("Bình minh · Piano MindCanvas", "Daybreak · MindCanvas Piano")}</p></div>}
            <div className="online-room-player-local room-island-controls">{volumeControl}</div>
            <div ref={setInlineActions}/>
            {sourceControl}
            {backgroundAvailable && <small className="room-audio-status">{label("Piano nền là bản khác video YouTube.", "Background piano is a separate track from the YouTube video.")}</small>}
          </> : <div className="online-room-board-invite"><BookOpen size={37}/>
            <strong>{room.music_enabled ? label("Chưa phát nhạc", "No music playing yet") : label("Cùng ngồi học nhé", "Let’s study together")}</strong>
            <p>{room.music_enabled ? label("Bài hát sẽ hiện ở đây khi chủ phòng chọn.", "A track will appear here when the host chooses one.")
              : label("Phòng không bật nhạc. Bạn có thể đổi ghế hoặc trò chuyện trong khung chat.", "This room has no music. Pick a seat or use the room chat.")}</p>
            {mayControl && <button type="button" className="secondary-button" onClick={() => setPanel("queue")}><Plus size={14}/>{label("Chọn bài đầu tiên", "Choose the first track")}</button>}
          </div>}
        </div>
        {mayControl && <div className="online-room-player-controls" aria-label={label("Điều khiển nhạc của chủ phòng", "Host playback controls")}>
          <button type="button" className="secondary-button" disabled={busy || !readyTracks.length} onClick={() => void run({ name: "next", revision: playback.revision })}><SkipForward size={17}/>{label("Bài tiếp", "Next track")}</button>
        </div>}
        <div className="online-room-seat-heading"><div><Armchair size={18}/><strong>{label("Chỗ ngồi", "Seats")}</strong><span>{members.length}/{room.capacity}</span></div><small>{self ? `${label("Ghế của bạn", "Your seat")}: ${self.seat}` : label("Chọn ghế trống để đổi chỗ", "Choose a vacant seat")}</small></div>
        {roomLayout === "classroom"
          ? <SeatMap members={members} avatars={av} owner={owner} host={room.host_id} label={label} busy={busy} onSeat={seat => void run({ name: "seat", seat })}/>
          : <CompactSeats members={members} avatars={av} owner={owner} label={label} busy={busy} onSeat={seat => void run({ name: "seat", seat })}/>}
      </section>}
      <aside className="online-room-aside">
        <div className="online-room-segment online-room-side-tabs" role="group" aria-label={label("Các mục trong phòng", "Room panels")}>
          <button type="button" aria-pressed={panel === "chat"} onClick={() => setPanel("chat")}><MessageCircle size={15}/>Chat</button>
          {showQueue && <button type="button" aria-pressed={panel === "queue"} onClick={() => setPanel("queue")}><Music2 size={15}/>{label("Hàng đợi", "Queue")}</button>}
          <button type="button" aria-pressed={panel === "people"} onClick={() => setPanel("people")}><Users size={15}/>{label("Mọi người", "People")}{waiting.length > 0 && <small>{waiting.length}</small>}</button>
        </div>
        {panel === "chat" && <RoomChat foreground={foreground} messages={messages} label={label} owner={owner} busy={busy} canManage={can_manage} chatLocked={!!room.chat_locked} onReport={openReport} run={run} vi={vi} upload={isMeeting ? upload : undefined} download={isMeeting ? download : undefined}/>}
        {panel === "queue" && showQueue && <RoomQueue vi={vi} label={label} run={run} mayControl={mayControl} suggestions={suggestions} busy={busy} queued={readyTracks} pending={pendingTracks}/>}
        {panel === "people" && <div className="online-room-people">
          {waiting.length > 0 && <section><h2>{label("Đang chờ vào", "Waiting to join")}</h2><ul>{waiting.map(person => <li key={person.id}><strong>{person.name}</strong>
            <button type="button" className="icon-button" disabled={busy} aria-label={`${label("Cho vào:", "Admit:")} ${person.name}`} onClick={() => void run({ name: "admit", id: person.id })}><Check size={17}/></button>
            <button type="button" className="icon-button" disabled={busy} aria-label={`${label("Từ chối:", "Decline:")} ${person.name}`} onClick={() => void run({ name: "deny", id: person.id })}><X size={17}/></button>
          </li>)}</ul></section>}
          {isMeeting && can_manage && snapshot.presenter_id && snapshot.presenter_id !== owner &&
            <button className="secondary-button" type="button" disabled={busy} onClick={() => void manageMeeting({ name: "presenter", target: null })}><ScreenShare size={16}/>{label("Lấy lại quyền trình chiếu", "Take back presenting rights")}</button>}
          <section><h2>{label("Trong phòng", "In the room")} <small>{members.length}</small></h2><ul>{members.map(person => <li key={person.id}>
            <ProfileAvatar url={av.get(person.id)} name={person.name} className="online-room-person-avatar"/>
            <div><strong>{person.name}{person.id === owner ? label(" (bạn)", " (you)") : ""}</strong><small>{label("Ghế", "Seat")} {person.seat}{room.host_id === person.id && label(" · Chủ phòng", " · Host")}{isMeeting && person.id === snapshot.presenter_id && label(" · Trình chiếu", " · Presenter")}{isMeeting && person.hand_raised_at && label(" · Đang giơ tay", " · Hand raised")}</small></div>
            {can_manage && person.id !== owner && person.id !== room.host_id && <>
              {isMeeting && <>
                <button type="button" className="icon-button" disabled={busy} title={label("Cho trình chiếu", "Allow presenting")} aria-label={`${label("Cho trình chiếu:", "Allow presenting:")} ${person.name}`} onClick={() => void manageMeeting({ name: "presenter", target: person.id })}><ScreenShare size={16}/></button>
                <button type="button" className="icon-button" disabled={busy} title={label("Tắt mic", "Mute microphone")} aria-label={`${label("Tắt mic:", "Mute microphone:")} ${person.name}`} onClick={() => void manageMeeting({ name: "mute", target: person.id })}><MicOff size={16}/></button>
              </>}
              {!room.official && !classRoom && <button type="button" className="icon-button" disabled={busy} title={label("Chuyển quyền chủ phòng", "Transfer host role")} aria-label={`${label("Chuyển quyền cho:", "Transfer to:")} ${person.name}`} onClick={() => setConfirm({ action: { name: "transfer", id: person.id }, title: label("Chuyển quyền chủ phòng?", "Transfer the host role?"), text: `${person.name} ${(isMeeting ? label("sẽ quản lý cuộc họp từ bây giờ.", "will manage the meeting from now on.") : label("sẽ quản lý phòng và nhạc từ bây giờ.", "will manage the room and its music from now on."))}` })}><Crown size={16}/></button>}
              <button type="button" className="icon-button" disabled={busy} title={label("Mời rời phòng", "Remove from room")} aria-label={`${label("Mời rời:", "Remove:")} ${person.name}`} onClick={() => setConfirm({ action: { name: "remove_member", id: person.id }, title: label("Mời người này rời phòng?", "Remove this person?"), text: `${person.name} ${label("sẽ không thể vào lại phòng này.", "will not be able to rejoin this room.")}` })}><X size={16}/></button>
            </>}
          </li>)}</ul></section>
          {can_manage && !room.official && <button type="button" className="secondary-button" disabled={busy} onClick={closeRoom}>{label("Kết thúc phòng", "End room")}</button>}
        </div>}
      </aside>
    </div>
    {foreground && shareShown && <Dialog title={label("Chia sẻ phòng", "Share room")} onClose={() => setShareShown(false)} className="online-room-dialog" workspace>
      <div className="online-room-share-form"><p>{classRoom ? label("Chỉ thành viên đang tham gia lớp có thể mở liên kết này.", "Only currently enrolled members can open this link.") : room.visibility === "public"
        ? label("Ai đã đăng nhập đều có thể vào phòng công khai.", "Anyone signed in can join a public room.")
        : room.entry_mode === "password" ? label("Người nhận cần nhập mật khẩu. Hãy gửi mật khẩu riêng.", "Guests must enter the room password. Send the password separately.")
        : legacyInvite ? label("Khách dùng mã cần chờ bạn duyệt. Link mời có hạn 24 giờ.", "Guests who use the code need your approval. Invitation links last 24 hours.")
        : label("Người nhận sẽ phải chờ bạn duyệt trước khi vào.", "Guests must wait for your approval before joining.")}</p>
        {room.code && <label>{label("Mã phòng", "Room code")}<input readOnly value={room.code} onFocus={event => event.currentTarget.select()}/></label>}
        {invite && <label>{label("Liên kết", "Link")}<input ref={inputRef} readOnly value={invite} onFocus={event => event.currentTarget.select()}/></label>}
        <div className="online-room-actions">{invite && <button type="button" className="primary-button" onClick={() => void copyTextWithFallback(invite, inputRef.current).then(setCopied)}><Link2 size={16}/>{copied ? label("Đã sao chép", "Copied") : label("Sao chép", "Copy")}</button>}
          {legacyInvite && can_manage && <button type="button" className={invite ? "secondary-button" : "primary-button"} disabled={busy} onClick={() => void share(true)}>{label("Tạo link mời mới", "Create an invitation link")}</button>}</div>
        {legacyInvite && <small>{label("Tạo link mới sẽ vô hiệu link cũ; thành viên đã được duyệt vẫn có thể quay lại.", "A new link invalidates the old link. Admitted members can still return.")}</small>}
        {problem && <p role="alert" className="form-error">{problem}</p>}
      </div>
    </Dialog>}
    {foreground && report && <RoomReportDialog key={report.message?.id ?? "room"} message={report.message} label={label} busy={busy} error={problem} onClose={() => setReport(null)} onSubmit={async (reason,detail) => {
      const result = await run({ name:"report",...(report.message ? { id:report.message.id } : {}),reason,detail });
      if (result?.state === "active") { setReport(null); setNote(label("Đã gửi báo cáo cho quản trị viên.","Report sent to the administrator.")); }
    }}/>}
    {foreground && confirm && <Dialog title={confirm.title} onClose={() => setConfirm(null)} className="online-room-dialog" dismissible={!busy} workspace>
      <div className="online-room-share-form"><p>{confirm.text}</p><div className="online-room-actions">
        <button type="button" className="secondary-button" onClick={() => setConfirm(null)} disabled={busy}>{label("Hủy", "Cancel")}</button>
        <button type="button" className={confirm.action.name === "delete" ? "secondary-button online-room-delete" : "primary-button"} disabled={busy} onClick={() => {
          const target = confirm.action;
          if (target.name === "delete") { void removeRoom(); return; }
          void run(target).then(result => {
            if (!result) return;
            setConfirm(null);
            if (target.name === "close") exit();
            else setNote(label("Đã cập nhật thành viên trong phòng.", "Room membership updated."));
          });
        }}>{confirm.action.name === "delete" ? label("Xóa phòng", "Delete room") : label("Xác nhận", "Confirm")}</button>
      </div>{problem && <p role="alert" className="form-error">{problem}</p>}</div>
    </Dialog>}
  </div>;
}

function SeatMap({ members, avatars, owner, host, label, onSeat, busy }: {
  members: RoomAttendee[]; avatars: Map<string,string>; owner: string; host: string | null;
  label: Labels; onSeat: (seat: number) => void; busy: boolean;
}) {
  const bySeat = new Map(members.map(person => [person.seat, person]));
  return <div className="online-room-seats" aria-label={label("Sơ đồ 20 ghế trong lớp", "Classroom seat map")}>
    {Array.from({ length: 4 }, (_, row) => <div className="online-room-seat-row" key={row}>
      {Array.from({ length: 5 }, (_, column) => {
        const seat = row * 5 + column + 1, person = bySeat.get(seat), isYou = person?.id === owner;
        const seatLabel = `${label("Ghế", "Seat")} ${seat}`;
        return person ? <div className="online-room-seat" key={seat} data-occupied="true" data-self={isYou} title={`${seatLabel}: ${person.name}`} aria-label={`${seatLabel}: ${person.name}`}>
          <ProfileAvatar url={avatars.get(person.id)} name={person.name} className="online-room-seat-avatar"/>
          <span>{isYou ? label("Bạn", "You") : person.name}</span>{host === person.id && <Crown size={12} className="online-room-seat-crown" aria-label={label("Chủ phòng", "Host")}/>}
        </div> : <button type="button" className="online-room-seat" key={seat} data-occupied="false" disabled={busy} onClick={() => onSeat(seat)}
          aria-label={`${label("Chuyển tới ghế", "Move to seat")} ${seat}`} title={`${seatLabel} · ${label("Trống", "Vacant")}`}><Armchair size={18}/><span>{seat}</span></button>;
      })}
    </div>)}
  </div>;
}

function CompactSeats({ members, avatars, owner, label, onSeat, busy }: {
  members: RoomAttendee[]; avatars: Map<string,string>; owner: string;
  label: Labels; onSeat: (seat: number) => void; busy: boolean;
}) {
  const occupied = new Set(members.map(person => person.seat));
  const vacant = Array.from({ length: 20 }, (_, index) => index + 1).filter(seat => !occupied.has(seat));
  return <div className="online-room-compact-seats">
    <ul aria-label={label("Người đang ngồi", "Seated participants")}>{members.map(person => <li key={person.id} data-self={person.id === owner}>
      <ProfileAvatar url={avatars.get(person.id)} name={person.name} className="online-room-seat-avatar"/>
      <span>{person.id === owner ? label("Bạn", "You") : person.name}</span><small>{person.seat}</small>
    </li>)}</ul>
    <select aria-label={label("Đổi ghế", "Change seat")} value="" disabled={busy || !vacant.length} onChange={event => { if (event.target.value) onSeat(Number(event.target.value)); }}>
      <option value="" disabled>{label("Đổi ghế", "Change seat")}</option>
      {vacant.map(seat => <option value={seat} key={seat}>{label("Ghế", "Seat")} {seat}</option>)}
    </select>
  </div>;
}

function RoomReportDialog({ message,label,busy,error,onClose,onSubmit }: { message?:RoomMessage; label:Labels; busy:boolean; error:string; onClose:()=>void; onSubmit:(reason:RoomReportReason,detail:string)=>Promise<void> }) {
  const [reason,setReason] = useState<RoomReportReason>("spam"), [detail,setDetail] = useState("");
  return <Dialog title={message ? label("Báo cáo tin nhắn","Report message") : label("Báo cáo phòng","Report room")} onClose={onClose} dismissible={!busy} workspace className="online-room-dialog">
    <form className="online-room-create-form" onSubmit={event => { event.preventDefault(); if (!busy) void onSubmit(reason,detail); }}>
      <p>{message ? label("Quản trị viên sẽ nhận nội dung tin nhắn này (hoặc tên tệp) cùng lý do báo cáo.", "The administrator receives this message (or its filename) and your report reason.") : label("Quản trị viên sẽ nhận tên phòng, lý do và mô tả bạn cung cấp.", "The administrator receives the room name, reason and your description.")}</p>
      {message && <blockquote>{message.file?.name ?? message.body}</blockquote>}
      <label>{label("Lý do","Reason")}<select value={reason} onChange={event => setReason(event.target.value as RoomReportReason)}>
        <option value="spam">{label("Spam","Spam")}</option><option value="harassment">{label("Quấy rối","Harassment")}</option><option value="inappropriate">{label("Nội dung không phù hợp","Inappropriate content")}</option><option value="other">{label("Khác","Other")}</option>
      </select></label>
      <label>{label("Mô tả thêm (không bắt buộc)","Additional details (optional)")}<textarea maxLength={400} rows={3} value={detail} onChange={event => setDetail(event.target.value)}/></label>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button type="submit" className="primary-button" disabled={busy}><Flag size={16}/>{label("Gửi báo cáo","Submit report")}</button>
    </form>
  </Dialog>;
}

function RoomChat({ foreground, messages, label, owner, busy, canManage, chatLocked,onReport, run, vi, upload, download }: { foreground: boolean; messages: RoomMessage[]; label: Labels; owner: string; busy: boolean; canManage: boolean; chatLocked:boolean; onReport:(message?:RoomMessage)=>void; run: Run; vi: boolean; upload?: (file:File,key:string) => Promise<void>; download?: (id:string) => Promise<Blob> }) {
  const postingBlocked = chatLocked && !canManage;
  const input = useRef<HTMLInputElement>(null), fileWorking = useRef(false);
  const [file, setFile] = useState<{ value: File; key: string } | null>(null);
  const [fileError, setFileError] = useState<unknown>(null), [fileBusy, setFileBusy] = useState(false);
  const [preview, setPreview] = useState<MeetingRoomFile | null>(null);
  const [fetching, setFetching] = useState<string | null>(null);
  async function sendFile() {
    if (!file || !upload || postingBlocked || fileWorking.current) return;
    fileWorking.current = true; setFileBusy(true); setFileError(null); nearBottom.current = true;
    try { await upload(file.value,file.key); setFile(null); }
    catch (error) { setFileError(error); }
    finally { fileWorking.current = false; setFileBusy(false); }
  }
  async function saveFile(item: MeetingRoomFile) {
    if (!download || fetching) return;
    setFetching(item.id); setFileError(null);
    try {
      const blob = await download(item.id), url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = item.name; link.click();
      setTimeout(() => URL.revokeObjectURL(url),30000);
    } catch (error) { setFileError(error); }
    finally { setFetching(null); }
  }
  useEffect(() => {
    if (preview && !messages.some(message => message.file?.id === preview.id)) setPreview(null);
  },[messages,preview]);
  const [body, setBody] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const lastKey = useRef<{ body: string; id: string } | null>(null);
  const lastId = messages.at(-1)?.id;
  useEffect(() => { if (list.current && nearBottom.current) list.current.scrollTop = list.current.scrollHeight; }, [lastId]);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    const value = body.trim();
    if (!value || busy || postingBlocked) return;
    if (lastKey.current?.body !== value) lastKey.current = { id: crypto.randomUUID(), body: value };
    const result = await run({ name: "chat", body: value, key: lastKey.current.id });
    if (result?.state === "active") { nearBottom.current = true; setBody(previous => previous.trim() === value ? "" : previous); lastKey.current = null; }
  };
  return <div className="online-room-chat">
    <div className="online-chat-controls">
      {canManage && <button type="button" className="secondary-button" aria-pressed={chatLocked} disabled={busy} onClick={() => void run({ name:"chat_lock",locked:!chatLocked })}><Lock size={14}/>{chatLocked ? label("Mở khóa chat","Unlock chat") : label("Khóa gửi chat","Lock chat")}</button>}
      <button type="button" className="text-button" disabled={busy} onClick={() => onReport()}><Flag size={14}/>{label("Báo cáo phòng","Report room")}</button>
    </div>
    {postingBlocked && <p className="online-room-muted" role="status">{label("Chat đang khóa. Bạn vẫn đọc được tin nhắn và gửi báo cáo.","Chat is locked. You can still read messages and submit reports.")}</p>}
    <div className="online-room-chat-log" role="log" aria-live="polite" aria-label={label("Tin nhắn trong phòng", "Room messages")} ref={list}
      onScroll={event => { const el = event.currentTarget; nearBottom.current = el.scrollHeight - el.clientHeight - el.scrollTop < 42; }}>
      {!messages.length && <p className="online-room-muted">{label("Chưa có tin nhắn. Gửi lời chào nhé!", "No messages yet. Say hello!")}</p>}
      {messages.map(message => <article key={message.id} className="online-room-message" data-own={message.author_id === owner}>
        <div><strong>{message.author_id === owner ? label("Bạn", "You") : message.name}</strong>
          <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString(vi ? "vi-VN" : "en", { hour: "2-digit", minute: "2-digit" })}</time>
          {message.author_id !== owner && <button type="button" className="icon-button" disabled={busy} title={label("Báo cáo tin nhắn","Report message")} aria-label={label("Báo cáo tin nhắn","Report message")} onClick={() => onReport(message)}><Flag size={13}/></button>}
          {canManage && <button type="button" className="icon-button" disabled={busy} title={label("Xóa tin nhắn", "Delete message")} aria-label={`${label("Xóa tin nhắn của", "Delete message from")} ${message.name}`} onClick={() => void run({ name: "chat_delete", id: message.id })}><Trash2 size={13}/></button>}
        </div>{message.file && download ? <div className="meeting-chat-file">
          <FileText size={19}/><span><strong>{message.file.name}</strong><small>{new Intl.NumberFormat(vi ? "vi-VN" : "en",{ maximumFractionDigits:1 }).format(message.file.size/1024)} KB</small></span>
          <div><button className="secondary-button" type="button" onClick={() => setPreview(message.file!)}><Eye size={14}/>{label("Xem","View")}</button>
            <button className="secondary-button" type="button" disabled={!!fetching} onClick={() => void saveFile(message.file!)}><Download size={14}/>{label("Tải","Download")}</button></div>
        </div> : <p>{message.body}</p>}
      </article>)}
    </div>
    {fileError != null && <p className="online-room-feedback" role="alert">{roomIssue(fileError,vi)}</p>}
    {file && <div className="meeting-file-pending"><span>{file.value.name}</span>
      <button type="button" className="primary-button" disabled={fileBusy || postingBlocked} onClick={() => void sendFile()}>{fileBusy ? label("Đang gửi…","Sending…") : label("Gửi tệp","Send file")}</button>
      <button type="button" className="icon-button" disabled={fileBusy} aria-label={label("Bỏ chọn tệp","Remove selected file")} onClick={() => { setFile(null); setFileError(null); }}><X size={16}/></button></div>}
    {foreground && preview && download && <Suspense fallback={<p role="status">{label("Đang mở tệp…","Opening file…")}</p>}><MeetingFilePreview key={preview.id} file={preview} vi={vi} load={download} onClose={() => setPreview(null)}/></Suspense>}
    <form className="online-room-chat-form" data-files={Boolean(upload)} onSubmit={event => void send(event)}>
      {upload && <><input type="file" ref={input} className="meeting-file-input" aria-label={label("Chọn tệp để gửi","Choose file to send")} accept={MEETING_FILE_ACCEPT} onChange={event => {
        const picked = event.currentTarget.files?.[0]; event.currentTarget.value = "";
        if (!picked) return;
        if (!picked.size || picked.size > MEETING_FILE_LIMIT) { setFile(null); setFileError(new OnlineRoomError("ONLINE_FILE_SIZE")); return; }
        setFileError(null); setFile({ value:picked,key:crypto.randomUUID() });
      }}/><button type="button" className="secondary-button" disabled={fileBusy || postingBlocked} title={label("Đính kèm tệp (tối đa 8 MB)","Attach file (up to 8 MB)")} aria-label={label("Đính kèm tệp","Attach a file")} onClick={() => input.current?.click()}><Paperclip size={16}/></button></>}
      <input value={body} disabled={postingBlocked} onChange={event => setBody(event.target.value)} maxLength={600} placeholder={label("Gửi tin vào phòng…", "Message the room…")} aria-label={label("Nội dung tin nhắn", "Message text")}/>
      <button type="submit" className="primary-button" disabled={busy || postingBlocked || !body.trim()} aria-label={label("Gửi tin nhắn", "Send message")}><Send size={18}/></button>
    </form>
  </div>;
}

function RoomQueue({ vi, label, mayControl, suggestions, queued, pending, busy, run }: {
  vi: boolean; label: Labels; mayControl: boolean; suggestions: boolean; queued: RoomSnapshot["queue"]; pending: RoomSnapshot["queue"]; busy: boolean; run: Run;
}) {
  const [link, setLink] = useState(""), [title, setTitle] = useState(""), [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || busy) return;
    setError(""); setSaving(true);
    try {
      const track = await prepareRoomMusicTrack(link, title);
      if (!track) {
        setError(label("Dán link bài hát hoặc playlist YouTube hợp lệ.", "Paste a valid YouTube song or playlist link."));
        return;
      }
      if (await run({ name: "track", ...track })) { setLink(""); setTitle(""); }
    } finally { setSaving(false); }
  };
  return <div className="online-room-queue">
    {mayControl && <label className="online-room-check"><input type="checkbox" checked={suggestions} disabled={busy} onChange={event => void run({ name: "suggestions", enabled: event.target.checked })}/>{label("Mở đề xuất từ thành viên", "Allow suggestions")}</label>}
    {(suggestions || mayControl) && <form className="online-room-track-form" onSubmit={event => void submit(event)}>
      <RoomMusicFields vi={vi} link={link} title={title} onLink={setLink} onTitle={setTitle}/>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button type="submit" className="primary-button" disabled={saving || busy || !link.trim()}><Plus size={16}/>{mayControl ? label("Thêm bài", "Add track") : label("Gửi đề xuất", "Suggest track")}</button>
    </form>}
    {!suggestions && !mayControl && <p className="online-room-muted">{label("Chỉ chủ phòng có thể thêm bài lúc này.", "Only the host can add tracks right now.")}</p>}
    <section><h2>{label("Sắp phát", "Up next")} <small>{queued.length}</small></h2>
      {!queued.length && <p className="online-room-muted">{label("Hàng đợi đang trống.", "The queue is empty.")}</p>}
      <ol>{queued.map((track, index) => <li key={track.id}><span className="online-room-queue-rank">{index + 1}</span><div><strong>{track.title}</strong><small>{track.playlist_id ? `${label("Playlist", "Playlist")} · ` : ""}{track.name}</small></div>
        {mayControl && <><button type="button" className="icon-button" disabled={busy || index === 0} aria-label={`${label("Đưa lên", "Move up")} ${track.title}`} onClick={() => void run({ name: "queue_move", id: track.id, direction: "up" })}><ArrowUp size={15}/></button>
          <button type="button" className="icon-button" disabled={busy || index === queued.length - 1} aria-label={`${label("Đưa xuống", "Move down")} ${track.title}`} onClick={() => void run({ name: "queue_move", id: track.id, direction: "down" })}><ArrowDown size={15}/></button>
          <button type="button" className="icon-button" disabled={busy} aria-label={`${label("Bỏ bài", "Remove track")} ${track.title}`} onClick={() => void run({ name: "track_decision", id: track.id, decision: "remove" })}><X size={16}/></button></>}
      </li>)}</ol>
    </section>
    {pending.length > 0 && <section><h2>{label("Chờ duyệt", "Pending approval")}</h2><ul>{pending.map(track => <li key={track.id}><div><strong>{track.title}</strong><small>{track.playlist_id ? `${label("Playlist", "Playlist")} · ` : ""}{track.name}</small></div>
      {mayControl && <><button type="button" className="icon-button" disabled={busy} aria-label={`${label("Duyệt", "Approve")} ${track.title}`} onClick={() => void run({ name: "track_decision", id: track.id, decision: "approve" })}><Check size={16}/></button>
        <button type="button" className="icon-button" disabled={busy} aria-label={`${label("Từ chối", "Reject")} ${track.title}`} onClick={() => void run({ name: "track_decision", id: track.id, decision: "remove" })}><X size={16}/></button></>}
    </li>)}</ul></section>}
  </div>;
}
