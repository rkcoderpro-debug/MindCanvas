import assert from "node:assert/strict";

const safari = "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5";
export const appleProfiles = {
  iphone: { userAgent: `Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) ${safari} Mobile/15E148 Safari/604.1`, platform: "iPhone", touch: true, dpr: 3 },
  ipad: { userAgent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ${safari} Safari/605.1.15`, platform: "MacIntel", touch: true, dpr: 2 },
  mac: { userAgent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ${safari} Safari/605.1.15`, platform: "MacIntel", touch: false, dpr: 2 },
};

export async function checkApple({ profile, resize, open, click, drag, press, evaluate, wait }, token) {
  const dom = selector => `document.querySelector(${JSON.stringify(selector)})`;
  const visible = selector => `${dom(selector)}?.getClientRects().length > 0`;
  const bounds = selector => evaluate(`${dom(selector)}.getBoundingClientRect().toJSON()`);
  const inWidth = async (selector, left, right) => {
    const box = await bounds(selector);
    assert(box.left >= left - 1 && box.right <= right + 1, `${selector} outside [${left}, ${right}]: ${box.left}, ${box.right}`);
  };
  const setSafeArea = async (top, horizontal, bottom) => {
    await evaluate(`(() => {
      const style = document.documentElement.style;
      style.setProperty('--safe-area-top', '${top}px');
      style.setProperty('--safe-area-left', '${horizontal}px');
      style.setProperty('--safe-area-right', '${horizontal}px');
      style.setProperty('--safe-area-bottom', '${bottom}px');
    })()`);
  };

  await profile("iphone", 390, 844);
  await open("/qa/navigation?learn=overview", ".chat-bubble-toggle");
  assert(await evaluate(visible(".ios-device .mobile-compact-nav")));
  assert((await bounds(".chat-bubble-toggle")).bottom < (await bounds(".mobile-compact-nav")).top);
  await click(".chat-bubble-toggle");
  await click(".connections-person");
  await click(".connections-composer textarea");
  await evaluate(`(() => {
    const field = document.querySelector('.connections-composer textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, 'Safari draft');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    Object.defineProperties(visualViewport, { height: { configurable: true, value: 290 }, offsetTop: { configurable: true, value: 19 } });
    visualViewport.dispatchEvent(new Event('resize'));
  })()`);
  await wait(visible(".chat-bubble[data-viewport-adjusted]"), "keyboard changes chat viewport");
  assert(await evaluate(`parseFloat(getComputedStyle(${dom(".connections-composer textarea")}).fontSize) >= 16`));
  assert((await bounds(".connections-composer")).bottom <= 309);
  await click(".chat-thread-minimize");
  await wait(visible(".chat-bubble-toggle"), "chat can be closed with keyboard open");
  await evaluate(`delete visualViewport.height; delete visualViewport.offsetTop; window.dispatchEvent(new Event('pageshow'));`);
  await click(".chat-bubble-toggle");
  await wait(`${dom(".connections-composer textarea")}?.value === 'Safari draft'`, "chat keeps its draft");

  await open("/qa/shared-thread", ".chat-bubble-toggle");
  await click(".chat-bubble-toggle");
  await click(".connections-person");
  await wait(visible(".connections-resource"), "chat has a shared file");
  const returnTop = await evaluate(`(() => {
    const thread = document.querySelector('.connections-messages');
    const link = document.querySelector('.connections-resource');
    thread.scrollTop = thread.scrollHeight;
    document.activeElement.blur();
    const top = thread.scrollTop;
    link.click();
    return top;
  })()`);
  assert(returnTop > 0);
  await wait(`location.hash === '#share=${token}' && ${visible(".shared-document-reader pre")}`, "chat opens file in the workspace");
  await click(".qa-shared-back");
  await wait(`!location.hash && ${visible(".connections-resource")} && document.activeElement === ${dom(".connections-resource")}`, "Back restores the chat attachment even if it was tapped without focus");
  assert(Math.abs(await evaluate(`${dom(".connections-messages")}.scrollTop`) - returnTop) <= 2);

  await resize(844, 390);
  await open("/?learn=overview", ".learning-space-heading");
  await setSafeArea(0, 44, 21);
  await inWidth(".main-area", 44, 800);
  assert((await bounds(".main-area")).bottom <= 369);
  await open("/qa/pdf", ".pdf-page-shell[data-fit]");
  await setSafeArea(0, 44, 21);
  await evaluate(`${dom(".document-viewer")}.requestFullscreen = undefined`);
  await click(".document-fullscreen-toggle");
  await wait(visible(".document-reader[data-fullscreen-fallback]"), "PDF fallback when Fullscreen API is missing");
  await inWidth(".document-reader-bar", 44, 800);
  assert((await bounds(".document-reader-footer")).bottom <= 369);
  await evaluate(`${dom(".document-reader-footer button:last-child")}.focus()`);
  await press("Space");
  await wait(`${dom(".document-reader-footer")}.textContent.includes('2 / 2')`, "Space activates the focused PDF control");
  await click(".document-fullscreen-toggle");
  await wait(`!${dom(".document-reader.is-fullscreen")}`, "Exit PDF fallback");
  console.log("iPhone profile: chat keyboard and draft, shared file return and focus, landscape safe area, PDF fallback and keyboard.");

  await profile("ipad", 820, 1180);
  await open("/?canvas=11111111-1111-4111-8111-111111111111", ".canvas-svg");
  assert(await evaluate(visible(".ios-device .canvas-svg")), "iPad with desktop user agent uses touch mode");
  await resize(507, 744);
  if (!await evaluate(visible(".canvas-inspector.is-open"))) await click(".inspector-toggle");
  await wait(visible('.canvas-inspector.is-open[data-overlay="true"]'), "inspector fits iPad Split View");
  await inWidth(".canvas-inspector.is-open", 0, 507);
  await click(".canvas-inspector .inspector-close");
  await open("/?learn=quiz", ".quiz-test-card .primary-button");
  await click(".quiz-test-card .primary-button");
  await click(".activity-screen .quiz-options button");
  await resize(560, 440);
  await click(".activity-screen .quiz-runner-actions .primary-button");
  await wait(`${dom(".activity-screen .quiz-question-card")}?.textContent.includes('2')`, "Quiz retains the response in a resized iPad window");
  await open("/?learn=flashcards", ".deck-item button");
  await click(".deck-item button");
  await click(".flashcard-tabs [role=tab]:last-child:not(:disabled)");
  await click(".activity-flashcards .review-card-scene");
  await resize(820, 1180);
  await wait(`${dom(".activity-flashcards .review-card-scene")}?.getAttribute('aria-pressed') === 'true'`, "Flashcard stays flipped on resize");
  console.log("iPad profile: touch detection with desktop user agent, Split View inspector, Quiz and Flashcard state.");

  await profile("mac", 920, 640);
  await open("/?view=shared#share=" + token, ".shared-document-reader pre");
  assert(!await evaluate(visible(".ios-device")), "Mac desktop does not take iPad touch mode");
  await evaluate(`(() => {
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (!this.download || !this.href.startsWith('blob:')) return click.call(this);
      window.qaDownload = fetch(this.href).then(response => response.json()).then(data => ({ name: this.download, title: data.title }));
    };
  })()`);
  await click(".shared-document-reader .reader-primary-action");
  await wait("!!window.qaDownload", "shared file is available for download");
  const download = await evaluate("window.qaDownload");
  assert(download.name.endsWith(".json") && download.title.length > 100);
  await open("/?canvas=11111111-1111-4111-8111-111111111111", ".canvas-svg");
  await inWidth(".editor-frame", 0, 920);
  await click('.drawing-toolbar-tools button[aria-label="Di chuyển canvas"]');
  const canvas = await bounds(".canvas-svg");
  const x = Math.floor(canvas.left + canvas.width / 2), y = Math.floor(canvas.top + canvas.height / 2);
  const transform = `${dom("[data-canvas-viewport]")}.getAttribute('transform')`;
  const beforeDrag = await evaluate(transform);
  await drag(x, y, x + 68, y + 37);
  await wait(`${transform} !== ${JSON.stringify(beforeDrag)}`, "drag changes the Canvas viewport");
  const nodes = "document.querySelectorAll('.canvas-svg .mind-node').length";
  const beforeAdd = await evaluate(nodes);
  await click('.drawing-toolbar-tools button[aria-label="Node sơ đồ tư duy"]');
  await wait(`${nodes} === ${beforeAdd + 1}`, "Canvas adds a node");
  await press("Meta+z");
  await wait(`${nodes} === ${beforeAdd}`, "Command-Z undoes the Canvas change");
  console.log("Mac profile: desktop Canvas drag and Command-Z at reduced width, shared file download name and bytes.");
}
