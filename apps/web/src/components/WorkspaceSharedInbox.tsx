import { useEffect,useState } from "react";
import { Link2 } from "lucide-react";
import { shareReceived, type ShareReceived } from "../lib/workspaceSharing";
import { workspaceShareUrl } from "../lib/workspaceShareLinks";
import { useLanguage } from "../lib/i18n";
export default function WorkspaceSharedInbox({owner}:{owner:string|null}){
  const [items,setItems]=useState<ShareReceived[]>([]);
  const {language,t}=useLanguage();
  useEffect(()=>{
    if(!owner)return;
    const abort=new AbortController();
    void shareReceived(abort.signal).then(rows=>{if(!abort.signal.aborted)setItems(rows);}).catch(()=>{});
    return()=>abort.abort();
  },[owner]);
  if(!items.length)return null;
  return <section className="workspace-home workspace-shared-inbox"><h2>{language==="vi"?"Nội dung được mời qua email":"Shared with you by email"}</h2>
    <ul>{items.map(item=><li key={item.token}><a href={workspaceShareUrl(item.token)}><Link2 size={16}/>{item.title}</a><small>{item.role==="editor"?t("shareEditor"):t("shareViewer")}</small></li>)}</ul></section>;
}
