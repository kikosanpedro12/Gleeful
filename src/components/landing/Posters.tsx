import type { ChapterId } from "./chapters";

/**
 * Still illustrations for each episode. Shown when 3D is off: no WebGL,
 * reduced motion, data saver, a slow device, or before the 3D stage is ready
 * (they are server-rendered, so the page never starts blank). Drawn for this
 * project; decorative, so hidden from screen readers.
 */
const Teachers = ({ x = 250, y = 210, helmet = false }: { x?: number; y?: number; helmet?: boolean }) => (
  <g transform={`translate(${x} ${y})`}>
    {/* Leo */}
    <g>
      <rect x="-34" y="-8" width="26" height="46" rx="10" fill="#1F6B5F" />
      <rect x="-30" y="36" width="8" height="30" rx="4" fill="#1D2747" />
      <rect x="-20" y="36" width="8" height="30" rx="4" fill="#1D2747" />
      <circle cx="-21" cy="-22" r="14" fill="#C68A5E" />
      <path d="M-35 -26 q14 -16 28 0 q-4 -12 -14 -12 q-10 0 -14 12z" fill="#1C1715" />
      <rect x="-8" y="-26" width="8" height="34" rx="4" fill="#1F6B5F" transform="rotate(-35 -8 -8)" />
      {helmet && <circle cx="-21" cy="-22" r="20" fill="#E6FBFF" fillOpacity=".35" stroke="#F5F8FF" strokeWidth="2" />}
    </g>
    {/* Mia */}
    <g transform="translate(46 4)">
      <rect x="-34" y="-8" width="26" height="44" rx="10" fill="#E8735A" />
      <rect x="-30" y="34" width="8" height="28" rx="4" fill="#1D2747" />
      <rect x="-20" y="34" width="8" height="28" rx="4" fill="#1D2747" />
      <circle cx="-21" cy="-22" r="13" fill="#C98F68" />
      <path d="M-38 -18 q-4 -26 17 -24 q21 -2 17 24 q-6 -14 -17 -14 q-11 0 -17 14z" fill="#2B1C16" />
      <rect x="-46" y="-30" width="8" height="32" rx="4" fill="#E8735A" transform="rotate(35 -42 -2)" />
      {helmet && <circle cx="-21" cy="-22" r="19" fill="#E6FBFF" fillOpacity=".35" stroke="#F5F8FF" strokeWidth="2" />}
    </g>
  </g>
);

