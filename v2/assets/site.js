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
  function wireField() {
    var field = document.querySelector('.field');
    if (!field) return;

    var canvas = document.createElement('canvas');
    canvas.className = 'field__fx';
    canvas.setAttribute('aria-hidden', 'true');
    field.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    var night = field.classList.contains('field--night');

    // Dark body, light eyes and mouth. Composited at low alpha the body
    // darkens the ground and the features lighten it, so the face still
    // reads as a face instead of collapsing into a blob. Colors come from
    // CSS custom properties, so a field variant can re-theme them.
    var css = getComputedStyle(field);
    var bodyColor = (css.getPropertyValue('--face-body') || '#000000').trim();
    var eyeColor  = (css.getPropertyValue('--face-eye')  || '#FFFFFF').trim();

    // To swap in custom art, put data-sprite="/your-image.png" on the .field
    // element. No JS change needed — the aspect ratio is read off the file.
    // Art is treated as pixel art (see pixel below); drop data-sprite-smooth
    // on the element if you ever point this at a smooth, non-pixel image.
    var customSprite = field.getAttribute('data-sprite');
    var pixel = !!customSprite && !field.hasAttribute('data-sprite-smooth');

    var sprite = new Image();
    var ready = false;
    var ratio = 0.8;                                   // the drawn glyph is 100x80
    sprite.onload = function () {
      ready = true;
      if (sprite.naturalWidth) ratio = sprite.naturalHeight / sprite.naturalWidth;
    };
    sprite.onerror = function () { ready = false; };   // a bad path just means no texture
    sprite.src = customSprite || monkeyUri(bodyColor, eyeColor);

    var faces = [];
    var W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var mx = -9999, my = -9999;

    function seed() {
      // density scales with area so phones don't get a crowd
      var count = Math.round(Math.min(46, Math.max(14, (W * H) / 46000)));
      faces = [];
      for (var i = 0; i < count; i++) {
        // 24–48px: big enough for the eyes to resolve, small enough to stay texture
        var s = 24 + Math.random() * 24;
        faces.push({
          x: Math.random() * W,
          y: Math.random() * H,
          s: s,
          rot: pixel ? 0 : (Math.random() - 0.5) * 0.9,
          spin: pixel ? 0 : (Math.random() - 0.5) * 0.0022,
          vx: (Math.random() - 0.5) * 0.16,
          vy: -0.05 - Math.random() * 0.14,        // a slow, general drift upward
          a: (night ? 0.07 : 0.13) + Math.random() * 0.06,
          ox: 0, oy: 0                             // cursor offset, eased
        });
      }
    }

    function size() {
      W = field.clientWidth;
      H = field.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = !pixel;
      seed();
      // Resizing the canvas wipes it. The animation loop repaints anyway, but
      // the reduced-motion path paints only once, so it has to repaint here or
      // the field goes permanently blank after the first resize.
      if (reduced) draw();
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      if (!ready) return;

      for (var i = 0; i < faces.length; i++) {
        var f = faces[i];

        if (!reduced) {
          f.x += f.vx;
          f.y += f.vy;
          f.rot += f.spin;

          // gentle shove away from the cursor, then ease back
          var dx = f.x + f.ox - mx, dy = f.y + f.oy - my;
          var d2 = dx * dx + dy * dy;
          if (d2 < 26000 && d2 > 0.01) {
            var d = Math.sqrt(d2);
            var push = (1 - d / 161) * 26;
            f.ox += ((dx / d) * push - f.ox) * 0.10;
            f.oy += ((dy / d) * push - f.oy) * 0.10;
          } else {
            f.ox += (0 - f.ox) * 0.06;
            f.oy += (0 - f.oy) * 0.06;
          }

          // wrap around the edges
          var m = f.s * 1.6;
          if (f.y < -m) { f.y = H + m; f.x = Math.random() * W; }
          if (f.x < -m) f.x = W + m;
          if (f.x > W + m) f.x = -m;
        }

        var w = f.s, h = f.s * ratio;
        ctx.save();
        ctx.globalAlpha = f.a;
        if (pixel) {
          // whole-pixel size and position, so the art stays crisp instead of
          // shimmering as it drifts across sub-pixel offsets
          w = Math.round(w); h = Math.round(h);
          ctx.drawImage(sprite,
            Math.round(f.x + f.ox - w / 2), Math.round(f.y + f.oy - h / 2), w, h);
        } else {
          ctx.translate(f.x + f.ox, f.y + f.oy);
          ctx.rotate(f.rot);
          ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
        }
        ctx.restore();
      }
    }

    function loop() { draw(); requestAnimationFrame(loop); }

    size();
    window.addEventListener('resize', size);

    if (reduced) {
      sprite.onload = function () {
        ready = true;
        if (sprite.naturalWidth) ratio = sprite.naturalHeight / sprite.naturalWidth;
        draw();
      };
      if (ready) draw();
      return;
    }

    window.addEventListener('mousemove', function (e) { mx = e.clientX; my = e.clientY; }, { passive: true });
    window.addEventListener('mouseout', function () { mx = my = -9999; });
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
    wipe.innerHTML = tauntMarkup(word || TAUNTS[(Math.random() * TAUNTS.length) | 0]);
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

      var go = function () { location.href = a.href; };
      el.addEventListener('animationend', go, { once: true });
      setTimeout(go, 620); // guarantee navigation even if the event misses
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
