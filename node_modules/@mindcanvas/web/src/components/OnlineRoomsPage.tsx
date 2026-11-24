import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, BookOpen, DoorOpen, GraduationCap, Headphones, Lock, Plus, Radio, Search, Users, Video } from "lucide-react";
import Dialog from "./Dialog";
import OnlineMusicRoom from "./OnlineMusicRoom";
import { useLanguage } from "../lib/i18n";
import { useLearningActive } from "../lib/learningNavigation";
import { normalizeQuickSearch } from "../lib/learningCommands";
import { createOnlineRoom, listOnlineRooms, roomIssue, type OnlineRoom, type RoomCreate } from "../lib/onlineRooms";
import { captureOnlineRoomInvite, forgetOnlineRoomInvite, onlineRoomUrl, readOnlineRoomLink, type OnlineRoomLink } from "../lib/onlineRoomRoutes";
import "./onlineRooms.css";

type Props = { owner: string | null; onSignIn?: () => void };
type Filter = "all" | "official" | "mine" | "meeting" | "public" | "classroom";
const DEFAULT_ROOM: RoomCreate = { kind: "music", name: "", topic: "", visibility: "private", layout: "classroom", approve: true, suggestions: true };

export default function OnlineRoomsPage({ owner, onSignIn }: Props) {
  const { language, t } = useLanguage();
  const vi = language === "vi";
  const label = (vn: string, en: string) => vi ? vn : en;
  const active = useLearningActive();
  const [link, setLink] = useState<OnlineRoomLink | null>(() => readOnlineRoomLink());
  const [rooms, setRooms] = useState<OnlineRoom[]>([]);
  const [canCreatePublic, setCanCreatePublic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<unknown>(null);
  const [refresh, setRefresh] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<RoomCreate | null>(null);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const createBusy = useRef(false);
  const visible = useRef(active);
  visible.current = active;

  useEffect(() => {
    if (!active) { setLink(null); setDraft(null); return; }
    const sync = () => {
      const next = readOnlineRoomLink();
      captureOnlineRoomInvite();
      setLink(next);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [active]);
  useEffect(() => {
    if (!active || !owner || link) return;
    const controller = new AbortController();
    let inFlight = false;
    async function load() {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      try {
        const data = await listOnlineRooms(controller.signal);
        if (!controller.signal.aborted) { setRooms(data.rooms); setCanCreatePublic(data.can_create_public); setProblem(null); }
      } catch (err) {
        if (!controller.signal.aborted) setProblem(err);
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    const poll = window.setInterval(() => { if (document.visibilityState !== "hidden") void load(); }, 15000);
    return () => { window.clearInterval(poll); controller.abort(); };
  }, [active, owner, link, refresh]);

  const enter = (id: string) => {
    window.history.pushState({ ...window.history.state, mindcanvasFromRoomLobby: id }, "", onlineRoomUrl(id));
    setLink({ id });
  };
  const back = () => {
    if (link) forgetOnlineRoomInvite(link.id);
    const current = new URL(window.location.href);
    if (current.searchParams.get("learn") === "rooms") {
      if (window.history.state?.mindcanvasFromClass === link?.id) window.history.back();
      else if (window.history.state?.mindcanvasFromRoomLobby === link?.id) window.history.back();
      else window.history.replaceState(window.history.state, "", onlineRoomUrl(null));
    }
    setLink(null);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft?.name.trim() || createBusy.current) return;
    createBusy.current = true; setCreating(true); setFormError("");
    try {
      const id = await createOnlineRoom(draft);
      if (visible.current) { setDraft(null); enter(id); }
    } catch (err) { setFormError(roomIssue(err, vi)); }
    finally { createBusy.current = false; setCreating(false); }
  };
  const term = normalizeQuickSearch(query);
  const matches = rooms.filter(room => (filter !== "official" || room.official) && (filter !== "mine" || room.host_id === owner) && (filter !== "meeting" || room.kind === "meeting") && (filter !== "public" || room.visibility === "public") && (filter !== "classroom" || !!room.classroom_id)
    && (!term || normalizeQuickSearch(`${room.name} ${room.topic} ${room.host_name}`).includes(term)));

  if (!active) return null;
  if (owner && link) return <OnlineMusicRoom key={link.id} link={link} owner={owner} onBack={back} vi={vi} fromClass={window.history.state?.mindcanvasFromClass === link.id}/>;
  return <section className="online-rooms">
    <header className="online-rooms-hero">
      <div><span className="online-room-live-tag"><Radio size={15}/>{label("HỌC CÙNG NHAU", "STUDY TOGETHER")}</span>
        <h1>{label("Phòng Online", "Online Rooms")}</h1>
        <p>{link ? label("Bạn có lời mời vào một phòng. Đăng nhập để tiếp tục.", "You have a room invitation. Sign in to continue.")
          : label("Chọn một chỗ để nghe nhạc, học hoặc họp với mọi người.", "Take a seat to listen, study or meet with others.")}</p>
        {owner ? <button type="button" className="primary-button" onClick={() => { setFormError(""); setDraft(DEFAULT_ROOM); }}><Plus size={18}/>{label("Tạo phòng", "Create a room")}</button>
          : onSignIn && <button type="button" className="primary-button" onClick={onSignIn}><DoorOpen size={18}/>{label("Đăng nhập để vào phòng", "Sign in to join")}</button>}
      </div><div className="online-rooms-hero-art" aria-hidden="true"><span/><span/><Headphones size={88} strokeWidth={1.3}/></div>
    </header>
    {owner && <>
      <div className="online-rooms-directory-head"><h2>{label("Sảnh phòng", "Room lobby")}</h2>
        <label className="online-room-search"><Search size={16}/><input type="search" aria-label={label("Tìm phòng", "Search rooms")} placeholder={label("Tìm tên phòng…", "Find a room…")} value={query} onChange={event => setQuery(event.target.value)}/></label>
      </div>
      <div className="online-room-segment" role="group" aria-label={label("Lọc phòng", "Filter rooms")}>
        <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>{label("Tất cả", "All rooms")}</button>
        <button type="button" aria-pressed={filter === "official"} onClick={() => setFilter("official")}>{label("Phòng mở sẵn", "Official rooms")}</button>
        <button type="button" aria-pressed={filter === "meeting"} onClick={() => setFilter("meeting")}>{label("Phòng học / họp", "Study / Meeting")}</button>
        <button type="button" aria-pressed={filter === "public"} onClick={() => setFilter("public")}>{label("Công khai", "Public")}</button>
        <button type="button" aria-pressed={filter === "classroom"} onClick={() => setFilter("classroom")}>{label("Lớp học", "Classrooms")}</button>
        <button type="button" aria-pressed={filter === "mine"} onClick={() => setFilter("mine")}>{label("Phòng của bạn", "Your rooms")}</button>
      </div>
      {problem != null && <div className="online-room-feedback" role="status">{roomIssue(problem, vi)} <button type="button" className="secondary-button" onClick={() => setRefresh(value => value + 1)}>{t("retry")}</button></div>}
      {loading ? <p role="status" className="online-room-muted">{t("loading")}</p> : matches.length > 0 ? (
        <div className="online-room-card-grid">{matches.map(room => <article key={room.id} className="online-room-card" data-quiet={room.kind === "music" && !room.music_enabled} data-meeting={room.kind === "meeting"}>
          <div className="online-room-card-symbol">{room.kind === "meeting" ? <Video size={24}/> : room.music_enabled ? <Headphones size={24}/> : <BookOpen size={24}/>}</div>
          <div className="online-room-card-main"><span className="online-room-card-kind">{room.classroom_id ? <><GraduationCap size={13}/>{label("Chỉ thành viên lớp", "Class members only")}</> : room.official ? label("Mở sẵn", "Official") : room.visibility === "private" ? <><Lock size={12}/>{label("Phòng riêng", "Private")}</> : label("Công khai", "Public")}</span>
            {room.kind === "meeting" && <span className="online-room-card-kind">{label("Học / họp", "Study / Meeting")}</span>}<h3>{room.name}</h3><p>{room.topic || room.host_name}</p></div>
          <div className="online-room-card-count"><Users size={15}/><span>{room.occupancy}/{room.capacity}</span></div>
          <meter className="online-room-capacity" min={0} max={room.capacity} value={room.occupancy} aria-label={label("Số ghế đã có người", "Occupied seats")}/>
          <button type="button" className="secondary-button" onClick={() => enter(room.id)} aria-label={`${label("Vào", "Join")} ${room.name}`}>
            {room.occupancy >= room.capacity ? label("Đã đầy · Kiểm tra chỗ", "Full · Check seats") : label("Vào phòng", "Join room")}<ArrowRight size={16}/>
          </button>
        </article>)}</div>
      ) : problem == null && <p className="online-room-empty">{term ? label("Không tìm thấy phòng phù hợp.", "No matching rooms.") : label("Chưa có phòng trong mục này.", "No rooms in this section.")}</p>}
    </>}
    {draft && <Dialog title={label("Tạo phòng", "Create a room")} onClose={() => setDraft(null)} dismissible={!creating} workspace className="online-room-dialog">
      <form onSubmit={event => void save(event)} className="online-room-create-form">
        <label>{label("Loại phòng", "Room type")}<select value={draft.kind} onChange={event => {
          const kind = event.target.value as RoomCreate["kind"];
          setDraft({ ...draft, kind, layout: kind === "meeting" ? "table" : "classroom" });
        }}><option value="music">{label("Phòng nghe nhạc", "Music room")}</option><option value="meeting">{label("Phòng học / họp", "Study / Meeting room")}</option></select></label>
        <label>{label("Tên phòng", "Room name")}<input autoFocus required maxLength={64} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder={label("Ví dụ: Tập trung 45 phút", "For example: 45 minutes of focus")}/></label>
        <label>{label("Chủ đề", "Topic")}<input maxLength={160} value={draft.topic} onChange={event => setDraft({ ...draft, topic: event.target.value })} placeholder={label("Không bắt buộc", "Optional")}/></label>
        <label>{label("Kiểu hiển thị mặc định", "Default layout")}<select value={draft.layout} onChange={event => setDraft({ ...draft, layout: event.target.value as RoomCreate["layout"] })}>{draft.kind === "meeting" ? <option value="table">{label("Bàn họp nhìn từ trên", "Overhead meeting table")}</option> : <option value="classroom">{label("Lớp học Việt Nam", "Vietnamese classroom")}</option>}<option value="compact">{label("Gọn", "Compact")}</option></select></label>
        <label>{label("Ai có thể vào?", "Who can join?")}<select value={draft.visibility} onChange={event => setDraft({ ...draft, visibility: event.target.value as RoomCreate["visibility"] })}><option value="private">{label("Có lời mời", "By invitation")}</option>{canCreatePublic && <option value="public">{label("Công khai", "Public")}</option>}</select></label>
        {draft.visibility === "private" && <label className="online-room-check"><input type="checkbox" checked={draft.approve} onChange={event => setDraft({ ...draft, approve: event.target.checked })}/>{label("Chờ chủ phòng duyệt trước khi vào", "Wait for host approval before joining")}</label>}
        {draft.kind === "music" && <label className="online-room-check"><input type="checkbox" checked={draft.suggestions} onChange={event => setDraft({ ...draft, suggestions: event.target.checked })}/>{label("Cho phép thành viên đề xuất bài", "Allow track suggestions")}</label>}
        {formError && <p role="alert" className="form-error">{formError}</p>}
        <button type="submit" className="primary-button" disabled={creating || !draft.name.trim()}><Plus size={16}/>{creating ? t("loading") : label("Tạo và vào phòng", "Create and join")}</button>
      </form>
    </Dialog>}
  </section>;
}
