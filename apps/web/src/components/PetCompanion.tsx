import { usePetPosition } from "../lib/usePetPosition";
import InteractivePet from "./InteractivePet";
import { useCallback, useEffect, useRef, useState } from "react";
import { Heart, Sparkles, X } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { getPetLevel, getPetMood, PET_KINDS, readPet, recordPetActivity, updatePetProfile, type PetActivityType, type PetKind, type PetMood, type PetState, fetchPetProfile } from "../lib/pet";

const PET_EMOJI: Record<PetKind, string> = { cat: "🐱", dog: "🐶", fox: "🦊", rabbit: "🐰", hamster: "🐹" };

const COPY = {
  vi: {
    label: "Thú cưng học tập",
    expand: "Mở bảng thú cưng",
    close: "Đóng bảng thú cưng",
    vitality: "Sức khỏe",
    level: "Cấp",
    daily: "Hôm nay",
    minutes: "phút học",
    name: "Tên thú cưng",
    kind: "Loài",
    cat: "Mèo",
    dog: "Chó",
    fox: "Cáo",
    rabbit: "Thỏ",
    hamster: "Hamster",
    minimize: "Thu nhỏ",
    energetic: "Đang tràn đầy năng lượng!",
    happy: "Rất vui vì bạn đang học.",
    calm: "Đang chờ bạn cùng học.",
    tired: "Hơi mệt rồi, mình học một chút nhé?",
    sad: "Mình nhớ bạn. Quay lại học cùng nhé!",
    studyHint: "Mỗi 5 phút học giúp pet khỏe hơn.",
    followPointer: "Nhìn theo con trỏ",
    followPointerHint: "Tắt để pet nghỉ và chuyển sang trạng thái idle.",
  },
  en: {
    label: "Study companion",
    expand: "Open pet panel",
    close: "Close pet panel",
    vitality: "Vitality",
    level: "Level",
    daily: "Today",
    minutes: "study minutes",
    name: "Pet name",
    kind: "Species",
    cat: "Cat",
    dog: "Dog",
    fox: "Fox",
    rabbit: "Rabbit",
    hamster: "Hamster",
    minimize: "Minimize",
    energetic: "Full of energy!",
    happy: "Happy that you are studying.",
    calm: "Waiting for the next study session.",
    tired: "A little tired—shall we study for a while?",
    sad: "I miss you. Come back and study with me!",
    studyHint: "Every five minutes of study restores vitality.",
    followPointer: "Follow pointer",
    followPointerHint: "Turn this off to let the pet rest in idle mode.",
  },
} as const;

function moodCopy(mood: PetMood, language: "vi" | "en") {
  return COPY[language][mood];
}

