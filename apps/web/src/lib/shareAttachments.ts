import type { BoardState,CanvasEmbed } from "@mindcanvas/shared";
import { readDocument } from "./documentStore";
import { fetchBoard } from "./projectStore";
import { listMissingFolderAttachments,listShareAttachments, shareUpload, WorkspaceShareError } from "./workspaceSharing";

async function publishAttachment(owner:string,canvas:string,embed:string,name:string,documentId:string|null,url?:string){
  const document=documentId ? await readDocument(owner,documentId) : null;
  const source=document?.dataUrl || url;
  if(!source?.startsWith("data:")) throw new WorkspaceShareError("ATTACH_MISSING",404);
  const bytes=await (await fetch(source)).blob();
  return shareUpload("attach",canvas,bytes,name,{embed});
}
export async function ensureCanvasAttachment(owner:string,board:BoardState,embed:CanvasEmbed){
  const known=await listShareAttachments(board.id);
  const saved=known.find(file=>file.embed===embed.id);
  if(saved)return saved.id;
  const name=embed.fileName||embed.title||"document";
  return (await publishAttachment(owner,board.id,embed.id,name,embed.documentId??null,embed.url)).id;
}
export async function ensureCanvasAttachments(owner:string,board:BoardState){
  const attachments=board.embeds.filter(embed=>embed.kind==="document");
  if(!attachments.length)return;
  const known=await listShareAttachments(board.id);
  for(const embed of attachments){
    if(!known.some(file=>file.embed===embed.id))await publishAttachment(owner,board.id,embed.id,embed.fileName||embed.title||"document",embed.documentId??null,embed.url);
  }
}
export async function ensureFolderAttachments(owner:string,folderId:string){
  const missing=await listMissingFolderAttachments(folderId);
  const boards=new Map<string,BoardState>();
  for(const item of missing){
    const local=item.document ? await readDocument(owner,item.document) : null;
    let url=local?.dataUrl;
    if(!url){
      let board=boards.get(item.canvas);
      if(!board){board=await fetchBoard(owner,item.canvas);boards.set(item.canvas,board);}
      url=board.embeds.find(embed=>embed.id===item.embed)?.url;
    }
    if(!url?.startsWith("data:"))throw new WorkspaceShareError("ATTACH_MISSING",404);
    await publishAttachment(owner,item.canvas,item.embed,item.name,null,url);
  }
}
