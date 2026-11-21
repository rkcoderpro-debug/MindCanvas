/** Detailed vector hamster that stays crisp at both the floating and mobile sizes. */
export default function HamsterPetArt() {
  return <>
    <defs>
      <linearGradient id="hamster-fur" x1="0" y1="0" x2=".9" y2="1">
        <stop offset="0" stopColor="#ffad2f"/>
        <stop offset=".55" stopColor="#ff790d"/>
        <stop offset="1" stopColor="#e95708"/>
      </linearGradient>
      <linearGradient id="hamster-cream" x1=".2" y1="0" x2=".8" y2="1">
        <stop offset="0" stopColor="#fffdf3"/>
        <stop offset="1" stopColor="#f3e5c9"/>
      </linearGradient>
      <radialGradient id="hamster-ear-pink" cx=".45" cy=".35" r=".8">
        <stop offset="0" stopColor="#ffccdb"/>
        <stop offset="1" stopColor="#ec8eaa"/>
      </radialGradient>
      <radialGradient id="hamster-eye" cx=".32" cy=".25" r=".85">
        <stop offset="0" stopColor="#4f463f"/>
        <stop offset=".42" stopColor="#29252a"/>
        <stop offset="1" stopColor="#12151b"/>
      </radialGradient>
    </defs>

    <g className="hamster-body">
      <path d="M34 101Q38 87 54 84Q70 79 86 84Q102 88 106 101L109 122Q109 139 94 140H46Q31 139 31 122Z" fill="url(#hamster-fur)" stroke="#d95c12" strokeWidth="1.5"/>
      <ellipse cx="70" cy="117" rx="23" ry="21" fill="url(#hamster-cream)"/>
      <path d="M49 109Q52 101 60 100M91 109Q88 101 80 100" fill="none" stroke="#fff1d7" strokeWidth="2.2" strokeLinecap="round" opacity=".9"/>
      <path d="M47 103Q51 99 56 100M84 100Q90 99 94 103" fill="none" stroke="#ce671c" strokeWidth="1.5" strokeLinecap="round" opacity=".55"/>
      <ellipse cx="48" cy="133" rx="12" ry="7" fill="#f5a9b9"/>
      <ellipse cx="92" cy="133" rx="12" ry="7" fill="#f5a9b9"/>
      <g fill="none" stroke="#c8757e" strokeWidth="1" strokeLinecap="round" opacity=".8">
        <path d="M42 133v3M48 134v3M54 133v3M86 133v3M92 134v3M98 133v3"/>
      </g>
      <path d="M54 106Q50 111 52 116M86 106Q90 111 88 116" fill="none" stroke="#ed9a27" strokeWidth="8" strokeLinecap="round"/>
      <ellipse cx="53" cy="116" rx="6" ry="4" fill="#f7c88a"/>
      <ellipse cx="87" cy="116" rx="6" ry="4" fill="#f7c88a"/>
      <g fill="none" stroke="#c68c66" strokeWidth=".8" strokeLinecap="round">
        <path d="M50 115v2M53 115v2M56 115v2M84 115v2M87 115v2M90 115v2"/>
      </g>
    </g>

    <g className="pet-head">
      <g className="hamster-ear-left">
        <circle cx="42" cy="42" r="18" fill="url(#hamster-fur)" stroke="#d95c12" strokeWidth="1.4"/>
        <circle cx="42" cy="43" r="10.8" fill="url(#hamster-ear-pink)"/>
        <ellipse cx="38.5" cy="38.5" rx="3.1" ry="2" fill="#fff5f5" opacity=".8"/>
      </g>
      <g className="hamster-ear-right">
        <circle cx="98" cy="42" r="18" fill="url(#hamster-fur)" stroke="#d95c12" strokeWidth="1.4"/>
        <circle cx="98" cy="43" r="10.8" fill="url(#hamster-ear-pink)"/>
        <ellipse cx="94.5" cy="38.5" rx="3.1" ry="2" fill="#fff5f5" opacity=".8"/>
      </g>

      <ellipse cx="70" cy="66" rx="43" ry="38" fill="url(#hamster-fur)" stroke="#d95c12" strokeWidth="1.5"/>
      <path d="M63 30Q70 26 77 30L78 55Q70 61 62 55Z" fill="url(#hamster-cream)"/>
      <path d="M31 68Q35 56 47 56Q58 56 65 64Q70 70 75 64Q83 56 94 56Q105 57 109 69Q111 82 101 91Q92 99 81 92Q74 87 70 87Q65 87 58 92Q47 99 38 91Q29 83 31 68Z" fill="url(#hamster-cream)"/>
      <path d="M32 60Q37 52 46 51M108 60Q103 52 94 51" fill="none" stroke="#ffd27d" strokeWidth="2.4" strokeLinecap="round" opacity=".9"/>
      <path d="M36 48Q41 44 47 47M93 47Q99 44 104 48" fill="none" stroke="#cf5d12" strokeWidth="1.4" strokeLinecap="round" opacity=".55"/>

      <g className="pet-open-eyes">
        <ellipse cx="51" cy="68" rx="10.2" ry="12.2" fill="#fff"/>
        <ellipse cx="89" cy="68" rx="10.2" ry="12.2" fill="#fff"/>
        <g className="pet-pupils">
          <ellipse cx="52" cy="69" rx="7.5" ry="9.3" fill="url(#hamster-eye)"/>
          <ellipse cx="88" cy="69" rx="7.5" ry="9.3" fill="url(#hamster-eye)"/>
          <ellipse cx="49.5" cy="65.5" rx="2.8" ry="3.3" fill="#fff"/>
          <ellipse cx="85.5" cy="65.5" rx="2.8" ry="3.3" fill="#fff"/>
          <circle cx="54.5" cy="72.5" r="1.3" fill="#fff" opacity=".75"/>
          <circle cx="90.5" cy="72.5" r="1.3" fill="#fff" opacity=".75"/>
        </g>
      </g>
      <g className="pet-closed-eyes" fill="none" stroke="#553e36" strokeWidth="2.7" strokeLinecap="round">
        <path d="M43 70Q51 64 59 70M81 70Q89 64 97 70"/>
      </g>

      <ellipse cx="39" cy="81" rx="8" ry="4.6" fill="#f4a0a7" opacity=".6"/>
      <ellipse cx="101" cy="81" rx="8" ry="4.6" fill="#f4a0a7" opacity=".6"/>
      <ellipse cx="61" cy="84" rx="10" ry="7" fill="#fffaf0"/>
      <ellipse cx="79" cy="84" rx="10" ry="7" fill="#fffaf0"/>
      <path d="M65 79Q70 76 75 79Q76 84 70 86Q64 84 65 79Z" fill="#d77988" stroke="#b96370" strokeWidth=".7"/>
      <path d="M70 86Q65 92 60 88M70 86Q75 92 80 88" fill="none" stroke="#72504a" strokeWidth="1.5" strokeLinecap="round"/>
      <g fill="none" stroke="#8b695a" strokeWidth=".9" strokeLinecap="round" opacity=".72">
        <path d="M49 83L30 78M49 87L28 87M51 91L33 96M91 83L110 78M91 87L112 87M89 91L107 96"/>
      </g>
      <g fill="none" stroke="#f9cb8a" strokeWidth="1.2" strokeLinecap="round" opacity=".9">
        <path d="M34 53Q39 49 44 50M96 50Q101 49 106 53M33 74l-2 4M107 74l2 4"/>
      </g>
    </g>
  </>;
}