export default function PetCompanion({ owner, active, visible = true, activityType = "workspace" }: { visible?: boolean; owner: string | null; active: boolean; activityType?: PetActivityType }) {
  const floating = usePetPosition();
  const { language } = useLanguage();
  const copy = COPY[language];
  const [pet, setPet] = useState<PetState>(() => readPet(owner));
  const [expanded, setExpanded] = useState(false);
  const [nameDraft, setNameDraft] = useState(pet.name);
  const [followPointer, setFollowPointer] = useState(pet.followPointer !== false);
  const pendingSeconds = useRef(0);
  const lastTickAt = useRef(Date.now());
  const lastInteractionAt = useRef(Date.now());
  const petRef = useRef(pet);
  const flushInFlight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const local = readPet(owner);
    petRef.current = local;
    setPet(local);
    setNameDraft(local.name);
    setFollowPointer(local.followPointer !== false);
    pendingSeconds.current = 0;
    lastTickAt.current = Date.now();
    lastInteractionAt.current = Date.now();
    let alive = true;
    void fetchPetProfile(owner).then(remote => {
      if (!alive) return;
      petRef.current = remote;
      setPet(remote);
      setNameDraft(remote.name);
      setFollowPointer(remote.followPointer !== false);
    });
    return () => { alive = false; };
  }, [owner]);

  const flush = useCallback((): Promise<void> => {
    if (flushInFlight.current) return flushInFlight.current;
    const amount = Math.floor(pendingSeconds.current);
    if (amount <= 0) return Promise.resolve();
    pendingSeconds.current = 0;
    const task = (async () => {
      let remaining = amount;
      let latest = petRef.current;
      while (remaining > 0) {
        const chunk = Math.min(300, remaining);
        latest = await recordPetActivity(owner, chunk, activityType);
        remaining -= chunk;
      }
      petRef.current = latest;
      setPet(latest);
    })().finally(() => { flushInFlight.current = null; });
    flushInFlight.current = task;
    return task;
  }, [activityType, owner]);

  useEffect(() => {
    const markInteraction = () => { lastInteractionAt.current = Date.now(); };
    const onVisibilityChange = () => {
      lastTickAt.current = Date.now();
      if (document.visibilityState === "hidden") void flush();
    };
    const onPageHide = () => { void flush(); };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart", "wheel", "pointermove"];
    for (const event of events) window.addEventListener(event, markInteraction, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    const timer = window.setInterval(() => {
      const now = Date.now();
      const elapsed = Math.min(60_000, Math.max(0, now - lastTickAt.current));
      lastTickAt.current = now;
      const visible = document.visibilityState !== "hidden";
      const recentlyActive = now - lastInteractionAt.current <= 90_000;
      if (active && visible && recentlyActive) pendingSeconds.current += Math.floor(elapsed / 1000);
      if (pendingSeconds.current >= 60) void flush();
    }, 60_000);
    return () => {
      window.clearInterval(timer);
      for (const event of events) window.removeEventListener(event, markInteraction);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      void flush();
    };
  }, [active, flush]);

  const mood = getPetMood(pet);
  const update = (patch: { kind?: PetKind; name?: string; followPointer?: boolean }) => {
    void updatePetProfile(owner, patch).then(next => {
      petRef.current = next;
      setPet(next);
      setNameDraft(next.name);
      setFollowPointer(next.followPointer !== false);
    });
  };
  const saveName = () => {
    const name = nameDraft.trim().slice(0, 40);
    if (name && name !== pet.name) update({ name });
    else setNameDraft(pet.name);
  };

  return <aside {...floating} hidden={!visible} className={`pet-companion ${expanded ? "is-expanded" : ""}`} aria-label={copy.label}>
    {expanded && <section className="pet-companion-card" aria-label={copy.label}>
      <header>
        <div><strong>{pet.name}</strong><small>{moodCopy(mood, language)}</small></div>
        <button type="button" className="icon-button" aria-label={copy.close} title={copy.close} onClick={() => setExpanded(false)}><X size={16}/></button>
      </header>
      <div className="pet-companion-status"><span className="pet-companion-heart"><Heart size={15}/></span><div><strong>{copy.vitality}: {pet.vitality}/100</strong><div className="pet-vitality-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pet.vitality}><span style={{ width: `${pet.vitality}%` }}/></div><small>{copy.level} {getPetLevel(pet)} · {copy.daily} {Math.floor(pet.dailyStudySeconds / 60)} {copy.minutes}</small></div></div>
      <p className="pet-companion-hint"><Sparkles size={14}/>{copy.studyHint}</p>
      <label>{copy.kind}<select value={pet.kind} onChange={event => update({ kind: event.target.value as PetKind })}>{PET_KINDS.map(kind => <option key={kind} value={kind}>{PET_EMOJI[kind]} {copy[kind]}</option>)}</select></label>
      <label>{copy.name}<input value={nameDraft} maxLength={40} onChange={event => setNameDraft(event.target.value)} onBlur={saveName} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); saveName(); } }}/></label>
      <label className="pet-follow-toggle"><span>{copy.followPointer}</span><input type="checkbox" checked={followPointer} onChange={event => { const next = event.target.checked; setFollowPointer(next); update({ followPointer: next }); }}/><small>{copy.followPointerHint}</small></label>
      <button type="button" className="secondary-button pet-minimize-button" onClick={() => setExpanded(false)}>{copy.minimize}</button>
    </section>}
    <div className="pet-interaction-area"><InteractivePet kind={pet.kind} mood={mood} name={pet.name} followPointer={followPointer}/><button type="button" className="pet-info-button" aria-label={expanded ? copy.close : copy.expand} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{pet.name} · ⓘ</button></div>
  </aside>;
}
