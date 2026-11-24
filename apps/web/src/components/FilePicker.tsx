import { File, Upload } from "lucide-react";
import { useId, useState, type ChangeEventHandler, type ReactNode, type Ref } from "react";
import { useLanguage } from "../lib/i18n";

type Props = {
  label?: string;
  "aria-label"?: string;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  /** When supplied, the owning feature decides which selected files are still current. */
  fileNames?: readonly string[];
  description?: ReactNode;
  className?: string;
  layout?: "field" | "inline";
  inputRef?: Ref<HTMLInputElement>;
  onChange: ChangeEventHandler<HTMLInputElement>;
  onBeforeChoose?: () => void;
  onDropFiles?: (files: File[]) => void;
};

/** A themed label for the platform file input, including keyboard and touch activation. */
export default function FilePicker({
  label, "aria-label": ariaLabel, accept, multiple, disabled, fileNames, description,
  className = "", layout = "field", inputRef, onChange, onDropFiles, onBeforeChoose,
}: Props) {
  const { t } = useLanguage();
  const id = useId();
  const [recent, setRecent] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const names = fileNames ?? recent;
  const choose = t(multiple ? "filePickerChooseMany" : "filePickerChooseOne");
  const hasFiles = (types: DOMStringList | readonly string[]) => Array.from(types).includes("Files");
  return <div className={`file-picker file-picker-${layout}${onDropFiles ? " file-picker-droppable" : ""} ${className}`}
    data-dragging={dragging || undefined} data-disabled={disabled || undefined}
    onDragOver={onDropFiles ? event => {
      if (!hasFiles(event.dataTransfer.types)) return;
      event.preventDefault();
      const enabled = !disabled && !event.currentTarget.closest("fieldset:disabled");
      event.dataTransfer.dropEffect = enabled ? "copy" : "none";
      setDragging(enabled);
    } : undefined}
    onDragLeave={onDropFiles ? event => {
      if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false);
    } : undefined}
    onDrop={onDropFiles ? event => {
      if (!hasFiles(event.dataTransfer.types) && !event.dataTransfer.files.length) return;
      event.preventDefault();
      setDragging(false);
      if (disabled || event.currentTarget.closest("fieldset:disabled")) return;
      const files = Array.from(event.dataTransfer.files).slice(0, multiple ? undefined : 1);
      if (files.length) {
        setRecent(files.map(file => file.name));
        onDropFiles(files);
      }
    } : undefined}>
    {label && <span className="file-picker-label">{label}</span>}
    <div className="file-picker-row">
      <label className="file-picker-trigger secondary-button">
        <Upload size={16} aria-hidden="true"/><span>{choose}</span>
        <input ref={inputRef} className="file-picker-native" type="file" accept={accept} multiple={multiple}
          aria-label={ariaLabel ?? label ?? choose} aria-describedby={`${id}-files${description ? ` ${id}-hint` : ""}`}
          disabled={disabled} onClick={onBeforeChoose} onChange={event => {
            if (event.currentTarget.matches(":disabled")) return;
            const files = Array.from(event.currentTarget.files ?? []);
            if (files.length) setRecent(files.map(file => file.name));
            onChange(event);
            // Some import flows allow selecting the same file after an error or a revision.
            event.currentTarget.value = "";
          }}/>
      </label>
      <span id={`${id}-files`} className="file-picker-selection" aria-live="polite">
        {names.length > 0 ? <><File size={14} aria-hidden="true"/>
          <span title={names.join("\n")}>
            {names.length > 1 ? t("filePickerSelectedCount", { count: names.length }) : names[0]}
          </span>
        </> : <span>{t("filePickerEmpty")}</span>}
      </span>
    </div>
    {description && <small id={`${id}-hint`} className="file-picker-hint">{description}</small>}
    {names.length > 1 && <details className="file-picker-names">
      <summary>{t("filePickerShowNames")}</summary>
      <ul>{names.map((name, index) => <li key={index}>{name}</li>)}</ul>
    </details>}
  </div>;
}
