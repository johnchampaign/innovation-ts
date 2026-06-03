// Loads the card catalog from data/cards.tsv (the same authoritative file used
// by the C# engine — copied verbatim, never edited from memory).
//
// TSV layout (two header rows, then one row per card):
//   0 ID  1 Age  2 Color  3 Title  4 Top  5 Left  6 Middle  7 Right
//   8 Hexagon(info only)  9 Dogma Icon  10 Cond1  11 Cond2  12 Cond3

import { CARDS_TSV as tsvRaw } from './cards-tsv-raw.generated';
import type { CardDef, Color, IconName, DogmaEffectDef } from './engine/types';

function parseIcon(s: string): IconName {
  switch (s.trim().toLowerCase()) {
    case 'leaf': return 'leaf';
    case 'castle': return 'castle';
    case 'lightbulb': return 'lightbulb';
    case 'crown': return 'crown';
    case 'factory': return 'factory';
    case 'clock': return 'clock';
    default: return 'none'; // 'x', blank, etc.
  }
}

function parseColor(s: string): Color {
  const c = s.trim().toLowerCase();
  if (c === 'yellow' || c === 'red' || c === 'purple' || c === 'blue' || c === 'green') return c;
  throw new Error(`Unknown card color: "${s}"`);
}

function parseEffect(raw: string): DogmaEffectDef | null {
  let text = raw.trim();
  if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1).trim();
  if (text === '') return null;
  return { text, isDemand: /^\s*I demand/i.test(text) };
}

function loadCatalog(): CardDef[] {
  const lines = tsvRaw.split(/\r?\n/);
  const byId: CardDef[] = [];
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const f = line.split('\t');
    const id = Number(f[0]);
    if (!Number.isFinite(id)) continue;
    const effects = [f[10], f[11], f[12]]
      .map((e) => parseEffect(e ?? ''))
      .filter((e): e is DogmaEffectDef => e !== null);
    byId[id] = {
      id,
      age: Number(f[1]),
      color: parseColor(f[2]),
      title: (f[3] ?? '').trim(),
      icons: [parseIcon(f[4]), parseIcon(f[5]), parseIcon(f[6]), parseIcon(f[7])],
      dogmaIcon: parseIcon(f[9]),
      effects,
    };
  }
  return byId;
}

/** Card catalog indexed by card ID (sparse array; `CARDS[id]`). */
export const CARDS: readonly CardDef[] = loadCatalog();

/** Every defined card, dense, for iteration (deck building, etc.). */
export const ALL_CARDS: readonly CardDef[] = CARDS.filter(Boolean);

const BY_TITLE = new Map<string, CardDef>(ALL_CARDS.map((c) => [c.title, c]));

export function cardById(id: number): CardDef {
  const c = CARDS[id];
  if (!c) throw new Error(`No card with id ${id}`);
  return c;
}

export function cardByTitle(title: string): CardDef {
  const c = BY_TITLE.get(title);
  if (!c) throw new Error(`No card titled "${title}"`);
  return c;
}
