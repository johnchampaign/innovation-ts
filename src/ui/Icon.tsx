// SVG icon badges — flat-design colored squares with white silhouettes,
// matching the C# WPF reference (CardVisuals.cs uses pre-composited JPGs
// of the VB6 art; we reproduce the look with inline SVG so the same UI
// works offline and on any background).
//
// Six gameplay icons + the hexagon ('none') placeholder.

import type React from 'react';
import type { IconName } from '../engine/types';

const BG: Record<Exclude<IconName, 'none'>, string> = {
  leaf:      '#2f7a3a',
  castle:    '#4a4438',
  lightbulb: '#d6a91d',
  crown:     '#c47a1f',
  factory:   '#9c2c2c',
  clock:     '#2a5f8a',
};

interface Props {
  icon: IconName;
  size?: number;
  /** When false renders a transparent placeholder of the same dimensions
   *  so layouts stay aligned (covered slot under a splay etc.). */
  visible?: boolean;
}

export function IconBadge({ icon, size = 22, visible = true }: Props) {
  if (!visible) {
    return <span style={{ display: 'inline-block', width: size, height: size }} />;
  }
  if (icon === 'none') {
    // Hexagon-slot placeholder: dark muted square. The C# version leaves it
    // empty; the muted tone visually marks the slot without dropping a
    // gameplay icon on it.
    return (
      <span style={{
        display: 'inline-block', width: size, height: size,
        background: 'rgba(0,0,0,0.18)', borderRadius: 2,
      }} />
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'inline-block', borderRadius: 2 }}
    >
      <rect x={0} y={0} width={24} height={24} fill={BG[icon]} rx={2} ry={2} />
      <g fill="#ffffff" stroke="#ffffff" strokeWidth={0.6} strokeLinejoin="round">
        {iconPath(icon)}
      </g>
    </svg>
  );
}

function iconPath(icon: Exclude<IconName, 'none'>): React.JSX.Element {
  switch (icon) {
    case 'leaf':
      // Stylised leaf shape — teardrop with central vein.
      return (
        <>
          <path d="M5 18 C 5 9, 12 4, 19 5 C 19 12, 14 19, 6 19 Z" />
          <path d="M7 17 L 17 7" stroke="#2f7a3a" strokeWidth={1.2} />
        </>
      );
    case 'castle':
      // Crenellated battlement.
      return (
        <>
          <rect x={3} y={9} width={18} height={11} />
          <rect x={3} y={6} width={3} height={4} />
          <rect x={8} y={4} width={3} height={6} />
          <rect x={13} y={6} width={3} height={4} />
          <rect x={18} y={4} width={3} height={6} />
          <rect x={10} y={14} width={4} height={6} fill="#4a4438" stroke="none" />
        </>
      );
    case 'lightbulb':
      // Bulb body + filament + base.
      return (
        <>
          <ellipse cx={12} cy={10} rx={6} ry={6.5} />
          <rect x={9} y={16} width={6} height={3} />
          <rect x={10} y={19} width={4} height={2} />
        </>
      );
    case 'crown':
      // Three-point crown.
      return (
        <>
          <path d="M3 18 L 4 9 L 8 13 L 12 6 L 16 13 L 20 9 L 21 18 Z" />
          <rect x={3} y={18} width={18} height={3} />
        </>
      );
    case 'factory':
      // Two stacks + roofline.
      return (
        <>
          <path d="M3 20 L 3 12 L 9 14 L 9 10 L 15 13 L 15 9 L 21 11 L 21 20 Z" />
          <rect x={6} y={5} width={3} height={6} fill="#9c2c2c" stroke="none" />
        </>
      );
    case 'clock':
      // Clock face — circle + hands.
      return (
        <>
          <circle cx={12} cy={12} r={8} />
          <path d="M12 7 L 12 12 L 16 14" stroke="#2a5f8a" strokeWidth={1.6} fill="none" strokeLinecap="round" />
        </>
      );
  }
}
