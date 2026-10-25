// diya-qr.js — a scannable QR code dressed as a diya (oil lamp).
// The code itself stays a square grid (phones need that), but it's drawn as round,
// gradient-coloured dots on cream, with saffron corner "eyes", a little diya in the middle,
// a flame flickering on top and a clay lamp bowl underneath.
// Needs qrcode-generator (window.qrcode) loaded first.
window.DiyaQR = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  let uid = 0;
  // Tuned so it decodes with both strict (OpenCV) and phone-style (ZXing) readers; see README.
  const DEFAULTS = { dot: 'circle', dotSize: 1.0, eyeRound: 0 };

  // One-time styles for the flickering flame (switched off for "reduce motion" and when printing).
  function injectStyles() {
    if (document.getElementById('diya-qr-css')) return;
    const st = document.createElement('style');
    st.id = 'diya-qr-css';
    st.textContent = `
      .dq-flame, .dq-core { transform-box: fill-box; transform-origin: 50% 100%; animation: dqFlicker .9s ease-in-out infinite alternate; }
      .dq-core { animation-duration: .7s; animation-direction: alternate-reverse; }
      .dq-halo { transform-box: fill-box; transform-origin: center; animation: dqHalo 1.6s ease-in-out infinite alternate; }
      @keyframes dqFlicker { 0% { transform: scale(1,1) rotate(-3deg); } 40% { transform: scale(.92,1.1) rotate(2deg); } 100% { transform: scale(1.05,.95) rotate(-1deg); } }
      @keyframes dqHalo { from { opacity: .45; transform: scale(.94); } to { opacity: .85; transform: scale(1.06); } }
      @media (prefers-reduced-motion: reduce) { .dq-flame, .dq-core, .dq-halo { animation: none; } }
      @media print { .dq-flame, .dq-core, .dq-halo { animation: none; } }`;
    document.head.append(st);
  }

  // Build the SVG. `text` is what the code opens (the guest page address).
  function render(container, text, opts = {}) {
    const dotStyle = opts.dot || DEFAULTS.dot, eyeRound = opts.eyeRound ?? DEFAULTS.eyeRound, dotSize = opts.dotSize ?? DEFAULTS.dotSize;
    injectStyles();
    const id = `dq${++uid}`;

    // Highest error correction ("H", ~30%) so the little diya in the middle doesn't stop it scanning.
    const qr = window.qrcode(0, 'H');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();

    // Layout, in QR "module" units.
    const quiet = 4;                     // blank border phones need around the code
    const card = n + quiet * 2;          // cream card the code sits on
    const side = 7, top = 15, bottom = 13;
    const W = card + side * 2, H = top + card + bottom;
    const x0 = side + quiet, y0 = top + quiet;   // top-left of the code itself
    const cx = W / 2;

    // Areas drawn specially: the three finder "eyes" and a 7×7 hole in the middle for the diya logo.
    const inEye = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
    const mid = Math.floor(n / 2), hole = 3;
    const inHole = (r, c) => Math.abs(r - mid) <= hole && Math.abs(c - mid) <= hole;

    let dots = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!qr.isDark(r, c) || inEye(r, c) || inHole(r, c)) continue;
        dots += dotStyle === 'circle'
          ? `<circle cx="${x0 + c + 0.5}" cy="${y0 + r + 0.5}" r="${dotSize / 2}"/>`
          : `<rect x="${x0 + c + (1 - dotSize) / 2}" y="${y0 + r + (1 - dotSize) / 2}" width="${dotSize}" height="${dotSize}" rx="${dotSize * 0.3}"/>`;
      }
    }

    // Rounded saffron eyes with berry centres.
    const eye = (r, c) => {
      const x = x0 + c, y = y0 + r;
      return `<rect x="${x + 0.5}" y="${y + 0.5}" width="6" height="6" rx="${1.7 * eyeRound}" fill="none" stroke="#b33a00" stroke-width="1"/>` +
             `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="${0.9 * eyeRound}" fill="#7a0f45"/>`;
    };

    // Little diya in the centre hole.
    const lx = x0 + mid + 0.5, ly = y0 + mid + 0.5;
    const logo = `
      <rect x="${x0 + mid - hole + 0.2}" y="${y0 + mid - hole + 0.2}" width="${hole * 2 + 0.6}" height="${hole * 2 + 0.6}" rx="1.4" fill="#fff8ec"/>
      <path d="M${lx} ${ly - 2.6} C${lx + 0.9} ${ly - 1.4} ${lx + 1.1} ${ly - 0.6} ${lx} ${ly + 0.2} C${lx - 1.1} ${ly - 0.6} ${lx - 0.9} ${ly - 1.4} ${lx} ${ly - 2.6}Z" fill="url(#${id}fl)"/>
      <path d="M${lx - 2.5} ${ly + 0.4} Q${lx} ${ly + 3.4} ${lx + 2.5} ${ly + 0.4} Z" fill="url(#${id}cl)"/>
      <path d="M${lx - 2.5} ${ly + 0.4} Q${lx} ${ly + 1.2} ${lx + 2.5} ${ly + 0.4}" stroke="#e0a100" stroke-width="0.3" fill="none"/>`;

    // Big lamp bowl behind the card (only its sides and belly show), plus the flame on top.
    const rim = top + card - 7;
    const belly = 2 * (H - 0.8) - rim;   // control point so the bowl's lowest point is just above the bottom edge
    const dotsY = top + card + bottom * 0.42;
    const bowlDots = [-12, -6, 0, 6, 12].map((dx, i) =>
      `<circle cx="${cx + dx}" cy="${dotsY - Math.abs(dx) * 0.18}" r="${i === 2 ? 1.3 : 0.9}" fill="${i % 2 ? '#ff2e7e' : '#ffd45c'}"/>`).join('');

    const svg = `
<svg xmlns="${NS}" viewBox="0 0 ${W} ${H}" role="img" aria-label="QR code to request a song" shape-rendering="geometricPrecision">
  <defs>
    <linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="${x0}" y1="${y0}" x2="${x0 + n}" y2="${y0 + n}">
      <stop offset="0" stop-color="#6b0f3a"/><stop offset=".5" stop-color="#4a1a7a"/><stop offset="1" stop-color="#8a2c00"/>
    </linearGradient>
    <radialGradient id="${id}fl" cx="50%" cy="72%" r="62%">
      <stop offset="0" stop-color="#fffbe0"/><stop offset=".4" stop-color="#ffd23d"/><stop offset="1" stop-color="#ff5a00"/>
    </radialGradient>
    <radialGradient id="${id}halo"><stop offset="0" stop-color="#ffb02e" stop-opacity=".75"/><stop offset="1" stop-color="#ffb02e" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}cl" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ff8a1f"/><stop offset="1" stop-color="#a83200"/></linearGradient>
  </defs>

  <!-- flame -->
  <circle class="dq-halo" cx="${cx}" cy="${top - 6.5}" r="7.5" fill="url(#${id}halo)"/>
  <path class="dq-flame" d="M${cx} ${0.6} C${cx + 4.6} ${5.6} ${cx + 5.4} ${9.6} ${cx} ${top - 0.6} C${cx - 5.4} ${9.6} ${cx - 4.6} ${5.6} ${cx} ${0.6}Z" fill="url(#${id}fl)"/>
  <path class="dq-core" d="M${cx} ${5.4} C${cx + 1.8} ${8.2} ${cx + 2} ${10.4} ${cx} ${top - 1.4} C${cx - 2} ${10.4} ${cx - 1.8} ${8.2} ${cx} ${5.4}Z" fill="#fffbe0"/>

  <!-- clay bowl (behind the card) -->
  <path d="M0.6 ${rim} Q${cx} ${belly} ${W - 0.6} ${rim} Z" fill="url(#${id}cl)"/>
  <path d="M0.6 ${rim} Q${cx} ${rim + 5} ${W - 0.6} ${rim}" stroke="#ffd45c" stroke-width="0.7" fill="none"/>
  ${bowlDots}

  <!-- the code: cream card, gradient dots, eyes, centre diya -->
  <rect x="${side}" y="${top}" width="${card}" height="${card}" rx="3" fill="#fff8ec" stroke="#ffd45c" stroke-width="0.5"/>
  <g fill="url(#${id}g)">${dots}</g>
  ${eye(0, 0)}${eye(0, n - 7)}${eye(n - 7, 0)}
  ${logo}
</svg>`;
    container.innerHTML = svg; // built only from our own numbers and the QR pattern, never user input
    return container.firstElementChild;
  }

  return { render };
})();
