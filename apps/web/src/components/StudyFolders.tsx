import { useState, type FormEvent } from "react";
import { Folder, FolderInput, FolderPlus, Pencil } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import type { StudyArea, StudyFolder, StudyFolders } from "../hooks/useStudyFolders";
import type { AccountPlan } from "../lib/account";
import Dialog from "./Dialog";
import FolderTreePicker, { folderAncestors } from "./FolderTreePicker";
import { WorkspaceShareButton } from "./WorkspaceShareDialog";
import "./studyFolders.css";

type Item = { id: string; title: string };
type StudyItem = Item & { cloud: boolean };
type NameDialog = { folder?: StudyFolder };

const messageOf = (error: unknown, fallback: string) =>
  error && typeof error === "object" && "message" in error ? String(error.message) : fallback;

export function StudyFolderControls({ store, items, area, owner, plan }: {
  store: StudyFolders;
  items: StudyItem[];
  area: StudyArea;
  owner: string | null;
  plan?: AccountPlan;
}) {
  const { language, t } = useLanguage();
  const vi = language === "vi";
  const [dialog, setDialog] = useState<NameDialog | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const trail = folderAncestors(store.folders, store.folderId);
  const children = store.folders.filter(folder => folder.parentId === store.folderId)
    .sort((a, b) => a.name.localeCompare(b.name, language));
  const root = vi ? "Thư mục" : "Folders";
  const addLabel = vi ? "Thêm thư mục" : "New folder";
  const renameLabel = vi ? "Đổi tên thư mục" : "Rename folder";
  const shareAvailable = !!owner && store.ready;

  const open = (folder?: StudyFolder) => {
    setError("");
    setName(folder?.name ?? "");
    setDialog({ folder });
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const id = await store.saveFolder(name.trim(), dialog?.folder);
      if (!dialog?.folder) store.selectFolder(id);
      setDialog(null);
    } catch (error) {
      setError(messageOf(error, vi ? "Chưa lưu được thư mục." : "Could not save the folder."));
    } finally {
      setBusy(false);
    }
  };

  return <section className="study-folders" aria-label={vi ? "Thư mục học liệu" : "Study folders"}>
    <div className="study-folder-heading">
      <nav aria-label={vi ? "Đường dẫn thư mục" : "Folder path"}>
        <button type="button" className="study-folder-crumb" onClick={() => store.selectFolder(null)}
          aria-current={trail.length === 0 ? "location" : undefined}>{root}</button>
        {trail.map((folder, index) => <span key={folder.id}><span aria-hidden="true"> › </span>
          <button type="button" className="study-folder-crumb" onClick={() => store.selectFolder(folder.id)}
            aria-current={index === trail.length - 1 ? "location" : undefined}>{folder.name}</button></span>)}
      </nav>
      <button type="button" className="secondary-button" disabled={!store.ready} onClick={() => open()}>
        <FolderPlus size={17}/>{addLabel}
      </button>
    </div>
    {store.fetchError && <p role="status">{vi ? "Thư mục chưa đồng bộ. Hãy tải lại trang để thử lại." : "Folders are not synced. Reload to try again."}</p>}
    {children.length > 0 && <ul className="study-folder-list">
      {children.map(folder => {
        const pending = store.pendingIn(folder.id, items);
        return <li key={folder.id}>
          <button type="button" className="study-folder-open" onClick={() => store.selectFolder(folder.id)}>
            <Folder size={18}/><span>{folder.name}</span>
          </button>
          <button type="button" className="icon-button" aria-label={`${renameLabel}: ${folder.name}`} title={renameLabel}
            disabled={!store.ready} onClick={() => open(folder)}><Pencil size={16}/></button>
          {owner && <WorkspaceShareButton compact item={{ kind: "learning_folder", id: folder.id, title: folder.name }}
            friends={{ plan, area }} available={shareAvailable}
            note={!shareAvailable ? (vi ? "Thư mục chưa đồng bộ." : "This folder is not synced yet.")
              : pending.length ? (vi ? `Cần đồng bộ để người nhận mở được: ${pending.map(item => item.title).join(", ")}.`
                : `Sync these items to make them available: ${pending.map(item => item.title).join(", ")}.`) : undefined}/>}
        </li>;
      })}
    </ul>}
    {dialog && <Dialog title={dialog.folder ? renameLabel : addLabel} onClose={() => setDialog(null)} dismissible={!busy}>
      <form className="study-folder-form" onSubmit={event => void save(event)}>
        <label>{vi ? "Tên thư mục" : "Folder name"}<input value={name} onChange={event => setName(event.target.value)} required maxLength={80}/></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setDialog(null)}>{t("cancel")}</button>
          <button type="submit" className="primary-button" disabled={busy || !name.trim()}>{busy ? t("saving") : t("save")}</button></footer>
      </form>
    </Dialog>}
  </section>;
}

export function StudyFolderMoveButton({ store, item, labeled = false, synced = true }: {
  store: StudyFolders; item: Item; labeled?: boolean; synced?: boolean;
}) {
  const { language, t } = useLanguage();
  const vi = language === "vi";
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = vi ? "Chuyển thư mục" : "Move to folder";
  const current = store.itemFolder(item.id);
  return <>
    <button type="button" className={labeled ? "study-folder-move-label" : "icon-button study-folder-move"}
      title={label} aria-label={`${label}: ${item.title}`} disabled={!store.ready || store.moving}
      onClick={() => { setDestination(current); setError(""); setOpen(true); }}>
      <FolderInput size={17}/>{labeled && label}
    </button>
    {open && <Dialog title={label} onClose={() => setOpen(false)} dismissible={!busy}>
      <p>{item.title}</p>
      <FolderTreePicker folders={store.folders} selected={destination} onSelect={setDestination}
        label={vi ? "Thư mục đích" : "Destination folder"} disabled={busy}/>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setOpen(false)}>{t("cancel")}</button>
        <button type="button" className="primary-button" disabled={busy || destination === current} onClick={async () => {
          setBusy(true);
          setError("");
          try { await store.moveItem(item.id, destination, synced); setOpen(false); }
          catch (error) { setError(messageOf(error, vi ? "Chưa chuyển được học liệu." : "Could not move the item.")); }
          finally { setBusy(false); }
        }}>{busy ? t("saving") : t("move")}</button></footer>
    </Dialog>}
  </>;
}
