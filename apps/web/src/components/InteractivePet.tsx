import { useEffect, useRef, useState } from 'react';
import type { PetKind, PetMood } from '../lib/pet';

export default function InteractivePet({ kind, mood, name }: { kind: PetKind; mood: PetMood; name: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [bow, setBow] = useState(false), [petting, setPetting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movement = useRef({ x: 0, distance: 0 });
  useEffect(() => {
    const el = root.current; if (!el) return;
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || preference?.matches) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = el.getBoundingClientRect();
        const x = Math.max(-1, Math.min(1, (event.clientX - box.left - box.width / 2) / 240));
        const y = Math.max(-1, Math.min(1, (event.clientY - box.top - box.height / 2) / 240));
        el.style.setProperty('--pet-x', `${x * 4}px`); el.style.setProperty('--pet-y', `${y * 3}px`); el.style.setProperty('--pet-turn', `${x * 7}deg`);
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(frame); if (timer.current) clearTimeout(timer.current); };
  }, []);
  const stroke = () => { setPetting(true); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setPetting(false), 1100); };
  const release = () => { setBow(false); setPetting(false); movement.current.distance = 0; if (timer.current) clearTimeout(timer.current); };
  const fur = kind === 'fox' ? '#ee995e' : kind === 'dog' ? '#c5a383' : kind === 'rabbit' ? '#e4d8ee' : '#eec797';
  return <div ref={root} className={`interactive-pet ${bow ? 'bowing' : ''} ${petting ? 'petted' : ''}`} data-mood={mood}>
    <svg viewBox="0 0 140 150" aria-hidden="true"><ellipse cx="70" cy="138" rx="46" ry="7" fill="#000" opacity=".1"/>
      <path className="pet-tail" d="M97 123 Q139 130 119 94" fill="none" stroke={fur} strokeWidth="15" strokeLinecap="round"/>
      <ellipse cx="70" cy="111" rx="32" ry="27" fill={fur}/><ellipse cx="70" cy="117" rx="19" ry="21" fill="#fff3e6"/>
      <ellipse cx="48" cy="133" rx="14" ry="7" fill={fur}/><ellipse cx="92" cy="133" rx="14" ry="7" fill={fur}/>
      <g className="pet-head">
        {kind === 'rabbit' ? <><ellipse cx="47" cy="27" rx="12" ry="24" fill={fur}/><ellipse cx="93" cy="27" rx="12" ry="24" fill={fur}/><ellipse cx="47" cy="26" rx="5" ry="16" fill="#eeb0b8"/><ellipse cx="93" cy="26" rx="5" ry="16" fill="#eeb0b8"/></> : kind === 'dog' ? <><ellipse cx="32" cy="66" rx="13" ry="28" fill="#947455"/><ellipse cx="108" cy="66" rx="13" ry="28" fill="#947455"/></> : <><path d="M32 60 L29 20 Q49 26 56 47 M84 47 Q100 25 112 20 L108 65" fill={fur} stroke={fur} strokeWidth="5" strokeLinejoin="round"/><path d="M36 47 L35 31 L48 45 M94 45 L106 31 L103 48" fill="#e9a8a4"/></>}
        <ellipse cx="70" cy="71" rx="43" ry="34" fill={fur}/><ellipse cx="70" cy="87" rx="23" ry="16" fill="#fff3e6"/>
        <g className="pet-open-eyes"><ellipse cx="51" cy="70" rx="9" ry="11" fill="#fff"/><ellipse cx="89" cy="70" rx="9" ry="11" fill="#fff"/><g className="pet-pupils"><ellipse cx="51" cy="71" rx="4.5" ry="7" fill="#34303d"/><ellipse cx="89" cy="71" rx="4.5" ry="7" fill="#34303d"/><circle cx="52" cy="68" r="1.5" fill="white"/><circle cx="90" cy="68" r="1.5" fill="white"/></g></g>
        <g className="pet-closed-eyes" fill="none" stroke="#5e4550" strokeWidth="3" strokeLinecap="round"><path d="M44 73 Q51 68 58 73 M82 73 Q89 68 96 73"/></g>
        <path d="M65 83 Q70 79 75 83 L70 89 Z" fill="#a96974"/><path d="M70 89 Q63 96 60 89 M70 89 Q77 96 80 89" fill="none" stroke="#80535b" strokeWidth="2" strokeLinecap="round"/>
        <ellipse cx="39" cy="83" rx="8" ry="4" fill="#e9a0a0" opacity=".5"/><ellipse cx="101" cy="83" rx="8" ry="4" fill="#e9a0a0" opacity=".5"/>
      </g>
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
