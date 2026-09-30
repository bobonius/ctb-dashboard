// Everything that touches the DOM. All league arithmetic comes from
// lib/league.mjs, so no number on the page is computed twice.

// the stamp index.html put on this module rides along to the ones it imports
const L = await import(`./league.mjs${new URL(import.meta.url).search}`);
const { fixturesCalendar } = await import(`./ics.mjs${new URL(import.meta.url).search}`);

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// The viewer's own calendar date. toISOString() would give the UTC date, which
// in the Netherlands is still yesterday until 01:00 or 02:00 — long enough for
// the hero to call a match "Tomorrow" on the morning it is played.
const pad = (n) => String(n).padStart(2, '0');
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const asDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = (s) => asDate(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const shortDate = (s) => asDate(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const shortField = (f) => String(f ?? '').replace('Hockey Field', 'Hockey').replace('Football Field', 'Football');
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

const who = (id) => state.squad.find((p) => p.id === id) || {};
const playerName = (id) => who(id).name || id;
// A photo is a file in data/faces/ unless it already looks like a path or URL.
const face = (id, cls = 'face') => {
  const src = who(id).photo;
  if (!src) return `<svg class="${cls}" viewBox="0 0 48 48" aria-hidden="true"><use href="#i-face"/></svg>`;
  const url = /^(https?:|\/|data:)/.test(src) || src.includes('/') ? src : `data/faces/${src}`;
  return `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy">`;
};

// A face in a round frame. The frame is what makes a silhouette and a photo
// sit at the same size, so a half-photographed squad still lines up.
const mug = (id, cls = 'fc') => `<span class="${cls}">${face(id, '')}</span>`;

const state = { meta: null, fixtures: [], squad: [], appearances: [], formations: new Map(),
  motm: new Map(), rowIds: [], phaseView: null, design: pickDesign(), leaderTab: 'goals' };

// Two designs of the same page, one switch. "new" is the default; "classic" is
// the page as it was. The choice is remembered per browser, and ?design=classic
// in the address forces one, so a link can show someone a particular version.
function pickDesign() {
  const q = new URLSearchParams(location.search).get('design');
  if (q === 'classic' || q === 'new') return q;
  try { return localStorage.getItem('ctb-design') === 'classic' ? 'classic' : 'new'; } catch (e) { return 'new'; }
}
function setDesign(d) {
  state.design = d;
  try { localStorage.setItem('ctb-design', d); } catch (e) { /* private window: this visit only */ }
  render();
}

/* ---------- loading ---------- */

async function text(path) {
  // no-store, or the Pages CDN serves a stale table for minutes after a commit
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.text();
}

const SYMBOLS = `<svg width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute">
  <defs>
    <!-- simplified at 20px: a real pentagon net turns to mush -->
    <symbol id="i-ball" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10.5" fill="currentColor"/>
      <path fill="#0b0c10" d="M12 6.3l3.6 2.6-1.4 4.3h-4.4L8.4 8.9 12 6.3z"/>
      <path fill="#0b0c10" d="M12 1.9c.9 0 1.7.1 2.5.3l-2.5 1.9-2.5-1.9c.8-.2 1.6-.3 2.5-.3z"/>
      <path fill="#0b0c10" d="M3.2 16.6c-.4-.8-.7-1.7-.8-2.6l2.9.6 1 3-3.1-1z"/>
      <path fill="#0b0c10" d="M20.8 16.6l-3.1 1 1-3 2.9-.6c-.1.9-.4 1.8-.8 2.6z"/>
      <path fill="#0b0c10" d="M8.9 21.4l1.2-2.7h3.8l1.2 2.7c-1 .3-2 .4-3.1.4s-2.1-.1-3.1-.4z"/>
    </symbol>
    <symbol id="i-boot" viewBox="0 0 24 24">
      <path fill="currentColor" d="M2.4 16.2c0-1.7 1.2-3.1 2.9-3.5l6.1-1.4c1-.2 1.8-.9 2.2-1.9l1-2.6c.3-.8 1.2-1.2 2-1l1.9.6c.8.3 1.3 1.1 1.2 1.9l-1 8.2c-.1.9-.9 1.6-1.8 1.6H3.3c-.5 0-.9-.4-.9-.9v-1z"/>
      <path fill="currentColor" d="M2.6 19.4h16.6v1.2a.8.8 0 0 1-.8.8h-.6v1.1a.5.5 0 0 1-.5.5h-1.1a.5.5 0 0 1-.5-.5v-1.1h-3.3v1.1a.5.5 0 0 1-.5.5h-1.1a.5.5 0 0 1-.5-.5v-1.1H7v1.1a.5.5 0 0 1-.5.5H5.4a.5.5 0 0 1-.5-.5v-1.1h-.6a.8.8 0 0 1-.8-.8z"/>
    </symbol>
    <symbol id="i-crown" viewBox="0 0 24 15">
      <path fill="currentColor" stroke="#0b0c10" stroke-width="1.6" stroke-linejoin="round"
        d="M2.2 13.2V3.4l5 3.9L12 1.3l4.8 6 5-3.9v9.8z"/>
    </symbol>
    <symbol id="i-sheet" viewBox="0 0 24 24">
      <path fill="currentColor" d="M12 2.2 4.3 5.3v6.1c0 4.8 3.3 8.8 7.7 10.4 4.4-1.6 7.7-5.6 7.7-10.4V5.3z"/>
      <ellipse cx="12" cy="11.6" rx="2.9" ry="3.9" fill="none" stroke="#0b0c10" stroke-width="2"/>
    </symbol>
    <symbol id="i-glove" viewBox="0 0 24 24">
      <path fill="currentColor" d="M7.2 14.6 4.4 11a1.7 1.7 0 0 1 2.6-2.2L8.4 10V4.6a1.4 1.4 0 0 1 2.8 0V9.5V3.4a1.4 1.4 0 0 1 2.8 0v6.1V4.3a1.4 1.4 0 0 1 2.8 0v5.8V6.4a1.4 1.4 0 0 1 2.8 0v8.3a6.3 6.3 0 0 1-3.2 5.5H9.6a5.2 5.2 0 0 1-2.4-5.6z"/>
      <rect x="8.6" y="20.4" width="8.8" height="2.6" rx="1" fill="currentColor"/>
    </symbol>
    <symbol id="i-cal" viewBox="0 0 24 24">
      <path fill="currentColor" d="M7 2.5h2v2h6v-2h2v2h2.2c1 0 1.8.8 1.8 1.8v13.4c0 1-.8 1.8-1.8 1.8H4.8c-1 0-1.8-.8-1.8-1.8V6.3c0-1 .8-1.8 1.8-1.8H7zM5 9.5v10h14v-10z"/>
      <path fill="currentColor" d="M11 11.5h2v3h3v2h-3v3h-2v-3H8v-2h3z"/>
    </symbol>
    <symbol id="i-face" viewBox="0 0 48 48">
      <rect width="48" height="48" fill="#2b3444"/>
      <circle cx="24" cy="18.5" r="8.4" fill="#5b6a83"/>
      <path fill="#5b6a83" d="M7.5 47c0-8.4 7.4-13.8 16.5-13.8S40.5 38.6 40.5 47z"/>
    </symbol>
  </defs>
</svg>`;

export async function boot() {
  document.body.insertAdjacentHTML('afterbegin', SYMBOLS);
  try {
    const [meta, fx, sq, ap] = await Promise.all([
      text('data/meta.json'), text('data/fixtures.csv'),
      text('data/squad.csv'), text('data/appearances.csv'),
    ]);
    state.meta = JSON.parse(meta);
    state.fixtures = L.readFixtures(fx);
    state.squad = L.readSquad(sq);
    state.appearances = L.readAppearances(ap);
    state.formations = L.readFormations(ap);
    state.motm = L.readMotm(ap);
    state.rowIds = L.appearanceRowIds(ap);
    render();
  } catch (err) {
    $('#app').innerHTML = `<div class="wrap"><div class="empty" style="margin-top:40px">
      <b>Could not load the season data</b>${esc(err.message)}<br><br>
      If you opened this file straight off disk, that is the cause: the browser blocks
      module imports and data fetches over file://. Serve the folder instead
      (VS Code, right click index.html, Open with Live Server).</div></div>`;
  }
}

/* ---------- dashboard ---------- */

// Our season as a crawl: every Club Tower Brugge match in date order, played
// ones carrying their score, the next one picked out, the rest still to come.
// It is decoration, so it is hidden from screen readers, and the list is
// printed twice because a seamless loop needs a second copy to scroll into.
function ticker() {
  const me = state.meta.team;
  const ours = state.fixtures
    .filter((f) => f.home === me || f.away === me)
    .sort((a, b) => (L.whenPlayed(a) < L.whenPlayed(b) ? -1 : 1));
  if (!ours.length) return '';
  const next = L.nextFixture(state.fixtures, me, todayIso());

  const bits = ours.map((f) => {
    const home = f.home === me;
    const opp = home ? f.away : f.home;
    const when = shortDate(L.whenPlayed(f));
    if (L.isPlayed(f)) {
      const us = home ? f.hs : f.as;
      const them = home ? f.as : f.hs;
      const r = us > them ? 'w' : us < them ? 'l' : 'd';
      return `<span class="it pl"><i>${esc(when)}</i>${esc(opp)}
        <b class="${r}">${us}–${them}</b></span>`;
    }
    if (next && f.id === next.id) {
      return `<span class="it nx"><i>Next</i>${esc(opp)} · ${esc(when)} ${esc(f.time)}</span>`;
    }
    return `<span class="it up"><i>${esc(when)}</i>${esc(opp)}</span>`;
  });

  const run = bits.join('');
  return `<div class="ticker" aria-hidden="true"><div class="tk">${run}${run}</div></div>`;
}

function mast() {
  const { meta } = state;
  const opt = (d, label) => `<button type="button" data-design="${d}" aria-pressed="${state.design === d}">${label}</button>`;
  return `<header class="mast">
      <div class="crest" aria-hidden="true"></div>
      <div><h1>${esc(meta.team)}</h1>
        <div class="sub">${esc(meta.league)} · ${esc(meta.season)} · ${esc(meta.venue)}</div></div>
      <div class="dswitch" role="group" aria-label="Page design">${opt('classic', 'Classic')}${opt('new', 'New')}</div>
    </header>`;
}

function render() {
  if (state.design === 'new') return renderNew();
  const { meta } = state;
  const next = L.nextFixture(state.fixtures, meta.team, todayIso());

  $('#app').innerHTML = `<div class="wrap">
    ${mast()}
    ${ticker()}
    ${hero(next)}
    <div class="grid">
      <section><h2>${hIcon('i-ball')}Goals</h2><p class="hint">Season total, built up match by match</p>${board('goals')}</section>
      <section><h2>${hIcon('i-boot')}Assists</h2><p class="hint">Season total, built up match by match</p>${board('assists')}</section>
      <section><h2>${hIcon('i-sheet')}Clean sheets</h2><p class="hint">Keeper and defenders, every match we kept it
        at nil</p>${board('cleanSheets')}</section>
      <section><h2>${hIcon('i-glove')}Penalties saved</h2><p class="hint">Season total, built up match by match</p>${board('pensSaved')}</section>
      <section class="full"><h2>Attendance</h2>${attendance()}</section>
      <section class="full"><h2>League table</h2>${tables()}</section>
      <section class="full"><h2>Position</h2>
        <p class="hint">Every team, every matchday with a result. A week counts as soon as one score
          is in; teams still waiting on a result that week are dimmed.</p>
        ${chart()}</section>
      <section class="full"><h2>Our season</h2>${season()}
        <div class="calwrap calrow">${calButtons()}
          <p class="hint">Every match, with pitch and kick-off, kept in sync: a moved match or a new score
            shows up in your calendar by itself — Google checks roughly once or twice a day. Easiest to set up
            on a computer. Or <button class="linkish" type="button" data-cal>download a one-off copy</button>.</p>
        </div></section>
      <section class="full"><h2>The squad</h2>${wall()}</section>
    </div>
    <div class="foot">
      <span>Typed by hand after every match</span>
      <a href="${esc(meta.sourceUrl)}" target="_blank" rel="noopener">Official schedule on Playpass</a>
    </div></div>`;
}

// The subscription feed is calendar.ics next to the page, rebuilt on every push
// by the Pages workflow, so a subscribed calendar follows fixtures.csv by itself.
// Google cannot be handed a feed by link reliably — its webcal:// route fetches
// over plain http and comes back empty — so the button copies the https address
// and opens Google's own "From URL" page, where it is pasted once.
const feedUrl = () => new URL('calendar.ics', location.href).href;
const GOOGLE_ADD = 'https://calendar.google.com/calendar/u/0/r/settings/addbyurl';
const calIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-cal"/></svg>';
const calButtons = () => `<span class="calbtns">
  <button class="cal" type="button" data-gcal>${calIcon}Sync to Google Calendar</button>
  <a class="cal alt" href="${esc(feedUrl().replace(/^https?:/, 'webcal:'))}">Apple / Outlook</a>
</span><p class="calnote" hidden></p>`;

async function syncGoogle(btn) {
  const url = feedUrl();
  let copied = false;
  try { await navigator.clipboard.writeText(url); copied = true; } catch (e) { /* shown below instead */ }
  window.open(GOOGLE_ADD, '_blank', 'noopener');
  const note = btn.closest('.calwrap')?.querySelector('.calnote');
  if (note) {
    note.hidden = false;
    note.innerHTML = `${copied ? '<b>Link copied.</b> In' : 'Copy this link, then in'} the Google tab, paste it into
      <i>URL of calendar</i> and press <i>Add calendar</i>. It syncs to your phone from there.
      <input class="calurl" readonly value="${esc(url)}" aria-label="Calendar link">`;
    note.querySelector('.calurl').addEventListener('focus', (e) => e.target.select());
  }
}

// The file is made on the spot from what is loaded, handed to the browser as a
// download, and the phone takes it from there: iOS offers "Add all", Android
// opens it in the calendar app.
function downloadCalendar() {
  const ics = fixturesCalendar(state.fixtures, state.meta, L);
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'),
    { href: url, download: `${state.meta.team.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function hero(f) {
  if (!f) return `<div class="hero"><div class="kick">Next up</div><h2 class="opp">Season complete</h2></div>`;
  const me = state.meta.team;
  const home = f.home === me;
  const opp = home ? f.away : f.home;
  const days = Math.round((asDate(f.scheduled) - asDate(todayIso())) / 864e5);
  const when = days < 0 ? 'Overdue' : days === 0 ? 'Tonight' : days === 1 ? 'Tomorrow' : `in ${days} days`;

  // Their record in whichever competition this match belongs to — in phase 2
  // that is their group, not the single round everyone has left behind.
  const phase = L.phaseOf(f);
  const scope = L.inPhase(state.fixtures, phase, f.group || null);
  const t = L.buildTable(scope, null, phase === 2 ? L.phase1Seeds(state.fixtures) : null);
  const r = L.rowFor(t, opp);
  const where = phase === 2 && f.group ? ` in the ${esc(L.groupLabel(f.group))}` : '';
  const bit = r && r.p
    ? `${esc(opp)} sit ${ordinal(r.pos)}${where} on ${r.pts} point${r.pts === 1 ? '' : 's'}${r.form.length ? ', form ' + form(r.form) : ''}`
    : '';

  // Which column you are listed in means nothing on a neutral pitch. Having
  // played them already does.
  const seen = L.teamMatches(state.fixtures, me).filter((m) => m.opp === opp);
  const nth = ['First', 'Second', 'Third', 'Fourth', 'Fifth'][seen.length] || `${seen.length + 1}th`;
  const last = seen[0];
  const again = last
    ? `${nth} meeting — ${last.r === 'W' ? 'won' : last.r === 'L' ? 'lost' : 'drew'}
       ${last.gf}–${last.ga} on ${esc(shortDate(last.date))}`
    : '';

  const xi = lineup(f);
  return `<div class="hero${xi ? ' has-xi' : ''}">
    <div class="hcol">
    <div class="kick">Next up</div><h2 class="opp">${esc(opp)}</h2>
    <div class="meta">
      <span><b>${esc(fmtDate(f.scheduled))}</b></span>
      <span><b>${esc(f.time)}</b> <span class="dim">kick-off</span></span>
      <span><b>${esc(shortField(f.field))}</b></span>
      ${again ? `<span class="dim">${again}</span>` : ''}
    </div>
    <div class="count"><strong>${esc(when)}</strong><span>${esc(state.meta.venue)}</span></div>
    <div class="calwrap">${calButtons()}</div>
    ${bit ? `<div class="meta" style="margin-top:16px"><span class="dim">${bit}</span></div>` : ''}
    ${state.meta.note ? `<div class="note">${esc(state.meta.note)}</div>` : ''}
    </div>${xi}
  </div>`;
}

const form = (f) => `<span class="form">${f.slice(-5).map((r) => `<i class="${r}">${r}</i>`).join('')}</span>`;

// The same icon a board's stat wears everywhere else on the page, so the
// heading and the dots in the attendance grid read as one thing.
const hIcon = (id) => `<svg class="hi" viewBox="0 0 24 24" aria-hidden="true"><use href="#${id}"/></svg>`;

const BOARD_WORDS = { goals: 'goals', assists: 'assists', cleanSheets: 'clean sheets', pensSaved: 'penalty saves' };

function board(key) {
  const list = L.leaderboard(state.squad, state.appearances, key);
  if (!list.length) return `<div class="empty"><b>Nothing on the board</b>No ${BOARD_WORDS[key]} logged yet this season.</div>`;
  const max = list[0][key];
  return `<ol class="lb">${list.map((r, i) => `
    <li${i === 0 ? ' class="lead"' : ''}>
      <span class="rk">${i + 1}</span>
      ${mug(r.id)}
      <span class="nm">${esc(r.name)}<span class="sec">${r.apps} app${r.apps === 1 ? '' : 's'}</span></span>
      <span class="val">${r[key]}</span>
      <span class="bar" style="width:${Math.round((r[key] / max) * 100)}%"></span>
    </li>`).join('')}</ol>`;
}

// The starting eleven for the next match, on a pitch with our goal at the
// bottom. Subs sit in a strip underneath, because before kick-off there is no
// squad list to infer them from.
function lineup(f, label = 'Line-up') {
  if (!f) return '';
  const spots = state.formations.get(f.id);
  if (!spots) return '';

  const { lines, bench, other } = L.layout(spots);
  // Man of the match wears it. Before kick-off nobody has earned anything, so
  // the crown only exists once the match has a score.
  const star = L.isPlayed(f) ? state.motm.get(f.id) : null;
  const crown = (id) => (id && id === star
    ? `<svg class="crown" viewBox="0 0 24 15" role="img" aria-label="Man of the match"><use href="#i-crown"/></svg>`
    : '');
  const king = (id) => (id && id === star ? ' king' : '');

  const chips = lines.map((line) => line.players.map((sp, i) => {
    const x = ((i + 1) / (line.players.length + 1)) * 100;
    return `<div class="chip${king(sp.player)}" style="left:${x.toFixed(1)}%;top:${line.y}%">
      ${crown(sp.player)}
      <span class="ph">${face(sp.player)}<i class="pos">${esc(sp.pos)}</i></span>
      <span class="nm">${esc(playerName(sp.player))}</span></div>`;
  }).join('')).join('');

  return `<div class="xi">
    ${label ? `<div class="kick">${esc(label)}</div>` : ''}
    <div class="pitch"><div class="box"></div><div class="box six"></div>
      <div class="box top"></div><div class="box six top"></div>${chips}</div>
    ${other.length ? `<div class="strip"><span class="lbl">Also</span>
      ${other.map((sp) => `<span class="sub${king(sp.player)}">${crown(sp.player)}${face(sp.player)}<b>${esc(sp.pos)}</b>${esc(playerName(sp.player))}</span>`).join('')}</div>` : ''}
    ${bench.length ? `<div class="strip"><span class="lbl">Bench</span>
      ${bench.map((sp) => `<span class="sub${king(sp.player)}">${crown(sp.player)}${face(sp.player)}${esc(playerName(sp.player))}</span>`).join('')}</div>` : ''}
  </div>`;
}

// What happened in one match: how it started, who scored, who came off the bench.
function matchPanel(f) {
  const ap = state.appearances.filter((a) => a.fixture === f.id);
  const icon = (id) => `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#${id}"/></svg>`;
  const pills = (rows, key) => rows.map((a) => `<span class="sub">${face(a.player)}${esc(playerName(a.player))}
    ${a[key] > 1 ? `<b class="x">×${a[key]}</b>` : ''}</span>`).join('');

  const scored = ap.filter((a) => a.goals).sort((a, b) => b.goals - a.goals || a.player.localeCompare(b.player));
  const set = ap.filter((a) => a.assists).sort((a, b) => b.assists - a.assists || a.player.localeCompare(b.player));

  const run = [];
  if (!L.isPlayed(f)) {
    run.push('<p class="hint" style="margin:0">Not played yet.</p>');
  } else if (!ap.length) {
    run.push('<p class="hint" style="margin:0">No squad logged for this match.</p>');
  } else {
    // An empty column means two different things, and the score says which. We
    // scored nothing: nobody scored and nobody assisted, and that is a fact the
    // scoreline already proves. We scored and the names are missing: the match
    // happened, the logging did not. Never claim the first when it is the second.
    const us = f.home === state.meta.team ? f.hs : f.as;
    const blank = us ? '<span class="dim">not logged</span>' : '<span class="dim">nobody</span>';
    run.push(`<div class="strip"><span class="lbl">${icon('i-ball')}Scored</span>${
      scored.length ? pills(scored, 'goals') : blank}</div>`);
    run.push(`<div class="strip"><span class="lbl">${icon('i-boot')}Assists</span>${
      set.length ? pills(set, 'assists') : blank}</div>`);
    // A clean sheet only exists when we conceded nothing, so the strip only
    // does too; saves only appear when somebody made one.
    const them = f.home === state.meta.team ? f.as : f.hs;
    const sheets = ap.filter((a) => a.cleanSheets);
    if (them === 0) run.push(`<div class="strip"><span class="lbl">${icon('i-sheet')}Clean sheet</span>${
      sheets.length ? pills(sheets, 'cleanSheets') : '<span class="dim">not logged</span>'}</div>`);
    const saves = ap.filter((a) => a.pensSaved).sort((a, b) => b.pensSaved - a.pensSaved);
    if (saves.length) run.push(`<div class="strip"><span class="lbl">${icon('i-glove')}Pens saved</span>${
      pills(saves, 'pensSaved')}</div>`);
  }

  const pitch = lineup(f, L.isPlayed(f) ? 'Started' : 'Planned');
  return `<div class="mpanel">${pitch}<div class="run">${run.join('')}</div></div>`;
}

// A dot per match per player. The pattern is the point: a percentage hides
// who has not turned up since October.
function attendance(v2 = false) {
  const me = state.meta.team;
  const ours = state.fixtures
    .filter((f) => (f.home === me || f.away === me) && L.isPlayed(f))
    .sort((a, b) => (L.whenPlayed(a) < L.whenPlayed(b) ? -1 : 1));
  const logged = L.loggedFixtures(state.appearances);
  const done = ours.filter((f) => logged.has(f.id));

  if (!state.squad.length) {
    return `<div class="empty"><b>No squad yet</b>
      Add players to <code>data/squad.csv</code> — one line each, <code>id,name,active,photo</code>.
      The id is what you type when logging a match.</div>`;
  }
  if (!done.length) {
    return `<div class="empty"><b>Nothing logged yet</b>
      One line per match in <code>data/appearances.csv</code>:
      <code>fixture_id,squad,goals,assists,motm,formation</code>.</div>`;
  }

  const rows = state.squad
    .map((p) => ({ ...p, ...L.playerTotals(state.appearances, p.id) }))
    .filter((p) => p.active || p.apps)
    .sort((a, b) => b.apps - a.apps || a.name.localeCompare(b.name));

  const ap = state.appearances;
  const icon = (id, cls) => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#${id}"/></svg>`;

  // A column only gets the extra room when somebody in it did both.
  const both = (p, f) => { const a = ap.find((x) => x.player === p.id && x.fixture === f.id);
    return !!(a && a.goals && a.assists); };
  const colW = ours.map((f) => (rows.some((p) => both(p, f)) ? (v2 ? 54 : 46) : (v2 ? 32 : 22)));

  const mark = (id, n) => `<span class="mark">${icon(id, '')}${n > 1 ? `<i class="n">${n}</i>` : ''}</span>`;

  const cell = (p, f, i) => {
    const w = ` style="width:${colW[i]}px"`;
    const opp = f.home === me ? f.away : f.home;
    const when = `${shortDate(L.whenPlayed(f))} ${f.home === me ? 'v' : 'away to'} ${opp}`;
    if (!logged.has(f.id)) return `<span class="cell nl"${w} title="${esc(when)} — not logged"><i class="dot"></i></span>`;
    const a = ap.find((x) => x.player === p.id && x.fixture === f.id);
    if (!a) return `<span class="cell off"${w} title="${esc(when)} — missed"><i class="dot"></i></span>`;
    const bits = [];
    if (a.goals) bits.push(`${a.goals} goal${a.goals === 1 ? '' : 's'}`);
    if (a.assists) bits.push(`${a.assists} assist${a.assists === 1 ? '' : 's'}`);
    if (a.cleanSheets) bits.push('clean sheet');
    if (a.pensSaved) bits.push(`${a.pensSaved} penalt${a.pensSaved === 1 ? 'y' : 'ies'} saved`);
    const tip = `${when} — ${bits.length ? bits.join(', ') : 'played'}`;
    const two = a.goals && a.assists;
    const inner = a.goals || a.assists
      ? (a.goals ? mark('i-ball', a.goals) : '') + (a.assists ? mark('i-boot', a.assists) : '')
      : '<i class="dot"></i>';
    return `<span class="cell${two ? ' two' : ''}"${w} title="${esc(tip)}">${inner}</span>`;
  };

  const panel = (p) => {
    const ms = L.playerMatches(state.fixtures, ap, me, p.id);
    if (!ms.length) return '<p class="hint" style="margin:0">Nothing logged for this player yet.</p>';
    return `<p class="tot"><b>${p.apps}</b> app${p.apps === 1 ? '' : 's'} ·
      <b>${p.goals}</b> goal${p.goals === 1 ? '' : 's'} ·
      <b>${p.assists}</b> assist${p.assists === 1 ? '' : 's'}${p.cleanSheets ? ` ·
      <b>${p.cleanSheets}</b> clean sheet${p.cleanSheets === 1 ? '' : 's'}` : ''}${p.pensSaved ? ` ·
      <b>${p.pensSaved}</b> pen${p.pensSaved === 1 ? '' : 's'} saved` : ''}</p>
      <ul class="rows">${ms.map((m) => `
      <li><span class="dt">${esc(shortDate(m.date))}</span>
        <span class="vs">${m.home ? 'v ' : 'away to '}${esc(m.opp)}
          ${m.goals || m.assists || m.cleanSheets || m.pensSaved ? `<span class="did">
            ${m.goals ? `<span>${icon('i-ball', 'ball')}${m.goals > 1 ? `×${m.goals}` : ''}</span>` : ''}
            ${m.assists ? `<span>${icon('i-boot', 'boot')}${m.assists > 1 ? `×${m.assists}` : ''}</span>` : ''}
            ${m.cleanSheets ? `<span>${icon('i-sheet', 'ball')}</span>` : ''}
            ${m.pensSaved ? `<span>${icon('i-glove', 'ball')}${m.pensSaved > 1 ? `×${m.pensSaved}` : ''}</span>` : ''}
          </span>` : ''}
          <span class="fld">${esc(shortField(m.field))}</span></span>
        <span class="sc ${m.r === 'W' ? 'w' : m.r === 'L' ? 'l' : 'd'}">${m.gf}–${m.ga}</span></li>`).join('')}
      </ul>`;
  };

  // The new design labels every column, so a cell can be read without hovering.
  const head = v2 ? `<div class="atthead" aria-hidden="true"><span></span><span class="cells">${ours.map((f, i) => {
    const d = asDate(L.whenPlayed(f));
    return `<span class="cell" style="width:${colW[i]}px"><b>${d.getDate()}</b>${esc(d.toLocaleDateString('en-GB', { month: 'short' }))}</span>`;
  }).join('')}</span><span></span></div>` : '';

  return `<p class="hint">${v2 ? 'Press a player for their season.' : `${done.length} of ${ours.length} played matches logged.
    One cell per match, oldest on the left. Press a player for their season.`}</p>
    ${dataFlags()}
    <div class="attwrap"><div class="attgrid">${head}${rows.map((p) => `
      <div class="attrow" data-player="${esc(p.id)}" tabindex="0" role="button" aria-expanded="false">
        <span class="who${p.active ? '' : ' gone'}">${mug(p.id)}<b class="nmt">${esc(p.name)}</b></span>
        <span class="cells">${ours.map((f, i) => cell(p, f, i)).join('')}</span>
        <span class="pc">${p.apps}/${done.length}</span>
      </div>
      <div class="attdet" hidden>${panel(p)}</div>`).join('')}</div></div>
    <div class="legend">
      <span><i class="on"></i>Played</span>
      <span>${icon('i-ball', 'ball')}Scored</span>
      <span>${icon('i-boot', 'boot')}Assisted</span>
      <span><i class="off"></i>Missed</span>
      <span><i class="nl"></i>Not logged yet</span>
    </div>`;
}

// What hand-typed data gets wrong and cannot catch itself.
function dataFlags() {
  const { offBy, unknown, orphans, conflict, twice, notOurs, leaky } = L.dataChecks(state.fixtures, state.appearances,
    state.squad, state.meta.team, state.formations, state.motm, state.rowIds);
  if (!offBy.length && !unknown.length && !orphans.length && !twice.length && !notOurs.length && !leaky.length) return '';
  const bits = [];
  // A merge conflict first and on its own: it is the one where every other
  // number on the page is also suspect, so it should not read as a footnote.
  if (conflict) {
    bits.push(`<b>appearances.csv still has merge-conflict markers</b> (<code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code>)
      — a merge was committed before it was resolved, so some matches are counted twice.`);
  }
  const strays = orphans.filter((id) => !/^(<{7}|={7}|>{7})/.test(id));
  if (strays.length) {
    bits.push(`<b>${strays.length} row${strays.length === 1 ? '' : 's'}</b> in appearances.csv
      with no such fixture: ${strays.slice(0, 4).map((id) => `<code>${esc(id || '(blank)')}</code>`).join(', ')}${strays.length > 4 ? ', …' : ''}.`);
  }
  if (notOurs.length) {
    bits.push(`<b>${notOurs.length} row${notOurs.length === 1 ? '' : 's'}</b> in appearances.csv for a match
      we did not play in — probably a mistyped fixture id (${notOurs.slice(0, 3).map((f) =>
      `<code>${esc(f.id)}</code> is ${esc(f.home)} v ${esc(f.away)}`).join(', ')}).`);
  }
  if (leaky.length) {
    bits.push(`<b>${leaky.length} clean sheet${leaky.length === 1 ? '' : 's'}</b> logged for a match we conceded in
      (${leaky.slice(0, 3).map((f) => `${esc(shortDate(L.whenPlayed(f)))} v ${esc(f.home === state.meta.team ? f.away : f.home)}`).join(', ')}).`);
  }
  if (twice.length) {
    bits.push(`<b>${twice.length} match${twice.length === 1 ? '' : 'es'}</b> logged on more than one row, so everyone in
      ${twice.length === 1 ? 'it is' : 'them is'} counted twice (${twice.slice(0, 3).map((f) =>
      `${esc(shortDate(L.whenPlayed(f)))} v ${esc(f.home === state.meta.team ? f.away : f.home)}`).join(', ')}).`);
  }
  if (offBy.length) {
    bits.push(`<b>${offBy.length} match${offBy.length === 1 ? '' : 'es'}</b> where the scorers do not add up
      to the score (${offBy.slice(0, 3).map((x) => `${esc(shortDate(L.whenPlayed(x.fixture)))}: ${x.claimed} of ${x.scored}`).join(', ')}${offBy.length > 3 ? ', …' : ''}).`);
  }
  if (unknown.length) {
    bits.push(`<b>${unknown.length} name${unknown.length === 1 ? '' : 's'}</b> in appearances.csv with no squad row:
      ${unknown.slice(0, 5).map(esc).join(', ')}${unknown.length > 5 ? ', …' : ''}.`);
  }
  return `<p class="flag">${bits.join(' ')}</p>`;
}

// Phase 1 is one table of sixteen with the cut line drawn after eighth.
// Phase 2 is the two groups, each starting from zero.
function tables(v2 = false) {
  const fx = state.fixtures;
  const twoPhases = L.hasPhase2(fx);
  if (state.phaseView == null) state.phaseView = L.phase2Live(fx) ? 2 : 1;
  const view = twoPhases ? state.phaseView : 1;

  const swtch = twoPhases ? `<div class="pswitch" role="tablist">
    ${[1, 2].map((n) => `<button role="tab" data-phase="${n}" aria-selected="${view === n}">Phase ${n}</button>`).join('')}
  </div>` : '';

  if (view === 1) {
    const t = L.buildTable(L.inPhase(fx, 1));
    const cutAt = Math.ceil(t.length / 2);
    return `${swtch}
      ${v2 ? '' : `<p class="hint">Points, goal difference, goals for, then goals against.
        ${twoPhases ? 'How the single round finished.' : `The top ${cutAt} go into the top group after the winter break.`}</p>`}
      ${tableHTML(t, { phase: 1, cutAt })}
      <div class="legend"><span><i class="cut"></i>Top ${cutAt} — top group in phase 2</span></div>`;
  }

  const seeds = L.phase1Seeds(fx);
  const groups = L.groupsIn(fx, 2);
  return `${swtch}
    <p class="hint">Everyone starts phase 2 on zero. Level teams are separated by where they
      finished the single round.</p>
    ${groups.map((g) => {
      const t = L.buildTable(L.inPhase(fx, 2, g), null, seeds);
      return `<h3 class="gh">${esc(L.groupLabel(g))}</h3>
        ${tableHTML(t, { phase: 2, group: g, seeds })}`;
    }).join('')}`;
}

function tableHTML(t, opt = {}) {
  const phase = opt.phase || 1;
  return `<table class="tbl"><thead><tr>
    <th></th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th>
    <th class="fm" title="Oldest on the left, newest on the right">Form →</th>
    </tr></thead><tbody>${t.map((r) => {
    const last5 = L.teamMatches(state.fixtures, r.team)
      .filter((m) => m.phase === phase).slice(0, 5).reverse();
    const cls = [
      'tr',
      r.team === state.meta.team ? 'me' : '',
      opt.cutAt && r.pos <= opt.cutAt ? 'up' : '',
      opt.cutAt && r.pos === opt.cutAt ? 'cut' : '',
    ].filter(Boolean).join(' ');
    const seeded = opt.seeds ? ` title="Finished ${ordinal(opt.seeds.get(r.team) || 0)} in the single round"` : '';
    return `
    <tr class="${cls}" data-team="${esc(r.team)}" data-phase="${phase}"
      tabindex="0" role="button" aria-expanded="false">
      <td>${r.pos}</td><td${seeded}>${esc(r.team)}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
      <td>${r.gf}</td><td>${r.ga}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="pts">${r.pts}</td>
      <td class="fm">${formRun(last5)}</td>
    </tr>
    <tr class="det" hidden><td colspan="11">${teamPanel(r.team)}</td></tr>`;
  }).join('')}</tbody></table>`;
}

// Oldest to newest, fading in towards the present, with the newest ringed.
function formRun(ms) {
  if (!ms.length) return '<span class="dim">—</span>';
  return `<span class="form">${ms.map((m, i) => {
    const o = (0.55 + (0.45 * (i + 1)) / ms.length).toFixed(2);
    const where = m.home ? 'v ' : 'away to ';
    return `<i class="${m.r}${i === ms.length - 1 ? ' now' : ''}" style="opacity:${o}"
      title="${esc(shortDate(m.date))} ${where}${esc(m.opp)} ${m.gf}–${m.ga}">${m.r}</i>`;
  }).join('')}</span>`;
}

function teamPanel(team) {
  const ms = L.teamMatches(state.fixtures, team);
  if (!ms.length) return `<div class="tdet"><p class="hint" style="margin:0">No results yet.</p></div>`;
  const block = (rows) => `<ul class="rows">${rows.map((m) => `
    <li><span class="dt">${esc(shortDate(m.date))}</span>
      <span class="vs">${m.home ? 'v ' : 'away to '}${esc(m.opp)}
        <span class="fld">${esc(shortField(m.field))}</span></span>
      <span class="sc ${m.r === 'W' ? 'w' : m.r === 'L' ? 'l' : 'd'}">${m.gf}–${m.ga}</span></li>`).join('')}
    </ul>`;
  const p2 = ms.filter((m) => m.phase === 2);
  const p1 = ms.filter((m) => m.phase !== 2);
  if (!p2.length) return `<div class="tdet">${block(p1)}</div>`;
  return `<div class="tdet">
    <h4 class="ph">Phase 2 — ${esc(L.groupLabel(p2[0].group))}</h4>${block(p2)}
    <h4 class="ph">Single round</h4>${block(p1)}</div>`;
}

function chart() {
  const { dates, teams, series, splitAfter, phase2From } = L.rankHistory(state.fixtures);
  if (!dates.length) {
    return `<div class="empty"><b>No results yet</b>
      The first score puts all ${teams.length || ''} teams on the chart.</div>`;
  }
  const me = state.meta.team;
  const n = dates.length, rows = teams.length;
  const COL = n > 1 ? Math.max(52, Math.min(120, 780 / (n - 1))) : 0;
  const ROW = 30, PAD = 30, TOP = 20, BOT = 34, NAMES = 190;
  const W = PAD + (n - 1) * COL + NAMES;
  const H = TOP + (rows - 1) * ROW + BOT;
  const x = (i) => PAD + i * COL;
  const y = (row) => TOP + (row - 1) * ROW;
  const cutAt = splitAfter || Math.ceil(rows / 2);
  const cutY = (y(cutAt) + y(cutAt + 1)) / 2;
  const breakAt = phase2From ? dates.indexOf(phase2From) : -1;

  const cols = dates.map((d, i) => `
    <line class="col" x1="${x(i)}" y1="${TOP - 14}" x2="${x(i)}" y2="${H - BOT + 8}"/>
    <text class="ax" x="${x(i)}" y="${H - BOT + 26}">${esc(shortDate(d))}</text>`).join('');

  const split = `<line class="cutline${splitAfter ? ' hard' : ''}" x1="${PAD - 18}" y1="${cutY}"
    x2="${x(n - 1) + 12}" y2="${cutY}"/>`;
  const brk = breakAt > 0 ? `
    <line class="brk" x1="${x(breakAt) - COL / 2}" y1="${TOP - 16}" x2="${x(breakAt) - COL / 2}" y2="${H - BOT + 8}"/>
    <text class="brklbl" x="${x(breakAt) - COL / 2 + 5}" y="${TOP - 6}">winter break</text>` : '';

  const lane = (t) => {
    const pts = series.get(t);
    const mine = t === me;
    const segs = pts.slice(1).map((p, i) => `
      <line class="seg${p.played ? '' : ' dim'}" x1="${x(i)}" y1="${y(pts[i].row)}"
        x2="${x(i + 1)}" y2="${y(p.row)}"/>`).join('');
    const nodes = pts.map((p, i) => `
      <g class="nd${p.played ? '' : ' dim'}">
        <circle cx="${x(i)}" cy="${y(p.row)}" r="9"/>
        <text x="${x(i)}" y="${y(p.row)}">${p.row}</text>
        <title>${esc(t)} — ${esc(shortDate(p.date))}: ${p.phase === 2
          ? `${ordinal(p.pos)} in the ${esc(L.groupLabel(p.group))}`
          : ordinal(p.pos)}, ${p.pts} pts from ${p.p} played${p.played ? '' : ' (no result this week)'}</title>
      </g>`).join('');
    const last = pts[pts.length - 1];
    return `<g class="tm${mine ? ' me' : ''}">${segs}${nodes}
      <text class="nm" x="${x(n - 1) + 17}" y="${y(last.row)}">${esc(t)}</text></g>`;
  };

  return `<div class="chartwrap">
    <svg class="bump" width="${W.toFixed(0)}" height="${H}" viewBox="0 0 ${W.toFixed(0)} ${H}" role="img"
      aria-label="League position of all ${rows} teams after every matchday with a result">
      ${cols}${split}${brk}${teams.filter((t) => t !== me).map(lane).join('')}${teams.includes(me) ? lane(me) : ''}
    </svg></div>
    <div class="legend">
      <span><i class="me"></i>${esc(me)}</span>
      <span><i></i>Played that week</span>
      <span><i class="off"></i>No result in yet</span>
      <span><i class="cut${splitAfter ? ' hard' : ''}"></i>${splitAfter
        ? 'Groups cannot cross' : `Top ${cutAt} go through`}</span>
    </div>`;
}

// Everyone, faces and all. A silhouette here is a standing invitation: it is the
// one place on the page where not having sent a photo is visible.
function wall() {
  if (!state.squad.length) {
    return `<div class="empty"><b>No squad yet</b>
      Add players to <code>data/squad.csv</code>.</div>`;
  }
  const rows = [...state.squad].sort((a, b) =>
    (b.active ? 1 : 0) - (a.active ? 1 : 0) || a.name.localeCompare(b.name));
  return `<p class="hint">A photo is opt-in. Send one and the silhouette becomes you.</p>
    <div class="wall">${rows.map((p) => `
      <figure${p.active ? '' : ' class="gone"'}>${mug(p.id, 'ph')}
        <figcaption>${esc(p.name)}</figcaption></figure>`).join('')}</div>`;
}

function season() {
  const ours = state.fixtures
    .filter((f) => f.home === state.meta.team || f.away === state.meta.team)
    .sort((a, b) => (L.whenPlayed(a) < L.whenPlayed(b) ? -1 : 1));
  if (!ours.length) return `<div class="empty"><b>No fixtures</b>Add rows to data/fixtures.csv.</div>`;
  const logged = L.loggedFixtures(state.appearances);

  return `<ul class="rows season">${ours.map((f) => {
    let label = f.time, cls = 'tbd';
    if (L.isPlayed(f)) {
      const us = f.home === state.meta.team ? f.hs : f.as;
      const them = f.home === state.meta.team ? f.as : f.hs;
      label = `${us}–${them}`;
      cls = us > them ? 'w' : us < them ? 'l' : 'd';
    }
    const moved = f.playedOn && f.playedOn !== f.scheduled;
    // A row opens only when there is something behind it.
    const more = state.formations.has(f.id) || (L.isPlayed(f) && logged.has(f.id));
    return `<li class="mrow${more ? ' can' : ''}"${more ? ` data-fixture="${esc(f.id)}" tabindex="0" role="button" aria-expanded="false"` : ''}>
      <span class="dt">${esc(shortDate(L.whenPlayed(f)))}</span>
      <span class="vs">${f.home === state.meta.team ? 'v ' + esc(f.away) : 'away to ' + esc(f.home)}
        <span class="fld">${esc(shortField(f.field))}${moved ? ' <span class="moved">moved</span>' : ''}</span></span>
      <span class="sc ${cls}">${esc(label)}</span>
      ${f.note ? `<span class="nt">${esc(f.note)}</span>` : ''}</li>
    ${more ? `<li class="mdet" hidden>${matchPanel(f)}</li>` : ''}`;
  }).join('')}</ul>`;
}

/* ---------- the new design ----------
   Same data, same league engine, a different edit: the sections in the order a
   player reads them on a Monday (next match, our results, where we stand, who
   did what), one heading style for the main sections and a quieter one for the
   rest, and nothing that repeats itself. The classic page above is untouched. */

function renderNew() {
  const { meta } = state;
  const next = L.nextFixture(state.fixtures, meta.team, todayIso());
  $('#app').innerHTML = `<div class="wrap v2">
    ${mast()}
    ${ticker()}
    ${heroNew(next)}
    <div class="v2grid">
      <section class="s-season"><h2>Our season</h2>${seasonNew(next)}</section>
      <section class="s-leaders"><h2>Season leaders</h2>${leadersNew()}</section>
      <section class="s-table"><h2>League table</h2>${tables(true)}</section>
      <section class="s-pos"><h3 class="h2s">Position</h3>${chartNew()}</section>
      <section class="s-att"><h2>Attendance</h2>${attendance(true)}</section>
      <section class="s-squad"><h3 class="h2s">The squad</h3>${wallNew()}</section>
    </div>
    <div class="foot">
      <span>Typed by hand after every match</span>
      <a href="${esc(meta.sourceUrl)}" target="_blank" rel="noopener">Official schedule on Playpass</a>
    </div></div>`;
}

// Two or three letters for a club that has no crest here. A leading
// abbreviation (DHL, VV, MTT) is kept as it is; otherwise the initials.
function monogram(name) {
  const words = String(name).split(/\s+/).filter(Boolean);
  if (/^[A-Z]{2,}$/.test(words[0] || '')) return words[0].slice(0, 3);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

const scoreClass = (gf, ga) => (gf > ga ? 'w' : gf < ga ? 'l' : 'd');

function heroNew(f) {
  if (!f) return `<div class="hero"><div class="kick">${esc(state.meta.season)}</div>
    <div class="lock"><div class="side"><i class="crest"></i><h2 class="nm">Season complete</h2></div></div></div>`;
  const me = state.meta.team;
  const opp = f.home === me ? f.away : f.home;
  const days = Math.round((asDate(f.scheduled) - asDate(todayIso())) / 864e5);
  const when = days < 0 ? 'overdue' : days === 0 ? 'tonight' : days === 1 ? 'tomorrow' : `in ${days} days`;

  // Both sides' standing in the competition this match belongs to.
  const phase = L.phaseOf(f);
  const t = L.buildTable(L.inPhase(state.fixtures, phase, f.group || null), null,
    phase === 2 ? L.phase1Seeds(state.fixtures) : null);
  const standing = (team) => {
    const r = L.rowFor(t, team);
    if (!r || !r.p) return '<span class="dim">no games yet</span>';
    return `<b>${ordinal(r.pos)}</b><span class="dim">·</span>${r.pts} pt${r.pts === 1 ? '' : 's'}${r.form.length ? form(r.form) : ''}`;
  };

  const seen = L.teamMatches(state.fixtures, me).filter((m) => m.opp === opp);
  const again = seen[0]
    ? `${['First', 'Second', 'Third', 'Fourth', 'Fifth'][seen.length] || `${seen.length + 1}th`} meeting · last time
       ${seen[0].r === 'W' ? 'won' : seen[0].r === 'L' ? 'lost' : 'drew'} ${seen[0].gf}–${seen[0].ga}` : '';

  const last = L.teamMatches(state.fixtures, me)[0];
  const lastBit = last ? `<div class="last"><span class="lbl">Last time out</span>
    <span class="sc ${scoreClass(last.gf, last.ga)}">${last.gf}–${last.ga}</span>
    <span>v ${esc(last.opp)}</span><span class="dim">${esc(shortDate(last.date))}</span></div>` : '';

  const xi = lineup(f);
  return `<div class="hero${xi ? ' has-xi' : ''}">
    <div class="hcol">
      <div class="kick">Next up · ${esc(when)}</div>
      <div class="lock">
        <div class="side us"><i class="crest" aria-hidden="true"></i><h2 class="nm">${esc(me)}</h2>
          <div class="st">${standing(me)}</div></div>
        <div class="v" aria-hidden="true">v</div>
        <div class="side them"><i class="mono" aria-hidden="true">${esc(monogram(opp))}</i><h2 class="nm">${esc(opp)}</h2>
          <div class="st">${standing(opp)}</div></div>
      </div>
      <p class="when"><b>${esc(fmtDate(f.scheduled))}</b><i>·</i><b>${esc(f.time)}</b><i>·</i><b>${esc(shortField(f.field))}</b><i>·</i>${esc(state.meta.venue)}
        ${again ? `<span class="again">${again}</span>` : ''}</p>
      <div class="acts calwrap">
        <button class="cal" type="button" data-gcal>${calIcon}Sync to Google Calendar</button>
        <a class="linkish" href="${esc(feedUrl().replace(/^https?:/, 'webcal:'))}">Apple / Outlook</a>
        <p class="calnote" hidden></p>
      </div>
      ${lastBit}
      ${state.meta.note ? `<div class="note">${esc(state.meta.note)}</div>` : ''}
    </div>${xi}
  </div>`;
}

// Our fixtures grouped by month. Kick-off is only printed when it is not the
// usual one, because a column of identical 19:00s says nothing. Played matches,
// the next one and the two after it are shown; the rest fold away.
function seasonNew(next) {
  const me = state.meta.team;
  const ours = state.fixtures.filter((f) => f.home === me || f.away === me)
    .sort((a, b) => (L.whenPlayed(a) < L.whenPlayed(b) ? -1 : 1));
  if (!ours.length) return `<div class="empty"><b>No fixtures</b>Add rows to data/fixtures.csv.</div>`;
  const logged = L.loggedFixtures(state.appearances);

  const tally = new Map();
  ours.forEach((f) => tally.set(f.time, (tally.get(f.time) || 0) + 1));
  const usual = [...tally].sort((a, b) => b[1] - a[1])[0][0];
  const folded = new Set(ours.filter((f) => !L.isPlayed(f)).slice(3).map((f) => f.id));

  let month = '';
  const items = ours.map((f) => {
    const d = asDate(L.whenPlayed(f));
    const fold = folded.has(f.id) ? ' fold' : '';
    const m = d.toLocaleDateString('en-GB', { month: 'long' });
    const head = m !== month ? `<li class="mon${fold}">${esc(m)}</li>` : '';
    month = m;

    const opp = f.home === me ? f.away : f.home;
    let right = f.time !== usual ? `<span class="sc tbd">${esc(f.time)}</span>` : '<span></span>';
    let cls = '';
    if (L.isPlayed(f)) {
      const us = f.home === me ? f.hs : f.as, them = f.home === me ? f.as : f.hs;
      right = `<span class="sc ${scoreClass(us, them)}">${us}–${them}</span>`;
    } else if (next && f.id === next.id) {
      right = `<span class="sc nxt">Next${f.time !== usual ? ` · ${esc(f.time)}` : ''}</span>`;
      cls = ' nx';
    }
    const moved = f.playedOn && f.playedOn !== f.scheduled ? ' <span class="moved">moved</span>' : '';
    const more = state.formations.has(f.id) || (L.isPlayed(f) && logged.has(f.id));
    return `${head}<li class="mrow${cls}${fold}${more ? ' can' : ''}"${more ? ` data-fixture="${esc(f.id)}" tabindex="0" role="button" aria-expanded="false"` : ''}>
      <span class="dt"><b>${d.getDate()}</b>${esc(d.toLocaleDateString('en-GB', { weekday: 'short' }))}</span>
      <span class="vs"><span class="op">${esc(opp)}</span><span class="fld">${esc(shortField(f.field))}${moved}</span></span>
      ${right}<span class="chev" aria-hidden="true">${more ? '›' : ''}</span>
      ${f.note ? `<span class="nt">${esc(f.note)}</span>` : ''}</li>
    ${more ? `<li class="mdet${fold}" hidden>${matchPanel(f)}</li>` : ''}`;
  }).join('');

  const feed = esc(feedUrl().replace(/^https?:/, 'webcal:'));
  return `<p class="hint">Kick-off ${esc(usual)} unless shown.</p>
    <ul class="rows season">${items}</ul>
    ${folded.size ? `<button class="more" type="button" data-more aria-expanded="false"
      data-less="Show less">Rest of the season · ${folded.size} more</button>` : ''}
    <div class="calwrap callinks">Every match in your calendar:
      <button class="linkish" type="button" data-gcal>Google</button><i>·</i>
      <a class="linkish" href="${feed}">Apple / Outlook</a><i>·</i>
      <button class="linkish" type="button" data-cal>one-off file</button>
      <p class="calnote" hidden></p></div>`;
}

// One block with tabs instead of four boards, three of them mostly empty.
function leadersNew() {
  const tabs = [
    { key: 'goals', label: 'Goals', icon: 'i-ball' },
    { key: 'assists', label: 'Assists', icon: 'i-boot' },
    { key: 'def', label: 'Defence', icon: 'i-sheet' },
  ];
  if (!tabs.some((t) => t.key === state.leaderTab)) state.leaderTab = 'goals';
  const sum = (key) => state.appearances.reduce((n, a) => n + (a[key] || 0), 0);
  return `<div class="ltabs" role="tablist">${tabs.map((t) => `
    <button role="tab" type="button" data-ltab="${t.key}" aria-selected="${state.leaderTab === t.key}">
      ${hIcon(t.icon)}${t.label}${t.key !== 'def' ? `<b>${sum(t.key)}</b>` : ''}</button>`).join('')}</div>
    ${tabs.map((t) => `<div class="lpanel" data-lpanel="${t.key}"${state.leaderTab === t.key ? '' : ' hidden'}>
      ${t.key === 'def' ? defenceBoard() : boardNew(t.key)}</div>`).join('')}`;
}

// Tied players share a rank, printed once. Bars only when they would show a
// difference, and gold only for whoever leads.
function rankRows(list, val) {
  let prev = null, rank = 0;
  return list.map((r, i) => {
    const v = val(r);
    const shown = v !== prev ? String(i + 1) : '';
    if (v !== prev) rank = i + 1;
    prev = v;
    return { r, shown, lead: rank === 1 };
  });
}

function boardNew(key) {
  const list = L.leaderboard(state.squad, state.appearances, key);
  if (!list.length) return `<div class="empty"><b>Nothing yet</b>No ${BOARD_WORDS[key]} logged this season.</div>`;
  const max = list[0][key];
  const bars = new Set(list.map((r) => r[key])).size > 1;
  return `<ol class="lb">${rankRows(list, (r) => r[key]).map(({ r, shown, lead }) => `
    <li${lead ? ' class="lead"' : ''}>
      <span class="rk">${shown}</span>${mug(r.id)}
      <span class="nm">${esc(r.name)}<span class="sec">${r.apps} app${r.apps === 1 ? '' : 's'}</span></span>
      <span class="val">${r[key]}</span>
      ${bars ? `<span class="bar" style="width:${Math.round((r[key] / max) * 100)}%"></span>` : ''}
    </li>`).join('')}</ol>`;
}

// Clean sheets and penalty saves share a tab but not a ranking: each is its own
// board, and a keeper who saved a penalty in a clean-sheet match is on both.
function defenceBoard() {
  const part = (key, icon, title, note) => `<h4 class="lsub">${hIcon(icon)}${title}
    <span class="dim">${note}</span></h4>${boardNew(key)}`;
  return part('cleanSheets', 'i-sheet', 'Clean sheets', 'keeper and every defender, when we kept it at nil')
    + part('pensSaved', 'i-glove', 'Penalties saved', '');
}

// Our line, and everyone else as a faint field behind it. Drawn to the width it
// will be shown at, so the numbers stay readable on a phone.
function chartNew() {
  const { dates, teams, series, splitAfter, phase2From } = L.rankHistory(state.fixtures);
  if (!dates.length) return `<div class="empty"><b>No results yet</b>The first score puts us on the chart.</div>`;
  const me = state.meta.team;
  const n = dates.length, rows = teams.length;
  const W = innerWidth >= 1100 ? 500 : Math.max(300, Math.min(innerWidth - 30, 640));
  const AX = 24, NAMES = 150, ROW = 24, TOP = 14, BOT = 30;
  const COL = n > 1 ? Math.min(130, (W - AX - 14 - NAMES) / (n - 1)) : 0;
  const x = (i) => AX + 14 + i * COL;
  const y = (row) => TOP + (row - 1) * ROW;
  const H = TOP + (rows - 1) * ROW + BOT;
  const cutAt = splitAfter || Math.ceil(rows / 2);
  const cutY = (y(cutAt) + y(cutAt + 1)) / 2;
  const breakAt = phase2From ? dates.indexOf(phase2From) : -1;
  const every = Math.ceil(n / Math.max(1, Math.floor((W - AX - NAMES) / 56)));

  const axis = Array.from({ length: rows }, (_, i) => `<text class="rk" x="${AX - 4}" y="${y(i + 1)}">${i + 1}</text>`).join('');
  const cols = dates.map((d, i) => (i % every === 0 || i === n - 1
    ? `<text class="ax" x="${x(i)}" y="${H - 8}">${esc(shortDate(d))}</text>` : '')).join('');
  const brk = breakAt > 0 ? `<line class="brk" x1="${x(breakAt) - COL / 2}" y1="${TOP - 10}" x2="${x(breakAt) - COL / 2}" y2="${H - BOT + 6}"/>` : '';

  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.row)}`).join(' ');
  const others = teams.filter((t) => t !== me).map((t) => {
    const pts = series.get(t);
    const last = pts[pts.length - 1];
    return `<g class="tm"><title>${esc(t)} — ${ordinal(last.pos)}</title>
      <path d="${path(pts)}"/>${pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.row)}" r="2.6"/>`).join('')}
      <text class="nm" x="${x(n - 1) + 12}" y="${y(last.row)}">${esc(t)}</text></g>`;
  }).join('');
  const mine = series.get(me);
  const ours = mine ? `<g class="tm me"><path d="${path(mine)}"/>${mine.map((p, i) => `
      <g class="nd${p.played ? '' : ' dim'}"><circle cx="${x(i).toFixed(1)}" cy="${y(p.row)}" r="10"/>
        <text x="${x(i).toFixed(1)}" y="${y(p.row)}">${p.row}</text>
        <title>${esc(shortDate(p.date))}: ${ordinal(p.pos)}, ${p.pts} pts from ${p.p} played</title></g>`).join('')}
      <text class="nm" x="${x(n - 1) + 17}" y="${y(mine[mine.length - 1].row)}">${esc(me)}</text></g>` : '';

  const rowsMe = (mine || []).filter((p) => p.played);
  const now = rowsMe[rowsMe.length - 1];
  const best = rowsMe.length ? Math.min(...rowsMe.map((p) => p.pos)) : null;
  const worst = rowsMe.length ? Math.max(...rowsMe.map((p) => p.pos)) : null;
  const line = now ? `<p class="hint">Now <b>${ordinal(now.pos)}</b>${rowsMe.length > 1
    ? ` — best ${ordinal(best)}, lowest ${ordinal(worst)}` : ''}.${matchMedia('(hover: hover)').matches ? ' Point at a grey line to see who it is.' : ''}</p>` : '';

  return `${line}<div class="chartwrap"><svg class="bump b2" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
      aria-label="Our league position after every matchday with a result">
      ${axis}${cols}${brk}
      <line class="cutline${splitAfter ? ' hard' : ''}" x1="${AX}" y1="${cutY}" x2="${x(n - 1) + 8}" y2="${cutY}"/>
      <text class="cutlbl" x="${x(n - 1) + 12}" y="${cutY}">${splitAfter ? 'groups split' : `top ${cutAt}`}</text>
      ${others}${ours}</svg></div>`;
}

// Photos first: the silhouettes then read as a queue waiting for theirs.
function wallNew() {
  if (!state.squad.length) return `<div class="empty"><b>No squad yet</b>Add players to <code>data/squad.csv</code>.</div>`;
  const rows = [...state.squad].sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0)
    || (b.photo ? 1 : 0) - (a.photo ? 1 : 0) || a.name.localeCompare(b.name));
  return `<p class="hint">Send a photo and your silhouette becomes you.</p>
    <div class="wall">${rows.map((p) => `
      <figure${p.active ? '' : ' class="gone"'}>${mug(p.id, 'ph')}<figcaption>${esc(p.name)}</figcaption></figure>`).join('')}</div>`;
}

/* ---------- events ----------
   Pressing a team, a player or one of our matches opens the panel that sits
   right after it. The page shows data and never changes it: there is no way
   for a visitor to edit anything, only to look closer.                   */

function toggleRow(tr) {
  const det = tr.nextElementSibling;
  if (!det || !['det', 'attdet', 'mdet'].some((c) => det.classList.contains(c))) return;
  const open = det.hidden;
  det.hidden = !open;
  tr.classList.toggle('open', open);
  tr.setAttribute('aria-expanded', String(open));
}

document.addEventListener('click', (e) => {
  const d = e.target.closest?.('[data-design]');
  if (d) { if (d.dataset.design !== state.design) setDesign(d.dataset.design); return; }
  const lt = e.target.closest?.('[data-ltab]');
  if (lt) {
    state.leaderTab = lt.dataset.ltab;
    const box = lt.closest('section');
    box.querySelectorAll('[data-ltab]').forEach((b) => b.setAttribute('aria-selected', String(b === lt)));
    box.querySelectorAll('[data-lpanel]').forEach((p) => { p.hidden = p.dataset.lpanel !== state.leaderTab; });
    return;
  }
  const more = e.target.closest?.('[data-more]');
  if (more) {
    const list = more.previousElementSibling;
    const all = !list.classList.contains('all');
    list.classList.toggle('all', all);
    more.setAttribute('aria-expanded', String(all));
    [more.textContent, more.dataset.less] = [more.dataset.less, more.textContent];
    return;
  }
  if (e.target.closest?.('[data-cal]')) { downloadCalendar(); return; }
  const g = e.target.closest?.('[data-gcal]');
  if (g) { syncGoogle(g); return; }
  const ph = e.target.closest?.('.pswitch button');
  if (ph) { state.phaseView = Number(ph.dataset.phase); render(); return; }
  const tr = e.target.closest?.('tr[data-team],.attrow[data-player],li[data-fixture]');
  if (tr) toggleRow(tr);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const tr = e.target.closest?.('tr[data-team],.attrow[data-player],li[data-fixture]');
  if (!tr) return;
  e.preventDefault();
  toggleRow(tr);
});
