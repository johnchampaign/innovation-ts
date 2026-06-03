// In-flight dogma choice prompt. Cream theme to match the rest of the UI.

import { useState } from 'react';
import { cardById } from '../card-data';
import { COLORS } from '../engine/types';
import type { ChoiceResponse, PendingChoice } from '../engine/types';
import { CardChip } from './Card';
import { panelBg, textColor, cardBorder } from './colors';

interface Props {
  pc: PendingChoice;
  onSubmit: (response: ChoiceResponse) => void;
}

export function ChoicePrompt({ pc, onSubmit }: Props) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 50,
    }}>
      <div style={{
        maxWidth: 760, width: '92vw', maxHeight: '88vh', overflow: 'auto',
        background: panelBg, border: `1px solid ${cardBorder}`, borderRadius: 8,
        padding: '14px 18px',
        boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
        color: textColor,
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}>
        <header style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          marginBottom: 8, borderBottom: '1px solid rgba(0,0,0,0.12)', paddingBottom: 6,
        }}>
          <strong style={{ fontSize: 14 }}>Player {pc.playerId}</strong>
          <span style={{ fontSize: 11, opacity: 0.7 }}>{pc.kind}</span>
        </header>
        <p style={{ margin: '6px 0 14px', lineHeight: 1.4, fontSize: 13 }}>{pc.prompt}</p>
        <ChoiceBody pc={pc} onSubmit={onSubmit} />
      </div>
    </div>
  );
}

function ChoiceBody({ pc, onSubmit }: Props) {
  switch (pc.kind) {
    case 'select-hand-card':
    case 'select-score-card':
      return (
        <>
          <CardGrid options={pc.options} onPick={(id) => onSubmit(id)} />
          {pc.optional && <DeclineButton onSubmit={onSubmit} />}
        </>
      );
    case 'select-board-color':
      return (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {pc.options.map((idx) => (
              <button key={idx} onClick={() => onSubmit(idx)} style={pickButton()}>
                {COLORS[idx]}
              </button>
            ))}
          </div>
          {pc.optional && <DeclineButton onSubmit={onSubmit} />}
        </>
      );
    case 'select-value':
      return (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {pc.options.map((v) => (
              <button key={v} onClick={() => onSubmit(v)} style={pickButton()}>{v}</button>
            ))}
          </div>
          {pc.optional && <DeclineButton onSubmit={onSubmit} />}
        </>
      );
    case 'select-player':
      return (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {pc.options.map((id, i) => (
              <button key={id} onClick={() => onSubmit(id)} style={pickButton()}>
                Player {pc.playerOptions?.[i] ?? id}
              </button>
            ))}
          </div>
          {pc.optional && <DeclineButton onSubmit={onSubmit} />}
        </>
      );
    case 'yes-no':
      return (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onSubmit(true)} style={pickButton()}>Yes</button>
          <button onClick={() => onSubmit(false)} style={pickButton(true)}>No</button>
        </div>
      );
    case 'select-hand-card-subset':
    case 'select-score-card-subset':
      return <SubsetPicker pc={pc} onSubmit={onSubmit} />;
    case 'select-card-order':
      return <OrderPicker pc={pc} onSubmit={onSubmit} />;
    default:
      return <em>Unrecognised choice kind: {(pc as { kind: string }).kind}</em>;
  }
}

function CardGrid({ options, onPick }: { options: number[]; onPick: (id: number) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map((id, i) => (
        <CardChip key={`${id}-${i}`} cardId={id} onClick={() => onPick(id)} />
      ))}
    </div>
  );
}

function DeclineButton({ onSubmit }: { onSubmit: (r: ChoiceResponse) => void }) {
  return (
    <div style={{ marginTop: 10 }}>
      <button onClick={() => onSubmit(null)} style={pickButton(true)}>Decline</button>
    </div>
  );
}

function SubsetPicker({ pc, onSubmit }: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  const min = pc.minCount ?? 0;
  const max = pc.maxCount ?? pc.options.length;
  const canSubmit = selected.length >= min && selected.length <= max;
  const toggle = (id: number) => {
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  };
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {pc.options.map((id, i) => (
          <CardChip
            key={`${id}-${i}`}
            cardId={id}
            selected={selected.includes(id)}
            onClick={() => toggle(id)}
          />
        ))}
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          {selected.length} selected {min === max ? `(need ${min})` : `(${min}–${max})`}
        </span>
        <button onClick={() => onSubmit(selected)} disabled={!canSubmit} style={pickButton(false, !canSubmit)}>Confirm</button>
        {pc.optional && (
          <button onClick={() => onSubmit(null)} style={pickButton(true)}>Decline</button>
        )}
      </div>
    </>
  );
}

function OrderPicker({ pc, onSubmit }: Props) {
  const [order, setOrder] = useState<number[]>([...pc.options]);
  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };
  return (
    <>
      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 0 }}>
        Order is top→bottom (first card lands on top). Reorder with the ↑/↓ buttons.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {order.map((id, i) => (
          <div key={`${id}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 22, fontSize: 12, opacity: 0.7 }}>#{i + 1}</span>
            <button onClick={() => move(i, -1)} disabled={i === 0} style={smallButton()}>↑</button>
            <button onClick={() => move(i, +1)} disabled={i === order.length - 1} style={smallButton()}>↓</button>
            <span style={{ fontSize: 12 }}>
              Age {cardById(id).age} — {cardById(id).title}
            </span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={() => onSubmit(order)} style={pickButton()}>Confirm order</button>
      </div>
    </>
  );
}

function pickButton(secondary?: boolean, disabled?: boolean): React.CSSProperties {
  return {
    padding: '6px 14px', borderRadius: 4,
    border: `1px solid ${cardBorder}`,
    background: disabled ? '#ddd9c5' : secondary ? '#e8e3c8' : '#a98a4b',
    color: disabled ? '#888' : secondary ? textColor : '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13, fontWeight: 600,
    fontFamily: '"Segoe UI", system-ui, sans-serif',
  };
}

function smallButton(): React.CSSProperties {
  return {
    padding: '2px 8px', borderRadius: 3,
    border: `1px solid ${cardBorder}`, background: '#e8e3c8',
    color: textColor, cursor: 'pointer', fontSize: 12,
  };
}