const art: Record<ChapterId, React.ReactNode> = {
  classroom: (
    <>
      <rect x="40" y="40" width="320" height="150" rx="10" fill="#B7814E" />
      <rect x="52" y="52" width="296" height="126" rx="6" fill="#1E4D3A" />
      <text x="200" y="125" textAnchor="middle" fontSize="30" fontWeight="800" fill="#F5F8FF">Ask me anything</text>
      <rect x="0" y="262" width="400" height="58" fill="#E7C79B" />
      <ellipse cx="220" cy="278" rx="120" ry="20" fill="#0E8A8C" />
      <Teachers x={230} y={214} />
    </>
  ),
  ocean: (
    <>
      <path d="M0 270 q100 -30 200 0 t200 0 v50 h-400z" fill="#D9C38A" />
      {[30, 70, 330, 370].map((x, i) => <path key={x} d={`M${x} 290 q-12 -60 6 -${120 + i * 15}`} stroke="#2E8B57" strokeWidth="9" fill="none" strokeLinecap="round" />)}
      <ellipse cx="110" cy="90" rx="70" ry="24" fill="#2B59C3" />
      <path d="M176 90 l26 -18 v36z" fill="#2B59C3" />
      {[[90, 170], [120, 190], [150, 165], [300, 120], [325, 140]].map(([x, y]) => <path key={`${x}${y}`} d={`M${x} ${y} l18 -8 v16z`} fill="#FFB627" />)}
      {[60, 180, 260, 350].map((x, i) => <circle key={x} cx={x} cy={60 + i * 30} r="5" fill="#E6FBFF" />)}
      <Teachers x={240} y={200} helmet />
    </>
  ),
  cell: (
    <>
      <rect x="20" y="20" width="360" height="280" rx="60" fill="#9BD37A" />
      <circle cx="120" cy="120" r="52" fill="#8E6CCF" />
      <circle cx="136" cy="110" r="18" fill="#5B3FA6" />
      <circle cx="300" cy="90" r="46" fill="#CFF3FF" fillOpacity=".6" />
      {[[80, 240], [180, 60], [330, 230], [250, 140], [60, 180]].map(([x, y]) => <ellipse key={`${x}${y}`} cx={x} cy={y} rx="28" ry="13" fill="#3FA34D" />)}
      <Teachers x={240} y={214} />
    </>
  ),
  dino: (
    <>
      <path d="M40 260 l70 -150 l70 150z" fill="#6B4F3A" />
      <path d="M96 140 l14 -30 l14 30z" fill="#FF6A3D" />
      <rect x="0" y="258" width="400" height="62" fill="#7FA650" />
      <ellipse cx="300" cy="200" rx="60" ry="30" fill="#4E8F7A" />
      <path d="M252 196 q-30 -70 -60 -110" stroke="#4E8F7A" strokeWidth="16" fill="none" strokeLinecap="round" />
      <ellipse cx="188" cy="82" rx="18" ry="10" fill="#4E8F7A" />
      <path d="M356 204 q40 10 44 30" stroke="#4E8F7A" strokeWidth="14" fill="none" strokeLinecap="round" />
      {[268, 290, 318, 340].map((x) => <rect key={x} x={x} y="220" width="12" height="40" rx="5" fill="#4E8F7A" />)}
      <Teachers x={150} y={214} />
    </>
  ),
  city: (
    <>
      <circle cx="310" cy="70" r="40" fill="#FFE7A3" />
      {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={40 + i * 16} y={250 - i * 26} width={200 - i * 32} height="28" fill={i % 2 ? "#D9A441" : "#C8913A"} />)}
      {[280, 310, 340, 370].map((x) => <rect key={x} x={x} y="170" width="14" height="92" fill="#F3E3BD" />)}
      <rect x="272" y="160" width="114" height="14" fill="#E2CC97" />
      <rect x="0" y="262" width="400" height="58" fill="#E0C27A" />
      <Teachers x={250} y={214} />
    </>
  ),
  numbers: (
    <>
      <ellipse cx="200" cy="290" rx="180" ry="26" fill="#FFD27A" />
      {["#FFB627", "#FF5E8A", "#74C365", "#F5F8FF"].map((c, i) => (
        <path key={c} d="M0 0 L60 0 A60 60 0 0 1 0 60 Z" fill={c} transform={`translate(${110 + (i % 2 ? 8 : -8)} ${110 + (i < 2 ? 8 : -8)}) rotate(${i * 90})`} />
      ))}
      {[["1/2", 300, 70], ["3/4", 330, 150], ["+", 200, 60]].map(([t, x, y]) => (
        <g key={String(t)}>
          <rect x={Number(x) - 32} y={Number(y) - 32} width="64" height="64" rx="14" fill="#F5F8FF" />
          <text x={Number(x)} y={Number(y) + 10} textAnchor="middle" fontSize="28" fontWeight="800" fill="#2B59C3">{t}</text>
        </g>
      ))}
      <Teachers x={240} y={214} />
    </>
  ),
  space: (
    <>
      {Array.from({ length: 36 }, (_, i) => <circle key={i} cx={(i * 97) % 400} cy={(i * 53) % 320} r={i % 5 ? 1.4 : 2.4} fill="#FFFFFF" />)}
      <circle cx="110" cy="110" r="58" fill="#FF5E8A" />
      <ellipse cx="110" cy="110" rx="96" ry="18" fill="none" stroke="#FFD27A" strokeWidth="9" transform="rotate(-18 110 110)" />
      <circle cx="330" cy="70" r="20" fill="#C9CED8" />
      <circle cx="320" cy="240" r="34" fill="#2B59C3" />
      <circle cx="310" cy="232" r="12" fill="#74C365" />
      <Teachers x={230} y={200} helmet />
    </>
  ),
};

export default function Poster({ id }: { id: ChapterId }) {
  return (
    <svg className="lp-poster" viewBox="0 0 400 320" aria-hidden focusable="false" preserveAspectRatio="xMidYMid meet">
      {art[id]}
    </svg>
  );
}
