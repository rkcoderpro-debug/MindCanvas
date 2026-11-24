import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Flag, Gauge, Radio, RefreshCw, ShieldCheck } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { ApiError, getOnlineRoomAdmin, updateOnlineRoomAdmin, type OnlineRoomAdminData, type OnlineRoomAdminAction } from "../lib/api";
import { OnlineRoomError, roomIssue } from "../lib/onlineRooms";
import "./onlineRooms.css";

export default function AdminOnlineRooms() {
  const { language } = useLanguage();
  const vi = language === "vi", label = (vn:string,en:string) => vi ? vn : en;
  const [data,setData] = useState<OnlineRoomAdminData|null>(null), [busy,setBusy] = useState(false), [error,setError] = useState<unknown>(null);
  const [limits,setLimits] = useState({ open:20,public:6 }), [verified,setVerified] = useState(false);
  const [account,setAccount] = useState(""), [role,setRole] = useState<"public_host"|"moderator">("public_host");
  const [billing,setBilling] = useState({ gb:"",usd:"" });
  const running = useRef(false);
  const apply = useCallback((result:OnlineRoomAdminData) => {
    setData(result); setLimits({ open:result.open_limit,public:result.public_limit });
    setBilling(result.billing ? { gb:String(result.billing.downstream_gb),usd:String(result.billing.cost_usd) } : { gb:"",usd:"" }); setError(null);
  },[]);
  const load = useCallback(async (signal?:AbortSignal) => {
    if (running.current) return;
    try { const result = await getOnlineRoomAdmin(signal); if (!signal?.aborted) apply(result); }
    catch (cause) { if (!signal?.aborted) setError(cause); }
  },[apply]);
  useEffect(() => { const c = new AbortController(); void load(c.signal); return () => c.abort(); },[load]);
  async function change(action:OnlineRoomAdminAction) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(null);
    try { apply(await updateOnlineRoomAdmin(action)); if (action.op === "pilot") setVerified(false); }
    catch (cause) { setError(cause); }
    finally { running.current = false; setBusy(false); }
  }
  const messages:Record<string,string> = {
    spam:label("Spam","Spam"), harassment:label("Quấy rối","Harassment"),
    inappropriate:label("Nội dung không phù hợp","Inappropriate content"), other:label("Khác","Other"),
  };
  const format = new Intl.NumberFormat(vi ? "vi-VN" : "en",{ maximumFractionDigits:2 });
  const date = (value:string) => new Date(value).toLocaleString(vi ? "vi-VN" : "en",{ timeZone:"Asia/Ho_Chi_Minh" });
  const errText = (cause:unknown) => roomIssue(cause instanceof ApiError ? new OnlineRoomError(cause.code ?? "ONLINE_ROLLOUT_UNAVAILABLE") : cause,vi);
  const submitLimits = (event:FormEvent) => { event.preventDefault(); void change({ op:"limits",openLimit:limits.open,publicLimit:limits.public }); };
  return <div className="online-rollout-admin">
    <div className="online-rollout-head"><div><h2>{label("Quản trị Phòng Online","Online Rooms administration")}</h2><p>{label("Mở phòng theo đợt, cấp quyền điều phối và xử lý báo cáo.","Manage rollout, moderation roles and reports.")}</p></div>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => void load()}><RefreshCw size={15}/>{label("Làm mới","Refresh")}</button>
    </div>
    {error != null && <p role="alert" className="online-room-feedback">{errText(error)}</p>}
    {!data && error == null && <p role="status">{label("Đang tải quản trị phòng…","Loading room administration…")}</p>}
    {data && <>
      <div className="online-rollout-grid">
        <section className="learning-card">
          <h3><Gauge size={18}/>{label("Mức dùng LiveKit trong tháng","LiveKit usage this month")}</h3>
          <dl className="online-rollout-numbers"><div><dt>{label("Phút kết nối đã đo","Measured participant-minutes")}</dt><dd>{data.latest_webhook ? format.format(data.measured_minutes) : "—"}</dd></div>
          <div><dt>{label("Kết nối chưa có sự kiện kết thúc","Connections without an end event")}</dt><dd>{format.format(data.open_sessions)}</dd></div></dl>
          <p>{data.latest_webhook ? `${label("Nhận sự kiện gần nhất:","Latest event:")} ${date(data.latest_webhook)}` : label("Chưa nhận dữ liệu đo từ LiveKit.","No measurement events received from LiveKit.")}</p>
          <p>{label("Số phút tính từ các kết nối đã có mốc bắt đầu và kết thúc. Xem lượng dữ liệu truyền xuống, hạn mức và số tiền thực trả trong Usage/Billing của LiveKit.","Minutes come from connections with start and end times. Check downstream transfer, plan allowances and actual charges in LiveKit Usage/Billing.")}</p>
          <a className="secondary-button" href="https://cloud.livekit.io/" target="_blank" rel="noreferrer">{label("Mở LiveKit Cloud","Open LiveKit Cloud")}</a>
          <form onSubmit={event => { event.preventDefault(); if (billing.gb !== "" && billing.usd !== "") void change({ op:"billing",downstreamGb:Number(billing.gb),costUsd:Number(billing.usd) }); }}>
            <label>{label("Dữ liệu truyền xuống (GB) theo LiveKit","Downstream transfer (GB) from LiveKit")}<input type="number" min={0} max={10000000} step={0.001} required value={billing.gb} onChange={e => setBilling({ ...billing,gb:e.target.value })}/></label>
            <label>{label("Chi phí hiển thị tháng này (USD)","Charges shown this month (USD)")}<input type="number" min={0} max={10000000} step={0.0001} required value={billing.usd} onChange={e => setBilling({ ...billing,usd:e.target.value })}/></label>
            <button type="submit" className="secondary-button" disabled={busy}>{label("Lưu số liệu đối chiếu","Save billing figures")}</button>
            {data.billing && <p>{label("Đã lưu lúc","Saved at")} {date(data.billing.recorded_at)}</p>}
          </form>
        </section>
        <section className="learning-card">
          <h3><Radio size={18}/>{label("Thử nghiệm phòng công khai","Public room pilot")}</h3>
          <p>{data.pilot_enabled ? label("Đang cho phép mở phòng công khai mới.","New public rooms can be opened.") : label("Đang tạm ngưng mở phòng công khai mới.","Opening new public rooms is paused.")}</p>
          {!data.pilot_enabled && <label className="online-room-check"><input type="checkbox" checked={verified} disabled={!data.pilot_ready || !data.billing || busy} onChange={e => setVerified(e.target.checked)}/>{label("Tôi đã đối chiếu số liệu và chi phí trong Usage/Billing.","I reviewed usage and costs in Usage/Billing.")}</label>}
          {!data.pilot_enabled && !data.pilot_ready && <p>{label("Cần ít nhất một phiên LiveKit đã đo và hoàn tất trong 7 ngày qua.","A completed, measured LiveKit session within seven days is required.")}</p>}
          {!data.pilot_enabled && !data.billing && <p>{label("Cần lưu số liệu Usage/Billing của tháng này.","Save this month’s Usage/Billing figures first.")}</p>}
          <button type="button" className="primary-button" disabled={busy || (!data.pilot_enabled && (!data.pilot_ready || !data.billing || !verified))} onClick={() => void change({ op:"pilot",enabled:!data.pilot_enabled,verified })}>
            {data.pilot_enabled ? label("Tạm ngưng mở mới","Pause new public rooms") : label("Bật thử nghiệm","Enable pilot")}
          </button>
          <p>{label("Tạm ngưng chỉ chặn mở mới. Có thể đóng riêng từng phòng mẫu dưới đây. Hai phòng gốc vẫn hoạt động.","Pausing blocks new rooms. Close each preset individually below. The two original rooms stay available.")}</p>
          <ul className="online-rollout-list">{data.presets.map(room => <li key={room.id}><span><strong>{room.name}</strong><small>{room.open ? label("Đang mở","Open") : label("Đang đóng","Closed")}</small></span>
            <button type="button" className="secondary-button" disabled={busy || (!room.open && !data.pilot_enabled)} onClick={() => void change({ op:"preset",target:room.id,enabled:!room.open })}>{room.open ? label("Đóng phòng","Close room") : label("Mở phòng","Open room")}</button></li>)}</ul>
        </section>
        <form className="learning-card" onSubmit={submitLimits}>
          <h3><Gauge size={18}/>{label("Giới hạn phòng đồng thời","Concurrent room limits")}</h3>
          <p>{data.open_count}/{data.open_limit} {label("phòng đang mở","open rooms")} · {data.public_count}/{data.public_limit} {label("công khai","public")}</p>
          <label>{label("Tổng phòng","Total rooms")}<input type="number" required min={1} max={100} value={limits.open} onChange={e => setLimits({ ...limits,open:Number(e.target.value) })}/></label>
          <label>{label("Phòng công khai","Public rooms")}<input type="number" required min={1} max={Math.min(25,limits.open)} value={limits.public} onChange={e => setLimits({ ...limits,public:Number(e.target.value) })}/></label>
          <button className="primary-button" disabled={busy} type="submit">{label("Lưu giới hạn","Save limits")}</button>
          <p>{label("Không tính hai phòng gốc. Hạ giới hạn sẽ chặn mở mới, không tự đóng phòng đang dùng.","The two original rooms are excluded. Lower limits block new rooms and leave existing rooms open.")}</p>
        </form>
        <section className="learning-card">
          <h3><ShieldCheck size={18}/>{label("Quyền phòng công khai","Public room permissions")}</h3>
          <form onSubmit={event => { event.preventDefault(); void change({ op:role,target:account.trim(),enabled:true }); }}>
            <label>{label("ID tài khoản","Account ID")}<input required placeholder="UUID" value={account} onChange={event => setAccount(event.target.value)} maxLength={38}/></label>
            <label>{label("Quyền","Permission")}<select value={role} onChange={event => setRole(event.target.value as typeof role)}>
              <option value="public_host">{label("Tạo phòng công khai khi thử nghiệm","Create public rooms during pilot")}</option>
              <option value="moderator">{label("Điều phối phòng mở sẵn","Moderate official rooms")}</option>
            </select></label>
            <button type="submit" className="primary-button" disabled={busy || !/^[0-9a-f-]{36}$/i.test(account.trim())}>{label("Cấp quyền","Grant")}</button>
          </form>
          <ul className="online-rollout-list">{([{ op:"public_host",users:data.public_hosts },{ op:"moderator",users:data.moderators }] as const).flatMap(({ op,users }) => users.map(target => <li key={`${op}:${target}`}><span><small>{op === "moderator" ? label("Điều phối","Moderator") : label("Chủ phòng","Public host")}</small><code>{target}</code></span>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => void change({ op,target,enabled:false })}>{label("Thu hồi","Revoke")}</button></li>))}</ul>
        </section>
      </div>
      <section className="learning-card">
        <h3><Flag size={18}/>{label("Báo cáo cần xử lý","Reports to review")} ({data.reports.length})</h3>
        {!data.reports.length && <p>{label("Không có báo cáo đang chờ.","No pending reports.")}</p>}
        <ul className="online-rollout-list">{data.reports.map(report => <li key={report.id} className="online-rollout-report">
          <div><strong>{report.room_name} · {messages[report.reason]}</strong><small>{date(report.filed_at)}</small>
            {report.message_excerpt && <blockquote>{report.message_excerpt}</blockquote>}{report.detail && <p>{report.detail}</p>}</div>
          <div className="online-room-actions">
            {report.can_remove && <button type="button" className="secondary-button" disabled={busy} onClick={() => {
              if (window.confirm(label("Gỡ tin nhắn khỏi phòng và đánh dấu báo cáo đã xử lý?","Remove the message and mark this report resolved?"))) void change({ op:"remove_reported_message",target:report.id });
            }}>{label("Gỡ tin nhắn","Remove message")}</button>}
            <button type="button" className="secondary-button" disabled={busy} onClick={() => void change({ op:"resolve_report",target:report.id })}>{label("Đã xử lý","Resolve")}</button>
            <button type="button" className="text-button" disabled={busy} onClick={() => void change({ op:"dismiss_report",target:report.id })}>{label("Bỏ qua","Dismiss")}</button>
          </div>
        </li>)}</ul>
      </section>
    </>}
  </div>;
}
