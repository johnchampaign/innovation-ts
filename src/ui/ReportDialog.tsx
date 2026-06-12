// "Report a problem" / "Upload logs" dialog. Reusable across hotseat and
// online modes — the host wires the actual submit handler (online posts to
// the framework's /api/games/:id/report; hotseat downloads a JSON bundle
// for manual sharing).

import { useState } from 'react';
import { panelBg, textColor, cardBorder } from './colors';

interface Props {
  open: boolean;
  /** "bug" = user describes a problem; "logs" = one-click log upload. */
  kind: 'bug' | 'logs';
  /** Pre-captured screenshot (data: URL) of the game UI taken BEFORE the
   *  dialog opened — so the screenshot shows the actual play state, not
   *  the report dialog itself. Provided by the host. */
  screenshotDataUrl?: string;
  /** Resolves to an opaque receipt id (or 'downloaded' for the hotseat
   *  download path) when the submission completes. */
  onSubmit: (
    message: string,
    severity: Severity,
    opts: { attachScreenshot: boolean; attachLog: boolean },
  ) => Promise<string>;
  onClose: () => void;
}

export type Severity = 'bug' | 'rules-question' | 'feedback';

export function ReportDialog({ open, kind, screenshotDataUrl, onSubmit, onClose }: Props) {
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<Severity>(kind === 'bug' ? 'bug' : 'feedback');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  // Default both attachments ON, per the user-requested behaviour.
  const [attachScreenshot, setAttachScreenshot] = useState(true);
  const [attachLog, setAttachLog] = useState(true);

  if (!open) return null;

  const screenshotAvailable = !!screenshotDataUrl;

  async function submit() {
    setSubmitting(true);
    setResult(null);
    try {
      const id = await onSubmit(message.trim(), severity, {
        attachScreenshot: attachScreenshot && screenshotAvailable,
        attachLog,
      });
      const isUrl = /^https?:\/\//.test(id);
      setResult({
        ok: true,
        text: isUrl
          ? `Submitted — filed as ${id}`
          : id === 'downloaded'
            ? 'Saved to your downloads as a JSON bundle. Send it along when reporting.'
            : `Submitted — receipt id ${id}.`,
      });
    } catch (e) {
      setResult({ ok: false, text: (e as Error)?.message ?? String(e) });
    } finally {
      setSubmitting(false);
    }
  }

  function close() {
    setMessage('');
    setResult(null);
    setAttachScreenshot(true);
    setAttachLog(true);
    onClose();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100,
    }}>
      <div style={{
        maxWidth: 540, width: '92vw', maxHeight: '88vh', overflow: 'auto',
        background: panelBg, border: `1px solid ${cardBorder}`, borderRadius: 8,
        padding: '16px 20px', color: textColor,
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}>
        <header style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          marginBottom: 6, borderBottom: '1px solid rgba(0,0,0,0.12)', paddingBottom: 6,
        }}>
          <strong style={{ fontSize: 15 }}>
            {kind === 'bug' ? 'Report a problem' : 'Upload logs'}
          </strong>
          {/* After a successful submission the "Cancel" label is misleading
           *  (the operation is already done). Switch to "Close" once we have
           *  a positive result. */}
          <button onClick={close} style={smallButton()}>
            {result?.ok ? 'Close' : 'Cancel'}
          </button>
        </header>

        <p style={{ margin: '8px 0', fontSize: 12, opacity: 0.8 }}>
          {kind === 'bug'
            ? 'Briefly describe what you expected and what actually happened. Game state and log are attached automatically.'
            : 'Send the current game log + state so the developer can replay your session. Add a note if there’s something specific to look at.'
          }
        </p>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          <span>Description {kind === 'logs' && <em style={{ opacity: 0.6 }}>(optional)</em>}</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder={kind === 'bug'
              ? 'e.g. "On turn 12 I tucked a card under purple but its splay reset to none."'
              : 'e.g. "Nothing specific — sharing for offline review."'}
            style={{
              padding: '6px 8px', borderRadius: 4,
              border: `1px solid ${cardBorder}`, background: '#fff',
              color: textColor, fontFamily: 'inherit', fontSize: 13,
              resize: 'vertical', minHeight: 70,
            }}
          />
        </label>

        {/* Attachment toggles only make sense for "Report a problem" — for
         *  "Upload logs" the log IS the payload, and there's no specific
         *  thing the user is pointing at that a screenshot would clarify.
         *  Hiding the whole panel keeps the flow one-click. */}
        {kind === 'bug' && (
          <div style={{
            marginTop: 10, padding: '8px 10px', borderRadius: 4,
            background: '#fbf7da', border: `1px solid ${cardBorder}`,
          }}>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Attach</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 4 }}>
              <input
                type="checkbox"
                checked={attachScreenshot && screenshotAvailable}
                onChange={(e) => setAttachScreenshot(e.target.checked)}
                disabled={!screenshotAvailable}
              />
              <span>
                Screenshot of the current game
                {!screenshotAvailable && <em style={{ opacity: 0.6 }}> (capture failed)</em>}
              </span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={attachLog}
                onChange={(e) => setAttachLog(e.target.checked)}
              />
              <span>Game log + state (JSON)</span>
            </label>
            {screenshotAvailable && attachScreenshot && (
              <div style={{ marginTop: 8 }}>
                <img
                  src={screenshotDataUrl}
                  alt="screenshot preview"
                  style={{
                    maxWidth: '100%', maxHeight: 120, borderRadius: 3,
                    border: `1px solid ${cardBorder}`, display: 'block',
                  }}
                />
                <div style={{ fontSize: 10, opacity: 0.65, marginTop: 4 }}>
                  Will be downloaded to your machine; drag it into a comment on the filed issue to attach.
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center' }}>
          {/* Severity is only meaningful for "Report a problem". The logs
           *  flow is a one-click session capture; pin its severity to
           *  feedback internally and don't surface the dropdown. */}
          {kind === 'bug' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              Severity
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as Severity)}
                style={{ padding: '3px 6px', borderRadius: 3, border: `1px solid ${cardBorder}` }}
              >
                <option value="bug">Bug</option>
                <option value="rules-question">Rules question</option>
                <option value="feedback">Feedback</option>
              </select>
            </label>
          )}
          <button
            onClick={submit}
            disabled={submitting || (kind === 'bug' && message.trim().length === 0)}
            style={primaryButton(submitting || (kind === 'bug' && message.trim().length === 0))}
          >
            {submitting ? 'Sending…' : kind === 'bug' ? 'Submit' : 'Upload'}
          </button>
        </div>

        {result && (
          <div style={{
            marginTop: 12, padding: '8px 10px', borderRadius: 4,
            background: result.ok ? '#dbe8c8' : '#f1d1cf',
            color: result.ok ? '#2f5f1d' : '#7a2a25',
            fontSize: 12, lineHeight: 1.4,
            wordBreak: 'break-word',
          }}>
            {renderResultText(result.text)}
          </div>
        )}
      </div>
    </div>
  );
}

/** Linkify https:// substrings inside the success message so the user can
 *  click through to the filed GitHub Issue. */
function renderResultText(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(https?:\/\/\S+)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
    parts.push(
      <a
        key={m.index}
        href={m[1]}
        target="_blank"
        rel="noreferrer"
        style={{ color: '#1a4d18', textDecoration: 'underline' }}
      >{m[1]}</a>,
    );
    lastIndex = m.index + m[1].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function primaryButton(disabled: boolean): React.CSSProperties {
  return {
    padding: '6px 14px', borderRadius: 4,
    border: `1px solid ${cardBorder}`,
    background: disabled ? '#ddd9c5' : '#a98a4b',
    color: disabled ? '#888' : '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13, fontWeight: 600,
  };
}

function smallButton(): React.CSSProperties {
  return {
    padding: '3px 10px', borderRadius: 4,
    border: `1px solid ${cardBorder}`, background: '#e8e3c8',
    color: textColor, cursor: 'pointer', fontSize: 12, fontWeight: 600,
  };
}
