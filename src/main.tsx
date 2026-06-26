import { createRoot } from 'react-dom/client';
import { SplashScreen } from 'digital-boardgame-framework/client';
import { Lobby } from './ui/Lobby';
import { OnlineGame } from './ui/OnlineGame';

// Router: ?game=&token= → OnlineGame; otherwise Lobby (which can drop into the
// hotseat Game inline). Tiny enough that a full router would be overkill.
function App() {
  const url = new URL(window.location.href);
  const gameId = url.searchParams.get('game');
  const token = url.searchParams.get('token');
  if (gameId && token) {
    return <OnlineGame gameId={gameId} token={token} />;
  }
  return <Lobby />;
}

// Startup interstitial. Self-managing (shows once per browser session) and
// renders its own overlay above the app, hiding on Continue. The default
// middle is a live "more games" list pulled from the hub's games.json, so
// Innovation cross-promos the other games and stays current automatically.
createRoot(document.getElementById('root')!).render(
  <>
    <SplashScreen title="Innovation" appId="innovation" />
    <App />
  </>,
);
