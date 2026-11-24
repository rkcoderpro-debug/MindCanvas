import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { Armchair, ArrowDown, ArrowUp, BookOpen, Check, Crown, DoorOpen, Headphones, Link2, Lock, Maximize2, MessageCircle, Minimize2, Music2, Pause, Play, Plus, Radio, Send, SkipForward, Trash2, Users, MicOff, ScreenShare, Video, X } from "lucide-react";
import { useOnlineRoom } from "../hooks/useOnlineRoom";
import { OFFICIAL_PIANO_VIDEO, type MeetingCommand, loadRoomAvatars, OnlineRoomError, roomIssue, youtubeRoomVideo, type RoomAction, type RoomAttendee, type RoomLayout, type RoomMessage, type RoomSnapshot } from "../lib/onlineRooms";
import { onlineRoomUrl, type OnlineRoomLink } from "../lib/onlineRoomRoutes";
import { copyTextWithFallback } from "../lib/share";
import { PageBack } from "./PageNavigation";
import { ProfileAvatar } from "./ProfileAvatar";
import OnlineRoomYouTube from "./OnlineRoomYouTube";
import Dialog from "./Dialog";

type Tab = "chat" | "queue" | "people";
type Labels = (vi: string, en: string) => string;
type Run = (action: RoomAction) => Promise<{ state: string; invite?: string } | undefined>;
type Confirm = { action: RoomAction; title: string; text: string };
const MeetingBoard = lazy(() => import("./OnlineMeetingBoard"));
const layoutKey = (meeting: boolean) => meeting ? "mindcanvas:online-meeting-layout:v1" : "mindcanvas:online-room-layout:v1";
function storedLayout(meeting: boolean): RoomLayout | null {
  try { const value = localStorage.getItem(layoutKey(meeting)); return value === "compact" || value === (meeting ? "table" : "classroom") ? value : null; }
  catch { return null; }
}

export default function OnlineMusicRoom({ link, owner, onBack, vi }: { link: OnlineRoomLink; owner: string; onBack: () => void; vi: boolean }) {
  const session = useOnlineRoom(link);
  const label: Labels = (vn, en) => vi ? vn : en;
  const exit = () => { session.leave(); onBack(); };
  const snapshot = session.snapshot;
  return <section className="online-rooms">
    <PageBack onBack={exit}>{label("Sảnh Phòng Online", "Online Rooms lobby")}</PageBack>
    {!snapshot ? <div className="online-room-state">
      <span className="online-room-card-symbol">{session.phase === "waiting" ? <Users size={26}/> : <DoorOpen size={26}/>}</span>
      <h1>{session.roomName || label("Phòng Online", "Online Rooms")}</h1>
      <p role="status">{
        session.phase === "waiting" ? label("Đang chờ chủ phòng duyệt. Bạn sẽ vào phòng ngay khi được chấp nhận.", "Waiting for the host. You will join as soon as they admit you.")
        : session.phase === "full" ? label("Phòng đã đủ 20 người. Chọn phòng khác hoặc thử lại khi có ghế trống.", "All 20 seats are taken. Choose another room or try again when a seat opens.")
        : session.phase === "waiting_full" ? label("Đã có nhiều yêu cầu đang chờ. Hãy thử lại sau.", "The waiting list is full. Try again later.")
        : session.phase === "removed" ? label("Chủ phòng chưa cấp quyền hoặc đã mời bạn rời phòng.", "The host declined your request or removed you from the room.")
        : session.phase === "closed" ? label("Phòng này đã đóng hoặc không còn mở.", "This room is closed or no longer available.")
        : session.phase === "invite_required" ? label("Bạn cần một liên kết mời còn hạn để vào phòng riêng này.", "You need a current invitation link to join this private room.")
        : session.phase === "other_tab" ? label("Bạn đang ngồi ở phòng này trong tab khác. Có thể chuyển ghế sang tab này.", "You have this seat in another tab. You can move the session to this tab.")
        : session.phase === "expired" ? label("Phiên đã hết hạn. Bấm kết nối lại để tìm ghế.", "Your session expired. Reconnect to find a seat.")
        : session.phase === "failed" ? roomIssue(session.problem, vi) : label("Đang kết nối và tìm ghế cho bạn…", "Connecting and finding a seat…")
      }</p>
      {session.phase === "waiting" && session.problem != null && <p role="status">{roomIssue(session.problem, vi)}</p>}
      <div className="online-room-actions"><button type="button" className="secondary-button" onClick={exit}>{label("Về sảnh", "Back to lobby")}</button>
        {["failed","full","waiting_full","expired","other_tab"].includes(session.phase) && <button type="button" className="primary-button" onClick={session.retry}>{session.phase === "other_tab" ? label("Dùng tab này", "Use this tab") : label("Thử lại", "Try again")}</button>}
      </div>
    </div> : <RoomInterior snapshot={snapshot} messages={session.messages} owner={owner} vi={vi} serverNow={session.serverNow} reconnecting={session.isReconnecting} action={session.act} meetingToken={session.meetingToken} meetingCommand={session.meetingCommand} exit={exit}/>}
  </section>;
}

