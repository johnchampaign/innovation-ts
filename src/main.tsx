import { createRoot } from 'react-dom/client';

// Placeholder shell. The engine + framework adapter are in place and exercised
// by `npm run smoke`; the real Board UI and the framework's online lobby
// (useGame) are the next milestone — see PORT-PLAN.md.
function App() {
  return (
    <div style={{ padding: 24, maxWidth: 640, margin: '0 auto', lineHeight: 1.5 }}>
      <h1>Innovation</h1>
      <p>TypeScript port — engine + boardgame.io + framework adapter scaffolded.</p>
      <p style={{ opacity: 0.8 }}>
        Run <code>npm run smoke</code> for the headless rollout. UI and online
        multiplayer (via the digital-boardgame-framework <code>useGame</code> hook)
        come next.
      </p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
