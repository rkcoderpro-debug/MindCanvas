import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, BookOpen, ChevronRight, File, FileText, Folder, Link2, LogIn, Pencil, RefreshCw, Upload } from "lucide-react";
import type { BoardState } from "@mindcanvas/shared";
import { useLanguage } from "../lib/i18n";
import { unpackCloudCanvas } from "../lib/canvasCloudMedia";
import { parseBoard } from "../lib/board";
import { shareCanvasAsset, shareChallenge, shareDownload, shareEdit, shareErrorText, shareOpen, shareSaveCanvas, shareSubmit, shareUpload, shareVerify, type ShareItem, type ShareView, type SharedCard } from "../lib/workspaceSharing";
import { sharedInboxUrl, SHARED_ROUTE_EVENT, workspaceShareTarget,workspaceShareUrl } from "../lib/workspaceShareLinks";
import SharedDocumentReader from "./SharedDocumentReader";
import FlashcardReview from "./FlashcardReview";
import QuizRunner, { QuizResult } from "./QuizRunner";
import FormulaText from "./FormulaText";
import { cleanLabViewer } from "../lib/labModes";
import "./workspaceSharing.css";

const CanvasBoard = lazy(()=>import("./CanvasBoard"));
const A4CanvasEditor = lazy(()=>import("./A4CanvasEditor"));
const LabViewer = lazy(()=>import("./LabViewer"));
type Resource=Extract<ShareView,{state:"ok"}>;
type StateByKind<K extends Resource["kind"]>=Extract<Resource,{kind:K}>;
type Tr=(vi:string,en:string)=>string;
type Context={token:string;editable:boolean;tr:Tr;pending:boolean;act:(fn:()=>Promise<unknown>,refresh?:boolean)=>void;loadItem:(item:ShareItem)=>void};
const noop=()=>{};
const fileIcons={folder:Folder,learning_folder:Folder,file:File,canvas:FileText,quiz:FileText,flashcard:BookOpen,lab:FileText};
const typeName=(tr:Tr,kind:ShareItem["kind"])=>({folder:tr("Thư mục","Folder"),file:tr("Tài liệu","File"),canvas:"Canvas",quiz:"Quiz",flashcard:"Flashcard",learning_folder:tr("Thư mục học liệu","Study folder"),lab:"Lab"})[kind];

function shareTrail(): ShareItem[] {
  const target = workspaceShareTarget();
  if (!target) return [];
  const saved = window.history.state?.mindcanvasSharedTrail as ShareItem[] | undefined;
  return saved?.at(-1)?.id === target.id && saved?.at(-1)?.kind === target.kind
    ? saved : [{ ...target, title: "…" }];
}

