/* ═══════════════════════════════════════════════════════════════
   aStubbyMonkey.com — shared behavior
   Nav state · tag-wipe transitions · popups · cursor · easter eggs
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ── monkey glyph, reused for confetti + flourishes ───────── */
  var MONKEY_SVG =
    "<svg viewBox='0 0 90 110' xmlns='http://www.w3.org/2000/svg'>" +
    "<g fill='CLR'>" +
    "<ellipse cx='25' cy='29' rx='24' ry='22'/><ellipse cx='65' cy='29' rx='24' ry='22'/>" +
    "<rect x='27' y='27' width='36' height='64' rx='18'/>" +
    "<ellipse cx='33' cy='93' rx='13' ry='11'/><ellipse cx='57' cy='93' rx='13' ry='11'/>" +
    "</g></svg>";

  // Build a data URI from the glyph. encodeURIComponent handles < > and #;
  // single quotes are legal unencoded inside a double-quoted CSS url().
  function monkeyUri(color) {
    return 'data:image/svg+xml,' + encodeURIComponent(MONKEY_SVG.replace('CLR', color));
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

  function buildWipe() {
    if (wipe || reduced) return null;
    wipe = document.createElement('div');
    wipe.className = 'tag-wipe';
    wipe.setAttribute('aria-hidden', 'true');
    wipe.innerHTML = '<div class="tag-wipe__word">TAG!</div>';
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
      var el = buildWipe();
      if (!el) { location.href = a.href; return; }

      el.classList.remove('is-out');
      el.classList.add('is-in');
      sessionStorage.setItem('sm-wiped', '1');

      var go = function () { location.href = a.href; };
      el.addEventListener('animationend', go, { once: true });
      setTimeout(go, 620); // guarantee navigation even if the event misses
    });

    // Arriving: if we came through a wipe, reveal from under it.
    if (sessionStorage.getItem('sm-wiped') === '1') {
      sessionStorage.removeItem('sm-wiped');
      var el = buildWipe();
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

    l.innerHTML =
      '<div class="pop-box">' +
        '<button class="pop-box__x" aria-label="Close">×</button>' +
        (opts.glyph ? '<div class="pop-box__glyph">' + opts.glyph + '</div>' : '') +
        '<h2 class="pop-box__title">' + opts.title + '</h2>' +
        '<p class="pop-box__text">' + opts.text + '</p>' +
        '<button class="btn pop-box__ok">' + (opts.ok || 'Got it') + '</button>' +
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

  // The personal Discord isn't open yet — this is the honest answer.
  var discordNags = 0;
  window.showDiscordPopup = function () {
    discordNags++;
    if (discordNags >= 3) {
      openPop({
        glyph: '💀',
        title: "It's still not ready",
        text: "That's " + discordNags + " clicks. It has not become ready in the last four seconds. Try the GTCH Discord — that one's actually open.",
        ok: 'Fine 💀'
      });
      return;
    }
    openPop({
      glyph: '🚧',
      title: 'Not open yet',
      text: "My personal Discord server isn't set up. The GTCH server is open though, and that's where everything happens anyway.",
      ok: 'Got it'
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
