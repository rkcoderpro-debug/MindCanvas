import { useEffect, useRef, useState, type FormEvent } from "react";
import { Clipboard, Link2, Mail, Share2, X } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { copyTextWithFallback } from "../lib/share";
import { shareErrorText, shareInvite, shareManage, type ShareGrant, type ShareItem, type ShareRole } from "../lib/workspaceSharing";
import { workspaceShareUrl } from "../lib/workspaceShareLinks";
import type { AccountPlan } from "../lib/account";
import Dialog from "./Dialog";
import FriendShareSettings from "./FriendShareSettings";
import "./workspaceSharing.css";

type ShareSettingsProps = {
  item: ShareItem; available?: boolean; prepare?: () => Promise<void>;
  friends?: { plan?: AccountPlan };
};

export function WorkspaceShareButton({item,available=true,prepare,compact=false,friends}: ShareSettingsProps & {compact?:boolean}){
  const {language}=useLanguage();
  const [open,setOpen]=useState(false);
  const label=language==="vi"?"Chia sẻ":"Share";
  return <><button type="button" aria-label={`${label}: ${item.title}`} title={label} className={compact?"icon-button":"secondary-button"} onClick={()=>setOpen(true)}><Share2 size={17}/>{compact?null:label}</button>
    {open && <Dialog workspace className="workspace-share-dialog" title={`${label}: ${item.title}`} onClose={()=>setOpen(false)}>
      <WorkspaceShareSettings item={item} available={available} prepare={prepare} friends={friends}/>
    </Dialog>}</>;
}
export function WorkspaceShareSettings({item,available=true,prepare,friends}: ShareSettingsProps){
  const {language,t}=useLanguage(),vi=language==="vi";
  const tr=(v:string,e:string)=>vi?v:e;
  const [rows,setRows]=useState<ShareGrant[]>([]),[ready,setReady]=useState(false),[busy,setBusy]=useState(false);
  const [email,setEmail]=useState(""),[inviteRole,setInviteRole]=useState<ShareRole>("viewer");
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[copied,setCopied]=useState("");
  const lock=useRef(false),linkInput=useRef<HTMLInputElement>(null),emailLinkInput=useRef<HTMLInputElement>(null);
  const [invitedEmail,setInvitedEmail]=useState("");
  const byLink=rows.find(x=>!x.email);
  const roleText=(role:ShareRole)=>role==="editor"?t("shareEditor"):t("shareViewer");
  useEffect(()=>{
    if(!available) return;
    const abort=new AbortController();
    setError("");setReady(false);
    void shareManage(item,"list","",undefined,abort.signal).then(value=>{
      if(!abort.signal.aborted){setRows(value);setReady(true);}
    }).catch(err=>{if(!abort.signal.aborted)setError(shareErrorText(err,vi));});
    return ()=>abort.abort();
  },[item.kind,item.id,available,vi]);
  const run=async(action:()=>Promise<void>)=>{
    if(lock.current)return;
    lock.current=true;setBusy(true);setError("");setNotice("");setCopied("");
    try{await action();}catch(err){setError(shareErrorText(err,vi));}finally{lock.current=false;setBusy(false);}
  };
  const setChannel=(value:string)=>run(async()=>{
    if(value!=="private" && prepare) await prepare();
    const next=await shareManage(item,value==="private"?"remove":"set","",value==="editor"?"editor":"viewer");
    setRows(next);
    setNotice(tr("Đã lưu quyền truy cập.","Access updated."));
  });
  const invite=(event:FormEvent)=>{
    event.preventDefault();
    void run(async()=>{
      if(prepare)await prepare();
      const address=email.trim().toLowerCase();
      const next=await shareManage(item,"set",address,inviteRole);
      setRows(next);
      const grant=next.find(x=>x.email===address);
      if(grant){
        setInvitedEmail(grant.email);setEmail("");
        await shareInvite(grant.token);
        setNotice(tr("Đã gửi email mời.","Invitation email sent."));
      }
    });
  };
  const copy=async(value:string,input?:HTMLInputElement|null)=>{
    const done=await copyTextWithFallback(value,input);
    setCopied(done?value:"");
    if(!done)setNotice(tr("Có thể chọn và sao chép đường dẫn trong ô liên kết.","Select and copy the URL in the link field."));
  };
  if(!available)return <p>{tr("Đăng nhập và đồng bộ nội dung lên đám mây trước khi chia sẻ.","Sign in and sync this item to the cloud before sharing.")}</p>;
  const link=byLink?workspaceShareUrl(byLink.token):"";
  const invited=rows.find(row=>row.email && row.email===invitedEmail);
  const privateLink=invited?workspaceShareUrl(invited.token):"";
  return <div className="workspace-share-settings">
    {friends && (item.kind==="quiz" || item.kind==="flashcard") && <FriendShareSettings key={item.kind+item.id} kind={item.kind} id={item.id} plan={friends.plan}/>}
    <div className="workspace-share-block">
      <h2><Link2 size={18}/>{tr("Quyền truy cập qua link","Link access")}</h2>
      <label>{tr("Ai có thể mở link?","Who can open the link?")}<select value={byLink?.role??"private"} disabled={!ready||busy} onChange={event=>void setChannel(event.target.value)}>
        <option value="private">{tr("Chỉ người được mời","Only invited people")}</option>
        <option value="viewer">{tr("Ai có link · Người xem","Anyone with the link · Viewer")}</option>
        <option value="editor">{tr("Ai có link · Người chỉnh sửa","Anyone with the link · Editor")}</option>
      </select></label>
      <small>{tr("Có thể xem mà không cần tài khoản. Muốn sửa phải đăng nhập.","Viewing does not require an account. Editing requires sign-in.")}</small>
      {item.kind==="folder"&&<small>{tr("Quyền của thư mục áp dụng cho nội dung bên trong nó.","Folder access includes the items inside it.")}</small>}
      {link && <div className="workspace-share-link-field">
        <input aria-label={tr("Link chia sẻ chung","General sharing link")} ref={linkInput} readOnly value={link} onFocus={event=>event.target.select()}/>
        <button className="secondary-button" type="button" disabled={busy} onClick={()=>void copy(link,linkInput.current)}><Clipboard size={15}/>{copied===link?t("shareCopied"):t("copyLink")}</button>
      </div>}
    </div>
    <form className="workspace-share-block" onSubmit={invite}>
      <h2><Mail size={18}/>{tr("Mời qua email","Invite by email")}</h2>
      <label>Email<input type="email" required maxLength={254} value={email} onChange={event=>setEmail(event.target.value)} placeholder="email@example.com"/></label>
      <label>{t("sharePermission")}<select value={inviteRole} onChange={event=>setInviteRole(event.target.value as ShareRole)}>
        <option value="viewer">{roleText("viewer")}</option><option value="editor">{roleText("editor")}</option>
      </select></label>
      <button className="primary-button" disabled={!ready||busy}>{t("sendInvite")}</button>
    </form>
    {rows.some(row=>row.email) && <section className="workspace-share-block"><h2>{tr("Email đã được cấp quyền","Invited emails")}</h2>
      <ul className="workspace-share-grants">{rows.filter(row=>row.email).map(row=><li key={row.email}>
        <strong>{row.email}</strong>
        <select aria-label={`${t("sharePermission")}: ${row.email}`} value={row.role} disabled={busy} onChange={event=>{
          const value=event.target.value as ShareRole; void run(async()=>{setRows(await shareManage(item,"set",row.email,value));});
        }}><option value="viewer">{roleText("viewer")}</option><option value="editor">{roleText("editor")}</option></select>
        <button type="button" className="icon-button" title={t("copyLink")} aria-label={`${t("copyLink")}: ${row.email}`} onClick={()=>{
          setInvitedEmail(row.email);
          const value=workspaceShareUrl(row.token);
          void copy(value, row.email===invitedEmail?emailLinkInput.current:undefined);
        }}><Clipboard size={16}/></button>
        <button type="button" className="icon-button" title={tr("Gửi lại email","Resend email")} aria-label={`${tr("Gửi lại email","Resend email")}: ${row.email}`} disabled={busy} onClick={()=>void run(async()=>{await shareInvite(row.token);setNotice(tr("Đã gửi lại email.","Invitation email sent."));})}><Mail size={16}/></button>
        <button type="button" className="icon-button" title={tr("Thu hồi","Revoke")} aria-label={`${tr("Thu hồi","Revoke")}: ${row.email}`} disabled={busy} onClick={()=>void run(async()=>{
          setRows(await shareManage(item,"remove",row.email));setNotice(tr("Đã thu hồi quyền.","Access revoked."));
        })}><X size={17}/></button>
      </li>)}</ul>
      {privateLink && <div className="workspace-share-private-link"><small>{tr("Link mời riêng","Private invitation link")} · {invitedEmail}</small>
        <div className="workspace-share-link-field"><input aria-label={tr("Link mời riêng","Private invitation link")} ref={emailLinkInput} readOnly value={privateLink} onFocus={event=>event.target.select()}/>
          <button className="secondary-button" type="button" onClick={()=>void copy(privateLink,emailLinkInput.current)}>{copied===privateLink?t("shareCopied"):t("copyLink")}</button>
        </div>
      </div>}
    </section>}
    {busy && <p role="status">{t("saving")}</p>}
    {notice && <p role="status">{notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