export default function WorkspaceSharedPage({token,signedIn,onSignIn,loginError,inWorkspace=false}:{token:string;signedIn:boolean;onSignIn:()=>void;loginError?:string;inWorkspace?:boolean}){
  const {language,t}=useLanguage(),vi=language==="vi",tr:Tr=(v,e)=>vi?v:e;
  const [trail,setTrail]=useState(shareTrail);
  useEffect(()=>{
    const sync = () => setTrail(shareTrail());
    window.addEventListener("popstate",sync);
    window.addEventListener("hashchange",sync);
    return () => {
      window.removeEventListener("popstate",sync);
      window.removeEventListener("hashchange",sync);
    };
  },[]);
  const [state,setState]=useState<ShareView|null>(null),[loading,setLoading]=useState(true),[sequence,setSequence]=useState(0);
  const [error,setError]=useState(""),[pending,setPending]=useState(false),[sent,setSent]=useState(false),[code,setCode]=useState("");
  const target=trail.at(-1);
  const lock=useRef(false);
  const reload=()=>setSequence(n=>n+1);
  useEffect(()=>{
    const abort=new AbortController();
    setLoading(true);setState(null);setError("");
    void shareOpen(token,target,abort.signal).then(value=>{if(!abort.signal.aborted)setState(value);})
      .catch(err=>{if(!abort.signal.aborted)setError(shareErrorText(err,vi));})
      .finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();
  },[token,target?.kind,target?.id,signedIn,sequence,vi]);
  const act:Context["act"]=(fn,refresh=false)=>{
    if(lock.current)return;
    lock.current=true;setPending(true);setError("");
    void Promise.resolve().then(fn).then(()=>{if(refresh)reload();}).catch(err=>setError(shareErrorText(err,vi))).finally(()=>{lock.current=false;setPending(false);});
  };
  const move = (items: ShareItem[], closer = false) => {
    if (pending || (items.at(-1)?.id === target?.id && items.at(-1)?.kind === target?.kind)) return;
    const depth = Number(window.history.state?.mindcanvasSharedFolderDepth) || 0;
    const steps = trail.length - items.length;
    if (closer && steps > 0 && steps <= depth) {
      window.history.go(-steps);
      return;
    }
    const next = workspaceShareUrl(token, items.at(-1));
    setState(null);
    setTrail(items);
    const state = { ...window.history.state, mindcanvasSharedTrail: items,
      mindcanvasSharedFolderDepth: closer ? 0 : depth + 1 };
    window.history[closer ? "replaceState" : "pushState"](state, "", next);
    window.dispatchEvent(new Event(SHARED_ROUTE_EVENT));
  };
  const navigate = (item: ShareItem) => move([...trail.map((entry, index) =>
    index === trail.length - 1 && state?.state === "ok" ? { ...entry, title: state.title } : entry), item]);
  const editable=!!(signedIn && state?.state==="ok" && ["owner","editor"].includes(state.role));
  const ctx:Context={token,editable,tr,pending,act,loadItem:navigate};
  const login=<button type="button" className="primary-button" onClick={onSignIn}><LogIn size={16}/>{tr("Đăng nhập để chỉnh sửa","Sign in to edit")}</button>;
  const Container = inWorkspace ? "section" : "main";
  return <Container className={`workspace-share-view${inWorkspace ? " in-workspace" : ""}`} aria-label={tr("Nội dung chia sẻ", "Shared content")}>
    {!inWorkspace && <div className="workspace-share-top"><a href={window.location.pathname}><ArrowLeft size={16}/> MindCanvas</a><Link2 size={15}/>{tr("Nội dung chia sẻ","Shared content")}
      {signedIn && <a href={sharedInboxUrl().href}>{t("sharedWithMe")}</a>}
    </div>}
    {trail.length>0 && <nav className="workspace-share-crumbs" aria-label={tr("Đường dẫn","Path")}>
      <button type="button" disabled={pending} onClick={()=>move([], true)}>{tr("Mục được chia sẻ","Shared item")}</button>
      {trail.map((item,index)=><span key={item.id}><ChevronRight size={14} aria-hidden="true"/>
        {index===trail.length-1 ? <span aria-current="page">{state?.state==="ok" ? state.title : item.title}</span>
          : <button type="button" disabled={pending} onClick={()=>move(trail.slice(0,index+1), true)}>{item.title}</button>}
      </span>)}
    </nav>}
    {loading ? <p role="status">{t("loading")}</p>:state?.state==="verify"?<section className="workspace-share-block">
      <h1>{tr("Xác minh email để xem","Verify your email to view")}</h1>
      <p>{tr("Mã chỉ được gửi đến địa chỉ ghi trong lời mời. Bạn không cần tài khoản MindCanvas.","The code goes only to the invited email address. You do not need a MindCanvas account.")}</p>
      <button type="button" className="secondary-button" disabled={pending} onClick={()=>act(async()=>{await shareChallenge(token);setSent(true);})}>{tr(sent?"Gửi lại mã":"Gửi mã xác minh",sent?"Resend code":"Send verification code")}</button>
      <button type="button" className="secondary-button" onClick={onSignIn}>{tr("Hoặc đăng nhập bằng email được mời","Or sign in with the invited email")}</button>
      {sent && <p role="status">{tr("Mã có hiệu lực trong 10 phút.","The code is valid for 10 minutes.")}</p>}
      <form onSubmit={e=>{e.preventDefault();act(()=>shareVerify(token,code),true);}}>
        <label>{tr("Mã 6 chữ số","Six-digit code")}<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" value={code} onChange={e=>setCode(e.target.value.slice(0,6))} required maxLength={6}/></label>
        <button className="primary-button" disabled={pending}>{tr("Xác minh","Verify")}</button>
      </form>
    </section>:state?.state==="sign-in"?<section className="workspace-share-block">
      {state.audience==="friend" ? <>
        <h1>{tr("Đăng nhập để mở tài liệu","Sign in to open the file")}</h1>
        <p>{tr("Hãy dùng tài khoản MindCanvas mà người gửi đã chọn.","Use the MindCanvas account selected by the sender.")}</p>
        <button type="button" className="primary-button" onClick={onSignIn}><LogIn size={16}/>{t("login")}</button>
      </> : <>
        <h1>{tr("Cần đăng nhập bằng email được mời","Sign in with the invited email")}</h1>
        <p>{tr("Chỉ tài khoản khớp địa chỉ nhận lời mời mới được chỉnh sửa.","Only the account matching the invitation can edit.")}</p>
        {login}
      </>}
    </section>:state?.state==="ok"?<>
      <header className="workspace-share-main-heading"><div><span className="eyebrow">{typeName(tr,state.kind)} · {editable?tr("Có thể chỉnh sửa","Can edit"):tr("Chỉ xem","View only")}</span><h1>{state.title}</h1></div>
        {state.signInToEdit && login}
        {!signedIn && !state.signInToEdit && <button type="button" className="secondary-button" onClick={onSignIn}><LogIn size={16}/>{tr("Đăng nhập để lưu vào mục chia sẻ", "Sign in to keep this in Shared with me")}</button>}
        <button className="secondary-button" type="button" disabled={pending} onClick={reload}><RefreshCw size={16}/>{tr("Mở lại","Reload")}</button>
      </header>
      {state.kind==="folder"&&<SharedFolder key={state.id} item={state} ctx={ctx}/>}
      {state.kind==="learning_folder" && <SharedItems items={state.data} ctx={ctx}/>}
      {state.kind==="lab" && <Suspense fallback={<p role="status">{t("loading")}</p>}><LabViewer
        key={state.id} html={state.data.html} title={state.title} allowExternalResources={state.data.allowExternalResources}
        viewerConfig={cleanLabViewer(state.data.viewerConfig)}/></Suspense>}
      {state.kind==="file"&&<SharedFile key={state.id} item={state} ctx={ctx}/>}
      {state.kind==="canvas"&&<SharedCanvas key={state.id} item={state} ctx={ctx}/>}
      {state.kind==="quiz"&&<SharedQuiz key={state.id} item={state} ctx={ctx}/>}
      {state.kind==="flashcard"&&<SharedFlashcards key={state.id} item={state} ctx={ctx}/>}
    </>:<div className="workspace-share-block"><h1>{tr("Không mở được nội dung chia sẻ","Could not open shared content")}</h1>
      <button type="button" className="secondary-button" onClick={reload}><RefreshCw size={16}/>{t("retry")}</button>
    </div>}
    {pending && <p role="status">{t("loading")}</p>}
    {(error||loginError) && <p className="form-error" role="alert">{error||loginError}</p>}
  </Container>;
}

