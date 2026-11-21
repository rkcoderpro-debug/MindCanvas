import { cleanLabThumbnail } from "./labModes";

/** Messages from an opaque-origin iframe must be tied to its Window and session. */
export function readLabBridgeMessage(event: MessageEvent, source: Window | null, token: string): { height?: number; thumbnail?: string } | null {
  if (!source || event.source !== source || !event.data || event.data.channel !== "mindcanvas-lab" || event.data.token !== token) return null;
  return {
    height: typeof event.data.height === "number" && Number.isFinite(event.data.height) ? Math.max(240, Math.min(1200, event.data.height)) : undefined,
    thumbnail: cleanLabThumbnail(event.data.thumbnail),
  };
}

/** Injected by the host after validating HTML; user HTML never gets parent DOM access. */
export function labBridgeScript(token: string): string {
  function bridge(session: string) {
    const send = (data: object) => window.parent.postMessage({ channel: "mindcanvas-lab", token: session, ...data }, "*");
    let timer: number;
    const measure = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const body = document.body, style = getComputedStyle(body);
        const margin = (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
        // documentElement.scrollHeight includes the iframe viewport even for tiny content.
        send({ height: Math.ceil(Math.max(body.scrollHeight, body.getBoundingClientRect().height) + margin) });
      }, 100);
    };
    const snapshot = async () => {
      try {
        const custom = (window as Window & { mindcanvasLabPreview?: () => string | Promise<string> }).mindcanvasLabPreview;
        if (custom) { const thumbnail = await custom(); if (typeof thumbnail === "string" && thumbnail.length < 200000) send({ thumbnail }); return; }
        const root = document.querySelector("[data-lab-preview]") ?? document.querySelector("canvas,svg");
        if (!root) return;
        const output = document.createElement("canvas"); output.width = 640; output.height = 360;
        const ctx = output.getContext("2d"); if (!ctx) return;
        ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
        if (ctx.fillStyle === "rgba(0, 0, 0, 0)") ctx.fillStyle = "#f0f7ff";
        ctx.fillRect(0, 0, 640, 360);
        const draw = (img: CanvasImageSource, width: number, height: number) => {
          if (!width || !height) return;
          const scale = Math.min(640 / width, 360 / height);
          ctx.drawImage(img, (640 - width * scale) / 2, (360 - height * scale) / 2, width * scale, height * scale);
          send({ thumbnail: output.toDataURL("image/webp", .75) });
        };
        if (root instanceof HTMLCanvasElement) { draw(root, root.width, root.height); return; }
        if (root instanceof SVGElement) {
          const clone = root.cloneNode(true) as SVGElement;
          clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
          const box = root.getBoundingClientRect(); clone.setAttribute("width", String(box.width || 640)); clone.setAttribute("height", String(box.height || 360));
          const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
          const img = new Image(); img.onload = () => { try { draw(img, img.width, img.height); } finally { URL.revokeObjectURL(url); } }; img.onerror = () => URL.revokeObjectURL(url); img.src = url;
        }
      } catch { /* Arbitrary HTML can use an uploaded cover instead. */ }
    };
    window.addEventListener("message", event => {
      if (event.source === window.parent && event.data?.channel === "mindcanvas-lab-preview" && event.data.token === session) void snapshot();
    });
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(measure).observe(document.body);
    measure(); window.setTimeout(() => void snapshot(), 900);
  }
  return `<script>(${bridge.toString()})(${JSON.stringify(token).replace(/</g, "\\u003c")});<\/script>`;
}

export async function labCoverFromFile(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 8_000_000) throw new Error("Chọn ảnh PNG, JPEG hoặc WebP tối đa 8 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("Không đọc được ảnh bìa.")); img.src = url; });
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 360;
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Không tạo được ảnh bìa.");
    ctx.fillStyle = "#eff6ff"; ctx.fillRect(0, 0, 640, 360);
    const scale = Math.min(640 / img.width, 360 / img.height);
    ctx.drawImage(img, (640 - img.width * scale) / 2, (360 - img.height * scale) / 2, img.width * scale, img.height * scale);
    const result = cleanLabThumbnail(canvas.toDataURL("image/webp", .75));
    if (!result) throw new Error("Ảnh bìa quá lớn. Hãy chọn ảnh đơn giản hơn.");
    return result;
  } finally { URL.revokeObjectURL(url); }
}
