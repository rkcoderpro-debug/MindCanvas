import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "esbuild";

const executable = process.env.MINDCANVAS_CHROMIUM;
if (!executable) throw new Error("Set MINDCANVAS_CHROMIUM to your Chrome, Edge or Chromium executable.");
const web = fileURLToPath(new URL("../", import.meta.url));
const origin = "https://mindcanvas.test";
const require = createRequire(import.meta.url);
const token = "ab".repeat(24);
const assets = new Map();
const compiled = await build({
  absWorkingDir: web, entryPoints: ["scripts/responsive/fixture.tsx"], outdir: "qa", entryNames: "app",
  write: false, bundle: true, format: "iife", jsx: "automatic", external: ["livekit-client"],
  define: { "import.meta.env": JSON.stringify({ VITE_API_BASE_URL: origin }), "process.env.NODE_ENV": '"production"' },
  loader: { ".woff2": "dataurl", ".woff": "dataurl", ".ttf": "dataurl", ".png": "dataurl" },
  plugins: [{
    name: "fixtures",
    setup(plugin) {
      plugin.onResolve({ filter: /\?url$/ }, ({ path }) => ({ path, namespace: "fixture-asset" }));
      plugin.onLoad({ filter: /.*/, namespace: "fixture-asset" }, async ({ path }) => {
        const resolved = require.resolve(path.replace(/\?url$/, ""));
        const url = "/assets/" + encodeURIComponent(resolved.split(/[\\/]/).at(-1));
        assets.set(url, ["text/javascript", await readFile(resolved)]);
        return { contents: "export default " + JSON.stringify(url) };
      });
      plugin.onResolve({ filter: /\/lib\/(activityNotifications|systemAnnouncements)$/ }, ({ path }) => ({
        path: path.split("/").at(-1), namespace: "fixture-notifications",
      }));
      plugin.onLoad({ filter: /.*/, namespace: "fixture-notifications" }, ({ path }) => {
        const created = "2026-01-01T00:00:00Z";
        const title = "Thông báo " + "tên_tệp_dài_".repeat(40);
        const activity = Array.from({ length: 12 }, (_, index) => ({
          kind: "message", source_id: "message-" + index, actor_id: "peer", title, preview: "Nội dung".repeat(20),
          target: "connections", target_id: "peer", created_at: created, read_at: null,
        }));
        const broadcast = { id: "notice", title, body: "Chi tiết ".repeat(45), published_at: created, read_at: null };
        const exports = path === "activityNotifications"
          ? 'export const listActivityNotifications = async () => ' + JSON.stringify(activity) + ';export const markActivityNotificationRead = async () => {};'
          : 'export const listSystemAnnouncements = async () => (' + JSON.stringify({ items: [broadcast], unreadCount: 1, hasMore: false }) +
            ');export const markSystemAnnouncementRead = async () => "2026-01-01";';
        return { resolveDir: web, contents: 'export * from "./src/lib/' + path + '.ts";' + exports };
      });
      plugin.onResolve({ filter: /\/lib\/connections$/ }, () => ({ path: "contacts", namespace: "fixture-contacts" }));
      plugin.onLoad({ filter: /^contacts$/, namespace: "fixture-contacts" }, () => ({
        resolveDir: web,
        contents: 'export * from "./src/lib/connections.ts";' +
          'export const listConnections = async () => new URLSearchParams(location.search).has("pending-connections") ? new Promise(() => {}) : [{peer_id:"peer",display_name:"' + "A".repeat(90) +
          '",unread_count:0,connected_at:"2026-01-01T00:00:00Z"}];' +
          'export const listBlockedConnections=async()=>[]; export const markDirectMessagesRead=async()=>{};' +
          'export const sendDirectMessage=async()=>{};' +
          'export const listDirectMessages = async () => [{id:"1",sender_id:"peer",recipient_id:"reader",body:"' +
          "dòng văn bản ".repeat(25) + '",resource_kind:null,created_at:"2026-01-01T00:00:00Z"}];',
      }));
    },
  }],
});
for (const output of compiled.outputFiles) {
  const path = output.path.split(/[\\/]/).at(-1);
  const css = path.endsWith(".css");
  assets.set("/" + path, [css ? "text/css" : "text/javascript", css ? output.text.replace(/^@import[^\r\n]*\r?\n/gm, "") : output.contents]);
}
const html = '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script></html>';
const profileRoot = await realpath(tmpdir());
const tmp = await realpath(await mkdtemp(join(profileRoot, "mindcanvas-responsive-")));
assert(dirname(tmp) === profileRoot && basename(tmp).startsWith("mindcanvas-responsive-"));
const browser = spawn(executable, [
  "--headless", "--disable-gpu", "--disable-background-networking", "--no-first-run", "--remote-debugging-pipe",
  "--user-data-dir=" + tmp, ...(process.env.MINDCANVAS_TEST_NO_SANDBOX === "1" ? ["--no-sandbox"] : []),
], { stdio: ["ignore", "ignore", "inherit", "pipe", "pipe"] });
const pending = new Map();
let messageId = 0, buffer = "";
let fetchError;
function send(method, params, sessionId) {
  const id = ++messageId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("CDP timeout: " + method)); }, 12_000);
    pending.set(id, (error, value) => { clearTimeout(timer); if (error) reject(error); else resolve(value); });
    browser.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + "\0");
  });
}
browser.once("error", error => { for (const finish of pending.values()) finish(error); pending.clear(); });
browser.stdio[4].setEncoding("utf8").on("data", chunk => {
  buffer += chunk;
  const messages = buffer.split("\0");
  buffer = messages.pop();
  for (const raw of messages) {
    const event = JSON.parse(raw);
    if (event.id) {
      pending.get(event.id)?.(event.error ? new Error(event.error.message) : null, event.result);
      pending.delete(event.id);
    } else if (event.method === "Fetch.requestPaused") {
      const { requestId, request } = event.params;
      const url = new URL(request.url);
      const data = { state: "ok", role: "viewer", kind: "file", title: "tệp-".repeat(40) + ".json",
        id: "33333333-3333-4333-8333-333333333333", data: { size: 480, revision: "qa" } };
      let resource = assets.get(url.pathname);
      if (url.pathname.endsWith("/download")) resource = ["application/json", JSON.stringify({ title: "nội dung ".repeat(60) })];
      if (url.pathname.endsWith("/open")) resource = ["application/json", JSON.stringify(data)];
      const knownHost = url.origin === origin;
      const [mime, content] = knownHost ? resource ?? ["text/html", html] : ["text/plain", ""];
      void send("Fetch.fulfillRequest", {
        requestId, responseCode: knownHost ? 200 : 404, responseHeaders: [{ name: "Content-Type", value: mime }],
        body: Buffer.from(content).toString("base64"),
      }, event.sessionId).catch(error => { fetchError = error; });
    }
  }
});