function SharedItems({items,ctx}:{items:ShareItem[];ctx:Context}){
  return items.length ? <ul className="workspace-shared-items">{items.map(item=>{
    const Icon = fileIcons[item.kind];
    return <li key={item.kind + item.id}><button type="button" aria-label={item.title} disabled={ctx.pending} onClick={() => ctx.loadItem(item)}>
      <Icon size={18} aria-hidden="true"/><span>{item.title}<small>{typeName(ctx.tr,item.kind)}</small></span><ChevronRight size={15} aria-hidden="true"/>
    </button></li>;
  })}</ul>:<p>{ctx.tr("Chưa có nội dung.","No items here.")}</p>;
}
function Rename({item,ctx,op="rename"}:{item:Resource;ctx:Context;op?:"rename"|"mkdir"}){
  const [name,setName]=useState(op==="rename"?item.title:"");
  return <form className="workspace-share-block" onSubmit={e=>{e.preventDefault();ctx.act(()=>shareEdit(ctx.token,item,op,{title:name}),true);}}>
    <label>{op==="mkdir"?ctx.tr("Tên thư mục con","Subfolder name"):ctx.tr("Tên mới","New name")}<input value={name} onChange={e=>setName(e.target.value)} maxLength={item.kind==="file"?255:item.kind==="flashcard"?120:80} required/></label>
    <button className="secondary-button" disabled={ctx.pending}>{op==="mkdir"?ctx.tr("Tạo thư mục con","Create subfolder"):ctx.tr("Đổi tên","Rename")}</button>
  </form>;
}
function SharedFolder({item,ctx}:{item:StateByKind<"folder">;ctx:Context}){
  return <><SharedItems items={item.data} ctx={ctx}/>
    {ctx.editable&&<><Rename item={item} ctx={ctx}/><Rename item={item} ctx={ctx} op="mkdir"/>
      <label className="workspace-share-block">{ctx.tr("Tải tệp lên thư mục","Upload a file to this folder")}<input type="file" disabled={ctx.pending} onChange={event=>{
        const file=event.currentTarget.files?.[0];event.currentTarget.value="";
        if(file)ctx.act(()=>shareUpload("add-file",item.id,file,file.name,{token:ctx.token}),true);
      }}/></label></>}
  </>;
}
function SharedFile({item,ctx}:{item:StateByKind<"file">;ctx:Context}){
  const {token,tr,act}=ctx;
  const load = useCallback((signal?: AbortSignal) => shareDownload(token, { kind: "file", id: item.id }, signal), [token, item.id]);
  return <>
    <SharedDocumentReader id={item.id} name={item.title} load={load}/>
    {ctx.editable&&<><Rename item={item} ctx={ctx}/>
      <label className="workspace-share-block">{tr("Tải lên bản thay thế · tối đa 40 MB","Replace file · up to 40 MB")}<input type="file" disabled={ctx.pending} onChange={e=>{
        const file=e.target.files?.[0];e.target.value="";
        if(file)act(()=>shareUpload("replace",item.id,file,file.name,{token,revision:item.data.revision}),true);
      }}/></label></>}
  </>;
}
function SharedCanvas({item,ctx}:{item:StateByKind<"canvas">;ctx:Context}){
  const {tr,token,act,editable,pending}=ctx;
  const [board,change]=useState<BoardState|null>(null),[failed,setFailed]=useState(false),[modified,setModified]=useState(false);
  useEffect(()=>{
    const abort=new AbortController();
    setFailed(false);change(null);setModified(false);
    void unpackCloudCanvas("share:"+token,item.id,item.title,{type:"mindcanvas-board",version:item.data.version,board:item.data.board},{
      exists:async()=>false,put:async()=>{throw new Error("Read-only asset transport");},
      get:path=>shareCanvasAsset(token,item.id,path.split("/").at(-1)??"",abort.signal),
    }).then(parsed=>{
      if(abort.signal.aborted)return;
      // Links/iframes from arbitrary sites are not loaded in shared views.
      const omitted=new Set(parsed.embeds.filter(e=>e.kind!=="document").map(e=>e.id));
      change({...parsed,
        layerOrder:parsed.layerOrder?.filter(id=>!omitted.has(id)),
        groups:parsed.groups?.map(group=>({...group,elementIds:group.elementIds.filter(id=>!omitted.has(id))})).filter(group=>group.elementIds.length>=2),
        embeds:parsed.embeds.filter(e=>e.kind==="document").map(e=>({...e,url:"",documentId:e.documentId||e.id})),
      });
    }).catch(()=>{if(!abort.signal.aborted)setFailed(true);});
    return()=>abort.abort();
  },[item.id,item.data.revision,token]);
  const save=()=>{
    if(!board||!editable)return;
    act(()=>shareSaveCanvas(token,item.id,item.data.revision,parseBoard({...board,updatedAt:new Date().toISOString()})),true);
  };
  const Editor=board?.a4?A4CanvasEditor:CanvasBoard;
  return <section className="workspace-shared-editor">
    {editable&&board&&<div className="workspace-share-block"><label>{tr("Tên Canvas","Canvas title")}<input value={board.title} maxLength={120} onChange={e=>{setModified(true);change({...board,title:e.target.value});}}/></label>
      <button className="primary-button" type="button" disabled={!modified||pending||!board.title.trim()} onClick={save}>{tr("Lưu thay đổi","Save changes")}</button>
      <small>{tr("Bạn có thể sửa nội dung Canvas. Tệp đính kèm được quản lý riêng phía dưới.","Edit the Canvas content here. Manage attached files separately below.")}</small>
    </div>}
    {failed?<p role="alert">{tr("Không mở được Canvas.","The Canvas could not be loaded.")}</p>:!board?<p role="status">{tr("Đang tải Canvas…","Loading Canvas…")}</p>:
      <Suspense fallback={<p role="status">Canvas…</p>}><Editor roomMode board={board} readOnly={!editable||pending}
        visibleToolIds={["select","hand","text","pen","highlighter","eraser","line","rect","ellipse","triangle","connector"]}
        onChange={next=>{if(editable&&!pending){setModified(true);change(next);}}} onViewportChange={next=>change(next)} onUndo={noop} onRedo={noop} onSave={save}/></Suspense>}
    {item.data.files.length>0&&<section><h2>{tr("Tài liệu đính kèm","Attached files")}</h2><SharedItems items={item.data.files} ctx={ctx}/></section>}
  </section>;
}
function SharedQuiz({item,ctx}:{item:StateByKind<"quiz">;ctx:Context}){
  const [index,setIndex]=useState(0);
  const [answers,setAnswers]=useState<Array<number|null>>(()=>item.data.questions.map(()=>null));
  const [result,setResult]=useState<Awaited<ReturnType<typeof shareSubmit>>|null>(null);
  const [editing,setEditing]=useState(false),[title,setTitle]=useState(item.title),[description,setDescription]=useState(item.data.description);
  const [qs,setQs]=useState(item.data.questions);
  const {tr,act,token,pending}=ctx;
  const update=(index:number,patch:Partial<typeof qs[number]>)=>setQs(xs=>xs.map((q,i)=>i===index?{...q,...patch}:q));
  return <>
    {item.data.description && <p>{item.data.description}</p>}
    {ctx.editable&&<button type="button" className="secondary-button" onClick={()=>setEditing(v=>!v)}><Pencil size={16}/>{editing?tr("Về làm quiz","Back to quiz"):tr("Chỉnh sửa quiz","Edit quiz")}</button>}
    {editing&&ctx.editable?<form className="workspace-shared-quiz workspace-shared-quiz-edit" onSubmit={e=>{e.preventDefault();act(()=>shareEdit(token,item,"quiz",{title,description,revision:item.data.revision,questions:qs}),true);}}>
      <label>{tr("Tiêu đề","Title")}<input required value={title} maxLength={200} onChange={e=>setTitle(e.target.value)}/></label>
      <label>{tr("Mô tả","Description")}<textarea value={description} maxLength={1000} onChange={e=>setDescription(e.target.value)}/></label>
      {qs.map((q,i)=><fieldset key={q.id}><legend>{i+1}</legend>
        <label>{tr("Câu hỏi","Question")}<input required value={q.prompt} maxLength={8000} onChange={e=>update(i,{prompt:e.target.value})}/></label>
        {q.options.map((value,n)=><label key={n}>{String.fromCharCode(65+n)}<input required maxLength={2000} value={value} onChange={e=>update(i,{options:q.options.map((x,k)=>k===n?e.target.value:x)})}/></label>)}
        <label>{tr("Đáp án","Correct option")}<select value={q.correctIndex??0} onChange={e=>update(i,{correctIndex:Number(e.target.value)})}>{q.options.map((_,n)=><option key={n} value={n}>{String.fromCharCode(65+n)}</option>)}</select></label>
        <label>{tr("Giải thích","Explanation")}<textarea maxLength={8000} value={q.explanation??""} onChange={e=>update(i,{explanation:e.target.value})}/></label>
        <button type="button" className="secondary-button" disabled={qs.length<=1} onClick={()=>setQs(prev=>prev.filter((_,n)=>n!==i))}>{tr("Bỏ câu này","Remove question")}</button>
      </fieldset>)}
      <button type="button" className="secondary-button" disabled={qs.length>=100} onClick={()=>setQs(prev=>[...prev,{id:crypto.randomUUID(),prompt:"",options:["","","",""],correctIndex:0}])}>{tr("Thêm câu","Add question")}</button>
      <button className="primary-button" disabled={pending}>{tr("Lưu quiz","Save quiz")}</button>
    </form> : item.data.questions.length > 0 && <section className="workspace-shared-study activity-quiz" aria-label={item.title}>
      {result ? <QuizResult score={result.score} total={result.total} answers={answers}
        questions={item.data.questions.map((question, position) => {
          const feedback = result.answers[position];
          return { ...question, correctIndex: feedback?.correct ?? -1, explanation: feedback?.explanation };
        })}
        onRetake={() => { setResult(null); setIndex(0); setAnswers(item.data.questions.map(() => null)); }}/>
        : <QuizRunner questions={item.data.questions} answers={answers} index={index} freeNavigation busy={pending} lockAnswer={pending}
            onPick={option => setAnswers(current => current.map((answer, position) => position === index ? option : answer))}
            onNavigate={setIndex} onSubmit={() => act(async () => setResult(await shareSubmit(token,item.id,item.data.revision,answers)))}/>}
    </section>}
  </>;
}
function SharedFlashcards({item,ctx}:{item:StateByKind<"flashcard">;ctx:Context}){
  const {tr,act,pending}=ctx;
  const {t}=useLanguage();
  const [index,setIndex]=useState(0),[flip,setFlip]=useState(false);
  const [edit,setEdit]=useState<Partial<SharedCard>|null>(null);
  const current=item.data[index];
  const show=(pos:number)=>{setIndex(pos);setFlip(false);};
  const save=(e:FormEvent)=>{
    e.preventDefault();
    if(edit)act(()=>shareEdit(ctx.token,item,"card",edit),true);
  };
  return <>
    {current ? <section className="workspace-shared-study activity-flashcards" aria-label={item.title}>
      <FlashcardReview target={{ ...current, front: <FormulaText text={current.front}/>, back: <FormulaText text={current.back}/> }}
        index={index} total={item.data.length} showAnswer={flip} onToggleAnswer={() => setFlip(value => !value)} t={t}
        footer={<div className="review-swipe-actions">
          <button type="button" className="secondary-button" disabled={index === 0} onClick={() => show(index - 1)}>{tr("Thẻ trước","Previous")}</button>
          <button type="button" className="secondary-button" disabled={index === item.data.length - 1} onClick={() => show(index + 1)}>{tr("Thẻ sau","Next")}</button>
        </div>}/>
    </section> : <p>{t("noCards")}</p>}
    {ctx.editable&&<><Rename item={item} ctx={ctx}/><div className="actions">
      <button type="button" className="secondary-button" onClick={()=>setEdit({front:"",back:""})}>{tr("Thêm thẻ","Add card")}</button>
      {current&&<button type="button" className="secondary-button" onClick={()=>setEdit({...current})}>{tr("Sửa thẻ này","Edit this card")}</button>}
    </div>{edit&&<form className="workspace-share-block" onSubmit={save}>
      <label>{tr("Mặt trước","Front")}<textarea required maxLength={20000} value={edit.front??""} onChange={e=>setEdit({...edit,front:e.target.value})}/></label>
      <label>{tr("Mặt sau","Back")}<textarea required maxLength={20000} value={edit.back??""} onChange={e=>setEdit({...edit,back:e.target.value})}/></label>
      <button className="primary-button" disabled={pending}>{tr("Lưu thẻ","Save card")}</button>
    </form>}</>}
  </>;
}
