// diwali.js — shared decorations for the guest page (/) and big screen (/tv).
// Everything here is drawn from our own constants; no guest input is ever put into innerHTML.
window.Diwali = (() => {
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches; // "reduce motion" phones
  const NS = 'http://www.w3.org/2000/svg';

  // ---- marigold strands: one every ~34px across the screen ----------------------------
  function toran(wrap) {
    const n = Math.ceil(document.documentElement.clientWidth / 34) + 1;
    for (let i = 0; i < n; i++) {
      const strand = document.createElement('span');
      strand.className = 'strand';
      strand.style.left = `${i * 34 + 10}px`;
      strand.style.animationDelay = `${-Math.random() * 3}s`;
      for (let j = 0; j < (i % 2 ? 2 : 3); j++) {          // alternate long and short strands
        const ball = document.createElement('b');
        ball.style.setProperty('--c', (i + j) % 2 ? '#ffc21a' : '#ff8a00');
        strand.append(ball);
      }
      strand.append(document.createElement('em'));         // mango leaf at the end
      wrap.append(strand);
    }
  }

  // ---- rangoli: filled petals in layered rings (crisp at any size) ------------------
  // Petal pointing outward from radius `d`, `len` long and `w` wide.
  const petal = (d, len, w) =>
    `M0 ${-d} C ${w} ${-(d + len * .25)} ${w * .9} ${-(d + len * .8)} 0 ${-(d + len)} ` +
    `C ${-w * .9} ${-(d + len * .8)} ${-w} ${-(d + len * .25)} 0 ${-d} Z`;

  function rangoli(svg) {
    svg.setAttribute('viewBox', '-100 -100 200 200');
    const parts = [];
    const add = (tag, attrs) => parts.push(`<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`);
    const ring = (n, fn) => { for (let i = 0; i < n; i++) fn((360 / n) * i, i); };

    // outer border: scalloped pink petals with white dot tips
    ring(24, (a) => add('path', { d: petal(74, 20, 7.5), fill: '#ff2e7e', transform: `rotate(${a})` }));
    ring(24, (a) => add('circle', { cx: 0, cy: -97, r: 2.2, fill: '#fff6ea', transform: `rotate(${a})` }));
    ring(24, (a) => add('path', { d: petal(78, 10, 3.5), fill: '#ffc23d', transform: `rotate(${a})` }));
    // dotted circle
    add('circle', { r: 72, fill: 'none', stroke: '#fff6ea', 'stroke-width': 1.6, 'stroke-dasharray': '1.5 4.2', 'stroke-linecap': 'round' });
    // saffron lotus petals with violet inner petals
    ring(12, (a) => add('path', { d: petal(36, 34, 13), fill: '#ff8a1f', transform: `rotate(${a})` }));
    ring(12, (a) => add('path', { d: petal(40, 22, 6.5), fill: '#b98cff', transform: `rotate(${a})` }));
    ring(12, (a) => add('path', { d: petal(56, 30, 8), fill: '#2fb36a', transform: `rotate(${a + 15})` }));
    ring(12, (a) => add('circle', { cx: 0, cy: -88, r: 2.6, fill: '#ffc23d', transform: `rotate(${a + 15})` }));
    // gold diamonds
    ring(16, (a) => add('rect', { x: -3.2, y: -35.2, width: 6.4, height: 6.4, fill: '#ffc23d', transform: `rotate(${a}) rotate(45 0 -32)` }));
    // centre flower
    add('circle', { r: 28, fill: '#3a1356' });
    ring(8, (a) => add('path', { d: petal(6, 20, 8), fill: '#ff2e7e', transform: `rotate(${a})` }));
    ring(8, (a) => add('path', { d: petal(8, 12, 4), fill: '#ffd45c', transform: `rotate(${a + 22.5})` }));
    add('circle', { r: 7, fill: '#ffc23d' });
    add('circle', { r: 3, fill: '#fff6ea' });
    svg.innerHTML = parts.join('');
  }

  // ---- embers rising --------------------------------------------------------------
  function embers(box, count = 26) {
    if (calm) return;
    for (let i = 0; i < count; i++) {
      const e = document.createElement('i');
      const size = 2 + Math.random() * 3;
      Object.assign(e.style, {
        left: `${Math.random() * 100}%`, width: `${size}px`, height: `${size}px`,
        animationDuration: `${8 + Math.random() * 10}s`, animationDelay: `${-Math.random() * 18}s`,
      });
      e.style.setProperty('--sway', `${(Math.random() - .5) * 80}px`);
      box.append(e);
    }
  }

  // ---- fireworks on a full-screen canvas ---------------------------------------------
  function fireworks(c) {
    const ctx = c.getContext('2d');
    const DPR = Math.min(2, devicePixelRatio || 1);
    const colors = ['#ffc23d', '#ff8a1f', '#ff2e7e', '#fff3b0', '#b98cff', '#ffffff'];
    let parts = [], raf = 0;
    const size = () => { c.width = innerWidth * DPR; c.height = innerHeight * DPR; };
    size(); addEventListener('resize', size);

    function burst(x, y, count = 70, spread = 1) {
      if (calm) return;
      const hue = colors[Math.floor(Math.random() * colors.length)]; // each burst leans one colour
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2, speed = (1.2 + Math.random() * 4.8) * spread;
        parts.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1,
          c: Math.random() < .6 ? hue : colors[i % colors.length], r: (1.4 + Math.random() * 1.6) * spread });
      }
      if (!raf) raf = requestAnimationFrame(tick);
    }
    function tick() {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = 'lighter';              // overlapping sparks glow brighter
      parts = parts.filter((p) => p.life > 0);
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.vy += .055;              // gravity
        p.vx *= .985; p.vy *= .985; p.life -= .013;          // drag + fade
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x * DPR, p.y * DPR, p.r * DPR, 0, Math.PI * 2); ctx.fill();
      }
      raf = parts.length ? requestAnimationFrame(tick) : 0;
    }
    // a small firework somewhere in the sky every few seconds
    function ambient(every = 6500, scale = 1) {
      if (calm) return;
      setInterval(() => {
        if (!document.hidden) burst(innerWidth * (.12 + Math.random() * .76), 60 + Math.random() * innerHeight * .22, 45, scale);
      }, every);
    }
    return { burst, ambient };
  }

  // ---- diya drawing (defined once, reused with <use href="#diya">) --------------------
  function diyaDefs() {
    const holder = document.createElementNS(NS, 'svg');
    holder.setAttribute('width', 0); holder.setAttribute('height', 0);
    holder.setAttribute('aria-hidden', 'true');
    holder.style.position = 'absolute';
    holder.innerHTML = `
      <defs>
        <radialGradient id="flameFill" cx="50%" cy="72%" r="62%">
          <stop offset="0" stop-color="#fffbe0"/><stop offset=".4" stop-color="#ffd23d"/><stop offset="1" stop-color="#ff5a00"/>
        </radialGradient>
        <radialGradient id="haloFill"><stop offset="0" stop-color="#ffb02e" stop-opacity=".75"/><stop offset="1" stop-color="#ffb02e" stop-opacity="0"/></radialGradient>
        <linearGradient id="clay" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ff8a1f"/><stop offset="1" stop-color="#a83200"/></linearGradient>
        <g id="diya">
          <circle class="halo" cx="20" cy="17" r="16" fill="url(#haloFill)"/>
          <circle class="spark" cx="19" cy="6" r="1" fill="#ffe08a" style="--dx:-3px"/>
          <circle class="spark" cx="21" cy="7" r=".9" fill="#ffe08a" style="--dx:4px"/>
          <path class="flame" d="M20 4 C24.5 11 26 15.5 20 21 C14 15.5 15.5 11 20 4Z" fill="url(#flameFill)"/>
          <path class="core" d="M20 11 C22 14.5 22.3 17 20 19.5 C17.7 17 18 14.5 20 11Z" fill="#fffbe0"/>
          <path d="M3 23 Q20 46 37 23 Z" fill="url(#clay)"/>
          <path d="M3 23 Q20 29.5 37 23" stroke="#ffd45c" stroke-width="1.6" fill="none"/>
          <circle cx="12" cy="30" r="1.4" fill="#ffd45c"/><circle cx="20" cy="32.5" r="1.5" fill="#ff2e7e"/><circle cx="28" cy="30" r="1.4" fill="#ffd45c"/>
        </g>
      </defs>`;
    document.body.prepend(holder);
  }

  // ---- music-themed thumbnails, used when a song has no album art ----------------------
  const ICONS = [
    // vinyl
    '<circle cx="32" cy="32" r="19" fill="#111"/><circle cx="32" cy="32" r="14" fill="none" stroke="#333" stroke-width="1"/><circle cx="32" cy="32" r="10" fill="none" stroke="#333" stroke-width="1"/><circle cx="32" cy="32" r="6" fill="#ffc23d"/><circle cx="32" cy="32" r="1.6" fill="#111"/>',
    // musical notes
    '<path d="M27 44.5a6 6 0 1 1-3.5-5.4V17.5l20-4.5v23.3a6 6 0 1 1-3.5-5.4V20.6l-13 2.9z" fill="#fff"/>',
    // headphones
    '<path d="M17 41v-7a15 15 0 0 1 30 0v7" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/><rect x="13" y="36" width="9" height="14" rx="3.5" fill="#fff"/><rect x="42" y="36" width="9" height="14" rx="3.5" fill="#fff"/>',
    // microphone
    '<rect x="26" y="12" width="12" height="23" rx="6" fill="#fff"/><path d="M20 30a12 12 0 0 0 24 0" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M32 42v8M25 50h14" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>',
    // dhol
    '<rect x="18" y="20" width="28" height="24" fill="#fff" opacity=".25"/><path d="M18 20h28M18 44h28" stroke="#fff" stroke-width="3"/><path d="M21 21l7 22M29 21l7 22M37 21l7 22" stroke="#fff" stroke-width="1.6"/><ellipse cx="18" cy="32" rx="5" ry="12" fill="#fff"/><ellipse cx="46" cy="32" rx="5" ry="12" fill="#fff"/>',
    // speaker
    '<rect x="20" y="11" width="24" height="42" rx="5" fill="#fff"/><circle cx="32" cy="38" r="8.5" fill="#3a1356"/><circle cx="32" cy="38" r="3" fill="#fff"/><circle cx="32" cy="21" r="4" fill="#3a1356"/>',
    // sitar-ish guitar
    '<ellipse cx="25" cy="42" rx="10" ry="10" fill="#fff"/><path d="M30 37 L48 15" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="25" cy="42" r="3" fill="#3a1356"/><path d="M45 13l5 5" stroke="#fff" stroke-width="3" stroke-linecap="round"/>',
  ];
  const TILES = [['#ff8a1f', '#ff2e7e'], ['#7b5cff', '#ff2e7e'], ['#ffc23d', '#ff6a00'], ['#1fb5a5', '#7b5cff'],
                 ['#ff2e7e', '#b98cff'], ['#ff6a00', '#ffc23d'], ['#2fb36a', '#1f7ab5']];
  const seed = Math.floor(Math.random() * ICONS.length); // a different mix each time the page opens
  const artCache = {};
  function art(i) {
    const k = (i + seed) % ICONS.length;
    if (!artCache[k]) {
      const [a, b] = TILES[(k * 3) % TILES.length];
      const svg = `<svg xmlns="${NS}" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>` +
        `<rect width="64" height="64" fill="url(#g)"/>${ICONS[k]}</svg>`;
      artCache[k] = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }
    return artCache[k];
  }
  // Point an <img> at the album art, falling back to a music tile if missing or broken.
  function setArt(img, url, i) {
    img.onerror = () => { img.onerror = null; img.src = art(i); };
    img.src = url || art(i);
  }

  return { calm, toran, rangoli, embers, fireworks, diyaDefs, art, setArt };
})();
