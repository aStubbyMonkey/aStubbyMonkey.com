/* ═══════════════════════════════════════════════════════════════
   aStubbyMonkey.com — shared behavior
   Nav state · tag-wipe transitions · popups · cursor · easter eggs
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ── monkey face, reused for confetti + the background ──────
     Wider than it is tall, with the eyes and mouth actually drawn,
     so it reads as a face at small sizes instead of a blob.
     ──────────────────────────────────────────────────────────── */
  var MONKEY_SVG =
    "<svg viewBox='0 0 100 80' xmlns='http://www.w3.org/2000/svg'>" +
      "<g fill='CLR'>" +
        "<ellipse cx='27' cy='29' rx='26' ry='25'/><ellipse cx='73' cy='29' rx='26' ry='25'/>" +
        "<rect x='32' y='33' width='36' height='30' rx='16'/>" +
        "<ellipse cx='36' cy='64' rx='13' ry='11'/><ellipse cx='64' cy='64' rx='13' ry='11'/>" +
      "</g>" +
      "<g fill='EYE'>" +
        "<ellipse cx='27' cy='27' rx='13' ry='10'/><ellipse cx='73' cy='27' rx='13' ry='10'/>" +
        "<ellipse cx='50' cy='56' rx='11' ry='4.5'/>" +
      "</g>" +
    "</svg>";

  // Build a data URI from the glyph. encodeURIComponent handles < > and #;
  // single quotes are legal unencoded inside a double-quoted CSS url().
  function monkeyUri(color, eye) {
    var svg = MONKEY_SVG.replace('CLR', color).replace('EYE', eye || 'rgba(0,0,0,0.45)');
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  /* ═══ BACKGROUND FIELD ══════════════════════════════════════
     Small faces drifting very slowly, easing away from the cursor.
     Deliberately low-contrast and small — this is texture, not art.
     ═════════════════════════════════════════════════════════ */
  /* ═══ WAVE FIELD ═══════════════════════════════════════════
     The background. No sprites, no images — a stack of smooth
     wave bands, each filled with its own vertical gradient, so
     the page reads light at the top and sinks into dark at the
     bottom. Layers overlap and drift slowly against each other,
     which is what gives the silk look: the crests catch a sheen
     while everything under them falls away.

     Colours come from --wave-hi / --wave-lo on the .field, so a
     page themes its own water without touching this code.
     ═════════════════════════════════════════════════════════ */
  function wireField() {
    var field = document.querySelector('.field');
    if (!field) return;

    var canvas = document.createElement('canvas');
    canvas.className = 'field__fx';
    canvas.setAttribute('aria-hidden', 'true');
    field.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    var css = getComputedStyle(field);
    var hi = parseHex((css.getPropertyValue('--wave-hi') || '#B06BE0').trim());
    var lo = parseHex((css.getPropertyValue('--wave-lo') || '#1A0329').trim());

    var W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var t0 = (window.performance || Date).now();
    var tilt = 0, tiltTo = 0;              // eased cursor parallax

    // Few, large, slow. More layers than this stops reading as waves and
    // starts reading as noise.
    var LAYERS = [
      { base: 0.30, a1: 0.085, a2: 0.030, f1: 1.05, f2: 2.30, s1: 0.055, s2: -0.080, p1: 0.0, p2: 1.9, mix: 0.00, par: 0.30 },
      { base: 0.46, a1: 0.070, a2: 0.034, f1: 0.85, f2: 1.95, s1: -0.048, s2: 0.071, p1: 2.1, p2: 0.4, mix: 0.26, par: 0.50 },
      { base: 0.62, a1: 0.075, a2: 0.028, f1: 1.20, f2: 2.60, s1: 0.062, s2: -0.055, p1: 4.0, p2: 3.1, mix: 0.52, par: 0.72 },
      { base: 0.79, a1: 0.065, a2: 0.032, f1: 0.95, f2: 2.15, s1: -0.058, s2: 0.066, p1: 1.2, p2: 5.0, mix: 0.78, par: 1.00 }
    ];

    function parseHex(h) {
      h = String(h).replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function mix(a, b, k) {
      return [Math.round(a[0] + (b[0] - a[0]) * k),
              Math.round(a[1] + (b[1] - a[1]) * k),
              Math.round(a[2] + (b[2] - a[2]) * k)];
    }
    function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

    function size() {
      W = field.clientWidth;
      H = field.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduced) draw((window.performance || Date).now());
    }

    // height of a layer's crest at x, as a fraction of H
    function crest(L, x, t) {
      var u = x / W;
      return L.base
           + Math.sin(u * 6.2832 * L.f1 + t * L.s1 + L.p1) * L.a1
           + Math.sin(u * 6.2832 * L.f2 + t * L.s2 + L.p2) * L.a2;
    }

    function draw(now) {
      var t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      tilt += (tiltTo - tilt) * 0.05;

      for (var i = 0; i < LAYERS.length; i++) {
        var L = LAYERS[i];
        var shift = tilt * 26 * L.par;               // nearer layers move more
        var top = 1e9;

        ctx.beginPath();
        ctx.moveTo(-2, H + 2);
        for (var x = -2; x <= W + 2; x += 6) {
          var y = crest(L, x, t) * H + shift;
          if (y < top) top = y;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W + 2, H + 2);
        ctx.closePath();

        // light where the crest is, falling away to dark below it
        var band = mix(hi, lo, L.mix);
        var deep = mix(hi, lo, Math.min(1, L.mix + 0.42));
        // a light tint of the band's own hue right at the crest, so the wave
        // catches the light before falling away — kept small, since lifting
        // the crest is what eats the contrast the text on top depends on
        var lift = mix(band, [255, 255, 255], 0.15);
        var g = ctx.createLinearGradient(0, top - H * 0.06, 0, top + H * 0.55);
        g.addColorStop(0, rgba(lift, 0.95));
        g.addColorStop(0.30, rgba(band, 0.95));
        g.addColorStop(1, rgba(deep, 0.95));
        ctx.fillStyle = g;
        ctx.fill();

        // the sheen: a soft bright line riding the crest
        ctx.beginPath();
        for (var x2 = -2; x2 <= W + 2; x2 += 6) {
          var y2 = crest(L, x2, t) * H + shift;
          if (x2 < 0) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2);
        }
        // a light tint of the band's own colour, not a wash toward white —
        // pushing this far toward white bleaches the hue out of every crest
        ctx.strokeStyle = rgba(mix(band, [255, 255, 255], 0.30), 0.22);
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
    }

    function loop() {
      draw((window.performance || Date).now());
      requestAnimationFrame(loop);
    }

    size();
    window.addEventListener('resize', size);
    if (reduced) return;

    window.addEventListener('mousemove', function (e) {
      tiltTo = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
    }, { passive: true });

    loop();
  }


  /* ═══ NAV: mark the current page ═══════════════════════════ */
  function markNav() {
    var here = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav__link').forEach(function (a) {
      var target = a.getAttribute('href');
      if (!target) return;
      target = target.split('/').pop().split('#')[0] || 'index.html';
      if (target === here) a.setAttribute('aria-current', 'page');
    });
  }

  /* ═══ TAG WIPE ═════════════════════════════════════════════
     Clicking through to another page slams a purple slab of
     monkey faces across the screen. You got tagged.
     ═════════════════════════════════════════════════════════ */
  var wipe = null;

  var TAUNTS = [
    'TAG!', "YOU'RE IT!", 'GOTCHA!', 'TOO SLOW!', 'TAGGED!', 'CAUGHT YOU!',
    'NO TAG BACKS!', 'GET BACK HERE!', 'MONKE!', 'BONK!', 'ZOOM!',
    'CAN’T CATCH ME!', 'RUN!', 'NICE TRY!', 'BEHIND YOU!', 'SPEED!'
  ];

  function tauntMarkup(word) {
    var cls = word.length > 11 ? ' tag-wipe__word--long'
            : word.length > 7  ? ' tag-wipe__word--mid'
            : '';
    return '<div class="tag-wipe__word' + cls + '">' + word + '</div>';
  }

  // The slab covers the screen on the way out of one page and uncovers on
  // the way into the next — two separate documents. Carry the chosen word
  // across in sessionStorage so it doesn't change halfway through.
  function buildWipe(word) {
    if (wipe || reduced) return null;
    wipe = document.createElement('div');
    wipe.className = 'tag-wipe';
    wipe.setAttribute('aria-hidden', 'true');
    wipe.innerHTML =
      '<span class="tag-wipe__crest tag-wipe__crest--4"></span>' +
      '<span class="tag-wipe__crest tag-wipe__crest--3"></span>' +
      '<span class="tag-wipe__crest tag-wipe__crest--2"></span>' +
      '<span class="tag-wipe__crest tag-wipe__crest--1"></span>' +
      tauntMarkup(word || TAUNTS[(Math.random() * TAUNTS.length) | 0]);
    document.body.appendChild(wipe);
    return wipe;
  }

  function isInternal(a) {
    if (!a) return false;
    if (a.target && a.target !== '_self') return false;
    if (a.hasAttribute('download')) return false;
    var href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#') return false;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) return false;
    return a.hostname === location.hostname;
  }

  function wireWipe() {
    if (reduced) return;

    // Leaving: cover the screen, then navigate.
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

      var a = e.target.closest('a');
      if (!isInternal(a)) return;
      if (a.pathname === location.pathname) return; // same page

      e.preventDefault();

      var word = TAUNTS[(Math.random() * TAUNTS.length) | 0];
      var el = buildWipe(word);
      if (!el) { location.href = a.href; return; }

      el.classList.remove('is-out');
      el.classList.add('is-in');
      sessionStorage.setItem('sm-wiped', '1');
      try { sessionStorage.setItem('sm-taunt', word); } catch (e2) {}

      // Hold once the screen is covered, so the line is actually readable
      // instead of flashing past on the way to the next page.
      var HOLD = 520;
      var went = false;
      var go = function () { if (went) return; went = true; location.href = a.href; };
      el.addEventListener('animationend', function () { setTimeout(go, HOLD); }, { once: true });
      setTimeout(go, 780 + HOLD + 320);  // guarantee it even if the event misses
    });

    // Arriving: if we came through a wipe, reveal from under it.
    if (sessionStorage.getItem('sm-wiped') === '1') {
      sessionStorage.removeItem('sm-wiped');
      var carried = sessionStorage.getItem('sm-taunt');
      sessionStorage.removeItem('sm-taunt');
      var el = buildWipe(carried);
      if (el) {
        el.style.transform = 'translate3d(0,0,0)';
        requestAnimationFrame(function () {
          el.classList.add('is-out');
          el.addEventListener('animationend', function () { el.remove(); wipe = null; }, { once: true });
        });
      }
    }
  }

  // Back/forward out of bfcache must never restore a stuck wipe.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted && wipe) { wipe.remove(); wipe = null; }
  });

  /* ═══ POPUPS ═══════════════════════════════════════════════ */
  var layer = null;
  var lastFocus = null;

  function ensureLayer() {
    if (layer) return layer;
    layer = document.createElement('div');
    layer.className = 'pop-layer';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    document.body.appendChild(layer);

    layer.addEventListener('click', function (e) {
      if (e.target === layer) closePop();
    });
    return layer;
  }

  function openPop(opts) {
    var l = ensureLayer();
    lastFocus = document.activeElement;

    var alt = opts.alt
      ? '<a class="pop-box__alt" href="' + opts.alt.href + '" target="_blank" rel="noopener">' +
          (opts.alt.icon || '') + opts.alt.label + '</a>'
      : '';

    l.innerHTML =
      '<div class="pop-box">' +
        '<button class="pop-box__x" aria-label="Close">×</button>' +
        (opts.glyph ? '<div class="pop-box__glyph">' + opts.glyph + '</div>' : '') +
        '<h2 class="pop-box__title">' + opts.title + '</h2>' +
        '<p class="pop-box__text">' + opts.text + '</p>' +
        '<div class="pop-box__actions">' +
          '<button class="btn pop-box__ok">' + (opts.ok || 'Got it') + '</button>' +
          alt +
        '</div>' +
      '</div>';

    l.querySelector('.pop-box__x').addEventListener('click', closePop);
    l.querySelector('.pop-box__ok').addEventListener('click', closePop);

    requestAnimationFrame(function () { l.classList.add('is-open'); });
    setTimeout(function () {
      var ok = l.querySelector('.pop-box__ok');
      if (ok) ok.focus();
    }, 60);
  }

  function closePop() {
    if (!layer) return;
    layer.classList.remove('is-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePop();
  });

  /* My own Discord server isn't built yet. Rather than hide the button
     or point it somewhere else, it tells the truth — and gets funnier
     the more you refuse to believe it. */
  var DISCORD_ICON =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.3.5a18.3 18.3 0 0 1 4.3 1.3 15.6 15.6 0 0 0-15 0A18.3 18.3 0 0 1 8.9 3.5L8.6 3a19.8 19.8 0 0 0-4.9 1.4C.6 9 .1 13.5.4 17.9A19.9 19.9 0 0 0 6.4 21l.6-.8a13 13 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 13 0l.5.4a13 13 0 0 1-2 1l.6.8a19.9 19.9 0 0 0 6-3.1c.4-5.1-.6-9.5-3.3-13.5ZM8.1 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm7.8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"/></svg>';

  var GTCH_ALT = {
    href: 'https://discord.gg/StQGJEyHEC',
    label: 'Join GTCH instead',
    icon: DISCORD_ICON
  };

  var nags = 0;
  var NAG_LINES = [
    {
      glyph: '🚧',
      title: 'Not open yet',
      text: "This is my own server, and I haven't built it yet. When it's ready this button will actually take you somewhere. Until then, GTCH is where I actually am.",
      ok: 'Fair enough'
    },
    {
      glyph: '🙃',
      title: 'Still not open',
      text: "Clicking it twice didn't finish setting it up. I checked.",
      ok: 'Worth a shot'
    },
    {
      glyph: '💀',
      title: 'It is NOT ready',
      text: "Three times. Three. The server has not spontaneously created itself in the last six seconds.",
      ok: 'Fine 💀'
    },
    {
      glyph: '🍌',
      title: 'Okay, respect',
      text: "You've clicked this NAG times now. That's genuinely more effort than I've put into making the server. I'll get on it.",
      ok: 'Get on it then'
    }
  ];

  window.showDiscordPopup = function () {
    nags++;
    var line = NAG_LINES[Math.min(nags - 1, NAG_LINES.length - 1)];
    openPop({
      glyph: line.glyph,
      title: line.title,
      text: line.text.replace('NAG', nags),
      ok: line.ok,
      alt: GTCH_ALT
    });
  };

  window.smPopup = openPop;

  /* ═══ CURSOR ═══════════════════════════════════════════════ */
  function wireCursor() {
    if (!finePointer || reduced) return;

    var dot = document.createElement('div');
    var ring = document.createElement('div');
    dot.className = 'cur-dot';
    ring.className = 'cur-ring';
    dot.setAttribute('aria-hidden', 'true');
    ring.setAttribute('aria-hidden', 'true');
    document.body.appendChild(dot);
    document.body.appendChild(ring);

    var mx = -100, my = -100, rx = -100, ry = -100, running = true;

    document.addEventListener('mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = 'translate(' + mx + 'px,' + my + 'px) translate(-50%,-50%)';
    }, { passive: true });

    (function loop() {
      if (!running) return;
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px) translate(-50%,-50%)';
      requestAnimationFrame(loop);
    })();

    // Delegated, so it also covers cards injected later by the APIs.
    document.addEventListener('mouseover', function (e) {
      if (e.target.closest('a, button, .sticker, .tile')) ring.classList.add('is-hot');
    });
    document.addEventListener('mouseout', function (e) {
      if (e.target.closest('a, button, .sticker, .tile')) ring.classList.remove('is-hot');
    });
  }

  /* ═══ CONFETTI (monkey faces, not squares) ═════════════════ */
  var CONFETTI_COLORS = ['#FFC93C', '#7700B1', '#3BE07A', '#DCE6E7', '#FF4D9D', '#FFFFFF'];

  function confetti(count) {
    if (reduced) return;
    count = count || 90;

    for (var i = 0; i < count; i++) {
      setTimeout(function () {
        var p = document.createElement('div');
        var w = Math.round(Math.random() * 20 + 14);
        var color = CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0];

        p.style.cssText =
          'position:fixed;z-index:940;pointer-events:none;' +
          'left:' + (Math.random() * 100).toFixed(1) + 'vw;top:-40px;' +
          'width:' + w + 'px;height:' + Math.round(w * 1.22) + 'px;' +
          'background:url("' + monkeyUri(color) + '") no-repeat center/contain;' +
          'animation:tumble ' + (Math.random() * 1.8 + 1.6).toFixed(2) + 's linear forwards;';

        document.body.appendChild(p);
        setTimeout(function () { p.remove(); }, 4400);
      }, i * 14);
    }
  }

  // Confetti keyframes are injected here so the stylesheet stays declarative.
  var kf = document.createElement('style');
  kf.textContent =
    '@keyframes tumble{' +
    '0%{opacity:1;transform:translateY(0) rotate(0deg);}' +
    '100%{opacity:.1;transform:translateY(112vh) rotate(720deg);}}';
  document.head.appendChild(kf);

  window.smConfetti = confetti;

  function chirp() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      [[523, 0], [659, .09], [784, .18], [1047, .27], [1319, .36]].forEach(function (pair) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'triangle';
        o.frequency.value = pair[0];
        var t = ctx.currentTime + pair[1];
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.22, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
        o.start(t); o.stop(t + 0.4);
      });
    } catch (e) { /* audio is a bonus, never a requirement */ }
  }
  window.smChirp = chirp;

  /* ═══ EASTER EGGS ══════════════════════════════════════════ */
  function wireEggs() {
    // 1 — poke the avatar ten times in ten seconds
    var av = document.querySelector('[data-egg="avatar"]');
    if (av) {
      var taps = [];
      av.addEventListener('click', function () {
        var now = Date.now();
        taps.push(now);
        taps = taps.filter(function (t) { return now - t < 10000; });
        if (taps.length >= 10) {
          taps = [];
          confetti(120);
          chirp();
          av.style.animation = 'none';
          requestAnimationFrame(function () { av.style.animation = 'spin360 .45s linear 3'; });
        }
      });
      var spinKf = document.createElement('style');
      spinKf.textContent = '@keyframes spin360{to{transform:rotate(360deg);}}';
      document.head.appendChild(spinKf);
    }

    // 2 — type the name
    var buf = '';
    var SECRET = 'astubbymonkey';
    document.addEventListener('keydown', function (e) {
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!/^[a-z]$/i.test(e.key)) return;
      buf += e.key.toLowerCase();
      if (buf.length > SECRET.length) buf = buf.slice(-SECRET.length);
      if (buf === SECRET) {
        buf = '';
        confetti(60);
        openPop({
          glyph: '✨',
          title: 'You found it',
          text: "You went looking, and you found it. Worth trying that with God too — <em>“I love those who love me, and those who seek me diligently find me.”</em> Proverbs 8:17",
          ok: 'Close'
        });
      }
    });
  }

  /* ═══ BOOT ═════════════════════════════════════════════════ */
  function boot() {
    markNav();
    wireField();
    wireWipe();
    wireCursor();
    wireEggs();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
