// Shared contract: generated facts stay data; the application owns quiz behavior.
const fail = message => { throw new Error(`Learning Hub: ${message}`); };
const text = (v, max = 12000) => typeof v === "string" && v.trim() && v.length <= max ? v.trim() : fail("thiếu nội dung hoặc nội dung quá dài.");
const id = v => typeof v === "string" && !["__proto__", "constructor", "prototype"].includes(v) && /^[a-zA-Z0-9_-]{1,80}$/.test(v) ? v : fail("mã mục không hợp lệ.");
const array = (v, min, max) => Array.isArray(v) && v.length >= min && v.length <= max ? v : fail("số lượng mục không hợp lệ.");
const unique = values => { if (new Set(values).size !== values.length) fail("trùng mã hoặc lựa chọn."); };
function goal(value) {
  return { id: id(value?.id), title: text(value?.title, 500), sourceRefs: array(value?.sourceRefs, 1, 12).map(ref => ({ sourceId: text(ref?.sourceId, 240), location: text(ref?.location, 500) })) };
}
function simulation(value) {
  if (!value || ["coefficient", "offset", "min", "max", "initial", "step"].some(k => typeof value[k] !== "number" || !Number.isFinite(value[k]) || Math.abs(value[k]) > 1e9) || ![1, 2, 3].includes(value.power) || value.min >= value.max || value.initial < value.min || value.initial > value.max || value.step <= 0 || value.step > value.max - value.min) fail("thông số mô phỏng không hợp lệ.");
  return { inputLabel: text(value.inputLabel, 160), inputUnit: text(value.inputUnit, 80), outputLabel: text(value.outputLabel, 160), outputUnit: text(value.outputUnit, 80), coefficient: value.coefficient, power: value.power, offset: value.offset, min: value.min, max: value.max, initial: value.initial, step: value.step, equation: text(value.equation, 1000), assumptions: text(value.assumptions, 2000) };
}
export function validateHubOutline(value, sourceIds) {
  const chapters = array(value?.chapters, 1, 24).map(chapter => ({ id: id(chapter?.id), title: text(chapter?.title, 500), summary: text(chapter?.summary, 2000), objectives: array(chapter?.objectives, 1, 40).map(goal) }));
  if (chapters.some(c => c.id === "review")) fail("mã chương review được dành cho ôn tập tổng hợp.");
  unique(chapters.map(c => c.id)); unique(chapters.flatMap(c => c.objectives.map(o => o.id)));
  if (chapters.reduce((sum, c) => sum + c.objectives.length, 0) > 400) fail("tối đa 400 ý kiến thức; hãy chia nguồn thành các phần nhỏ hơn.");
  const refs = chapters.flatMap(c => c.objectives.flatMap(o => o.sourceRefs.map(r => r.sourceId)));
  if (sourceIds && (refs.some(ref => !sourceIds.includes(ref)) || sourceIds.some(ref => !refs.includes(ref)))) fail("bản đồ kiến thức chưa bao phủ đúng tất cả nguồn.");
  return { title: text(value?.title, 240), summary: text(value?.summary, 4000), chapters, warnings: array(value?.warnings ?? [], 0, 30).map(w => text(w, 2000)) };
}
export function validateHubChapter(value, outline) {
  const objectives = array(value?.objectives, 1, 40).map(v => ({ ...goal(v), explanation: text(v?.explanation), terms: text(v?.terms, 6000), example: typeof v?.example === "string" && v.example.length <= 12000 ? v.example : fail("ví dụ không hợp lệ."), misconception: text(v?.misconception, 6000), recall: text(v?.recall, 4000), visual: v?.visual == null ? null : {
    kind: ["steps", "compare", "cause-effect", "simulation"].includes(v.visual.kind) ? v.visual.kind : fail("kiểu minh họa không hợp lệ."), title: text(v.visual.title, 500), items: array(v.visual.items, 2, 10).map(item => ({ label: text(item.label, 500), detail: text(item.detail, 4000) })), ...(v.visual.kind === "simulation" ? { simulation: simulation(v.visual.simulation) } : {})
  } }));
  unique(objectives.map(o => o.id));
  const questions = array(value?.questions, 2, 240).map(q => {
    const options = array(q?.options, 2, 6).map(o => ({ id: id(o?.id), text: text(o?.text, 2000) })); unique(options.map(o => o.id)); unique(options.map(o => o.text));
    if (!options.some(o => o.id === q.answerId) || !objectives.some(o => o.id === q.objectiveId)) fail("đáp án hoặc liên kết kiến thức không hợp lệ.");
    return { id: id(q.id), objectiveId: q.objectiveId, prompt: text(q.prompt, 4000), options, answerId: q.answerId, explanation: text(q.explanation, 6000), difficulty: ["basic", "applied"].includes(q.difficulty) ? q.difficulty : fail("mức độ câu hỏi không hợp lệ.") };
  });
  unique(questions.map(q => q.id)); unique(questions.map(q => q.prompt));
  for (const o of objectives) if (questions.filter(q => q.objectiveId === o.id).length < 2) fail(`ý ${o.id} cần ít nhất hai câu hỏi khác nhau.`);
  if (outline && (value.id !== outline.id || objectives.length !== outline.objectives.length || outline.objectives.some(o => !objectives.some(v => v.id === o.id && v.title === o.title && JSON.stringify(v.sourceRefs) === JSON.stringify(o.sourceRefs))))) fail("chương tạo ra đã bỏ hoặc thay đổi mục tiêu của mục lục.");
  return { id: id(value?.id), title: text(value?.title, 500), summary: text(value?.summary, 2000), objectives, questions };
}
export function validateLearningHub(value, sourceIds) {
  const outline = validateHubOutline(value, sourceIds);
  if (value.version !== 1 || !["vi", "en", "vi-en"].includes(value.language) || !Number.isInteger(value.questionsPerRound) || value.questionsPerRound < 3 || value.questionsPerRound > 20 || !["mixed", "basic", "applied"].includes(value.difficulty)) fail("cấu hình Hub không hợp lệ.");
  const chapters = value.chapters.map(c => validateHubChapter(c)); unique(chapters.flatMap(c => c.questions.map(q => q.id)));
  if (chapters.reduce((sum, c) => sum + c.questions.length, 0) > 1600) fail("ngân hàng vượt quá 1.600 câu hỏi.");
  const sources = value.sources == null ? undefined : array(value.sources, 1, 6).map(s => ({ id: text(s?.id, 240), name: text(s?.name, 500) }));
  if (sources) { unique(sources.map(s => s.id)); const refs = chapters.flatMap(c => c.objectives.flatMap(o => o.sourceRefs)); if (refs.some(r => !sources.some(s => s.id === r.sourceId))) fail("nguồn tham chiếu không có trong danh sách tài liệu."); }
  return { ...outline, version: 1, language: value.language, questionsPerRound: value.questionsPerRound, difficulty: value.difficulty, ...(sources ? { sources } : {}), chapters };
}
export const emptyHubProgress = () => ({ read: [], attempts: {} });
export function cleanHubProgress(hub, value) {
  const objectives = new Set(hub.chapters.flatMap(c => c.objectives.map(o => o.id))), questions = hub.chapters.flatMap(c => c.questions);
  const read = Array.isArray(value?.read) ? [...new Set(value.read.filter(v => objectives.has(v)))] : [];
  const attempts = {};
  for (const q of questions) { const a = value?.attempts?.[q.id]; if (a && Number.isInteger(a.tries) && a.tries > 0 && a.tries <= 1000000 && Number.isInteger(a.correct) && a.correct >= 0 && a.correct <= a.tries && typeof a.lastCorrect === "boolean") attempts[q.id] = { tries: a.tries, correct: a.correct, lastCorrect: a.lastCorrect }; }
  return { read, attempts };
}
export function applyHubEvent(hub, progress, event, clean = cleanHubProgress) {
  const next = clean(hub, progress);
  if (event?.kind === "read" && hub.chapters.some(c => c.objectives.some(o => o.id === event.objectiveId))) next.read = [...new Set([...next.read, event.objectiveId])];
  if (event?.kind === "answer") {
    const q = hub.chapters.flatMap(c => c.questions).find(q => q.id === event.questionId);
    if (q && q.options.some(o => o.id === event.answerId)) { const prev = next.attempts[q.id] ?? { tries: 0, correct: 0 }; if (prev.tries < 1000000) next.attempts[q.id] = { tries: prev.tries + 1, correct: prev.correct + Number(event.answerId === q.answerId), lastCorrect: event.answerId === q.answerId }; }
  }
  return next;
}
export function hubCoverage(hub, progress, chapterId) {
  const chapters = hub.chapters.filter(c => !chapterId || c.id === chapterId), objectives = chapters.flatMap(c => c.objectives), questions = chapters.flatMap(c => c.questions);
  const result = { total: objectives.length, read: 0, tested: 0, mastered: 0, weak: 0 };
  for (const o of objectives) {
    const attempts = questions.filter(q => q.objectiveId === o.id).map(q => progress.attempts[q.id]);
    if (progress.read.includes(o.id)) result.read++;
    if (attempts.some(a => a?.tries)) result.tested++;
    if (attempts.length && attempts.every(a => a?.lastCorrect)) result.mastered++;
    if (attempts.some(a => a && !a.lastCorrect)) result.weak++;
  }
  return result;
}
export function pickHubRound(hub, progress, chapterId, random = Math.random) {
  const shuffle = values => { const out = [...values]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; };
  const pool = hub.chapters.filter(c => !chapterId || c.id === chapterId).flatMap(c => c.questions);
  const objectives = [...new Set(pool.map(q => q.objectiveId))];
  const rank = objectiveId => { const a = pool.filter(q => q.objectiveId === objectiveId).map(q => progress.attempts[q.id]); return !a.some(Boolean) ? 0 : a.some(v => v && !v.lastCorrect) ? 1 : a.some(v => !v) ? 2 : 3; };
  const order = shuffle(objectives).sort((a, b) => rank(a) - rank(b));
  const buckets = order.map(o => shuffle(pool.filter(q => q.objectiveId === o)).sort((a, b) => {
    const score = q => !progress.attempts[q.id] ? 0 : !progress.attempts[q.id].lastCorrect ? 1 : 2;
    return score(a) - score(b) || Number(hub.difficulty !== "mixed" && a.difficulty !== hub.difficulty) - Number(hub.difficulty !== "mixed" && b.difficulty !== hub.difficulty);
  }));
  const selected = []; // Round-robin prevents one objective exhausting the round.
  while (selected.length < hub.questionsPerRound && buckets.some(b => b.length)) for (const b of buckets) { if (b.length && selected.length < hub.questionsPerRound) selected.push(b.shift()); }
  return selected.map(q => ({ ...q, options: shuffle(q.options) }));
}
export function hubContract() {
  return `Learning Hub data contract v1. Embed valid JSON in <script type="application/json" id="mindcanvas-learning-hub"> (escape < as \\u003c in strings). Schema: {version:1,title,summary,language:"vi"|"en"|"vi-en",questionsPerRound:3..20,difficulty:"mixed"|"basic"|"applied",warnings:string[],chapters:[{id,title,summary,objectives:[{id,title,sourceRefs:[{sourceId,location}],explanation,terms,example,misconception,recall,visual:null|{kind:"steps"|"compare"|"cause-effect"|"simulation",title,items:[{label,detail}],simulation?:{inputLabel,inputUnit,outputLabel,outputUnit,coefficient,power:1|2|3,offset,min,max,initial,step,equation,assumptions}}}],questions:[{id,objectiveId,prompt,options:[{id,text}],answerId,explanation,difficulty:"basic"|"applied"}]}]}. All text fields are plain readable text, not HTML/Markdown/LaTeX; use Unicode math. IDs are unique ASCII letters/digits/_/-, max 80 characters. Use original source IDs (in Manual use exact attachment filenames) and explicit page/section/paragraph locations. Never fabricate a page number; use a clear section title if unpaginated. Every objective must have at least TWO distinct questions; each question tests exactly ONE objective, 2..6 distinct choices, exactly one correct answer by option ID with full explanation. Do not use 'all above', letter-dependent answers or cross-question references. Use at most 24 chapters, 40 objectives/chapter, 400 objectives and 1600 questions total; if sources exceed limits ask to split them, never silently omit material. Include conceptual and applied questions when supported. Visual has 2..10 meaningful steps/comparisons/causal links, never decorative filler. Optional simulation is ONLY y=coefficient*x^power+offset derived from a source equation (all other variables explicitly held fixed); state the equation, units, valid range, assumptions and approximation limits. All numeric parameters finite and abs<=1e9, min<max, initial in range, 0<step<=max-min. Use no simulation if the topic cannot fit this supported model; use visual steps instead. Never invent a physical law or imply every subject needs simulation. Empty example only when examples disabled or source cannot support one. Use finite precomputed questions; no runtime AI, no fake generation or unsafe parameter substitution.`;
}

