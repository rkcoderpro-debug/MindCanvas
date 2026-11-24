import { useEffect, useRef, useState } from "react";
import { ArrowRight, Lock, Video } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { useLearningActive } from "../lib/learningNavigation";
import { classroomOnlineRoom, roomIssue, type OnlineRoom } from "../lib/onlineRooms";

export default function ClassOnlineRoomCard({ classId,teacher,onEnter }: { classId:string; teacher:boolean; onEnter:(id:string)=>void }) {
  const { language } = useLanguage();
  const vi = language === "vi", label = (a:string,b:string) => vi ? a : b;
  const active = useLearningActive();
  const [room,setRoom] = useState<OnlineRoom|null>(null), [loading,setLoading] = useState(true);
  const [error,setError] = useState<unknown>(null), [refresh,setRefresh] = useState(0), [busy,setBusy] = useState(false);
  const inFlight = useRef(false), activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let polling = false;
    setLoading(true);
    const load = async () => {
      if (inFlight.current || polling) return;
      polling = true;
      try {
        const data = await classroomOnlineRoom(classId,false,controller.signal);
        if (!controller.signal.aborted) { setRoom(data.room); setError(null); }
      } catch (cause) { if (!controller.signal.aborted) setError(cause); }
      finally { polling = false; if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState !== "hidden") void load(); },12000);
    return () => { controller.abort(); window.clearInterval(timer); };
  },[classId,active,refresh]);
  async function enter() {
    if (inFlight.current) return;
    if (room) { onEnter(room.id); return; }
    if (!teacher) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const result = await classroomOnlineRoom(classId,true);
      if (activeRef.current && result.room) onEnter(result.room.id);
    } catch (cause) { if (activeRef.current) setError(cause); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="learning-card classrooms-online-room">
    <h3><Video size={18}/>{label("Phòng Online của lớp","Class online room")}</h3>
    <p><Lock size={14}/>{label("Chỉ giáo viên và học sinh đang tham gia lớp mới vào được phòng.","Only the teacher and currently enrolled students can join.")}</p>
    {room && <p role="status">{room.occupancy}/{room.capacity} {label("chỗ đang dùng","seats in use")}</p>}
    {loading && <p role="status">{label("Đang kiểm tra phòng…","Checking room…")}</p>}
    {!loading && !error && !room && !teacher && <p>{label("Giáo viên chưa mở phòng.","Your teacher has not opened the room.")}</p>}
    {error != null && <p role="alert">{roomIssue(error,vi)} <button type="button" className="text-button" onClick={() => setRefresh(v => v+1)}>{label("Kiểm tra lại","Check again")}</button></p>}
    {(room || (teacher && !loading)) && <button type="button" className="primary-button" disabled={busy || loading} onClick={() => void enter()}>
      {room ? label("Vào phòng của lớp","Join class room") : busy ? label("Đang mở…","Opening…") : label("Mở phòng cho lớp","Open class room")}<ArrowRight size={16}/>
    </button>}
  </section>;
}
