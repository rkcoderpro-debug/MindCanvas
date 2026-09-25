import { useEffect, useRef, useState } from 'react';
import { getPetPointerTracking, type PetKind, type PetMood } from '../lib/pet';
import HamsterPetArt from './HamsterPetArt';

export default function InteractivePet({ kind, mood, name, followPointer = true }: { kind: PetKind; mood: PetMood; name: string; followPointer?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [bow, setBow] = useState(false), [petting, setPetting] = useState(false), [pointerNear, setPointerNear] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movement = useRef({ x: 0, distance: 0 });
  const pointerNearRef = useRef(false);
  useEffect(() => {
    const el = root.current; if (!el) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const coarsePointer = window.matchMedia?.('(pointer: coarse)');
    let frame = 0;
    const resetTracking = () => {
      if (pointerNearRef.current) { pointerNearRef.current = false; setPointerNear(false); }
      el.style.setProperty('--pet-x', '0px');
      el.style.setProperty('--pet-y', '0px');
      el.style.setProperty('--pet-turn', '0deg');
    };
    const resetInteraction = () => { setBow(false); setPetting(false); };
    window.addEventListener("mindcanvas:pet-drag", resetInteraction);
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || reducedMotion?.matches || coarsePointer?.matches || !followPointer) { resetTracking(); return; }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = el.getBoundingClientRect();
        const dx = event.clientX - box.left - box.width / 2;
        const dy = event.clientY - box.top - box.height / 2;
        const radius = Math.hypot(window.innerWidth, window.innerHeight) + 1;
        const tracking = getPetPointerTracking(dx, dy, radius);
        if (pointerNearRef.current !== tracking.active) { pointerNearRef.current = tracking.active; setPointerNear(tracking.active); }
        el.style.setProperty('--pet-x', `${tracking.x}px`);
        el.style.setProperty('--pet-y', `${tracking.y}px`);
        el.style.setProperty('--pet-turn', `${tracking.turn}deg`);
      });
    };
    if (!followPointer || coarsePointer?.matches) resetTracking();
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('blur', resetTracking);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('blur', resetTracking);
      window.removeEventListener('mindcanvas:pet-drag', resetInteraction);
      cancelAnimationFrame(frame);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [followPointer]);
  const stroke = () => { setPetting(true); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setPetting(false), 1100); };
  const release = () => { setBow(false); setPetting(false); movement.current.distance = 0; if (timer.current) clearTimeout(timer.current); };
  const fur = kind === 'fox' ? '#ed9855' : kind === 'dog' ? '#e5ae70' : kind === 'rabbit' ? '#ded2ef' : '#f0c58b';
  const darkFur = kind === 'fox' ? '#c96f42' : kind === 'dog' ? '#a76a40' : kind === 'rabbit' ? '#c5b3d5' : '#c99a70';
  return <div ref={root} className={`interactive-pet ${bow ? 'bowing' : ''} ${petting ? 'petted' : ''} ${!followPointer || !pointerNear ? 'idle' : ''}`} data-kind={kind} data-mood={mood} data-follow={followPointer ? 'true' : 'false'} data-pointer-near={pointerNear ? 'true' : 'false'}>
    <svg viewBox="0 0 140 150" aria-hidden="true"><ellipse cx="70" cy="138" rx="46" ry="7" fill="#000" opacity=".1"/>
      {kind === 'hamster' ? <HamsterPetArt/> : <>
        <path className="pet-tail" d="M97 123 Q139 130 119 94" fill="none" stroke={fur} strokeWidth="15" strokeLinecap="round"/>
        <path d="M101 121 Q131 124 121 102" fill="none" stroke={darkFur} strokeWidth="4" strokeLinecap="round" opacity=".48"/>
        <ellipse cx="70" cy="111" rx="32" ry="27" fill={fur}/><ellipse cx="70" cy="117" rx="19" ry="21" fill="#fff3e6"/>
        <path d="M51 107 Q70 99 89 107" fill="none" stroke={darkFur} strokeWidth="2" opacity=".25"/>
        <ellipse cx="48" cy="133" rx="14" ry="7" fill={fur}/><ellipse cx="92" cy="133" rx="14" ry="7" fill={fur}/>
        <g fill="none" stroke={darkFur} strokeWidth="1.4" strokeLinecap="round" opacity=".5"><path d="M42 134h5 M49 134h5 M86 134h5 M93 134h5"/></g>
        <g className="pet-head">
          {kind === 'rabbit' ? <><ellipse cx="47" cy="27" rx="12" ry="24" fill={fur}/><ellipse cx="93" cy="27" rx="12" ry="24" fill={fur}/><ellipse cx="47" cy="26" rx="5" ry="16" fill="#eeb0b8"/><ellipse cx="93" cy="26" rx="5" ry="16" fill="#eeb0b8"/><path d="M45 10q3-3 6 0M91 10q3-3 6 0" fill="none" stroke={darkFur} strokeWidth="1.5" opacity=".45"/></> : kind === 'dog' ? <><path className="pet-ear-left" d="M42 41Q19 31 18 67Q19 98 34 91Q47 77 48 51Z" fill="#a76a40"/><path className="pet-ear-right" d="M98 41Q121 31 122 67Q121 98 106 91Q93 77 92 51Z" fill="#a76a40"/></> : <><path d="M32 60 L29 20 Q49 26 56 47 M84 47 Q100 25 112 20 L108 65" fill={fur} stroke={fur} strokeWidth="5" strokeLinejoin="round"/><path d="M36 47 L35 31 L48 45 M94 45 L106 31 L103 48" fill="#e9a8a4"/><path d="M34 55Q44 47 53 48M87 48Q97 46 107 55" fill="none" stroke={darkFur} strokeWidth="2" opacity=".35"/></>}
          <ellipse cx="70" cy="71" rx={kind === "dog" ? 38 : 43} ry={kind === "dog" ? 37 : 34} fill={fur}/>{kind === "dog" && <path d="M62 38Q70 34 78 38L76 69Q70 78 64 69Z" fill="#fff3e6"/>}<ellipse cx="70" cy="87" rx="23" ry="16" fill="#fff3e6"/>
          <path d="M44 55 Q52 50 60 54 M80 54 Q89 50 97 55" fill="none" stroke={darkFur} strokeWidth="2" strokeLinecap="round" opacity=".45"/>
          <g className="pet-open-eyes"><ellipse cx="51" cy="70" rx="9" ry="11" fill="#fff"/><ellipse cx="89" cy="70" rx="9" ry="11" fill="#fff"/><g className="pet-pupils"><ellipse cx="51" cy="71" rx="4.5" ry="7" fill="#34303d"/><ellipse cx="89" cy="71" rx="4.5" ry="7" fill="#34303d"/><circle cx="52" cy="68" r="1.5" fill="white"/><circle cx="90" cy="68" r="1.5" fill="white"/><circle cx="49.5" cy="72.5" r=".8" fill="white" opacity=".7"/><circle cx="87.5" cy="72.5" r=".8" fill="white" opacity=".7"/></g></g>
          <g className="pet-closed-eyes" fill="none" stroke="#5e4550" strokeWidth="3" strokeLinecap="round"><path d="M44 73 Q51 68 58 73 M82 73 Q89 68 96 73"/></g>
          {kind === "dog" ? <><ellipse cx="61" cy="86" rx="13" ry="10" fill="#fff3e6"/><ellipse cx="79" cy="86" rx="13" ry="10" fill="#fff3e6"/><path d="M63 80Q70 77 77 80Q79 87 70 89Q61 87 63 80" fill="#44312b"/><path d="M65 94Q70 106 75 94" fill="#e78d94"/></> : <path d="M65 83 Q70 79 75 83 L70 89 Z" fill="#a96974"/>}<path d="M70 89 Q63 96 60 89 M70 89 Q77 96 80 89" fill="none" stroke="#80535b" strokeWidth="2" strokeLinecap="round"/>
          {kind !== "dog" && <g fill="none" stroke="#80535b" strokeWidth="1.1" strokeLinecap="round" opacity=".55"><path d="M50 88L30 85 M50 91L28 92 M90 88L110 85 M90 91L112 92"/></g>}
          <ellipse cx="39" cy="83" rx="8" ry="4" fill="#e9a0a0" opacity=".5"/><ellipse cx="101" cy="83" rx="8" ry="4" fill="#e9a0a0" opacity=".5"/>
        </g>
      </>}
      <text className="pet-love" x="112" y="35" fill="#ec7893" fontSize="23">♥</text>
    </svg>
    <button className="pet-head-target" aria-label={`Xoa đầu ${name}`} title="Di chuột trên đầu để xoa · Chạm giữ trên điện thoại"
      onPointerEnter={e => { if (e.pointerType !== 'touch') { setBow(true); movement.current = { x: e.clientX, distance: 0 }; } }}
      onPointerMove={e => { if (e.pointerType !== 'touch') { movement.current.distance += Math.abs(e.clientX - movement.current.x); movement.current.x = e.clientX; if (movement.current.distance > 24) { stroke(); movement.current.distance = 0; } } }}
      onPointerLeave={release} onPointerCancel={release}
      onPointerDown={e => { setBow(true); if (e.pointerType === 'touch') { e.currentTarget.setPointerCapture(e.pointerId); setPetting(true); } }}
      onPointerUp={e => { if (e.pointerType === 'touch') release(); }}
      onFocus={() => setBow(true)} onBlur={release} onClick={e => { if (e.detail === 0) stroke(); }}/>
  </div>;
}
