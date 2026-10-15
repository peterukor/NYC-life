// =====================================================================
// main.ts — the entry point. Shows a loading mark, starts the game, and
// shows a friendly message if the device can't run 3D graphics.
// =====================================================================

import './ui/styles.css';
import { initClockFromUrl } from './core/clock.ts';
import { Game } from './game.ts';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

async function start(): Promise<void> {
  performance.mark('main:start');
  initClockFromUrl(location.search);
  const ui = document.getElementById('ui')!;
  // index.html already shows the loading screen; add it only if it isn't there.
  if (!ui.querySelector('.loading')) ui.insertAdjacentHTML('beforeend', '<div class="loading" aria-label="Loading"><div class="mark">NY</div></div>');
  if (!webglAvailable()) {
    ui.innerHTML = '<div class="modal-wrap"><div class="modal"><div class="big">🗽</div><h2>Your browser can’t show 3D</h2><p>NYC Life needs WebGL. Try the latest Chrome, Safari or Firefox, or turn on hardware acceleration in your browser settings.</p></div></div>';
    return;
  }
  const game = new Game(document.getElementById('stage')!);
  await game.boot();
}

// Keep a copy of the game on the device (sw.js, made by vite.config.ts):
// return visits start from the phone and work offline. Live builds only.
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {}));
}

start().catch((err) => {
  console.error(err);
  const ui = document.getElementById('ui');
  if (ui) ui.insertAdjacentHTML('beforeend', '<div class="modal-wrap"><div class="modal"><div class="big">🚧</div><h2>Something went wrong</h2><p>Reload the page to try again. Your progress is saved on this device.</p></div></div>');
});
