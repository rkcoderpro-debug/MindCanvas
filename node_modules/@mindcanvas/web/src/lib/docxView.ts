import JSZip from "jszip";

export const DOCX_CLASS = "mc-docx";
const PAGE_TOKEN = "__MINDCANVAS_WORD_PAGE__";
const TOTAL_TOKEN = "__MINDCANVAS_WORD_PAGES__";
const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export const DOCX_FRAME_HTML = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; img-src data: blob:; font-src data: blob:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>html,body{margin:0;padding:0;background:#e5e7eb}body{padding:16px;box-sizing:border-box}section.mc-docx{margin:0 auto 24px;background:white;box-shadow:0 2px 9px #0002}section.mc-docx:last-child{margin-bottom:0}</style></head><body></body></html>`;

/** Work on a rendering copy. Cached PAGE fields must follow the displayed
 * page, while the user's original DOCX remains unchanged. */
async function preparePageFields(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  let changed = false;
  for (const name of Object.keys(zip.files).filter(name => /^word\/(?:header|footer)\d+\.xml$/.test(name))) {
    const part = await zip.file(name)!.async("text");
    const xml = new DOMParser().parseFromString(part, "application/xml");
    let partChanged = false;
    for (const field of Array.from(xml.getElementsByTagNameNS(WORD_NS, "fldSimple"))) {
      const instruction = (field.getAttributeNS(WORD_NS, "instr") ?? field.getAttribute("w:instr") ?? "").trim().split(/\s+/)[0];
      if (instruction !== "PAGE" && instruction !== "NUMPAGES") continue;
      const run = field.getElementsByTagNameNS(WORD_NS, "r")[0]?.cloneNode(true) as Element | undefined;
      if (!run) continue;
      const texts = Array.from(run.getElementsByTagNameNS(WORD_NS, "t"));
      if (!texts.length) continue;
      texts[0].textContent = instruction === "PAGE" ? PAGE_TOKEN : TOTAL_TOKEN;
      texts.slice(1).forEach(text => text.remove());
      field.replaceWith(run);
      partChanged = changed = true;
    }
    if (partChanged) zip.file(name, new XMLSerializer().serializeToString(xml));
  }
  return changed ? zip.generateAsync({ type: "uint8array" }) : bytes;
}

export function sanitizeDocxDOM(root: HTMLElement) {
  root.querySelectorAll("script,iframe,object,embed,form,link,base").forEach(node => node.remove());
  for (const element of Array.from(root.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") element.removeAttribute(attribute.name);
      if (["href", "src", "xlink:href"].includes(name) && !/^(?:#|data:image\/|blob:)/i.test(attribute.value)) element.removeAttribute(attribute.name);
    }
  }
}

function replacePageFields(page: HTMLElement, index: number, total: number) {
  const walker = page.ownerDocument.createTreeWalker(page, 4 /* SHOW_TEXT */);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.textContent?.includes(PAGE_TOKEN) || node.textContent?.includes(TOTAL_TOKEN)) {
      node.textContent = node.textContent.replaceAll(PAGE_TOKEN, String(index + 1)).replaceAll(TOTAL_TOKEN, String(total));
    }
  }
}

/** Paginate at paragraph/table-row boundaries after fonts and images settle.
 * Oversized unsplittable objects stay visible instead of being clipped. */
export function paginateDocx(root: HTMLElement) {
  const document = root.ownerDocument;
  const view = document.defaultView!;
  const sourcePages = Array.from(root.querySelectorAll<HTMLElement>(`section.${DOCX_CLASS}`));
  const result: HTMLElement[] = [];
  let oversized = false;
  for (const original of sourcePages) {
    const articles = Array.from(original.children).filter(el => el.tagName === "ARTICLE") as HTMLElement[];
    const settings = view.getComputedStyle(original);
    const pageHeight = Number.parseFloat(settings.minHeight);
    const available = pageHeight - Number.parseFloat(settings.paddingTop || "0") - Number.parseFloat(settings.paddingBottom || "0");
    if (articles.length !== 1 || !(available > 0) || !original.getBoundingClientRect().width) {
      original.style.overflow = "visible";
      result.push(original);
      continue;
    }
    const article = articles[0];
    const blocks = [...Array.from(article.children), ...Array.from(original.children).filter(element => !["ARTICLE", "HEADER", "FOOTER"].includes(element.tagName))] as HTMLElement[];
    let page!: HTMLElement;
    let content!: HTMLElement;
    const createPage = () => {
      page = original.cloneNode(false) as HTMLElement;
      page.style.height = `${pageHeight}px`;
      page.style.overflow = "visible";
      content = article.cloneNode(false) as HTMLElement;
      content.style.display = "flow-root";
      content.style.marginBottom = "0";
      page.append(content);
      for (const element of Array.from(original.children)) {
        if (element.tagName !== "HEADER" && element.tagName !== "FOOTER") continue;
        const copy = element.cloneNode(true) as HTMLElement;
        if (copy.tagName === "HEADER" || copy.tagName === "FOOTER") {
          const css = view.getComputedStyle(element);
          copy.style.position = "absolute";
          copy.style.left = settings.paddingLeft; copy.style.right = settings.paddingRight;
          copy.style.margin = "0"; copy.style.minHeight = "0";
          if (copy.tagName === "HEADER") copy.style.top = `${Number.parseFloat(settings.paddingTop) + Number.parseFloat(css.marginTop || "0")}px`;
          else copy.style.bottom = `${Number.parseFloat(settings.paddingBottom) + Number.parseFloat(css.marginBottom || "0")}px`;
        }
        page.append(copy);
      }
      original.before(page);
      result.push(page);
    };
    const usedHeight = () => {
      const last = content.lastElementChild;
      return last ? last.getBoundingClientRect().bottom - content.getBoundingClientRect().top : 0;
    };
    const addBlock = (block: HTMLElement) => {
      content.append(block);
      if (usedHeight() <= available + 1) return;
      if (content.children.length > 1) { block.remove(); createPage(); content.append(block); }
      if (usedHeight() > available + 1) {
        page.style.height = "auto"; page.style.minHeight = `${pageHeight}px`;
        // Let a tall image/merged table grow. Do not let a footer cover it.
        page.querySelectorAll<HTMLElement>(":scope > footer").forEach(footer => { footer.style.position = "static"; });
        oversized = true;
      }
    };
    createPage();
    for (const block of blocks) {
      if (block.tagName !== "TABLE" || block.querySelector("[rowspan]")) { addBlock(block); continue; }
      // Split normal tables by complete rows, retaining the column grid and
      // repeated THEAD. Row-spanning tables remain intact.
      const rows = Array.from((block as HTMLTableElement).rows).filter(row => row.parentElement?.tagName !== "THEAD");
      let table: HTMLElement;
      let targetBody: HTMLTableSectionElement;
      const beginTable = () => {
        table = block.cloneNode(true) as HTMLElement;
        table.querySelectorAll("tbody,tfoot").forEach(part => part.remove());
        Array.from(table.children).filter(part => part.tagName === "TR").forEach(part => part.remove());
        targetBody = document.createElement("tbody"); table.append(targetBody); content.append(table);
      };
      beginTable();
      for (const row of rows) {
        targetBody!.append(row);
        if (usedHeight() <= available + 1) continue;
        row.remove();
        if (!targetBody!.children.length) table!.remove();
        if (content.children.length) createPage();
        beginTable(); targetBody!.append(row);
        if (usedHeight() > available + 1) {
          page!.style.height = "auto";
          page!.querySelectorAll<HTMLElement>(":scope > footer").forEach(footer => { footer.style.position = "static"; });
          oversized = true;
        }
      }
      if (!rows.length) { table!.remove(); addBlock(block); }
    }
    original.remove();
  }
  result.forEach((page, index) => {
    page.dataset.docxPage = String(index + 1);
    page.setAttribute("aria-label", `Page ${index + 1}`);
    replacePageFields(page, index, result.length);
  });
  return { pages: result, oversized };
}

export async function renderDocxView(bytes: Uint8Array, body: HTMLElement, styles: HTMLElement) {
  const { renderAsync } = await import("docx-preview");
  const prepared = await preparePageFields(bytes);
  await renderAsync(prepared, body, styles, {
    className: DOCX_CLASS, inWrapper: false, ignoreWidth: false, ignoreHeight: false,
    ignoreFonts: false, breakPages: true, ignoreLastRenderedPageBreak: false,
    renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true,
    renderAltChunks: false, renderChanges: false, useBase64URL: true,
  });
  sanitizeDocxDOM(body);
  // Trigger layout before waiting for the fonts used in this iframe.
  void body.offsetHeight;
  await body.ownerDocument.fonts?.ready;
  await Promise.all(Array.from(body.querySelectorAll("img")).map(image => image.decode?.().catch(() => undefined)));
  return paginateDocx(body);
}