function RoomInterior({ snapshot, messages, owner, vi, action, meetingToken, meetingCommand, serverNow, exit, reconnecting }: {
  snapshot: RoomSnapshot; messages: RoomMessage[]; owner: string; vi: boolean;
  action: ReturnType<typeof useOnlineRoom>["act"];
  meetingToken: ReturnType<typeof useOnlineRoom>["meetingToken"]; meetingCommand: ReturnType<typeof useOnlineRoom>["meetingCommand"]; serverNow: () => number; exit: () => void; reconnecting: boolean;
}) {
  const label: Labels = (vn, en) => vi ? vn : en;
  const { room, playback, members, can_manage, suggestions, waiting, queue } = snapshot;
  const isMeeting = room.kind === "meeting";
  const primaryLayout = isMeeting ? "table" : "classroom";
  const [layout, setLayout] = useState<RoomLayout | null>(() => storedLayout(isMeeting));
  const [panel, setPanel] = useState<Tab>("chat");
  const [av, setAv] = useState<Map<string,string>>(new Map());
  const [listen, setListen] = useState(() => room.official && room.music_enabled && playback.video_id === OFFICIAL_PIANO_VIDEO);
  const [wide, setWide] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [invite, setInvite] = useState("");
  const [shareShown, setShareShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [note, setNote] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const operation = useRef(false);
  const lastEnded = useRef<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const self = members.find(person => person.id === owner);
  const roomLayout = layout ?? room.layout;
  const mayControl = can_manage && !room.official && room.music_enabled;
  const showQueue = room.music_enabled && !room.official;
  const current = playback.video_id ? { ...playback, video_id: playback.video_id } : null;
  const readyTracks = queue.filter(track => track.status === "queued");
  const pendingTracks = queue.filter(track => track.status === "pending");
  const avatarSignature = JSON.stringify(members.map(person => [person.id, person.avatar_url, person.avatar_slot, person.avatar_revision]));

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
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
    let value = room.visibility === "public" ? onlineRoomUrl(room.id).toString() : invite;
    if (room.visibility === "private" && renew) {
      const result = await run({ name: "invite" });
      if (!result?.invite) return;
      value = onlineRoomUrl(room.id, result.invite).toString();
    }
    if (value) { setInvite(value); setCopied(await copyTextWithFallback(value)); }
  };
  const onEnded = async (revision: number) => {
    if (!mayControl || lastEnded.current === revision) return;
    lastEnded.current = revision;
    try { await action({ name: "next", revision }); }
    catch (err) {
      if (!(err instanceof OnlineRoomError && err.issue === "ONLINE_PLAYBACK_CHANGED")) setProblem(roomIssue(err, vi));
    }
  };
  const playPause = () => {
    if (!playback.playing) setListen(true);
    void run({ name: playback.playing ? "pause" : "play", revision: playback.revision });
  };
  const closeRoom = () => setConfirm({ action: { name: "close" }, title: label("Kết thúc phòng?", "End the room?"),
    text: isMeeting ? label("Cuộc gọi và chat sẽ dừng cho mọi người. Liên kết mời sẽ hết hiệu lực.", "The call and chat will end for everyone. The invitation link will expire.") : label("Nhạc và chat sẽ dừng cho mọi người. Liên kết mời của phòng này sẽ hết hiệu lực.", "Music and chat will stop for everyone. This room's invitation link will stop working.") });

  return <div className="online-room-interior" data-layout={roomLayout} data-wide={wide}>
    <header className="online-room-header">
      <div><span className="online-room-live-tag">{isMeeting ? <Video size={15}/> : <Radio size={15}/>} {isMeeting ? label("PHÒNG HỌC / HỌP", "STUDY / MEETING") : label("PHÒNG NGHE NHẠC", "MUSIC ROOM")}{room.visibility === "private" && <Lock size={13} aria-label={label("Phòng riêng", "Private room")}/>}</span>
        <h1 ref={heading} tabIndex={-1}>{room.name}</h1><p>{room.topic || `${label("Chủ phòng:", "Host:")} ${room.host_name}`}</p></div>
      <div className="online-room-actions">
        <div className="online-room-segment" role="group" aria-label={label("Kiểu hiển thị", "Room layout")}>
          <button type="button" aria-pressed={roomLayout === primaryLayout} onClick={() => changeLayout(primaryLayout)}><Armchair size={15}/>{isMeeting ? label("Bàn họp", "Meeting table") : label("Lớp học", "Classroom")}</button>
          <button type="button" aria-pressed={roomLayout === "compact"} onClick={() => changeLayout("compact")}><Users size={15}/>{label("Gọn", "Compact")}</button>
        </div>
        {(can_manage || room.visibility === "public") && <button type="button" className="secondary-button" disabled={busy} onClick={() => void share(false)}><Link2 size={16}/>{label("Chia sẻ phòng", "Share room")}</button>}
        <button type="button" className="secondary-button" onClick={exit}><DoorOpen size={16}/>{label("Rời phòng", "Leave room")}</button>
      </div>
    </header>
    {reconnecting && <p className="online-room-feedback" role="status">{label("Đang tìm lại kết nối với phòng…", "Reconnecting to the room…")}</p>}
    {problem && <p className="online-room-feedback" role="alert">{problem}</p>}
    {note && <p className="online-room-feedback" role="status">{note}</p>}
    <div className="online-room-workspace">
      {isMeeting ? <Suspense fallback={<p className="online-room-feedback" role="status">{label("Đang tải bàn họp…", "Loading the meeting table…")}</p>}>
        <MeetingBoard layout={roomLayout} room={room} owner={owner} members={members} avatars={av} presenter={snapshot.presenter_id ?? room.host_id}
          vi={vi} busy={busy} token={meetingToken} run={run} serverNow={serverNow}/>
      </Suspense> : <section className="online-room-stage-zone" aria-label={label("Không gian học chung", "Shared study space")}>
        {roomLayout === "classroom" && <div className="online-room-classroom-windows" aria-hidden="true"><span/><span/><span/></div>}
        <div className="online-room-stage-tools"><span>{label("Bảng chung", "Shared board")}</span>
          <button type="button" className="text-button" aria-pressed={wide} onClick={() => setWide(value => !value)}>{wide ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}
            {wide ? label("Thu nhỏ bảng", "Shrink board") : label("Phóng to bảng", "Expand board")}</button></div>
        <div className="online-room-board">
          <span className="online-room-board-label">{room.music_enabled ? label("ĐANG PHÁT TRONG PHÒNG", "PLAYING IN THE ROOM") : label("GÓC YÊN LẶNG", "QUIET CORNER")}</span>
          {current ? <>
            <strong className="online-room-track-title">{current.title || label("Video YouTube", "YouTube video")}</strong>
            {current.attribution && <small className="online-room-credit">{current.attribution}</small>}
            {listen ? <OnlineRoomYouTube key={current.video_id} playback={current} serverNow={serverNow} onEnded={revision => void onEnded(revision)} vi={vi}/>
              : <div className="online-room-board-invite"><Headphones size={31}/><p>{playback.playing ? label("Nghe cùng đoạn mọi người đang nghe.", "Catch up to the part everyone is listening to.") : label("Chủ phòng đang tạm dừng bài.", "The host has paused this track.")}</p>
                <button type="button" className="primary-button" onClick={() => setListen(true)}><Play size={16}/>{label("Nghe cùng phòng", "Listen with the room")}</button></div>}
            {listen && <button type="button" className="text-button online-room-stop-listening" onClick={() => setListen(false)}><X size={14}/>{label("Dừng nghe trên máy này", "Stop listening on this device")}</button>}
          </> : <div className="online-room-board-invite"><BookOpen size={37}/>
            <strong>{room.music_enabled ? label("Chưa phát nhạc", "No music playing yet") : label("Cùng ngồi học nhé", "Let’s study together")}</strong>
            <p>{room.music_enabled ? label("Bài hát sẽ hiện ở đây khi chủ phòng chọn.", "A track will appear here when the host chooses one.")
              : label("Phòng không bật nhạc. Bạn có thể đổi ghế hoặc trò chuyện trong khung chat.", "This room has no music. Pick a seat or use the room chat.")}</p>
            {mayControl && <button type="button" className="secondary-button" onClick={() => setPanel("queue")}><Plus size={14}/>{label("Chọn bài đầu tiên", "Choose the first track")}</button>}
          </div>}
        </div>
        {mayControl && <div className="online-room-player-controls" aria-label={label("Điều khiển nhạc của chủ phòng", "Host playback controls")}>
          <button type="button" className="secondary-button" disabled={busy || !current} onClick={playPause}>{playback.playing ? <Pause size={17}/> : <Play size={17}/>}
            {playback.playing ? label("Tạm dừng cho cả phòng", "Pause for everyone") : label("Phát cho cả phòng", "Play for everyone")}</button>
          <button type="button" className="secondary-button" disabled={busy || (!current && !readyTracks.length)} onClick={() => void run({ name: "next", revision: playback.revision })}><SkipForward size={17}/>{label("Bài tiếp", "Next track")}</button>
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
        {panel === "chat" && <RoomChat messages={messages} label={label} owner={owner} busy={busy} canManage={can_manage} run={run} vi={vi}/>}
        {panel === "queue" && showQueue && <RoomQueue label={label} run={run} mayControl={mayControl} suggestions={suggestions} busy={busy} queued={readyTracks} pending={pendingTracks}/>}
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
              {!room.official && <button type="button" className="icon-button" disabled={busy} title={label("Chuyển quyền chủ phòng", "Transfer host role")} aria-label={`${label("Chuyển quyền cho:", "Transfer to:")} ${person.name}`} onClick={() => setConfirm({ action: { name: "transfer", id: person.id }, title: label("Chuyển quyền chủ phòng?", "Transfer the host role?"), text: `${person.name} ${(isMeeting ? label("sẽ quản lý cuộc họp từ bây giờ.", "will manage the meeting from now on.") : label("sẽ quản lý phòng và nhạc từ bây giờ.", "will manage the room and its music from now on."))}` })}><Crown size={16}/></button>}
              <button type="button" className="icon-button" disabled={busy} title={label("Mời rời phòng", "Remove from room")} aria-label={`${label("Mời rời:", "Remove:")} ${person.name}`} onClick={() => setConfirm({ action: { name: "remove_member", id: person.id }, title: label("Mời người này rời phòng?", "Remove this person?"), text: `${person.name} ${label("sẽ không thể vào lại phòng này.", "will not be able to rejoin this room.")}` })}><X size={16}/></button>
            </>}
          </li>)}</ul></section>
          {can_manage && !room.official && <button type="button" className="secondary-button" disabled={busy} onClick={closeRoom}>{label("Kết thúc phòng", "End room")}</button>}
        </div>}
      </aside>
    </div>
    {shareShown && <Dialog title={label("Chia sẻ phòng", "Share room")} onClose={() => setShareShown(false)} className="online-room-dialog" workspace>
      <div className="online-room-share-form"><p>{room.visibility === "private"
        ? label("Liên kết mời có hạn 24 giờ. Người được mời cần đăng nhập.", "This link lasts for 24 hours. Guests need to sign in.")
        : label("Ai đã đăng nhập đều có thể vào phòng công khai.", "Anyone signed in can join a public room.")}</p>
        {invite && <label>{label("Liên kết", "Link")}<input ref={inputRef} readOnly value={invite} onFocus={event => event.currentTarget.select()}/></label>}
        <div className="online-room-actions">{invite && <button type="button" className="primary-button" onClick={() => void copyTextWithFallback(invite, inputRef.current).then(setCopied)}><Link2 size={16}/>{copied ? label("Đã sao chép", "Copied") : label("Sao chép", "Copy")}</button>}
          {room.visibility === "private" && can_manage && <button type="button" className={invite ? "secondary-button" : "primary-button"} disabled={busy} onClick={() => void share(true)}>{label("Tạo link mời mới", "Create an invitation link")}</button>}</div>
        {room.visibility === "private" && <small>{label("Tạo link mới sẽ vô hiệu link cũ; thành viên đã được duyệt vẫn có thể quay lại.", "A new link invalidates the old link. Admitted members can still return.")}</small>}
        {problem && <p role="alert" className="form-error">{problem}</p>}
      </div>
    </Dialog>}
    {confirm && <Dialog title={confirm.title} onClose={() => setConfirm(null)} className="online-room-dialog" dismissible={!busy} workspace>
      <div className="online-room-share-form"><p>{confirm.text}</p><div className="online-room-actions">
        <button type="button" className="secondary-button" onClick={() => setConfirm(null)} disabled={busy}>{label("Hủy", "Cancel")}</button>
        <button type="button" className="primary-button" disabled={busy} onClick={() => {
          const target = confirm.action;
          void run(target).then(result => {
            if (!result) return;
            setConfirm(null);
            if (target.name === "close") exit();
            else setNote(label("Đã cập nhật thành viên trong phòng.", "Room membership updated."));
          });
        }}>{label("Xác nhận", "Confirm")}</button>
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

function RoomChat({ messages, label, owner, busy, canManage, run, vi }: { messages: RoomMessage[]; label: Labels; owner: string; busy: boolean; canManage: boolean; run: Run; vi: boolean }) {
  const [body, setBody] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const lastKey = useRef<{ body: string; id: string } | null>(null);
  const lastId = messages.at(-1)?.id;
  useEffect(() => { if (list.current && nearBottom.current) list.current.scrollTop = list.current.scrollHeight; }, [lastId]);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    const value = body.trim();
    if (!value || busy) return;
    if (lastKey.current?.body !== value) lastKey.current = { id: crypto.randomUUID(), body: value };
    const result = await run({ name: "chat", body: value, key: lastKey.current.id });
    if (result?.state === "active") { nearBottom.current = true; setBody(previous => previous.trim() === value ? "" : previous); lastKey.current = null; }
  };
  return <div className="online-room-chat">
    <div className="online-room-chat-log" role="log" aria-live="polite" aria-label={label("Tin nhắn trong phòng", "Room messages")} ref={list}
      onScroll={event => { const el = event.currentTarget; nearBottom.current = el.scrollHeight - el.clientHeight - el.scrollTop < 42; }}>
      {!messages.length && <p className="online-room-muted">{label("Chưa có tin nhắn. Gửi lời chào nhé!", "No messages yet. Say hello!")}</p>}
      {messages.map(message => <article key={message.id} className="online-room-message" data-own={message.author_id === owner}>
        <div><strong>{message.author_id === owner ? label("Bạn", "You") : message.name}</strong>
          <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString(vi ? "vi-VN" : "en", { hour: "2-digit", minute: "2-digit" })}</time>
          {canManage && <button type="button" className="icon-button" disabled={busy} title={label("Xóa tin nhắn", "Delete message")} aria-label={`${label("Xóa tin nhắn của", "Delete message from")} ${message.name}`} onClick={() => void run({ name: "chat_delete", id: message.id })}><Trash2 size={13}/></button>}
        </div><p>{message.body}</p>
      </article>)}
    </div>
    <form className="online-room-chat-form" onSubmit={event => void send(event)}>
      <input value={body} onChange={event => setBody(event.target.value)} maxLength={600} placeholder={label("Gửi tin vào phòng…", "Message the room…")} aria-label={label("Nội dung tin nhắn", "Message text")}/>
      <button type="submit" className="primary-button" disabled={busy || !body.trim()} aria-label={label("Gửi tin nhắn", "Send message")}><Send size={18}/></button>
    </form>
  </div>;
}

