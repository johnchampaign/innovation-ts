import { createRoot } from 'react-dom/client';
import { Game } from './ui/Game';

createRoot(document.getElementById('root')!).render(<Game numPlayers={2} />);
