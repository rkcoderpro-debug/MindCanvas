import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { GripVertical, Layers3, PaintBucket, SlidersHorizontal, X } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import "./canvasInspector.css";

const widthKey = "mindcanvas:canvas-inspector-width";
const defaultWidth = 280;
const minWidth = 240;
const maxWidth = 520;
const canvasMinimum = 320;
const overlayThreshold = 660;
const sections = ["selection", "background", "layers"] as const;

function readWidth() {
  try {
    const saved = Number(localStorage.getItem(widthKey));
    if (saved >= minWidth && saved <= maxWidth) return saved;
  } catch {}
  return defaultWidth;
}

type InspectorProps = {
  closeButton: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onClose: () => void;
  selection: ReactNode;
  background: ReactNode;
  layers: ReactNode;
};

export default function CanvasInspector({ closeButton, open, onClose, selection, background, layers }: InspectorProps) {
  const { language, t } = useLanguage();
  const vi = language === "vi";
  const [section, setSection] = useState<(typeof sections)[number]>("selection");
  const [preferred, setPreferred] = useState(readWidth);
  const [available, setAvailable] = useState(() => typeof window === "undefined" ? overlayThreshold : window.innerWidth);
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{ id: number; startX: number; width: number; next: number } | null>(null);
  const overlay = available < overlayThreshold;
  useLayoutEffect(() => { if (overlay) drag.current = null; }, [overlay]);
  const limit = Math.max(minWidth, Math.min(maxWidth, available - canvasMinimum));
  const clampWidth = (value: number) => Math.min(limit, Math.max(minWidth, Math.round(value)));
  const width = clampWidth(preferred);
  const labels = { selection: vi ? "Lựa chọn" : "Selection", background: vi ? "Nền & bút" : "Canvas & pen", layers: t("layers") };
  const icons = { selection: SlidersHorizontal, background: PaintBucket, layers: Layers3 };
  const content = { selection, background, layers };
  const resizeLabel = vi ? "Đổi chiều rộng bảng Thuộc tính" : "Resize the Properties panel";

  useLayoutEffect(() => {
    const element = panel.current?.parentElement;
    if (!element) return;
    const measure = () => {
      if (element.clientWidth > 0) setAvailable(element.clientWidth);
    };
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const saveWidth = (next: number) => {
    setPreferred(next);
    try { localStorage.setItem(widthKey, String(next)); } catch {}
  };
  const finishDrag = (pointerId: number) => {
    const active = drag.current;
    if (active?.id !== pointerId) return;
    drag.current = null;
    saveWidth(active.next);
  };

  return <aside ref={panel} className={`inspector canvas-inspector ${open ? "is-open" : "is-closed"}`} aria-label={t("properties")}
    data-overlay={overlay} style={{ width: overlay ? undefined : width, flexBasis: overlay ? undefined : width }}>
    {!overlay && <div className="canvas-inspector-resize" role="separator" aria-orientation="vertical"
      aria-label={resizeLabel} title={resizeLabel} tabIndex={0} aria-valuemin={minWidth} aria-valuemax={limit} aria-valuenow={width}
      onKeyDown={event => {
        const sizes: Record<string, number | undefined> = { ArrowLeft: width + 16, ArrowRight: width - 16, Home: minWidth, End: limit };
        const next = sizes[event.key];
        if (next === undefined) return;
        event.preventDefault();
        event.stopPropagation();
        saveWidth(clampWidth(next));
      }}
      onDoubleClick={() => saveWidth(clampWidth(defaultWidth))}
      onPointerDown={event => {
        if (event.isPrimary === false || event.button !== 0) return;
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture?.(event.pointerId);
        drag.current = { id: event.pointerId, startX: event.clientX, width, next: width };
        event.preventDefault();
      }}
      onPointerMove={event => {
        const active = drag.current;
        if (active?.id !== event.pointerId) return;
        active.next = clampWidth(active.width + active.startX - event.clientX);
        setPreferred(active.next);
      }}
      onPointerUp={event => finishDrag(event.pointerId)}
      onPointerCancel={event => finishDrag(event.pointerId)}
      onLostPointerCapture={event => finishDrag(event.pointerId)}>
      <GripVertical size={13} aria-hidden="true"/>
    </div>}
    <div className="inspector-heading">
      <h3>{t("properties")}</h3>
      <button ref={closeButton} type="button" className="icon-button inspector-close" aria-label={t("closeProperties")}
        title={t("closeProperties")} onClick={onClose}><X size={19}/></button>
    </div>
    <div className="canvas-inspector-tabs" role="group" aria-label={t("properties")}>
      {sections.map(value => {
        const Icon = icons[value];
        return <button type="button" key={value} aria-pressed={section === value} onClick={() => setSection(value)}>
          <Icon size={14} aria-hidden="true"/>{labels[value]}
        </button>;
      })}
    </div>
    {sections.map(value => <div key={value} className="canvas-inspector-scroll" hidden={section !== value}>
      {content[value]}
    </div>)}
  </aside>;
}
