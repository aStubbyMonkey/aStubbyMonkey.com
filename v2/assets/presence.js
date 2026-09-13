/* ═══════════════════════════════════════════════════════════════
   PRESENCE — how many people are on the site right now

   The hard part of presence is not counting up, it is noticing
   that somebody left. A browser gets no reliable chance to say
   goodbye: closing a tab, shutting a laptop and walking out of
   wifi range all skip whatever cleanup the page had planned.

   So the leaving is handed to the server instead. onDisconnect()
   registers an instruction up front and the server runs it the
   moment the socket drops, however it drops. That is why this is
   a Realtime Database node and not a counter we increment — a
   counter would only ever climb.

   site.js loads this lazily, after the page has settled. It pulls
   the Firebase SDK, which is far too much weight to put in front
   of a paint for a number in the footer.
   ═══════════════════════════════════════════════════════════════ */
import { initializeApp, getApp, getApps }
  from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import { getDatabase, ref, push, set, remove, onValue, onDisconnect, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-database.js';

const CONFIG = {
  apiKey: 'AIzaSyBe1Ex5z_tDW4JuLZaHs-65_kMM0jfFjX8',
  authDomain: 'astubbymonkey-status.firebaseapp.com',
  projectId: 'astubbymonkey-status',
  storageBucket: 'astubbymonkey-status.firebasestorage.app',
  messagingSenderId: '410093699659',
  appId: '1:410093699659:web:bc3a00c3f70b3f8b0c43ce',
  databaseURL: 'https://astubbymonkey-status-default-rtdb.firebaseio.com'
};

const STALE = 6 * 60 * 1000;    // not counted after this long without a check-in
const BEAT  = 60 * 1000;        // how often we re-stamp ourselves
const SWEEP = 30 * 60 * 1000;   // and when a leftover gets cleared out
const MAX_SWEEP = 5;            // per pass, so a pile-up is not a write storm

const slots = document.querySelectorAll('[data-here]');
if (slots.length) start();

function start() {
  // status.html and about.html already initialise this app in their own
  // modules; a second initializeApp with the same name would throw.
  const app = getApps().length ? getApp() : initializeApp(CONFIG);
  const db = getDatabase(app);

  /* Timestamps are written by the server but compared here, so correct
     for the gap between the two clocks rather than trusting Date.now().
     A viewer whose machine is an hour fast would otherwise sweep the
     whole room. */
  let skew = 0;
  onValue(ref(db, '.info/serverTimeOffset'), (s) => { skew = s.val() || 0; }, noop);
  const serverNow = () => Date.now() + skew;

  const me = push(ref(db, 'presence'));

  /* Re-arm on every connect. The server consumes the instruction when it
     fires, so a dropped-and-restored connection without this would leave
     a ghost in the room permanently. */
  onValue(ref(db, '.info/connected'), (snap) => {
    if (snap.val() !== true) return;
    onDisconnect(me).remove()
      .then(() => set(me, serverTimestamp()))
      .catch(noop);
  }, noop);

  setInterval(() => { set(me, serverTimestamp()).catch(noop); }, BEAT);

  onValue(ref(db, 'presence'), (snap) => {
    const t = serverNow();
    let n = 0;
    const dead = [];

    snap.forEach((child) => {
      const v = child.val();
      if (typeof v !== 'number') { dead.push(child.key); return; }
      const age = t - v;
      if (age < STALE) n++;
      else if (age > SWEEP) dead.push(child.key);
    });

    render(n);

    // onDisconnect is reliable, but a server-side hiccup can still strand a
    // node. Anyone in the room tidies those; deleting an already-deleted
    // node succeeds, so the clients racing each other is harmless.
    dead.slice(0, MAX_SWEEP).forEach((k) => remove(ref(db, 'presence/' + k)).catch(noop));
  }, noop);
}

function render(n) {
  // Our own node may not have landed yet, and the room is never empty
  // while somebody is reading this.
  const text = n <= 1 ? 'Just you here right now' : n + ' people here right now';
  slots.forEach((el) => {
    el.textContent = text;
    el.hidden = false;
  });
}

/* Every read and write is silently optional. If the database rules have
   not been opened for /presence, or the SDK is blocked, the footer simply
   never shows the line — which is the right way for an ambient number to
   fail. */
function noop() {}
