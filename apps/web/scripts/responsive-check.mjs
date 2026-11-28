import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "esbuild";
import { appleProfiles, checkApple } from "./responsive/apple-checks.mjs";

const executable = process.env.MINDCANVAS_CHROMIUM;
const useWebKit = process.argv.includes("--webkit");
if (!useWebKit && !executable) throw new Error("Set MINDCANVAS_CHROMIUM to your Chrome, Edge or Chromium executable.");
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
      plugin.onResolve({ filter: /\/hooks\/useOnlineRoom$/ }, () => ({ path: "room", namespace: "fixture-room" }));
      plugin.onLoad({ filter: /^room$/, namespace: "fixture-room" }, () => ({
        resolveDir: web,
        contents: `
          import { useOnlineRoom as useProductionRoom } from "./src/hooks/useOnlineRoom.ts";
          const snapshot = {
            room: { id: "60000000-0000-4000-8000-000000000001", name: "Góc nhạc tập trung cho mọi người",
              kind: "music", official: false, music_enabled: true, visibility: "private", host_id: "host",
              layout: "classroom", topic: "Nhạc học chung", capacity: 20, code: "512441" },
            can_manage: true, suggestions: true, members: [{ id: "host", seat: 1, name: "Host" }],
            queue: [], waiting: [], playback: { playing: true, video_id: "abc12345678", title: "Piano QA",
              loop: false, offset: 0, at: "2026-01-01T00:00:00Z", revision: 1 },
          };
          export function useOnlineRoom(link) {
            if (location.pathname !== "/qa/music-room") return useProductionRoom(link);
            return { phase: "active", snapshot, messages: [], serverNow: () => 0, act: async () => ({}), leave() {} };
          }
        `,
      }));
      plugin.onResolve({ filter: /\/lib\/connections$/ }, () => ({ path: "contacts", namespace: "fixture-contacts" }));
      plugin.onLoad({ filter: /^contacts$/, namespace: "fixture-contacts" }, () => ({
        resolveDir: web,
        contents: 'export * from "./src/lib/connections.ts";' +
          'const contacts = [{peer_id:"peer",display_name:"' + "A".repeat(90) + '",unread_count:0,connected_at:"2026-01-01T00:00:00Z"}];' +
          'export const listConnections = async () => { const query = new URLSearchParams(location.search);' +
          'if (query.has("pending-connections")) return new Promise(() => {});' +
          'if (query.has("pending-close-race")) return window.qaChatContacts ??= new Promise(resolve => { window.qaReleaseChat = () => resolve(contacts); });' +
          'return contacts; };' +
          'export const listBlockedConnections=async()=>[]; export const markDirectMessagesRead=async()=>{};' +
          'export const sendDirectMessage=async()=>{};' +
          'export const listDirectMessages = async () => [...(location.pathname === "/qa/shared-thread" ? [{id:"shared",sender_id:"peer",recipient_id:"reader",body:"",resource_kind:"document",resource_title:"MindCanvas QA.json",workspace_file_token:"' + token + '",created_at:"2026-01-02T00:00:00Z"}] : []), {id:"1",sender_id:"peer",recipient_id:"reader",body:"dòng văn bản ".repeat(location.pathname === "/qa/shared-thread" ? 160 : 25),resource_kind:null,created_at:"2026-01-01T00:00:00Z"}];',
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
function fixtureResponse(url) {
  if (url.origin !== origin) return { status: 404, mime: "text/plain", body: "" };
  const data = { state: "ok", role: "viewer", kind: "file", title: "tệp-".repeat(40) + ".json",
    id: "33333333-3333-4333-8333-333333333333", data: { size: 480, revision: "qa" } };
  const [mime, body] = assets.get(url.pathname) ??
    (url.pathname.endsWith("/download") ? ["application/json", JSON.stringify({ title: "nội dung ".repeat(60) })]
      : url.pathname.endsWith("/open") ? ["application/json", JSON.stringify(data)] : ["text/html", html]);
  return { status: 200, mime, body };
}

async function runWebKit() {
  const { webkit } = await import("playwright").catch(error => {
    throw new Error("Install Playwright and its WebKit browser before running --webkit.", { cause: error });
  });
  const browser = await webkit.launch();
  let context, page, touch;
  try {
    const first = selector => page.locator(selector).first();
    await checkApple({
      async profile(name, width, height) {
        await context?.close();
        const device = appleProfiles[name];
        touch = device.touch;
        context = await browser.newContext({ viewport: { width, height }, userAgent: device.userAgent,
          hasTouch: touch, isMobile: touch, deviceScaleFactor: device.dpr, serviceWorkers: "block" });
        await context.addInitScript(({ platform, touch }) => {
          Object.defineProperties(navigator, { platform: { value: platform }, maxTouchPoints: { value: touch ? 5 : 0 } });
        }, device);
        await context.route("**/*", async route => {
          const { status, mime, body } = fixtureResponse(new URL(route.request().url()));
          await route.fulfill({ status, contentType: mime, body: typeof body === "string" ? body : Buffer.from(body) });
        });
        page = await context.newPage();
      },
      resize: (width, height) => page.setViewportSize({ width, height }),
      async open(path, selector) {
        await page.goto(origin + path);
        await first(selector).waitFor({ state: "visible", timeout: 8000 });
      },
      click: selector => touch ? first(selector).tap({ timeout: 8000 }) : first(selector).click({ timeout: 8000 }),
      async drag(x, y, endX, endY) {
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(endX, endY, { steps: 5 });
        await page.mouse.up();
      },
      press: key => page.keyboard.press(key),
      evaluate: expression => page.evaluate(expression),
      wait: (expression, label) => page.waitForFunction(expression, null, { timeout: 8000 }).catch(error => {
        throw new Error("Timed out: " + label, { cause: error });
      }),
    }, token);
  } finally { await browser.close(); }
}

async function runChromium() {
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
        const { status, mime, body } = fixtureResponse(new URL(request.url));
        void send("Fetch.fulfillRequest", {
          requestId, responseCode: status, responseHeaders: [{ name: "Content-Type", value: mime }],
          body: Buffer.from(body).toString("base64"),
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
    if (process.argv.includes("--apple-only")) {
      let device;
      const resizeApple = (width, height) => resize(width, height, device.touch, device.dpr);
      await checkApple({
        async profile(name, width, height) {
          device = appleProfiles[name];
          await page("Emulation.setUserAgentOverride", { userAgent: device.userAgent, platform: device.platform });
          await page("Emulation.setTouchEmulationEnabled", { enabled: device.touch, maxTouchPoints: device.touch ? 5 : 1 });
          await resizeApple(width, height);
        },
        resize: resizeApple, open, evaluate, wait: (expression, label) => wait(expression, label, 8000),
        async click(selector) {
          await wait(`${dom(selector)}?.getClientRects().length`, selector, 8000);
          await click(selector, device.touch);
        },
        async press(key) {
          const keys = {
            "Space": { key: " ", code: "Space", windowsVirtualKeyCode: 32 },
            "Meta+z": { key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 4 },
          };
          for (const type of ["keyDown", "keyUp"]) await page("Input.dispatchKeyEvent", { type, ...keys[key] });
        },
        async drag(x, y, endX, endY) {
          await page("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
          for (const step of [.25, .5, .75, 1]) await page("Input.dispatchMouseEvent", { type: "mouseMoved", x: x + (endX - x) * step, y: y + (endY - y) * step, button: "left", buttons: 1 });
          await page("Input.dispatchMouseEvent", { type: "mouseReleased", x: endX, y: endY, button: "left", buttons: 0, clickCount: 1 });
        },
      }, token);
      return;
    }
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
    if (process.argv.includes("--chat-only")) {
      await checkChatClose();
      await checkChatKeyboard();
      return;
    }
    if (process.argv.includes("--room-music-only")) {
      await checkRoomMusic();
      return;
    }
    if (process.argv.includes("--music-only")) {
      await checkMusicIsland();
      return;
    }
    if (process.argv.includes("--learning-navigation-only")) {
      await checkLearningNavigation();
      return;
    }
    if (process.argv.includes("--folder-library-only")) {
      await checkFolderLibrary();
      return;
    }
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
        await checkChatClose();
        await checkChatKeyboard();
        await checkLearningNavigation();
        await checkFolderLibrary();
        await checkMusicIsland();
        await checkInteractions();
      }
      if (!readerOnly) await checkAuthoring();
      if (!authoringOnly) await checkReaders();
    }

    async function checkChatClose() {
      for (const [width, height] of [[1180, 760], [390, 680], [320, 340]]) {
        const touch = width <= 480;
        await resize(width, height, touch);
        await page("Emulation.setTouchEmulationEnabled", { enabled: touch, maxTouchPoints: 1 });
        await open("/qa/chat?pending-close-race&width=" + width, ".chat-bubble-close");
        await chatOpened();
        await wait("typeof window.qaReleaseChat === 'function'");
        const point = await evaluate(`(() => {
          const close = ${dom(".chat-bubble-close")};
          const { left, top, width, height } = close.getBoundingClientRect();
          return { x: left + width / 2, y: top + height / 2, width, height };
        })()`);
        const { x, y } = point;
        assert(point.width >= 44 && point.height >= 44);
        if (touch) await page("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
        else await page("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
        await evaluate("window.qaReleaseChat()");
        await wait(dom('.connections-layout[data-thread-open="true"]') + "?.getClientRects().length", "thread opens as contacts finish loading");
        if (touch) await page("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        else await page("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
        await chatClosed();
        if (!touch) {
          await page("Input.dispatchMouseEvent", { type: "mouseMoved", x: 8, y: 8 });
          const shadow = `getComputedStyle(${chatLauncher}).boxShadow`;
          await wait(`${shadow} === 'none'`, "launcher is flat away from the pointer");
          const launcher = await evaluate(`(() => {
            const { x, y, width, height } = ${chatLauncher}.getBoundingClientRect();
            return { x: x + width / 2, y: y + height / 2 };
          })()`);
          await page("Input.dispatchMouseEvent", { type: "mouseMoved", ...launcher });
          await wait(`${shadow} !== 'none' && getComputedStyle(${chatLauncher}).translate === '0px -2px'`, "launcher lifts and gains a shadow on hover");
        }
        for (let attempt = 0; attempt < 4; attempt++) {
          await click(".chat-bubble-toggle", touch);
          await chatOpened();
          await click(".chat-bubble-close", touch);
          await chatClosed();
        }
      }
      console.log("Chat closes with one tap when the inbox changes into a conversation, and through repeated open/close at three sizes.");
    }

    async function checkChatKeyboard() {
      for (const [width, height, visible, offset] of [[320, 568, 285, 0], [844, 390, 215, 16], [1180, 820, 360, 0]]) {
        await resize(width, height);
        await page("Emulation.setTouchEmulationEnabled", { enabled: width <= 480, maxTouchPoints: 1 });
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
        const sendButton = await evaluate(`(() => {
          const button = ${dom(".connections-composer .primary-button")};
          const { x, y, width, height, bottom } = button.getBoundingClientRect();
          return { height, bottom, hit: button.contains(document.elementFromPoint(x + width / 2, y + height / 2)) };
        })()`);
        assert(sendButton.hit && sendButton.height >= 44 && sendButton.bottom <= visible + offset);
        await click(".chat-bubble-close", width <= 480);
        await chatClosed();
        await click(".chat-bubble-toggle", width <= 480);
        await chatOpened();
        assert.equal(await evaluate(dom(".connections-composer textarea") + ".value"), "Bản nháp còn nguyên");
        await page("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
        await page("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
        await chatClosed();
        await click("#open-dialog");
        await wait(dom("dialog[open]") + "?.getClientRects().length");
        assert(await evaluate(dom("dialog[open]") + ".getBoundingClientRect().bottom") <= visible + offset);
        await click("#confirm-dialog");
      }
      console.log("Chat stays above the keyboard, keeps its draft and closes with the X button and Escape.");
    }

    async function checkFolderLibrary() {
      for (const [width, height, sideBySide] of [[1440, 850, true], [768, 820, false], [390, 740, false]]) {
        const touch = width < 480;
        await resize(width, height, touch);
        await page("Emulation.setTouchEmulationEnabled", { enabled: touch, maxTouchPoints: 1 });
        const row = '.workspace-library-box button[data-manager-document]';
        await open("/?folders=all", row);
        const layout = await evaluate(`(() => {
          const library = ${dom(".workspace-library-box")}.getBoundingClientRect();
          const projects = ${dom(".folder-project-list")}.getBoundingClientRect();
          return { beside: projects.left > library.left && Math.abs(library.top - projects.top) < 2,
            below: projects.top >= library.bottom && Math.abs(library.left - projects.left) < 2 };
        })()`);
        assert(sideBySide ? layout.beside : layout.below, `Unexpected folder panel layout at ${width}: ${JSON.stringify(layout)}`);
        await checkWidth("Embedded library " + width);
        if (width !== 768) {
          await click(row, touch);
          await wait(`${dom(".document-reader-title h2")}?.getClientRects().length`, "document opens in manager", 8000);
          assert(await evaluate("location.search === '?folders=all'"));
          await click(".topbar .shell-back", touch);
          await wait(`${dom(row)}?.getClientRects().length`, "manager returns to list");
        }
        await click(".workspace-library-box .manager-documents", touch);
        await wait(`${dom(".document-library-list button")}?.getClientRects().length`, "full library opens", 8000);
        assert.equal(await evaluate(`${dom(".document-browse-sort select")}.value`), "newest");
        await checkWidth("Full library " + width);
      }
      console.log("Folder manager and full library passed at 1440, 768 and 390px, including direct reading and return to the list.");
    }

    async function checkRoomMusic() {
      for (const [width, height] of [[1366, 768], [768, 1024], [390, 844], [844, 390], [320, 568]]) {
        const touch = width <= 480;
        await resize(width, height, touch);
        await page("Emulation.setTouchEmulationEnabled", { enabled: touch, maxTouchPoints: 1 });
        await open("/qa/music-room", ".online-room-header h1");
        const result = await evaluate(`(() => {
          const top = document.querySelector(".topbar").getBoundingClientRect();
          const title = document.querySelector(".online-room-header h1").getBoundingClientRect();
          const roomActions = document.querySelector(".online-room-actions").getBoundingClientRect();
          const formerRoute = document.querySelector(".workspace-route-content");
          return { gap: title.top - top.bottom, right: roomActions.right, hidden: !formerRoute.getClientRects().length };
        })()`);
        assert(result.hidden && result.gap < 70 && result.right <= width + 1, JSON.stringify({ width, height, result }));
        const mute = ".online-room-player-local > button";
        const volume = dom(".online-room-player-local input");
        await click(mute, touch);
        assert(await evaluate(`${volume}.value === "0" && ${dom(mute)}.getAttribute("aria-pressed") === "true"`));
        await click(mute, touch);
        assert(await evaluate(`${volume}.value === "0.65"`));
        const frame = dom(".room-youtube-frame iframe");
        const slot = dom(".room-youtube-slot.in-room");
        const ambient = ".online-room-player-local > button:last-child";
        await evaluate(`${slot}.scrollIntoView({ block: "center" }); void 0`);
        await wait("window.qaRoomPlayer?.playing", "room player starts");
        await evaluate(`window.qaRoomFrame = ${frame}; void 0`);
        await click(ambient, touch);
        await wait(`${dom(ambient)}.getAttribute("aria-pressed") === "true"`, "ambient enabled");
        await evaluate(`${slot}.scrollIntoView({ block: "center" }); void 0`);
        await wait(`!!${dom(".room-ambient-light")}`, "ambient renders around the video");
        await click(ambient, touch);
        assert(await evaluate(`!${dom(".room-ambient-light")}`));
        assert(await evaluate(`!document.querySelector('.room-youtube-float.is-docked')`));

        if (width === 1366 || width === 390) {
          await evaluate(`${slot}.scrollIntoView({ block: "center" }); void 0`);
          await wait("window.qaRoomPlayer.playing", "inline room video plays before scrolling");
          const pauseCount = await evaluate("window.qaRoomPlayer.pauses");
          await evaluate(`(() => {
            const main = document.querySelector(".main-area");
            const slot = document.querySelector(".room-youtube-slot.in-room").getBoundingClientRect();
            main.scrollTop += slot.top - main.getBoundingClientRect().top + 28;
          })()`);
          await wait(`!!${dom('.room-youtube-float[data-clip="true"]')}`, "partly clipped room video");
          assert(await evaluate(`window.qaRoomPlayer.playing && window.qaRoomPlayer.pauses === ${pauseCount} && window.qaRoomFrame === ${frame}`));

          await evaluate(`${dom(".main-area")}.scrollTop = ${dom(".main-area")}.scrollHeight; void 0`);
          await wait(`!window.qaRoomPlayer.playing && !!${dom(".room-youtube-float[hidden]")}`, "offscreen room video pauses");
          await evaluate(`${dom(".main-area")}.scrollTop = 0; void 0`);
          await click(".shell-back", touch);
          const island = ".room-island .music-island-open";
          await wait(`${dom(island)}?.getAttribute("aria-expanded") === "true" && !!${dom(".room-youtube-float.on-island:not([hidden])")} && window.qaRoomPlayer.playing`, "room opens its video inside the Island");
          assert(await evaluate(`window.qaRoomFrame === ${frame}`));
          await click(island, touch);
          await wait(`!window.qaRoomPlayer.playing && !!${dom(".room-youtube-float[hidden]")}`, "collapsing the Island pauses playback");
          await click(island, touch);
          await wait("window.qaRoomPlayer.playing", "opening the Island resumes playback");
          assert(await evaluate(`window.qaRoomFrame === ${frame} && !${dom(".room-youtube-float.is-docked")}`));

          await evaluate(`Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); void 0`);
          await wait("!window.qaRoomPlayer.playing", "switching browser tabs pauses the room");
          await evaluate(`delete document.visibilityState; document.dispatchEvent(new Event("visibilitychange")); void 0`);
          await wait("window.qaRoomPlayer.playing", "returning to the tab restores playback");
        }
        assert(await evaluate(`!document.querySelector('.online-room-stop-listening')`));
      }
      console.log("Music room passed on five viewports. Video stays in the room or expanded Island. Collapse, full clipping and browser-tab hiding pause the same iframe.");
    }

    async function checkMusicIsland() {
      const wave = dom('.music-island [data-playing="true"]');
      const frame = dom(".music-youtube-frame iframe");
      for (const [width, height] of [[1160, 770], [390, 780]]) {
        const touch = width < 480;
        await resize(width, height, touch);
        await page("Emulation.setTouchEmulationEnabled", { enabled: touch, maxTouchPoints: 1 });
        const play = '.music-playlist button:is([aria-label="Phát Piano QA"],[aria-label="Tiếp tục Piano QA"])';
        await open("/?learn=music&qa-music=1", play);
        await click(play, touch);
        await wait(`window.qaMusicPlayer.playing && !!${wave}`, "YouTube is playing on " + width);
        await evaluate(`window.qaMusicFrame = ${frame}; window.qaMusicPlayer.time = 72`);
        const minimize = '.music-youtube-surface button[aria-label="Thu nhỏ video YouTube"]';
        if (!await evaluate(`${dom(minimize)}?.getClientRects().length`)) {
          await evaluate(`${dom(".music-youtube-slot")}?.scrollIntoView({ block: 'center' })`);
        }
        await wait(`${dom(minimize)}?.getClientRects().length`, "inline video is visible");
        await click(minimize, touch);
        const collapsed = `!!${dom('.music-youtube-surface[hidden]')} && !${frame}.getClientRects().length`;
        await wait(collapsed, "video is hidden after minimize");
        const home = touch ? ".mobile-compact-nav button:first-child" : ".workspace-nav-row > button:first-child";
        await click(home, touch);
        await wait(`${dom(".home-heading")}?.getClientRects().length`, "Workspace opens without the music page");
        assert(await evaluate(`${collapsed} && window.qaMusicFrame === ${frame} && window.qaMusicPlayer.playing && window.qaMusicPlayer.time === 72 && ${wave} && !${dom(".music-island-details")}`));
        await click(".music-island-open", touch);
        await wait(`${dom(".music-island.expanded")}?.getAnimations().every(animation => animation.playState !== 'running')`, "music controls finish opening");
        assert(await evaluate(`(() => {
          const island = ${dom(".music-island.expanded")};
          const title = island.querySelector(".music-title");
          const glass = getComputedStyle(island, "::before");
          const rect = island.getBoundingClientRect();
          return getComputedStyle(title).opacity === "1" && getComputedStyle(island).backgroundColor === "rgba(0, 0, 0, 0)" &&
            glass.backdropFilter.includes("blur(7px)") && rect.left >= 0 && rect.right <= innerWidth;
        })()`));
        await click(".music-island-menu summary", touch);
        await wait(`!!${dom(".music-island-menu[open]")}`, "music options open");
        await click(".music-island-menu summary", touch);
        await click('.music-island-details button[aria-label="Tạm dừng"]', touch);
        await wait(`!window.qaMusicPlayer.playing && !${wave}`, "pause from Dynamic Island");
      }
      console.log("YouTube test player keeps its time and playback with only Dynamic Island visible on Workspace at desktop and phone sizes.");

      await resize(1160, 770, false);
      await page("Emulation.setTouchEmulationEnabled", { enabled: false });
      const local = '.music-playlist button[aria-label="Phát Âm thanh QA"]';
      await open("/?learn=music&qa-music=local", local);
      await click(local, false);
      await wait(`!!${wave}`, "native audio is playing");
      await click(".workspace-nav-row > button:first-child", false);
      await wait(`${dom(".home-heading")}?.getClientRects().length`, "Workspace opens while local audio plays");
      await click(".music-island-open", false);
      const timeline = dom('.music-island-details input[aria-label="Vị trí phát"]');
      await wait(`Number(${timeline}?.value) >= 1`, "native audio continues after navigation");
      const previousTime = await evaluate(`Number(${timeline}.value)`);
      await evaluate(`(() => {
        Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
        Object.defineProperty(document, "hidden", { value: true, configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      })()`);
      await wait(`Number(${timeline}?.value) > ${previousTime} + .25`, "native audio advances after a simulated background event");
      await evaluate(`(() => {
        delete document.visibilityState;
        delete document.hidden;
        document.dispatchEvent(new Event("visibilitychange"));
      })()`);
      await open("/?learn=music&qa-music=local", '.music-playlist button[aria-label="Tiếp tục Âm thanh QA"]');
      assert(await evaluate(`!${wave}`));
      await click('.music-playlist button[aria-label="Tiếp tục Âm thanh QA"]', false);
      await wait(`!!${wave} && Number(${dom(".music-player-card .music-progress input")}?.value) >= 1`, "native audio resumes from the checkpoint");
      console.log("Native audio advances after leaving Music and resumes from its checkpoint after a reload.");
    }

    async function checkLearningNavigation() {
      const main = dom(".main-area");
      const back = dom(".topbar .shell-back");
      const assertTop = async label => {
        await delay(240);
        const state = await evaluate(`(() => {
          const main = ${main}, button = ${back};
          if (!button) return { top: main.scrollTop, back: false };
          const box = button.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return { top: main.scrollTop, back: box.top >= 0 && button.contains(hit) };
        })()`);
        assert(state.top <= 1 && state.back, `${label}: ${JSON.stringify(state)}`);
      };
      const viewports = [
        [1100, 540, ["quiz", "flashcards", "exams", "lab", "tools", "plan", "progress", "music", "connections", "classrooms", "rooms"]],
        [390, 660, ["quiz", "lab", "tools"]],
      ];
      for (const [width, height, tools] of viewports) {
        const touch = width <= 480;
        await resize(width, height, touch);
        await page("Emulation.setTouchEmulationEnabled", { enabled: touch, maxTouchPoints: 1 });
        await open("/", ".home-heading");
        const enter = touch ? ".mobile-compact-nav > button:nth-child(3)" : ".nav-learning";
        await click(enter, touch);
        await wait(dom(".learning-space-heading h1") + "?.getClientRects().length");
        await assertTop(`Learning Hub at ${width}px`);
        await evaluate(`${main}.scrollTop = 160`);
        assert(await evaluate(`${main}.scrollTop > 60`), "Learning Hub remains scrollable");
        await click(enter, touch);
        await assertTop(`Reopening Learning Hub at ${width}px`);
        for (const tool of tools) {
          await click(`.learning-space-home-content [data-guide-tab="${tool}"]`, touch);
          await wait(dom(`[data-learning-tool="${tool}"]:not([hidden])`) + "?.getClientRects().length", tool);
          await assertTop(`${tool} at ${width}px`);
          await click(".topbar .shell-back", touch);
          await wait(dom(".learning-space-heading h1") + "?.getClientRects().length");
          await assertTop(`Back from ${tool} at ${width}px`);
        }
        await click('.learning-space-home-content [data-guide-tab="shared"]', touch);
        await wait(dom(".shared-learning") + "?.getClientRects().length");
        await assertTop(`Shared with me at ${width}px`);
      }

      await resize(1100, 540, false);
      await page("Emulation.setTouchEmulationEnabled", { enabled: false, maxTouchPoints: 1 });
      const scrollbar = theme => evaluate(`(() => {
        document.documentElement.dataset.theme = '${theme}';
        const main = ${main};
        return {
          thumb: getComputedStyle(main, '::-webkit-scrollbar-thumb').backgroundColor,
          sizing: getComputedStyle(main).scrollbarWidth,
          width: getComputedStyle(main, '::-webkit-scrollbar').width,
          arrow: getComputedStyle(main, '::-webkit-scrollbar-button').display,
        };
      })()`);
      const sunset = await scrollbar("sunset"), ocean = await scrollbar("ocean");
      assert(sunset.thumb !== ocean.thumb, "Scrollbar thumb follows the theme");
      assert.equal(ocean.sizing, "auto", "Desktop uses the custom scrollbar dimensions");
      assert.equal(ocean.width, "6px");
      assert.equal(ocean.arrow, "none");
      console.log("Learning Hub entry and tool back buttons stay visible on desktop and phone. Scrollbar changes with the theme.");
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
          assert.equal(shadow, "none", "Chat launcher is flat on touch screens");
          await click(".chat-bubble-toggle", true);
          await chatOpened();
          await wait(dom(".connections-person") + "?.getClientRects().length");
          assert(await clearance(".chat-bubble-panel") >= 6, "Open chat overlays the navigation at " + width);
          const closeButton = await click(".chat-bubble-close", true);
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
        await click(".chat-bubble-close", true);
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

      console.log("Canvas resize and inspector, A4 page return, and PDF fit and pagination passed.");

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
}

if (useWebKit) await runWebKit();
else await runChromium();

