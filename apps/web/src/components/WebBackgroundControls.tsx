import { useRef } from "react";
import { ImagePlus, RotateCcw, Trash2 } from "lucide-react";
import type { CanvasBackgroundMedia } from "@mindcanvas/shared";
import { MAX_FILE_BYTES } from "../lib/board";
import { useLanguage } from "../lib/i18n";
import type { WebBackground } from "../lib/webBackground";

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("INVALID_DATA_URL"));
    reader.onerror = () => reject(reader.error ?? new Error("FILE_READ_FAILED"));
    reader.readAsDataURL(file);
  });
}

type Props = {
  background: WebBackground | null;
  canUseUpload?: boolean;
  onLocked?: () => void;
  onChange: (background: WebBackground | null) => void;
};

export default function WebBackgroundControls({ background, canUseUpload = false, onLocked, onChange }: Props) {
  const { t } = useLanguage();
  const input = useRef<HTMLInputElement>(null);
  const choose = () => {
    if (!canUseUpload) { onLocked?.(); return; }
    input.current?.click();
  };
  const select = async (file: File | undefined) => {
    if (!file) return;
    if (!canUseUpload) { onLocked?.(); return; }
    if (file.size > MAX_FILE_BYTES) return;
    const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
    if (!kind) return;
    try {
      const src = await readFile(file);
      const next: CanvasBackgroundMedia = { kind, src, name: file.name, mimeType: file.type || undefined, opacity: .36, blur: 0, brightness: 1, fit: "cover", position: "center", overlay: "#000000" };
      onChange(next);
    } catch { /* Keep the current background when the browser cannot read the file. */ }
  };
  const patch = (values: Partial<CanvasBackgroundMedia>) => { if (background) onChange({ ...background, ...values }); };
  return <div className="web-background-controls">
    <input ref={input} hidden type="file" accept="image/*,video/*,.mov,.m4v,.webm" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void select(file); }}/>
    {background && <div className="web-background-preview">{background.kind === "video" ? <video src={background.src} muted autoPlay loop playsInline/> : <img src={background.src} alt=""/>}<span/></div>}
    <div className="web-background-actions"><button type="button" className="secondary-button" onClick={choose}><ImagePlus size={16}/>{background ? t("replace") : t("uploadWebBackground")}</button>{background && <button type="button" className="icon-button" aria-label={t("clearWebBackground")} title={t("clearWebBackground")} onClick={() => onChange(null)}><Trash2 size={16}/></button>}</div>
    <small className="field-hint">{canUseUpload ? t("webBackgroundHint") : t("backgroundProOnly")}</small>
    {background && <div className="web-background-adjustments"><label>{t("backgroundMediaOpacity")}<input type="range" min=".1" max="1" step=".05" value={background.opacity ?? 1} onChange={event => patch({ opacity: Number(event.target.value) })}/></label><label>{t("backgroundMediaBlur")}<input type="range" min="0" max="24" step="1" value={background.blur ?? 0} onChange={event => patch({ blur: Number(event.target.value) })}/></label><label>{t("backgroundMediaBrightness")}<input type="range" min=".5" max="1.5" step=".05" value={background.brightness ?? 1} onChange={event => patch({ brightness: Number(event.target.value) })}/></label><label>{t("backgroundMediaFit")}<select value={background.fit ?? "cover"} onChange={event => patch({ fit: event.target.value as "cover" | "contain" })}><option value="cover">{t("backgroundFitCover")}</option><option value="contain">{t("backgroundFitContain")}</option></select></label><label>{t("backgroundMediaPosition")}<select value={background.position ?? "center"} onChange={event => patch({ position: event.target.value })}><option value="center">{t("center")}</option><option value="top">{t("alignTop")}</option><option value="right">{t("alignRight")}</option><option value="bottom">{t("alignBottom")}</option><option value="left">{t("alignLeft")}</option></select></label><label>{t("backgroundMediaOverlay")}<input type="color" value={background.overlay ?? "#000000"} onChange={event => patch({ overlay: event.target.value })}/></label></div>}
    {background && <button type="button" className="text-button web-background-reset" onClick={() => onChange(null)}><RotateCcw size={14}/>{t("clearWebBackground")}</button>}
  </div>;
}