try {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  await page("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  const evaluate = async expression => {
    if (fetchError) throw fetchError;
    const result = await page("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = async (expression, label = expression, timeout = 4000) => {
    const until = Date.now() + timeout;
    do {
      if (await evaluate(expression)) return;
      await delay(35);
    } while (Date.now() < until);
    throw new Error("Timed out: " + label);
  };
  const dom = selector => "document.querySelector(" + JSON.stringify(selector) + ")";
  const open = async (path, selector) => {
    await page("Page.navigate", { url: origin + path });
    const location = new URL(origin + path);
    await wait("location.pathname === " + JSON.stringify(location.pathname) + " && location.search === " +
      JSON.stringify(location.search) + " && " + dom(selector) + "?.getClientRects().length", path + " " + selector, 8000);
  };
  const resize = (width, height, mobile = width <= 480, dpr = 1) =>
    page("Emulation.setDeviceMetricsOverride", { width, height, mobile, deviceScaleFactor: dpr });
  const click = async (selector, touch = false) => {
    const position = "(() => {const e = " + dom(selector) +
      "; if (!e) return null; const b=e.getBoundingClientRect(); const x=b.x+b.width/2,y=b.y+b.height/2; const target=document.elementFromPoint(x,y);return {x,y,hit:e.contains(target),coveredBy:target?.closest('[class]')?.getAttribute('class'),width:b.width,height:b.height};})()";
    let point;
    for (let attempt = 0; attempt < 15; attempt++) {
      point = await evaluate(position);
      if (point?.hit) break;
      if (attempt === 0) await evaluate(dom(selector) + "?.scrollIntoView({block:'nearest',inline:'nearest'})");
      await delay(40);
    }
    assert(point?.hit, JSON.stringify({ selector, point }));
    if (touch) {
      await page("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: point.x, y: point.y }] });
      await page("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      for (const type of ["mousePressed", "mouseReleased"]) {
        await page("Input.dispatchMouseEvent", { type, x: point.x, y: point.y, button: "left", clickCount: 1 });
      }
    }
    return point;
  };
  const chatPanel = dom(".chat-bubble-panel");
  const chatLauncher = dom(".chat-bubble-toggle");
  const chatOpened = () => wait(chatPanel + "?.getClientRects().length > 0 && !" + chatLauncher + "?.getClientRects().length", "Only the chat panel should be visible");
  const chatClosed = () => wait(chatLauncher + "?.getClientRects().length > 0 && !" + chatPanel + "?.getClientRects().length", "Only the chat launcher should be visible");
  const checkWidth = async label => {
    const dimensions = await evaluate("(() => {const main=document.querySelector('.main-area');return [document.documentElement.scrollWidth,innerWidth,main?.scrollWidth,main?.clientWidth];})()");
    if (dimensions[0] <= dimensions[1] + 1 && (!dimensions[3] || dimensions[2] <= dimensions[3] + 1)) return;
    const outside = await evaluate("(() => {const main=document.querySelector('.main-area'); const end=main?.getBoundingClientRect().right??innerWidth; return [...(main??document.body).querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right > end+1).slice(0,6).map(e=>e.tagName+'.'+e.getAttribute('class'));})()");
    assert.fail(label + ": " + dimensions.join("/") + " " + JSON.stringify(outside));
  };
  const seededContent = { quiz: ".quiz-test-card", flashcards: ".deck-item", lab: ".lab-card-open", plan: ".planner-decks > label" };
  const screens = [
    ["/", ".home-heading"], ["/?folders=all", ".workspace-folder-browser"], ["/?folders=library", ".document-browse-surface"],
    ["/?view=shared", ".shared-learning"], ["/?profile=1", ".profile-screen"],
    ["/?view=shared#share=" + token, ".shared-document-reader pre"],
    ["/?learn=overview", ".learning-space-heading"],
    ...["quiz", "flashcards", "lab", "exams", "plan", "progress", "tools", "connections", "classrooms", "music", "rooms"].map(tab => {
      const section = '[data-learning-tool="' + tab + '"]:not([hidden])';
      return ["/?learn=" + tab, seededContent[tab] ? section + " " + seededContent[tab] : section];
    }),
  ];
  const allSizes = [[280,720],[320,568],[360,640],[390,844],[430,932],[512,768],[620,620],[621,620],[640,480],[768,1024],[844,390],[900,360],[1024,600],[1180,820],[1366,768],[1920,1080],[3440,1440]];
  const authoringOnly = process.argv.includes("--authoring-only");
  const readerOnly = process.argv.includes("--reader-only");
  const sizes = authoringOnly || readerOnly || process.argv.includes("--interactions-only") ? []
    : process.argv.includes("--quick") ? [[320,568],[844,390]] : allSizes;
  const failures = [];
  let passed = 0;
  for (const [width, height] of sizes) {
    await resize(width, height, width <= 480, width === 390 ? 3 : width === 1180 ? 2 : 1);
    for (const [path, selector] of screens) {
      try { await open(path, selector); await checkWidth(width + "×" + height + " " + path); passed++; }
      catch (error) {
        failures.push(width + "×" + height + " " + path + " " + error.message);
        console.error(failures.at(-1));
      }
    }
    console.log("Checked " + width + "×" + height + " (" + failures.length + " cumulative failures)");
  }
  console.log("Route and layout checks: " + passed + "/" + (sizes.length * screens.length));
  assert.equal(failures.length, 0, "Responsive route overflow or load failures");
  if (!process.argv.includes("--layout-only")) {
    if (!authoringOnly && !readerOnly) {
      await checkTopbar();
      await checkNavigationDock();
      await checkInteractions();
    }
    if (!readerOnly) await checkAuthoring();
    if (!authoringOnly) await checkReaders();
  }

  async function checkReaders() {
    const openFile = async (kind, ready, touch) => {
      const row = ".document-library-list > button[data-document-kind=" + kind + "]";
      await open("/?folders=library", row);
      await click(row, touch);
      await wait(dom(ready) + "?.getClientRects().length", kind + " reader is ready", 8000);
    };
    const readerFits = async (selector, label) => {
      const check = (body) => {
        const reader = body.closest(".document-reader, .shared-document-reader");
        const bounds = body.getBoundingClientRect(), frame = reader.getBoundingClientRect();
        const nav = document.querySelector(".mobile-compact-nav")?.getBoundingClientRect();
        return reader.scrollWidth <= reader.clientWidth + 1 && bounds.height >= 85 && frame.top >= 0
          && frame.bottom <= (nav?.height ? nav.top : innerHeight) + 1 && frame.left >= 0 && frame.right <= innerWidth;
      };
      try { await wait("(" + check + ")(" + dom(selector) + ")", label); }
      catch (error) {
        const dimensions = body => {
          const nodes = [body, body.closest(".document-reader, .shared-document-reader"), ...[".document-reader-bar",".document-reader-identity",".document-reader-controls",".document-pdf-zoom-control",".document-reader-footer",".document-pager",".document-reader-pdf",".document-tool-workspace",".document-reader-annotation"].map(name => document.querySelector(name)), body.closest("[data-reader-fitted]"), document.querySelector(".main-area"), document.querySelector(".topbar"), document.querySelector(".mobile-compact-nav")];
          return nodes.map(node => {
            if (!node) return null;
            const box = node.getBoundingClientRect(), style = getComputedStyle(node);
            return [node.className, box.left, box.top, box.right, box.bottom, node.scrollWidth, node.clientWidth, style.getPropertyValue("--reader-available-height"), style.paddingBottom];
          });
        };
        const measured = await evaluate("(" + dimensions + ")(" + dom(selector) + ")");
        throw new Error(label + ": " + JSON.stringify(measured), { cause: error });
      }
    };

    for (const [width, height] of [[320, 340], [390, 844], [820, 390]]) {
      const touch = width <= 480;
      await resize(width, height, touch, width === 390 ? 3 : 1);
      await page("Emulation.setTouchEmulationEnabled", { enabled: touch, maxTouchPoints: 1 });
      await openFile("pdf", ".pdf-page-shell[data-fit]", touch);
      await readerFits(".document-pdf-body", "PDF reading area at " + width);
      const toggle = await click(".reader-more-toggle", touch);
      if (touch) assert(toggle.width >= 44 && toggle.height >= 44);
      const menuFits = (panel) => {
        const menu = panel.getBoundingClientRect(), frame = panel.closest(".document-reader").getBoundingClientRect();
        return menu.height >= 50 && menu.top >= frame.top && menu.bottom <= frame.bottom && menu.right <= frame.right;
      };
      await wait("(" + menuFits + ")(" + dom(".reader-more-panel") + ")", "PDF menu stays in the reader at " + width);
      await page("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await page("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await wait("!" + dom(".reader-more-panel"));
      await click(".document-reader-footer button:last-of-type", touch);
      await wait(dom(".document-reader-footer") + ".textContent.includes('2 / 2')");
      await checkWidth("PDF Workspace at " + width);
    }

    await resize(390, 780, true);
    await page("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await open("/qa/pdf", ".pdf-page-shell[data-fit]");
    await evaluate(dom(".document-viewer") + ".requestFullscreen = async () => { throw new Error('Unavailable'); }");
    await click(".document-fullscreen-toggle", true);
    await wait(dom(".document-reader.is-fullscreen") + "?.getClientRects().length");
    await click(".document-fullscreen-toggle", true);
    await wait("!" + dom(".document-reader.is-fullscreen"));
    await click(".document-fullscreen-toggle", true);
    await wait(dom(".document-reader.is-fullscreen") + "?.getClientRects().length");
    assert.equal(await evaluate("getComputedStyle(" + dom(".document-pdf-body") + ").touchAction"), "auto");
    const pdfBounds = await evaluate("(() => {const b=" + dom(".document-pdf-body") + ".getBoundingClientRect();return [b.left + b.width/2,b.top + b.height*.7];})()");
    const [x, y] = pdfBounds;
    for (let step = 0; step < 2; step++) await click(".document-reader-controls .document-pdf-zoom-control button:last-child", true);
    await wait(dom(".document-pdf-body") + ".scrollHeight > " + dom(".document-pdf-body") + ".clientHeight + 32");
    await evaluate(dom(".document-pdf-body") + ".scrollTop = 0");
    await page("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (const distance of [40, 85, 135]) await page("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - distance }] });
    await page("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await wait(dom(".document-pdf-body") + ".scrollTop > 20", "fullscreen read-only PDF scrolls by touch");
    await page("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await page("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await wait("!" + dom(".document-reader.is-fullscreen"));

    await resize(820, 480, false);
    await page("Emulation.setTouchEmulationEnabled", { enabled: false, maxTouchPoints: 1 });
    await openFile("docx", ".docx-page-control button:last-child:not(:disabled)", false);
    await click(".docx-page-control button:last-child");
    await wait(dom(".docx-page-control span") + ".textContent.includes('2 / 3')");
    await resize(390, 680, true);
    await readerFits(".docx-document-viewport", "DOCX after resize");
    await wait(dom(".docx-page-control span") + ".textContent.includes('2 / 3')", "Word keeps the current page on resize");
    assert(await evaluate(dom(".docx-document-viewport") + ".scrollTop > 80"));

    await resize(360, 450, true);
    await openFile("xlsx", ".office-sheet-tabs button:last-child", true);
    await readerFits(".office-html", "XLSX reading area");
    await click(".office-sheet-tabs button:last-child", true);
    await wait(dom(".office-html") + ".textContent.includes('Sheet Two')");
    const sheetsStayVisible = () => {
      const table = document.querySelector(".office-html"), tabs = document.querySelector(".office-sheet-tabs");
      const before = tabs.getBoundingClientRect();
      table.scrollLeft = 90; table.scrollTop = 80;
      const after = tabs.getBoundingClientRect();
      return table.scrollLeft > 0 && table.scrollTop > 0 && before.top === after.top && before.left === after.left;
    };
    assert(await evaluate("(" + sheetsStayVisible + ")()"), "XLSX tabs stay visible while scrolling the sheet");
    await resize(740, 390, false);
    await wait(dom(".office-sheet-tabs button:last-child") + ".getAttribute('aria-pressed') === 'true'");
    await readerFits(".office-html", "XLSX after rotation");

    await resize(360, 430, true);
    await open("/?view=shared#share=" + token, ".shared-document-reader pre");
    await readerFits(".shared-document-reader pre", "Shared text document on a short phone");
    await click(".shared-document-reader .reader-more-toggle", true);
    await wait(dom(".shared-document-reader .reader-more-panel button:last-of-type") + "?.getClientRects().length", "Shared file keeps reload and sign-in actions reachable");
    console.log("PDF viewport, fullscreen touch, Word reading position, XLSX scroll, and shared document layout passed.");
  }

  async function checkAuthoring() {
    const setKeyboard = async (visible) => {
      const resizeVisualViewport = (opened) => {
        const viewport = window.visualViewport;
        if (opened) Object.defineProperties(viewport, { height: { configurable: true, value: 190 }, offsetTop: { configurable: true, value: 12 } });
        else { delete viewport.height; delete viewport.offsetTop; }
        viewport.dispatchEvent(new Event("resize"));
      };
      await evaluate("(" + resizeVisualViewport + ")(" + visible + ")");
    };
    const fill = async (selector, value) => {
      await evaluate(dom(selector) + ".focus()");
      await wait("document.activeElement === " + dom(selector));
      await page("Input.insertText", { text: value });
      await wait(dom(selector) + ".value === " + JSON.stringify(value));
    };
    const tracks = selector => "getComputedStyle(" + dom(selector) + ").gridTemplateColumns.trim().split(/\\s+/).length";
    const checkDialogWidth = async (selector, label) => {
      const measure = dialog => [
        dialog.scrollWidth, dialog.clientWidth,
        ...Array.from(dialog.querySelectorAll(".dialog-scroll, .quiz-studio-pane"), box => [box.scrollWidth, box.clientWidth]).flat(),
      ];
      const dimensions = await evaluate("(" + measure + ")(" + dom(selector) + ")");
      assert(dimensions.every((width, index) => index % 2 || width <= dimensions[index + 1] + 1), label + " overflows: " + dimensions);
    };
    const checkFocusAboveKeyboard = async selector => {
      const visible = (field) => {
        const dialog = field.closest("dialog");
        const box = dialog.getBoundingClientRect(), input = field.getBoundingClientRect();
        const titleEnd = dialog.querySelector(".dialog-titlebar").getBoundingClientRect().bottom;
        return document.activeElement === field && box.top >= 11 && box.bottom <= 203
          && Math.min(box.bottom, input.bottom) - Math.max(titleEnd, input.top) >= 28;
      };
      await wait("(" + visible + ")(" + dom(selector) + ")", selector + " stays reachable above the keyboard");
    };

    for (const tab of ["quiz", "flashcards"]) {
      await resize(320, 280, true);
      await page("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
      if (tab === "quiz") {
        await open("/?learn=quiz", ".quiz-heading .primary-button");
        await click(".quiz-heading .primary-button", true);
        await wait(dom("dialog[open] [id$='-tab-ai_manual']") + "?.getClientRects().length");
        await click("dialog[open] [id$='-tab-ai_manual']", true);
      } else {
        await open("/?learn=flashcards", ".deck-select");
        await click(".deck-select", true);
        await wait(dom(".flashcards-ai-trigger") + "?.getClientRects().length");
        await click(".flashcards-ai-trigger", true);
      }

      const dialog = "dialog.quiz-studio-ai_manual[open]";
      const input = dialog + " .quiz-json-input";
      const panes = dialog + " .quiz-studio-panes";
      const draft = JSON.stringify({ title: "Nội dung " + "tên_dài_".repeat(26) });
      await wait(dom(input) + "?.getClientRects().length");
      await wait(tracks(panes) + " === 1", tab + " single-column form in a narrow landscape window");
      await checkDialogWidth(dialog, tab + " at 320 × 280");
      await fill(input, draft);
      await setKeyboard(true);
      await checkFocusAboveKeyboard(input);
      await setKeyboard(false);
      await resize(980, 620, false);
      await wait(tracks(panes) + " === 2", tab + " columns on a wider display");
      assert(await evaluate("(getComputedStyle(" + dom(dialog + " .quiz-studio-prompt") + ").overflowY === 'auto')"));
      await checkDialogWidth(dialog, tab + " in two columns");
      await setKeyboard(true);
      await wait(tracks(panes) + " === 1", tab + " stacks while the keyboard is open");
      await checkFocusAboveKeyboard(input);
      assert.equal(await evaluate(dom(input) + ".value"), draft);
      await setKeyboard(false);
      await resize(620, 330, false);
      await wait(tracks(panes) + " === 1", tab + " stacks in a shallow tablet window");
      assert.equal(await evaluate(dom(input) + ".value"), draft);
      await click(dialog + " .dialog-titlebar button");
      await wait("!" + dom(dialog));
    }

    await resize(280, 370, true);
    await open("/?learn=lab", ".lab-add-button:not(:disabled)");
    await click(".lab-add-button", true);
    const lab = "dialog.lab-editor-dialog[open]";
    await wait(dom(lab) + "?.getClientRects().length");
    const footer = lab + " .lab-editor-footer";
    const footerFits = (section) => {
      const dialog = section.closest("dialog"), frame = dialog.getBoundingClientRect(), bounds = section.getBoundingClientRect();
      const scroll = dialog.querySelector(".dialog-scroll");
      return Math.abs(bounds.bottom - frame.bottom) <= 2 && scroll.scrollHeight > scroll.clientHeight
        && getComputedStyle(dialog).overflowY === "hidden" && Array.from(section.querySelectorAll("button")).every(button => button.getBoundingClientRect().height >= 44);
    };
    await wait("(" + footerFits + ")(" + dom(footer) + ")", "Lab actions stay at the bottom of the editor");
    await checkDialogWidth(lab, "Lab editor at 280 × 370");
    await click(lab + " .lab-input-switch button:last-of-type", true);
    await wait(dom(lab + " .lab-html-code") + "?.getClientRects().length");
    const title = "Lab responsive";
    await fill(lab + " .lab-editor > label > input", title);
    await fill(lab + " .lab-html-code", "<!doctype html><html><body><h1>Lab responsive</h1></body></html>");
    await setKeyboard(true);
    await checkFocusAboveKeyboard(lab + " .lab-html-code");
    await setKeyboard(false);
    await resize(820, 390, false);
    await page("Emulation.setTouchEmulationEnabled", { enabled: false, maxTouchPoints: 1 });
    await click(footer + " .lab-actions .secondary-button");
    const preview = lab + " .lab-editor-preview";
    await wait("document.activeElement === " + dom(preview) + " && " + dom(preview + " iframe") + "?.getClientRects().length");
    assert(await evaluate(dom(preview) + ".getBoundingClientRect().top < " + dom(lab + " .dialog-scroll") + ".getBoundingClientRect().bottom - 24"));
    await click(footer + " .primary-button");
    await wait("!" + dom(lab) + " && " + dom(".lab-library") + "?.textContent.includes(" + JSON.stringify(title) + ")");

    await resize(780, 390, false);
    await open("/?learn=exams", ".document-type-cards > button");
    await wait(tracks(".document-type-cards") + " === 1", "Document tools stack beside a visible sidebar");
    await checkWidth("Document creation at 780 × 390");
    await resize(1180, 820, false);
    await wait(tracks(".document-type-cards") + " === 2", "Document tools use two cards in a wide workspace");
    await click(".document-type-cards > button:first-child");
    await wait(dom(".takenote-builder .note-settings-grid") + "?.getClientRects().length");
    await resize(320, 568, true);
    await wait(tracks(".takenote-builder .note-settings-grid") + " === 1", "Takenote settings stack on a phone");
    await checkWidth("Takenote on a phone");
    await click(".topbar .shell-back", true);
    await wait(dom(".document-creator-home:not([hidden]) .document-type-cards button") + "?.getClientRects().length");
    await click(".document-type-cards > button:last-child", true);
    await wait(dom(".exam-builder-page .studio-workflow") + "?.getClientRects().length", "Exam builder opens on a phone");
    await checkWidth("Exam builder on a phone");
    console.log("Quiz and Flashcard authoring, Lab preview and save, Takenote and Exam layout passed on compact and wide screens.");
  }

  async function checkTopbar() {
    const closeWithEscape = async () => {
      for (const type of ["keyDown", "keyUp"]) {
        await page("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      }
    };
    const checkPanel = async (selector, label) => {
      const dimensions = (panel) => {
        const bounds = panel.getBoundingClientRect();
        const bar = document.querySelector(".topbar").getBoundingClientRect();
        const viewport = visualViewport;
        const nav = document.querySelector(".mobile-compact-nav")?.getBoundingClientRect();
        const left = Math.max(viewport.offsetLeft, bar.left);
        const right = Math.min(viewport.offsetLeft + viewport.width, bar.right);
        const end = Math.min(viewport.offsetTop + viewport.height, nav?.height ? nav.top : Infinity);
        return {
          panel: [bounds.left, bounds.top, bounds.right, bounds.bottom], visible: [left, viewport.offsetTop, right, end],
          fits: bounds.left >= left && bounds.right <= right && bounds.top >= viewport.offsetTop && bounds.bottom <= end,
          scrollsWithoutOverflow: panel.scrollWidth <= panel.clientWidth + 1,
        };
      };
      const measure = "(" + dimensions + ")(" + dom(selector) + ")";
      await wait(measure + ".fits && " + measure + ".scrollsWithoutOverflow", label);
    };

    const actions = () => {
      const bar = document.querySelector(".topbar");
      const frame = bar.getBoundingClientRect();
      return [...bar.querySelectorAll("button")].map(button => {
        const r = button.getBoundingClientRect();
        return [button.getAttribute("aria-label") ?? button.className, r.width, r.height, r.left - frame.left, frame.right - r.right];
      });
    };
    for (const [width, height] of [[280,370],[390,844],[512,320],[650,390],[820,480],[1180,820]]) {
      const touch = width <= 512 || width === 820;
      await resize(width, height, width <= 480, width === 390 ? 3 : 1);
      await page("Emulation.setTouchEmulationEnabled", { enabled: touch, maxTouchPoints: 1 });
      await open("/qa/topbar" + (width === 390 || width === 650 ? "?pinned" : ""), ".notification-trigger");
      const geometry = await evaluate("(" + actions + ")()");
      assert(geometry.every(([, w, h, l, r]) => w > 0 && h > 0 && l >= -1 && r >= -1), width + " topbar actions: " + JSON.stringify(geometry));
      if (touch) assert(geometry.every(([, w, h]) => w >= 44 && h >= 44), "Small touch target at " + width);
      await click(".notification-trigger", touch);
      await wait(dom(".notification-item-link") + "?.getClientRects().length");
      await checkPanel(".notification-panel", width + " notification");
      assert(await evaluate(dom(".notification-list") + ".scrollHeight > " + dom(".notification-list") + ".clientHeight"));
      await click("#notification-tab-system", touch);
      await wait(dom("#notification-tab-system[aria-selected=true]") + "?.getClientRects().length");
      await click(".notification-item-link", touch);
      await wait(dom(".announcement-body") + "?.getClientRects().length");
      await checkPanel(".notification-panel", width + " expanded notice");
      if (touch) await click(".notification-panel > header button:last-child", true);
      else await closeWithEscape();
      await wait("!" + dom(".notification-panel") + " && document.activeElement === " + dom(".notification-trigger"));
      await click(".topbar-profile-button", touch);
      await wait(dom(".topbar-profile-menu") + "?.getClientRects().length");
      await checkPanel(".topbar-profile-menu", width + " account menu");
      await click(".topbar-profile-menu button:first-of-type", touch);
      await wait("!" + dom(".topbar-profile-menu") + " && " + dom("#qa-topbar-selection") + ".value === 'profile'");
    }

    await resize(650, 390, false);
    await open("/qa/topbar?pinned", ".notification-trigger");
    await click(".notification-trigger");
    await wait(dom(".notification-item-link") + "?.getClientRects().length");
    await resize(320, 360, true);
    await wait("innerWidth === 320 && " + dom(".mobile-compact-nav") + "?.getClientRects().length");
    await checkPanel(".notification-panel", "notification after resize");
    await click(".notification-item-link", true);
    await wait("!" + dom(".notification-panel") + " && " + dom("#qa-topbar-selection") + ".value === 'message-0'");
    for (const [width, height] of [[320,568], [390,844], [844,390]]) {
      await resize(width, height);
      await open("/?learn=overview", ".learning-space-heading");
      await click(".topbar .command-trigger", width <= 480);
      await wait("document.activeElement === " + dom(".command-dialog[open] .command-search input"));
      await page("Input.insertText", { text: "quiz" });
      await wait(dom(".command-results [data-guide-tab=quiz]") + "?.getClientRects().length && " + dom(".command-search input") + ".value === 'quiz'");
      await evaluate("Object.defineProperties(visualViewport,{height:{configurable:true,value:200},offsetTop:{configurable:true,value:12}});visualViewport.dispatchEvent(new Event('resize'));");
      const dimensions = () => {
        const dialog = document.querySelector(".command-dialog"), input = dialog.querySelector("input");
        const results = dialog.querySelector(".command-results"), box = dialog.getBoundingClientRect();
        return { fits: box.top >= 12 && box.bottom <= 212, input: input.value, results: results.clientHeight };
      };
      const search = await evaluate("(" + dimensions + ")()");
      assert(search.fits && search.input === "quiz" && search.results >= 50, width + " search with keyboard: " + JSON.stringify(search));
      await click(".command-results [data-guide-tab=quiz]", width <= 480);
      await wait("!" + dom(".command-dialog[open]") + " && new URLSearchParams(location.search).get('learn') === 'quiz'");
    }
    console.log("Topbar, notifications, account and quick search passed on compact phones, tablets and shallow desktop windows.");
  }

  async function checkNavigationDock() {
    await resize(1024, 768, false);
    await open("/qa/navigation?learn=overview", ".chat-bubble-toggle");
    await click(".sidebar-toggle-button");
    await wait(dom(".sidebar.sidebar-collapsed") + "?.getClientRects().length");

    for (const [width, height] of [[280, 620], [320, 430], [390, 844], [480, 480], [481, 700], [620, 660]]) {
      await resize(width, height);
      const bottomBar = width <= 480;
      const more = bottomBar ? ".mobile-compact-nav > button:last-child" : ".sidebar-toggle-button";
      await wait(dom(more) + "?.getClientRects().length && !document.querySelector('.sidebar.sidebar-collapsed')");
      if (bottomBar) {
        await evaluate("(() => { const content = document.querySelector('.main-area'); content.style.backdropFilter = 'blur(8px)'; content.scrollTop = content.scrollHeight; })()");
        const clearance = selector => evaluate("document.querySelector('.mobile-compact-nav').getBoundingClientRect().top - " +
          dom(selector) + ".getBoundingClientRect().bottom");
        const gap = await clearance(".chat-bubble-toggle");
        assert(gap >= 10, "Chat launcher clearance at " + width + ": " + gap);
        const shadow = await evaluate("getComputedStyle(" + chatLauncher + ").boxShadow");
        assert.equal(shadow.match(/-?[\d.]+px/g)?.join(" "), "0px 2px 6px 0px", "Chat launcher should have a single compact shadow");
        await click(".chat-bubble-toggle", true);
        await chatOpened();
        await wait(dom(".connections-person") + "?.getClientRects().length");
        assert(await clearance(".chat-bubble-panel") >= 6, "Open chat overlays the navigation at " + width);
        const closeButton = await click(".chat-bubble-panel > header button", true);
        assert(closeButton.width >= 44 && closeButton.height >= 44, "Chat close tap target is too small");
        await chatClosed();
      }
      await click(more);
      await wait(dom(".sidebar.mobile-open .folder-row") + "?.getClientRects().length");
      const drawer = await evaluate(`(() => {
        const sheet = document.querySelector(".sidebar.mobile-open");
        const menu = sheet.querySelector(".nav-list");
        const rows = [...menu.children].map(row => row.getBoundingClientRect());
        const folder = sheet.querySelector(".folder-row");
        const arrow = folder.querySelector(".folder-expand-toggle").getBoundingClientRect();
        const icon = folder.querySelector(".folder-open svg").getBoundingClientRect();
        const actions = folder.querySelector(".folder-more");
        return {
          fits: sheet.scrollWidth <= sheet.clientWidth + 1 && sheet.getBoundingClientRect().bottom <= innerHeight,
          menuFits: menu.scrollWidth <= menu.clientWidth + 1 && getComputedStyle(menu).maskImage === "none",
          fullWidth: menu.clientWidth >= sheet.clientWidth - 24,
          stacked: rows.slice(1).every((row, index) => row.top >= rows[index].bottom - 1),
          aligned: icon.left >= arrow.right && icon.left <= arrow.right + 14,
          actionsVisible: getComputedStyle(actions).opacity === "1" && actions.getBoundingClientRect().width >= 36,
        };
      })()`);
      assert(Object.values(drawer).every(Boolean), "Mobile drawer at " + width + ": " + JSON.stringify(drawer));
      await click(".sidebar.mobile-open .folder-expand-toggle");
      await wait(dom(".sidebar.mobile-open .workspace-tree-children .folder-open") + "?.getClientRects().length");
      await click(".sidebar.mobile-open .folder-expand-toggle");
      await click(".sidebar.mobile-open .sidebar-toggle-button");
      await wait("!document.querySelector('.sidebar.mobile-open')");
      await checkWidth("Navigation after closing drawer at " + width);
    }
    await resize(1024, 768, false);
    await wait(dom(".sidebar.sidebar-collapsed") + "?.getClientRects().length");
    await click(".sidebar-toggle-button");
    await wait("!document.querySelector('.sidebar.sidebar-collapsed')");
    await resize(390, 844);
    await open("/qa/chat?pending-connections", ".chat-bubble-toggle");
    for (let attempt = 0; attempt < 2; attempt++) {
      await click(".chat-bubble-toggle", true);
      await chatOpened();
      await wait(dom(".connections-people [role=status]") + "?.getClientRects().length");
      await click(".chat-bubble-panel > header button", true);
      await chatClosed();
    }
    console.log("Mobile tools drawer and chat clearance passed at six widths. Chat closes by touch even while loading.");
  }

  async function checkInteractions() {

    await resize(1366, 768, false);
    await open("/?canvas=11111111-1111-4111-8111-111111111111", ".canvas-svg");
    const center = () => evaluate("(() => {const f=document.querySelector('.editor-frame'), m=document.querySelector('[data-canvas-viewport]').transform.baseVal.consolidate().matrix;return [(f.clientWidth/2-m.e)/m.a,(f.clientHeight/2-m.f)/m.d];})()");
    const before = await center();
    const sameCanvas = await evaluate("(window.qaCanvas = document.querySelector('.canvas-svg'), true)");
    assert(sameCanvas);
    await resize(844, 390, false);
    await delay(230);
    const after = await center();
    assert(before.every((value, index) => Math.abs(after[index] - value) <= 2), "Canvas center moved: " + [before, after]);
    assert(await evaluate("window.qaCanvas === document.querySelector('.canvas-svg')"));
    await checkWidth("Canvas landscape");
    await resize(512, 768, false);
    await delay(190);
    if (!await evaluate(dom(".canvas-inspector.is-open") + "?.getClientRects().length")) await click(".inspector-toggle");
    await wait(dom('.canvas-inspector[data-overlay="true"].is-open') + "?.getClientRects().length");
    await click(".canvas-inspector .inspector-close");

    await resize(390, 844);
    await open("/?canvas=22222222-2222-4222-8222-222222222222", ".a4-page-actions select");
    await click(".a4-page-actions > button:nth-of-type(2)");
    await wait(dom(".a4-page-actions select") + ".value === '1' && " + dom(".a4-scroll") + ".scrollTop > 100");
    await resize(844, 390, false);
    await delay(220);
    assert.equal(await evaluate(dom(".a4-page-actions select") + ".value"), "1", "A4 current page lost on resize");
    assert(await evaluate(dom(".a4-scroll") + ".getBoundingClientRect().height >= 100"), "A4 working area collapsed");

    await resize(320, 568);
    await open("/qa/pdf", ".pdf-page-shell[data-fit]");
    assert(await evaluate("document.querySelector('.document-pdf-body').scrollWidth <= document.querySelector('.document-pdf-body').clientWidth + 1"));
    await click(".document-reader-footer button:last-child");
    await wait(dom(".document-reader-footer") + ".textContent.includes('2 / 2')");
    await resize(844, 390, false);
    await wait(dom(".pdf-page-shell[data-fit]") + "?.clientWidth > 400", "PDF refits after rotation", 8000);
    await checkWidth("PDF landscape");

    for (const [width, height, visible, offset] of [[320, 568, 285, 0], [844, 390, 215, 16], [1180, 820, 360, 0]]) {
      await resize(width, height);
      await open("/qa/chat", ".chat-bubble-toggle");
      await click(".chat-bubble-toggle");
      await wait(dom(".connections-person") + "?.getClientRects().length");
      await click(".connections-person");
      await wait(dom(".connections-composer textarea") + "?.getClientRects().length");
      await click(".connections-composer textarea");
      await page("Input.insertText", { text: "Bản nháp còn nguyên" });
      await evaluate("Object.defineProperties(visualViewport,{height:{configurable:true,value:" + visible +
        "},offsetTop:{configurable:true,value:" + offset + "}});visualViewport.dispatchEvent(new Event('resize'));");
      const bounds = await evaluate("[" + dom(".connections-composer") + ".getBoundingClientRect().bottom," +
        dom(".chat-bubble-panel") + ".getBoundingClientRect().bottom,visualViewport.height+visualViewport.offsetTop," +
        dom(".chat-bubble-panel") + ".getBoundingClientRect().top]");
      if (bounds[0] > bounds[2] || bounds[1] > bounds[2] || bounds[3] < offset - 1 || bounds[1] - bounds[3] < 100) {
        const viewport = await evaluate("(() => {const dock=document.querySelector('.chat-bubble'), style=getComputedStyle(dock); return [innerHeight,document.documentElement.clientHeight,visualViewport.scale,visualViewport.offsetTop,visualViewport.pageTop,style.bottom,style.getPropertyValue('--visible-bottom'),dock.getBoundingClientRect().bottom,scrollY];})()");
        assert.fail("Chat outside the simulated visual viewport " + width + "×" + height + " " + bounds + " " + viewport);
      }
      assert.equal(await evaluate(dom(".connections-composer textarea") + ".value"), "Bản nháp còn nguyên");
      const sendButton = await click(".connections-composer .primary-button");
      assert(sendButton.height >= 44 && sendButton.y + sendButton.height / 2 <= visible + offset);
      await click(".chat-thread-minimize", width <= 480);
      await chatClosed();
      await click("#open-dialog");
      await wait(dom("dialog[open]") + "?.getClientRects().length");
      assert(await evaluate(dom("dialog[open]") + ".getBoundingClientRect().bottom") <= visible + offset);
      await click("#confirm-dialog");
    }
    console.log("Canvas resize and inspector, A4 page return, PDF fit and pagination, chat and dialog passed.");

    await resize(320, 568);
    await open("/?learn=quiz", ".quiz-test-card .primary-button");
    await click(".quiz-test-card .primary-button");
    await wait(dom(".activity-screen .quiz-options button") + "?.getClientRects().length");
    await click(".activity-screen .quiz-options button");
    await resize(844, 390, false);
    await click(".activity-screen .quiz-runner-actions .primary-button");
    assert(await evaluate(dom(".activity-screen .quiz-question-card") + ".textContent.includes('Câu 2')"));
    await click(".activity-screen .page-back-button");

    await resize(320, 568);
    await open("/?learn=flashcards", ".deck-item button");
    await click(".deck-item button");
    await wait(dom(".flashcard-tabs [role=tab]:last-child:not(:disabled)") + "?.getClientRects().length");
    await click(".flashcard-tabs [role=tab]:last-child");
    await wait(dom(".activity-flashcards .review-card-scene") + "?.getClientRects().length");
    await click(".activity-flashcards .review-card-scene");
    await resize(844, 390, false);
    assert(await evaluate(dom(".activity-flashcards .review-card-scene") + ".getAttribute('aria-pressed') === 'true'"));
    await click(".activity-screen .page-back-button");

    await open("/?learn=lab", ".lab-card-open");
    await click(".lab-card-open");
    await wait(dom(".activity-lab .lab-player iframe") + "?.getClientRects().length");
    await resize(320, 568);
    await click(".activity-lab .page-back-button");
    await wait(dom(".lab-card-open") + "?.getClientRects().length");
    console.log("Quiz, Flashcard and Lab interaction checks passed.");
  }
} finally {
  browser.kill();
  await new Promise(resolve => { if (browser.exitCode !== null || browser.signalCode !== null) resolve(); else browser.once("exit", resolve); });
  await rm(tmp, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
}

