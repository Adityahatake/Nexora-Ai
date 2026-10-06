import { useId } from 'react'

/* ------------------------------------------------------------------ */
/*  Nexora · decorative embroidery system                              */
/*  Mandalas, paisley stitch bands and floral vines drawn as SVG.      */
/* ------------------------------------------------------------------ */

const STITCH = '0.1 7' // thread-stitch dash

/** Concentric rangoli mandala with stitched rings and 12-fold petals. */
export function Mandala({
  size = 320,
  className = '',
  strokeWidth = 1.1,
}: {
  size?: number
  className?: string
  strokeWidth?: number
}) {
  const id = useId().replace(/[:]/g, '')
  const petals12 = Array.from({ length: 12 }, (_, i) => i * 30)
  const petals8 = Array.from({ length: 8 }, (_, i) => i * 45)
  const dots24 = Array.from({ length: 24 }, (_, i) => (i * Math.PI) / 12)

  return (
    <svg
      width={size}
      height={size}
      viewBox="-110 -110 220 220"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`mg-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#EE9B01" />
          <stop offset="55%" stopColor="#EF3F28" />
          <stop offset="100%" stopColor="#D6336C" />
        </linearGradient>
      </defs>
      <g fill="none" stroke={`url(#mg-${id})`} strokeWidth={strokeWidth} strokeLinecap="round">
        {/* outer rings */}
        <circle r="106" strokeDasharray={STITCH} opacity="0.85" />
        <circle r="100" opacity="0.9" />
        {/* outer petal ring */}
        {petals12.map((a) => (
          <path key={`op-${a}`} d="M 0 -96 Q 14 -78 0 -60 Q -14 -78 0 -96" transform={`rotate(${a})`} opacity="0.95" />
        ))}
        {/* bead ring between petals */}
        {dots24.map((t, i) => (
          <circle key={`d-${i}`} cx={Math.sin(t) * 78} cy={-Math.cos(t) * 78} r="1.6" fill="#E8B54D" stroke="none" opacity="0.9" />
        ))}
        <circle r="56" opacity="0.9" />
        <circle r="51" strokeDasharray={STITCH} opacity="0.8" />
        {/* scallop arcs */}
        {petals12.map((a) => (
          <path key={`sc-${a}`} d="M -10 -46 A 46 46 0 0 1 10 -46 Q 0 -38 -10 -46" transform={`rotate(${a})`} opacity="0.85" />
        ))}
        {/* inner petals */}
        {petals8.map((a) => (
          <path key={`ip-${a}`} d="M 0 -40 Q 10 -28 0 -16 Q -10 -28 0 -40" transform={`rotate(${a})`} opacity="0.95" />
        ))}
        <circle r="13" strokeDasharray={STITCH} opacity="0.85" />
        {/* core */}
        <circle r="4.5" fill="#EE9B01" stroke="none" />
        {petals8.map((a) => (
          <circle key={`c-${a}`} r="1.4" fill="#F7ECDA" stroke="none" transform={`rotate(${a}) translate(0 -8.5)`} opacity="0.9" />
        ))}
      </g>
    </svg>
  )
}

/** Single keri / paisley motif (mango paisley) with an inner curl. */
export function Paisley({
  size = 44,
  className = '',
  stroke = '#E8B54D',
  strokeWidth = 1.4,
  flip = false,
}: {
  size?: number
  className?: string
  stroke?: string
  strokeWidth?: number
  flip?: boolean
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 60 60"
      className={className}
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
      aria-hidden="true"
    >
      <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round">
        <path d="M30 5 C 44 5, 54 17, 54 30 C 54 44, 43 55, 30 55 C 19 55, 11 47, 11 37 C 11 28, 17 22, 24 22 C 30 22, 34 26, 34 31 C 34 34.5, 31.5 37, 28 37" />
        <path d="M28 37 C 32 31, 31 18, 30 5" strokeDasharray="0.1 5" opacity="0.8" />
        <circle cx="40" cy="30" r="2.2" fill={stroke} stroke="none" opacity="0.9" />
        <circle cx="37" cy="40" r="1.6" fill={stroke} stroke="none" opacity="0.8" />
        <circle cx="44" cy="21" r="1.6" fill={stroke} stroke="none" opacity="0.8" />
      </g>
    </svg>
  )
}

/** Small six-petal flower. */
function Flower({ x, y, r, stroke }: { x: number; y: number; r: number; stroke: string }) {
  const petals = Array.from({ length: 6 }, (_, i) => i * 60)
  return (
    <g transform={`translate(${x} ${y})`} fill="none" stroke={stroke} strokeWidth="1.2" strokeLinecap="round">
      {petals.map((a) => (
        <path key={a} d={`M 0 ${-r} Q ${r * 0.5} ${-r * 0.45} 0 ${-r * 0.18} Q ${-r * 0.5} ${-r * 0.45} 0 ${-r}`} transform={`rotate(${a})`} />
      ))}
      <circle r={r * 0.16} fill={stroke} stroke="none" />
    </g>
  )
}

/** Repeating embroidered band: stitched vine, paisley and blossoms. */
export function PaisleyBand({ className = '', flip = false }: { className?: string; flip?: boolean }) {
  const id = useId().replace(/[:]/g, '')
  return (
    <svg
      className={className}
      width="100%"
      height="64"
      preserveAspectRatio="xMidYMid slice"
      style={flip ? { transform: 'scaleY(-1)' } : undefined}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`pb-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#EE9B01" stopOpacity="0" />
          <stop offset="18%" stopColor="#EE9B01" />
          <stop offset="55%" stopColor="#EF3F28" />
          <stop offset="85%" stopColor="#D6336C" />
          <stop offset="100%" stopColor="#D6336C" stopOpacity="0" />
        </linearGradient>
        <pattern id={`pt-${id}`} width="150" height="64" patternUnits="userSpaceOnUse">
          {/* running stitch vine */}
          <path
            d="M 0 34 C 25 22, 50 46, 75 34 C 100 22, 125 46, 150 34"
            fill="none"
            stroke="#E8B54D"
            strokeWidth="1.2"
            strokeDasharray={STITCH}
            strokeLinecap="round"
            opacity="0.75"
          />
          {/* paisley */}
          <g transform="translate(28 8) scale(0.78)" fill="none" stroke="#E8B54D" strokeWidth="1.5" strokeLinecap="round">
            <path d="M30 5 C 44 5, 54 17, 54 30 C 54 44, 43 55, 30 55 C 19 55, 11 47, 11 37 C 11 28, 17 22, 24 22 C 30 22, 34 26, 34 31 C 34 34.5, 31.5 37, 28 37" opacity="0.9" />
            <path d="M28 37 C 32 31, 31 18, 30 5" strokeDasharray="0.1 5" opacity="0.7" />
          </g>
          <Flower x={102} y={30} r={12} stroke="#EF8E4B" />
          {/* seed beads */}
          <circle cx="70" cy="16" r="1.7" fill="#EE9B01" />
          <circle cx="76" cy="12" r="1.2" fill="#D6336C" />
          <circle cx="132" cy="46" r="1.7" fill="#EE9B01" />
          <circle cx="138" cy="50" r="1.2" fill="#D6336C" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="100%" height="64" fill={`url(#pt-${id})`} opacity="0.55" />
      <rect x="0" y="31" width="100%" height="1.6" fill={`url(#pb-${id})`} opacity="0.35" />
    </svg>
  )
}

/** Fine stitched divider with a centered blossom. */
export function StitchDivider({ className = '' }: { className?: string }) {
  const id = useId().replace(/[:]/g, '')
  return (
    <svg className={className} width="100%" height="22" viewBox="0 0 600 22" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <linearGradient id={`sd-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#EE9B01" stopOpacity="0" />
          <stop offset="35%" stopColor="#EE9B01" />
          <stop offset="50%" stopColor="#EF3F28" />
          <stop offset="65%" stopColor="#D6336C" />
          <stop offset="100%" stopColor="#D6336C" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1="11" x2="278" y2="11" stroke={`url(#sd-${id})`} strokeWidth="1.4" strokeDasharray={STITCH} strokeLinecap="round" />
      <line x1="322" y1="11" x2="600" y2="11" stroke={`url(#sd-${id})`} strokeWidth="1.4" strokeDasharray={STITCH} strokeLinecap="round" />
      <g transform="translate(300 11)">
        <path d="M 0 -8 L 8 0 L 0 8 L -8 0 Z" fill="none" stroke="#EE9B01" strokeWidth="1.4" />
        <circle r="2" fill="#EF3F28" />
      </g>
    </svg>
  )
}

/** Fixed page backdrop — scattered mandalas, stitched vines, petals. */
export function EmbroideryBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      {/* corner mandalas */}
      <Mandala size={620} className="absolute -top-56 -right-56 opacity-[0.10] animate-spin-slow" />
      <Mandala size={520} className="absolute top-[46%] -left-64 opacity-[0.07] animate-spin-slower" />
      <Mandala size={420} className="absolute -bottom-48 right-[12%] opacity-[0.06] animate-spin-slow" />

      {/* stitched vine, left edge */}
      <svg className="absolute left-6 top-0 h-full opacity-[0.14]" width="60" height="100%" preserveAspectRatio="none" viewBox="0 0 60 1000">
        <path
          d="M 30 -20 C 8 120, 52 240, 30 360 C 8 480, 52 600, 30 720 C 12 820, 48 920, 30 1040"
          fill="none"
          stroke="#E8B54D"
          strokeWidth="1.4"
          strokeDasharray={STITCH}
          strokeLinecap="round"
        />
        <Flower x={30} y={180} r={11} stroke="#EF8E4B" />
        <Flower x={30} y={540} r={11} stroke="#EF8E4B" />
        <Flower x={30} y={880} r={11} stroke="#EF8E4B" />
      </svg>

      {/* stitched vine, right edge */}
      <svg className="absolute right-6 top-0 h-full opacity-[0.10]" width="60" height="100%" preserveAspectRatio="none" viewBox="0 0 60 1000">
        <path
          d="M 30 -20 C 52 120, 8 240, 30 360 C 52 480, 8 600, 30 720 C 48 820, 12 920, 30 1040"
          fill="none"
          stroke="#D6336C"
          strokeWidth="1.4"
          strokeDasharray={STITCH}
          strokeLinecap="round"
        />
        <g transform="translate(30 350) scale(0.7)" fill="none" stroke="#E8B54D" strokeWidth="1.6" strokeLinecap="round">
          <path d="M30 5 C 44 5, 54 17, 54 30 C 54 44, 43 55, 30 55 C 19 55, 11 47, 11 37 C 11 28, 17 22, 24 22 C 30 22, 34 26, 34 31 C 34 34.5, 31.5 37, 28 37" />
        </g>
        <Flower x={30} y={700} r={10} stroke="#D6336C" />
      </svg>

      {/* drifting petals */}
      {[
        { left: '12%', top: '22%', d: '9s', s: 14, c: '#EE9B01' },
        { left: '86%', top: '34%', d: '11s', s: 11, c: '#D6336C' },
        { left: '70%', top: '72%', d: '13s', s: 13, c: '#E8B54D' },
        { left: '28%', top: '82%', d: '10s', s: 10, c: '#EF3F28' },
      ].map((p, i) => (
        <svg
          key={i}
          className="absolute animate-float-soft opacity-30"
          style={{ left: p.left, top: p.top, animationDuration: p.d }}
          width={p.s * 2}
          height={p.s * 2}
          viewBox="-10 -10 20 20"
        >
          <path d={`M 0 ${-p.s} Q ${p.s * 0.7} 0 0 ${p.s} Q ${-p.s * 0.7} 0 0 ${-p.s}`} fill={p.c} opacity="0.55" />
        </svg>
      ))}
    </div>
  )
}
