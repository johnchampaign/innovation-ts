// Icon badges — the actual VB6/C# JPG art served from /icons/ (copied
// verbatim from the C# repo's Resources directory). The full-size art is
// used above ~20px; below that the `_small` variant keeps small tiles crisp,
// matching the C# CardVisuals.BuildIconTile rule.
//
// Hexagon slot ('none') uses x.jpg — a dark-muted placeholder that visually
// occupies the slot without claiming it as a gameplay icon.

import type { IconName } from '../engine/types';

const FILE: Record<IconName, string> = {
  none:      'x',
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
