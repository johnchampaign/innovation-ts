import { createRoot } from 'react-dom/client';
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

createRoot(document.getElementById('root')!).render(<App />);