function RoomQueue({ label, mayControl, suggestions, queued, pending, busy, run }: {
  label: Labels; mayControl: boolean; suggestions: boolean; queued: RoomSnapshot["queue"]; pending: RoomSnapshot["queue"]; busy: boolean; run: Run;
}) {
  const [link, setLink] = useState(""), [title, setTitle] = useState(""), [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    const video = youtubeRoomVideo(link);
    if (!video) { setError(label("Hãy dán liên kết video YouTube hoặc youtu.be, không dùng link danh sách phát.", "Paste a single YouTube or youtu.be video link rather than a playlist.")); return; }
    const result = await run({ name: "track", video_id: video, title });
    if (result?.state === "active") { setLink(""); setTitle(""); }
  };
  return <div className="online-room-queue">
    {mayControl && <label className="online-room-check"><input type="checkbox" checked={suggestions} disabled={busy} onChange={event => void run({ name: "suggestions", enabled: event.target.checked })}/>{label("Mở đề xuất từ thành viên", "Allow suggestions")}</label>}
    {(suggestions || mayControl) && <form className="online-room-track-form" onSubmit={event => void submit(event)}>
      <label>{label("Liên kết video YouTube", "YouTube video link")}<input type="url" maxLength={420} required value={link} onChange={event => setLink(event.target.value)} placeholder="https://youtu.be/…"/></label>
      <label>{label("Tên bài (không bắt buộc)", "Track title (optional)")}<input maxLength={96} value={title} onChange={event => setTitle(event.target.value)}/></label>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button type="submit" className="primary-button" disabled={busy || !link.trim()}><Plus size={16}/>{mayControl ? label("Thêm bài", "Add track") : label("Gửi đề xuất", "Suggest track")}</button>
    </form>}
    {!suggestions && !mayControl && <p className="online-room-muted">{label("Chỉ chủ phòng có thể thêm bài lúc này.", "Only the host can add tracks right now.")}</p>}
    <section><h2>{label("Sắp phát", "Up next")} <small>{queued.length}</small></h2>
      {!queued.length && <p className="online-room-muted">{label("Hàng đợi đang trống.", "The queue is empty.")}</p>}
      <ol>{queued.map((track, index) => <li key={track.id}><span className="online-room-queue-rank">{index + 1}</span><div><strong>{track.title}</strong><small>{track.name}</small></div>
        {mayControl && <><button type="button" className="icon-button" disabled={busy || index === 0} aria-label={`${label("Đưa lên", "Move up")} ${track.title}`} onClick={() => void run({ name: "queue_move", id: track.id, direction: "up" })}><ArrowUp size={15}/></button>
          <button type="button" className="icon-button" disabled={busy || index === queued.length - 1} aria-label={`${label("Đưa xuống", "Move down")} ${track.title}`} onClick={() => void run({ name: "queue_move", id: track.id, direction: "down" })}><ArrowDown size={15}/></button>
          <button type="button" className="icon-button" disabled={busy} aria-label={`${label("Bỏ bài", "Remove track")} ${track.title}`} onClick={() => void run({ name: "track_decision", id: track.id, decision: "remove" })}><X size={16}/></button></>}
      </li>)}</ol>
    </section>
    {pending.length > 0 && <section><h2>{label("Chờ duyệt", "Pending approval")}</h2><ul>{pending.map(track => <li key={track.id}><div><strong>{track.title}</strong><small>{track.name}</small></div>
      {mayControl && <><button type="button" className="icon-button" disabled={busy} aria-label={`${label("Duyệt", "Approve")} ${track.title}`} onClick={() => void run({ name: "track_decision", id: track.id, decision: "approve" })}><Check size={16}/></button>
        <button type="button" className="icon-button" disabled={busy} aria-label={`${label("Từ chối", "Reject")} ${track.title}`} onClick={() => void run({ name: "track_decision", id: track.id, decision: "remove" })}><X size={16}/></button></>}
    </li>)}</ul></section>}
  </div>;
}
