import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The canonical deployment is Cloudflare Pages served at root, so base is '/'.
// (Lesson from the Tyrants port: don't gate base behind an env var that a
// manual build might miss — default it, override with VITE_BASE_PATH only for
// a genuine sub-path deploy.)
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? (process.env.VITE_BASE_PATH || '/') : '/',
  plugins: [react()],
  // Dedupe React so the published framework (built against its own React)
  // shares one copy with the app — else useGame throws "Cannot read
  // properties of null (reading 'useState')". (Tyrants integration gotcha.)
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { port: 5174, open: false },
}));
