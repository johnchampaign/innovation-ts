// Icon badges — the actual VB6/C# JPG art served from /icons/ for the six
// gameplay icons (leaf / castle / lightbulb / crown / factory / clock). The
// full-size art is used above ~20px; below that the `_small` variant keeps
// small tiles crisp, matching C# CardVisuals.BuildIconTile.
//
// Hexagon slot ('none') is a faint translucent placeholder — NOT the VB6
// x.jpg, which is actually a clock-with-banner left over from the original
// art and would (incorrectly) drop a clock-looking glyph onto every card.
// C# CardVisuals.BuildIconTile uses a translucent black rectangle here;
// we do the same.

import type { IconName } from '../engine/types';

const FILE: Record<Exclude<IconName, 'none'>, string> = {
  leaf:      'leaf',
  castle:    'castle',
  lightbulb: 'lightbulb',
  crown:     'crown',
  factory:   'factory',
  clock:     'clock',
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
    // Hexagon slot — leave it blank. C# uses a faintly tinted square so the
    // slot still visually occupies space without dropping a glyph; we match.
    return (
      <span style={{
        display: 'inline-block',
        width: size, height: size,
        background: 'rgba(0,0,0,0.10)',
        borderRadius: 2,
      }} />
    );
  }
  const useSmall = size <= 20;
  const file = FILE[icon] + (useSmall ? '_small' : '') + '.jpg';
  return (
    <img
      src={`/icons/${file}`}
      width={size}
      height={size}
      alt={icon}
      draggable={false}
      style={{
        display: 'inline-block',
        borderRadius: 2,
        verticalAlign: 'middle',
        userSelect: 'none',
        imageRendering: 'auto',
      }}
    />
  );
}

/** Big achievement-tile JPG for Monument/Empire/World/Wonder/Universe. */
export function SpecialAchievementBadge({
  name, size = 36,
}: { name: string; size?: number }) {
  const file = name.toLowerCase() + 'achievement.jpg';
  return (
    <img
      src={`/icons/${file}`}
      width={size}
      height={size}
      alt={name}
      title={name}
      draggable={false}
      style={{
        display: 'inline-block',
        borderRadius: 2,
        verticalAlign: 'middle',
        userSelect: 'none',
      }}
    />
  );
}
