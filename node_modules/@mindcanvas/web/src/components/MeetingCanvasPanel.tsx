import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eye, EyeOff, Layout, Pencil, Plus, RefreshCw } from "lucide-react";
import type { BoardState } from "@mindcanvas/shared";
import CanvasBoard from "./CanvasBoard";
import A4CanvasEditor from "./A4CanvasEditor";
import { blankBoard, exportBoard } from "../lib/board";
import { newA4Layout } from "../lib/a4Canvas";
import { fetchProjects, fetchProjectSnapshot, type Project } from "../lib/projectStore";
import { OnlineRoomError, roomIssue, type RoomCanvasAction, type RoomCanvasResult, type RoomCanvasSummary } from "../lib/onlineRooms";
import { meetingBoardCopy, mergeRoomBoard, sameRoomBoard } from "../lib/roomCanvas";

type Props = {
  owner: string; roomId: string; host: boolean; vi: boolean; visible: boolean; updateSignal: number;
  request: (action: RoomCanvasAction) => Promise<RoomCanvasResult>;
};
type Draft = { base: BoardState; board: BoardState };
const initialViewport = { x:0,y:0,scale:1 };
const noop = () => {};

export default function MeetingCanvasPanel({ owner, roomId, host, vi, visible, updateSignal, request }: Props) {
  const label = (vn: string,en: string) => vi ? vn : en;
  const latest = useRef<{ meta: RoomCanvasSummary | null; board: BoardState | null }>({ meta:null, board:null });
  const editorRoot = useRef<HTMLDivElement>(null), pointers = useRef(new Set<number>());
  const adjusting = () => pointers.current.size > 0 || Boolean(editorRoot.current?.contains(document.activeElement) &&
    document.activeElement?.matches("textarea, input:not([type=range]):not([type=checkbox]), [contenteditable=true]"));
  const saving = useRef<Draft | null>(null);
  const pending = useRef<Draft | null>(null), active = useRef(true), lock = useRef(false), blocked = useRef(false);
  const [canvas, setCanvas] = useState<RoomCanvasSummary | null>(null);
  const [board, setBoard] = useState<BoardState | null>(null);
  const [viewport, setViewport] = useState(initialViewport);
  const [dirty, setDirty] = useState(0), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null), [conflicted, setConflict] = useState(false);
  const [projects, setProjects] = useState<Project[] | null>(null), [project, setProject] = useState(""), [loading, setLoading] = useState(false);
  const updateView = useCallback(() => {
    setCanvas(latest.current.meta);
    setBoard(pending.current?.board ?? latest.current.board);
    setDirty(n => n + 1);
  }, []);

  const apply = useCallback((value: RoomCanvasResult) => {
    if (!active.current || value.state !== "active" || !("canvas" in value)) return;
    const meta = value.canvas ?? null;
    if (!meta) {
      latest.current = { meta:null,board:null };
      if (pending.current) { blocked.current = true; setConflict(true); }
    } else {
      if (latest.current.meta && latest.current.meta.revision > meta.revision) return;
      const board = meta.board !== undefined ? meetingBoardCopy(meta.board,roomId) : latest.current.board;
      latest.current = { meta: { ...meta, board:undefined },board };
      if (pending.current && board) {
        if (!meta.can_edit) { blocked.current = true; setConflict(true); }
        else if (!blocked.current) {
          const merged = mergeRoomBoard(pending.current.base,pending.current.board,board);
          if (merged) pending.current = sameRoomBoard(merged,board) ? null : { base:board,board:merged };
          else { blocked.current = true; setConflict(true); }
        }
      }
    }
    updateView();
  },[roomId,updateView]);
  const refresh = useCallback(async (strict = false) => {
    if (lock.current || !active.current) return;
    lock.current = true;
    try {
      const value = await request({ op:"read",revision:latest.current.meta?.revision });
      if (!active.current) return;
      const before = latest.current.meta;
      // The editor's drag and inline text gestures commit a snapshot. Don't
      // change that snapshot underneath a gesture, but apply revoked access now.
      if (adjusting() && value.state === "active" && value.canvas?.board !== undefined &&
        before && before.revision !== value.canvas.revision && before.can_edit === value.canvas.can_edit && before.on_stage === value.canvas.on_stage) return;
      const previousRevision = before?.revision;
      apply(value); setReady(true);
      if (!blocked.current && (!pending.current || latest.current.meta?.revision !== previousRevision)) setError(null);
    } catch (cause) {
      if (active.current && (strict || !latest.current.meta)) setError(cause);
    } finally { lock.current = false; }
  },[apply,request]);
  useEffect(() => {
    active.current = true;
    const unload = (event: BeforeUnloadEvent) => { if (pending.current) { event.preventDefault(); event.returnValue = ""; } };
    const release = (event: PointerEvent) => { pointers.current.delete(event.pointerId); };
    const clear = () => pointers.current.clear();
    window.addEventListener("pointerup",release); window.addEventListener("pointercancel",release); window.addEventListener("blur",clear);
    window.addEventListener("beforeunload",unload);
    return () => {
      active.current = false;
      window.removeEventListener("beforeunload",unload); window.removeEventListener("pointerup",release);
      window.removeEventListener("pointercancel",release); window.removeEventListener("blur",clear);
    };
  },[]);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(),80);
    return () => window.clearTimeout(timer);
  },[updateSignal,refresh]);
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState !== "hidden") void refresh(); },3300);
    window.addEventListener("online",resume);
    function resume() { void refresh(true); }
    return () => { window.clearInterval(id); window.removeEventListener("online",resume); };
  },[refresh]);

  const flush = useCallback(async () => {
    const draft = pending.current, meta = latest.current.meta;
    if (!draft || !meta?.can_edit || blocked.current || lock.current) return;
    lock.current = true; saving.current = draft; setBusy(true); setError(null);
    try {
      const result = await request({ op:"save",revision:meta.revision,board:draft.board });
      if (!active.current || result.state !== "active") return;
      if (result.conflict) {
        if (!adjusting()) apply(await request({ op:"read" }));
      } else if (result.canvas) {
        // The response acknowledges this exact draft. Rebase any input
        // committed by the local editor while the request was in flight.
        const newer = pending.current;
        pending.current = newer && newer !== draft && !sameRoomBoard(draft.board,newer.board) ? { base:draft.board,board:newer.board } : null;
        latest.current = { meta: result.canvas,board:draft.board };
        updateView();
      }
    } catch (cause) {
      if (!active.current) return;
      setError(cause);
      if (cause instanceof OnlineRoomError && cause.issue === "ONLINE_CANVAS_READ_ONLY") {
        try { apply(await request({ op:"read" })); } catch { /* keep the draft */ }
      }
    } finally {
      saving.current = null; lock.current = false;
      if (active.current) setBusy(false);
    }
  },[apply,request,updateView]);
  useEffect(() => {
    if (!pending.current || blocked.current || busy || error) return;
    const id = window.setTimeout(() => { if (lock.current) setDirty(n => n+1); else void flush(); },850);
    return () => window.clearTimeout(id);
  },[dirty,busy,error,flush]);

  const edit = (next: BoardState) => {
    const base = pending.current?.base ?? latest.current.board;
    if (!base || !latest.current.meta?.can_edit || blocked.current) return;
    try {
      const local = meetingBoardCopy({ ...next,updatedAt:new Date().toISOString() },roomId);
      pending.current = !saving.current && sameRoomBoard(base,local) ? null : { base,board:local };
      setError(null); updateView();
    } catch { setError(new OnlineRoomError("ONLINE_INPUT")); }
  };
  const command = async (action: RoomCanvasAction) => {
    if (lock.current || pending.current) return;
    lock.current = true; setBusy(true); setError(null);
    try { apply(await request(action)); setReady(true); }
    catch (cause) { if (active.current) setError(cause); }
    finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  };
  const choose = async () => {
    setLoading(true); setError(null);
    try {
      const rows = (await fetchProjects(owner)).filter(item => !item.deletedAt && item.ownerId === owner && !item.shared);
      if (active.current) setProjects(rows);
    } catch (cause) { if (active.current) setError(cause); }
    finally { if (active.current) setLoading(false); }
  };
  const attach = async () => {
    setLoading(true); setError(null);
    try {
      const source = await fetchProjectSnapshot(owner,project);
      if (!active.current) return;
      if (source.ownerId !== owner || source.deletedAt || source.shared) throw new OnlineRoomError("ONLINE_INPUT");
      await command({ op:"start",board:meetingBoardCopy(source.board,roomId) });
    } catch (cause) { if (active.current) setError(cause); }
    finally { if (active.current) setLoading(false); }
  };
  const start = (a4: boolean) => {
    const source = blankBoard(label("Canvas phòng họp","Meeting Canvas"));
    if (a4) source.a4 = newA4Layout();
    void command({ op:"start",board:meetingBoardCopy(source,roomId) });
  };
  const discard = () => {
    pending.current = null; blocked.current = false; setConflict(false); setError(null); updateView();
    void refresh(true);
  };
  const rendered = canvas?.on_stage && board ? { ...board,viewport } : null;
  const Editor = rendered?.a4 ? A4CanvasEditor : CanvasBoard;
  return <section className="meeting-canvas" hidden={!visible} aria-label={label("Canvas phòng họp","Meeting Canvas")}>
    <div className="meeting-canvas-head">
      <div><strong>{canvas?.title ?? label("Canvas phòng họp","Meeting Canvas")}</strong>
        {canvas?.on_stage && <small>{canvas.can_edit && !conflicted ? label("Có thể sửa","Can edit") : label("Chỉ xem","View only")}
          {pending.current ? " · " + label("Chưa lưu","Unsaved") : " · " + label("Đã đồng bộ","Synced")}</small>}</div>
      {host && canvas?.on_stage && <>
        <button type="button" className="secondary-button" disabled={busy || !!pending.current} aria-pressed={canvas.allow_edit} onClick={() => void command({ op:"permission",flag:!canvas.allow_edit })}><Pencil size={15}/>{canvas.allow_edit ? label("Khóa quyền sửa","Restrict editing") : label("Cho thành viên sửa","Allow members to edit")}</button>
        <button type="button" className="secondary-button" disabled={busy || !!pending.current} onClick={() => void command({ op:"stage",flag:false })}><EyeOff size={15}/>{label("Gỡ khỏi bàn","Hide from table")}</button>
      </>}
      {rendered && <button type="button" className="secondary-button" disabled={busy} title={label("Tải Canvas","Download Canvas")} onClick={() => exportBoard(rendered)}><Download size={15}/>{label("Tải Canvas","Download Canvas")}</button>}
    </div>
    {error != null && <p className="online-room-feedback" role="alert">{roomIssue(error,vi)}
      <button type="button" className="text-button" disabled={busy} onClick={() => pending.current && !conflicted ? void flush() : void refresh(true)}><RefreshCw size={14}/>{label("Thử lại","Retry")}</button></p>}
    {conflicted && pending.current && <div className="online-room-feedback" role="status">
      <p>{label("Bản nháp chưa được lưu vì quyền sửa hoặc nội dung đã đổi. Bạn có thể tải bản nháp trước khi dùng bản trong phòng.","Your draft was not saved because access or content changed. Download your draft before using the room version.")}</p>
      <button type="button" className="secondary-button" onClick={() => pending.current && exportBoard(pending.current.board)}>{label("Tải bản nháp","Download draft")}</button>
      <button type="button" className="secondary-button" onClick={discard}>{label("Dùng bản trong phòng","Use room version")}</button>
    </div>}
    {visible && rendered ? <div ref={editorRoot} className="meeting-canvas-editor" onPointerDownCapture={event => pointers.current.add(event.pointerId)}>
      <Editor board={rendered} readOnly={!canvas?.can_edit || conflicted} roomMode onChange={edit} onViewportChange={next => setViewport(next.viewport)} onUndo={noop} onRedo={noop} onSave={() => void flush()}/>
    </div> : !ready ? <p role="status">{label("Đang tải Canvas…","Loading Canvas…")}</p> : host ? <div className="meeting-canvas-start">
      {canvas ? <button type="button" className="primary-button" disabled={busy || !!pending.current} onClick={() => void command({ op:"stage",flag:true })}><Eye size={16}/>{label("Đưa Canvas trở lại bàn","Show Canvas on the table")}</button> : <>
        <p>{label("Tạo Canvas trống hoặc dùng bản sao từ Workspace. Bản sao giữ nét vẽ, chữ, sơ đồ và trang A4; tệp đa phương tiện và liên kết nhúng không đi theo.","Start a blank Canvas or copy one from Workspace. The copy keeps drawings, text, maps and A4 pages; media and embeds are omitted.")}</p>
        <div><button type="button" className="primary-button" disabled={busy || loading} onClick={() => start(false)}><Plus size={15}/>{label("Canvas trống","Blank Canvas")}</button>
          <button type="button" className="secondary-button" disabled={busy || loading} onClick={() => start(true)}><Plus size={15}/>A4</button>
          {projects === null && <button type="button" className="secondary-button" disabled={busy || loading} onClick={() => void choose()}><Layout size={15}/>{label("Chọn từ Workspace","Choose from Workspace")}</button>}</div>
        {projects && (projects.length ? <div><select aria-label={label("Canvas từ Workspace","Workspace Canvas")} value={project} onChange={e => setProject(e.target.value)}>
          <option value="">{label("Chọn Canvas của bạn","Select one of your Canvases")}</option>{projects.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select>
          <button type="button" className="secondary-button" disabled={!project || busy || loading} onClick={() => void attach()}>{label("Gắn bản sao","Attach a copy")}</button></div> : <p>{label("Bạn chưa có Canvas trên Workspace.","You don't have a Canvas in Workspace yet.")}</p>)}
      </>}
    </div> : <p>{label("Chủ phòng chưa đưa Canvas lên bàn.","The host hasn’t put a Canvas on the table.")}</p>}
  </section>;
}