// No closure dependencies: serialized into the downloadable standalone document.
function hubRuntime(hub, empty, clean, apply, coverage, pick) {
  const config = window.__MC_HUB_BRIDGE__;
  let state = clean(hub, config?.progress ?? empty()), active = "", round = [], index = 0, answered = false, score = 0;
  const en = hub.language === "en", t = (vi, eng) => en ? eng : vi;
  const root = document.getElementById("hub-root");
  const el = (tag, value, cls) => { const node = document.createElement(tag); if (value) node.textContent = value; if (cls) node.className = cls; return node; };
  const button = (label, action, cls = "") => { const b = el("button", label, cls); b.type = "button"; b.addEventListener("click", action); return b; };
  function simulationView(model, objectiveId) {
    const wrap = el("div", "", "simulation-controls"), label = el("label", `${model.inputLabel} (${model.inputUnit}) · ${model.min}–${model.max}`), input = el("input"), output = el("output");
    input.type = "range"; input.id = `sim-${objectiveId}`; label.htmlFor = input.id; input.min = model.min; input.max = model.max; input.step = model.step; input.value = model.initial;
    const compute = x => model.coefficient * x ** model.power + model.offset;
    const samples = Array.from({ length: 41 }, (_, i) => ({ x: model.min + (model.max - model.min) * i / 40, y: compute(model.min + (model.max - model.min) * i / 40) }));
    const low = Math.min(...samples.map(p => p.y)), high = Math.max(...samples.map(p => p.y)), ns = "http://www.w3.org/2000/svg";
    const xy = (x, y) => `${20 + 280 * (x - model.min) / (model.max - model.min)},${140 - 120 * (y - low) / (high - low || 1)}`;
    const graph = document.createElementNS(ns, "svg"), line = document.createElementNS(ns, "polyline"), dot = document.createElementNS(ns, "circle"); graph.setAttribute("viewBox", "0 0 320 160"); graph.setAttribute("role", "img"); graph.setAttribute("aria-label", `${model.outputLabel} / ${model.inputLabel}`);
    line.setAttribute("points", samples.map(p => xy(p.x, p.y)).join(" ")); line.setAttribute("fill", "none"); line.setAttribute("stroke", "#387d65"); line.setAttribute("stroke-width", "3"); dot.setAttribute("r", "5"); dot.setAttribute("fill", "#163f32"); graph.append(line, dot);
    const update = () => { const x = Number(input.value), y = compute(x), [cx, cy] = xy(x, y).split(","); dot.setAttribute("cx", cx); dot.setAttribute("cy", cy); output.textContent = `${model.inputLabel}: ${x} ${model.inputUnit} → ${model.outputLabel}: ${Number(y.toPrecision(7))} ${model.outputUnit}`; };
    input.addEventListener("input", update); update(); wrap.append(el("p", model.equation), el("p", model.assumptions), graph, label, input, output, button(t("Đặt lại mô phỏng", "Reset simulation"), () => { input.value = model.initial; update(); })); return wrap;
  }
  function emit(event) { state = apply(hub, state, event, clean); root.querySelectorAll(".stats").forEach(box => box.replaceWith(stats(box.dataset.chapter || undefined))); if (config?.token && window.parent !== window) window.parent.postMessage({ type: "mc-hub-event", token: config.token, event }, "*"); }
  function stats(chapterId) { const s = coverage(hub, state, chapterId), box = el("div", "", "stats"); box.dataset.chapter = chapterId || ""; for (const [label, value] of [[t("Đã đọc", "Read"), s.read], [t("Đã kiểm tra", "Tested"), s.tested], [t("Đã củng cố", "Consolidated"), s.mastered]]) box.append(el("span", `${label} ${value}/${s.total}`)); return box; }
  function shell() {
    root.replaceChildren(); const nav = el("nav", "", "chapters"); nav.setAttribute("aria-label", t("Chương và chủ đề", "Chapters and topics"));
    const add = (label, id) => { const b = button(label, () => { active = id; round = []; render(); }); b.setAttribute("aria-current", active === id ? "page" : "false"); nav.append(b); };
    add(t("Tổng quan", "Overview"), ""); hub.chapters.forEach((c, i) => add(`${i + 1}. ${c.title}`, c.id)); add(t("Ôn tập tổng hợp", "Overall review"), "review");
    const main = el("main"); main.tabIndex = -1; root.append(nav, main); return main;
  }
  function start(chapterId) { round = pick(hub, state, chapterId); index = 0; score = 0; showQuestion(); }
  function showQuestion() {
    const main = shell(), chapterId = active === "review" ? undefined : active;
    main.append(el("h1", active === "review" ? t("Ôn tập tổng hợp", "Overall review") : hub.chapters.find(c => c.id === active).title), stats(chapterId));
    if (index >= round.length) {
      main.append(el("h2", t(`Kết quả lượt này: ${score}/${round.length}`, `This round: ${score}/${round.length}`)), el("p", t("Một lượt điểm cao chưa có nghĩa là đã kiểm tra hết kiến thức. Tiếp tục với phần chưa kiểm tra và phần còn yếu.", "A high round score does not mean all objectives have been tested. Continue with untested and weaker knowledge.")), button(t("Lượt tiếp theo", "Next round"), () => start(chapterId), "primary"), button(t("Về ghi chú", "Back to notes"), render));
      return;
    }
    const q = round[index], o = hub.chapters.flatMap(c => c.objectives).find(o => o.id === q.objectiveId); answered = false;
    main.append(el("p", `${t("Câu", "Question")} ${index + 1}/${round.length} · ${o.title}`, "eyebrow"), el("h2", q.prompt));
    const choices = el("div", "", "choices"), feedback = el("div", "", "feedback"); feedback.setAttribute("role", "status");
    q.options.forEach(option => choices.append(button(option.text, () => {
      if (answered) return; answered = true; const correct = option.id === q.answerId; if (correct) score++; emit({ kind: "answer", questionId: q.id, answerId: option.id });
      [...choices.children].forEach((node, i) => { node.disabled = true; if (q.options[i].id === q.answerId) node.classList.add("correct"); else if (q.options[i].id === option.id) node.classList.add("incorrect"); });
      feedback.append(el("h3", correct ? t("Chính xác", "Correct") : t("Cần ôn lại", "Review needed")), el("p", `${t("Đáp án", "Answer")}: ${q.options.find(o => o.id === q.answerId).text}`), el("p", q.explanation), button(t("Xem lại kiến thức", "Review this concept"), () => { active = hub.chapters.find(c => c.objectives.some(v => v.id === o.id)).id; render(); document.getElementById(`objective-${o.id}`)?.scrollIntoView({ block: "start" }); }), button(t("Câu tiếp theo", "Next question"), () => { index++; showQuestion(); }, "primary"));
    })));
    main.append(choices, feedback);
  }
  function render() {
    const main = shell();
    if (!active) {
      main.append(el("p", "LEARNING HUB", "eyebrow"), el("h1", hub.title), el("p", hub.summary, "lead"), stats());
      main.append(el("p", t("Tiến độ theo các ý kiến thức đã lập từ nguồn. Đã đọc, đã kiểm tra và đã củng cố là ba trạng thái riêng biệt.", "Progress follows objectives mapped from sources. Read, tested and consolidated are separate states.")));
      const cards = el("div", "", "cards"); hub.chapters.forEach((c, i) => { const card = el("article", "", "card"); card.append(el("span", `${i + 1}` , "eyebrow"), el("h2", c.title), el("p", c.summary), stats(c.id), button(t("Bắt đầu học", "Start learning"), () => { active = c.id; render(); })); cards.append(card); }); main.append(cards);
      if (hub.warnings.length) { const warn = el("aside", "", "warning"); warn.append(el("h2", t("Phần cần kiểm tra", "Material to check"))); hub.warnings.forEach(w => warn.append(el("p", w))); main.append(warn); }
      main.append(el("p", t("Độ phủ này dựa trên bản đồ AI lập; hãy đối chiếu với tài liệu gốc, đặc biệt phần cảnh báo. Không bảo đảm AI đã nhận diện mọi chi tiết.", "Coverage relies on the AI-generated map. Check against original materials, especially warnings; the map may miss details."), "muted")); return;
    }
    if (active === "review") { main.append(el("h1", t("Ôn tập tổng hợp", "Overall review")), stats(), el("p", t("Ưu tiên ý chưa kiểm tra → ý còn yếu → ôn lại. Mỗi lượt dùng ngân hàng câu hỏi có sẵn và đảo thứ tự lựa chọn.", "Prioritize untested objectives, then weaker concepts, then review. Each round samples the embedded question bank and shuffles options.")), button(t("Bắt đầu ôn tập", "Start review"), () => start(), "primary")); return; }
    const c = hub.chapters.find(c => c.id === active);
    main.append(el("h1", c.title), el("p", c.summary, "lead"), stats(c.id), button(t("Làm quiz chương này", "Chapter quiz"), () => start(c.id), "primary"));
    const map = el("details", "", "coverage"); map.append(el("summary", t("Mục tiêu và nguồn kiến thức", "Objectives and sources")));
    c.objectives.forEach(o => {
      const attempts = c.questions.filter(q => q.objectiveId === o.id).map(q => state.attempts[q.id]);
      const status = attempts.every(a => a?.lastCorrect) ? t("Đã củng cố", "Consolidated") : attempts.some(a => a && !a.lastCorrect) ? t("Cần ôn lại", "Review needed") : attempts.some(Boolean) ? t("Đã kiểm tra một phần", "Partly tested") : t("Chưa kiểm tra", "Untested");
      const line = el("div", "", "coverage-item"); line.append(button(`${state.read.includes(o.id) ? "✓ " : ""}${o.title} · ${status}`, () => document.getElementById(`objective-${o.id}`)?.scrollIntoView({ block: "start" })), el("p", o.sourceRefs.map(r => `${hub.sources?.find(s => s.id === r.sourceId)?.name ?? r.sourceId}: ${r.location}`).join("; "))); map.append(line);
    }); main.append(map);
    c.objectives.forEach(o => {
      const section = el("section", "", "objective"); section.id = `objective-${o.id}`;
      section.append(el("h2", o.title), el("p", o.explanation), el("h3", t("Ghi nhớ chính xác", "Key terms and conditions")), el("p", o.terms));
      if (o.visual) { const visual = el("div", "", `visual ${o.visual.kind}`); visual.append(el("h3", o.visual.title)); if (o.visual.simulation) visual.append(simulationView(o.visual.simulation, o.id)); o.visual.items.forEach((item, i) => { const d = el("details"); d.append(el("summary", `${i + 1}. ${item.label}`), el("p", item.detail)); visual.append(d); }); section.append(visual); }
      if (o.example) { const d = el("details", "", "example"); d.append(el("summary", t("Ví dụ từng bước", "Worked example")), el("p", o.example)); section.append(d); }
      section.append(el("h3", t("Dễ nhầm ở đâu?", "Common misconception")), el("p", o.misconception), el("blockquote", o.recall));
      const read = button(state.read.includes(o.id) ? t("Đã đánh dấu đọc", "Marked as read") : t("Đánh dấu đã đọc", "Mark as read"), () => { emit({ kind: "read", objectiveId: o.id }); read.textContent = t("Đã đánh dấu đọc", "Marked as read"); read.disabled = true; }); read.disabled = state.read.includes(o.id); section.append(read); main.append(section);
    });
    main.append(button(t("Ôn tập chương này", "Review this chapter"), () => start(c.id), "primary"));
  }
  render();
}
const css = `:root{font-family:system-ui,-apple-system,sans-serif;color:#172e2c;background:#f6f8f7;line-height:1.65}*{box-sizing:border-box}h1,h2,h3,p,button,summary,td,li{white-space:pre-line}body{margin:0}button,summary{font:inherit;cursor:pointer}button{padding:10px 16px;border:1px solid #cbd9d4;background:white;border-radius:10px;color:inherit;text-align:left;max-width:100%;overflow-wrap:anywhere}button:hover{background:#edf5f1}button:focus-visible,summary:focus-visible{outline:3px solid #2f8473;outline-offset:3px}button:disabled{cursor:default;opacity:.8}.primary{background:#1e6856;color:white;border-color:#1e6856}.primary:hover{background:#174f42}#hub-root{display:grid;grid-template-columns:228px minmax(0,1fr);min-height:100vh}.chapters{padding:22px 14px;display:flex;flex-direction:column;gap:8px;border-right:1px solid #dde6e1;align-self:start;position:sticky;top:0;max-height:100vh;overflow:auto}.chapters button{background:transparent;border-color:transparent}.chapters [aria-current=page]{background:#dcece4;color:#164e3d;font-weight:650}main{padding:42px clamp(18px,4vw,64px);width:100%;max-width:1100px;margin:auto;min-width:0;align-self:start}h1{font-size:clamp(26px,3vw,40px);line-height:1.2;letter-spacing:-.035em;margin:0 0 20px}h2{font-size:23px;line-height:1.35}h3{font-size:17px}p,blockquote{white-space:pre-wrap;overflow-wrap:anywhere}.lead{color:#48655b;font-size:18px}.eyebrow{font-size:12px;font-weight:700;letter-spacing:.09em;color:#467160}.stats{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0}.stats span{border:1px solid #d8e4de;padding:5px 10px;border-radius:99px;font-size:13px;background:#fff}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr));gap:16px;margin:30px 0}.card,.objective{background:white;border:1px solid #dde6e1;border-radius:16px;padding:24px}.objective{margin:28px 0;scroll-margin-top:12px}.objective h2{margin-top:0}details{border-bottom:1px solid #dce7e0;padding:12px 0}summary{font-weight:600}.coverage{margin-top:20px}.coverage-item{padding:10px 0}.coverage-item p{font-size:13px;color:#526b60;margin:6px 0}.visual{border-radius:12px;background:#edf5f0;padding:18px;margin:22px 0}.visual h3{margin-top:0}blockquote{border-left:3px solid #5b9c81;padding-left:16px;margin:22px 0;color:#315f4d}.simulation-controls{display:grid;gap:12px}.simulation-controls svg{width:100%;max-height:200px;background:#fff;border-radius:8px}.simulation-controls input{width:100%}.simulation-controls output{font-weight:650;overflow-wrap:anywhere}.choices{display:grid;gap:12px;margin:26px 0}.choices button{padding:16px}.correct{border-color:#267352;background:#e5f3e9!important}.incorrect{border-color:#af5c45;background:#fff0eb!important}.feedback button,main>button{margin:6px 10px 6px 0}.warning{background:#fff7df;padding:20px;border-radius:12px}.muted{color:#60746b;font-size:13px}@media(max-width:700px){#hub-root{display:block}.chapters{position:static;border-right:0;border-bottom:1px solid #dde6e1;flex-direction:row;overflow-x:auto;max-height:none;padding:10px}.chapters button{flex:0 0 auto;max-width:210px;font-size:13px}main{padding:26px 16px}.objective,.card{padding:20px}.lead{font-size:16px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}`;
const json = value => JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
export function renderLearningHub(value, bridge) {
  const hub = validateLearningHub(value), safeTitle = hub.title.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  return `<!doctype html><html lang="${hub.language === "en" ? "en" : "vi"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><style>${css}</style>${bridge ? `<script>window.__MC_HUB_BRIDGE__=${json(bridge)}</script>` : ""}</head><body><div id="hub-root"></div><noscript>${safeTitle}: JavaScript is required for chapter tabs and quizzes.</noscript><script type="application/json" id="mindcanvas-learning-hub">${json(hub)}</script><script>(${hubRuntime.toString()})(JSON.parse(document.getElementById('mindcanvas-learning-hub').textContent),${emptyHubProgress.toString()},${cleanHubProgress.toString()},${applyHubEvent.toString()},${hubCoverage.toString()},${pickHubRound.toString()});</script></body></html>`;
}
