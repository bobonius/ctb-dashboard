// Everything that touches the DOM. All league arithmetic comes from
// lib/league.mjs so the page and the Action can never disagree.

// the stamp index.html put on this module rides along to the ones it imports
const L = await import(`./league.mjs${new URL(import.meta.url).search}`);

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iso = (d) => d.toISOString().slice(0, 10);
const todayIso = () => iso(new Date());
const asDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = (s) => asDate(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const shortDate = (s) => asDate(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const shortField = (f) => String(f ?? '').replace('Hockey Field', 'Hockey').replace('Football Field', 'Football');
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

const state = { meta: null, fixtures: [], squad: [], appearances: [], formations: new Map(), phaseView: null };

/* ---------- loading ---------- */

async function text(path) {
  // no-store, or the Pages CDN serves a stale table for minutes after a commit
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.text();
}

export async function boot() {
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

function render() {
  const { meta } = state;
  const next = L.nextFixture(state.fixtures, meta.team, todayIso());

  $('#app').innerHTML = `<div class="wrap">
    <header class="mast">
      <div class="crest" aria-hidden="true"></div>
      <div><h1>${esc(meta.team)}</h1>
        <div class="sub">${esc(meta.league)} · ${esc(meta.season)} · ${esc(meta.venue)}</div></div>
    </header>
    ${hero(next)}
    <div class="grid">
      ${lineup(next)}
      <section><h2>Goals</h2><p class="hint">Season total, built up match by match</p>${board('goals')}</section>
      <section><h2>Assists</h2><p class="hint">Season total, built up match by match</p>${board('assists')}</section>
      <section class="full"><h2>Attendance</h2>${attendance()}</section>
      <section class="full"><h2>League table</h2>${tables()}</section>
      <section class="full"><h2>Position</h2>
        <p class="hint">Every team, every matchday with a result. A week counts as soon as one score
          is in; teams still waiting on a result that week are dimmed.</p>
        ${chart()}</section>
      <section class="full"><h2>Our season</h2>${season()}</section>
    </div>
    <div class="foot">
      <span>Results sync from the sheet automatically</span>
      <a href="${esc(meta.sourceUrl)}" target="_blank" rel="noopener">Official schedule on Playpass</a>
    </div></div>`;
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

  return `<div class="hero">
    <div class="kick">Next up</div><h2 class="opp">${esc(opp)}</h2>
    <div class="meta">
      <span><b>${esc(fmtDate(f.scheduled))}</b></span>
      <span><b>${esc(f.time)}</b> <span class="dim">kick-off</span></span>
      <span><b>${esc(shortField(f.field))}</b></span>
      ${again ? `<span class="dim">${again}</span>` : ''}
    </div>
    <div class="count"><strong>${esc(when)}</strong><span>${esc(state.meta.venue)}</span></div>
    ${bit ? `<div class="meta" style="margin-top:16px"><span class="dim">${bit}</span></div>` : ''}
    ${state.meta.note ? `<div class="note">${esc(state.meta.note)}</div>` : ''}
  </div>`;
}

const form = (f) => `<span class="form">${f.slice(-5).map((r) => `<i class="${r}">${r}</i>`).join('')}</span>`;

function board(key) {
  const list = L.leaderboard(state.squad, state.appearances, key);
  if (!list.length) return `<div class="empty"><b>Nothing on the board</b>No ${key} logged yet this season.</div>`;
  const max = list[0][key];
  return `<ol class="lb">${list.map((r, i) => `
    <li${i === 0 ? ' class="lead"' : ''}>
      <span class="rk">${i + 1}</span>
      <span class="nm">${esc(r.name)}<span class="sec">${r.apps} app${r.apps === 1 ? '' : 's'}</span></span>
      <span class="val">${r[key]}</span>
      <span class="bar" style="width:${Math.round((r[key] / max) * 100)}%"></span>
    </li>`).join('')}</ol>`;
}

// The starting eleven for the next match, on a pitch with our goal at the
// bottom. Subs sit in a strip underneath, because before kick-off there is no
// squad list to infer them from.
function lineup(f) {
  if (!f) return '';
  const name = (id) => (state.squad.find((p) => p.id === id) || {}).name || id;
  const spots = state.formations.get(f.id);
  const opp = f.home === state.meta.team ? f.away : f.home;

  if (!spots) {
    return `<section class="full"><h2>Line-up</h2>
      <div class="empty"><b>No line-up for ${esc(opp)} yet</b>
        Add a <code>formation</code> to fixture ${esc(f.id)} in <code>data/appearances.csv</code>:
        <code>GK:Bob,CB:Tom,CM:Loek,ST:Jesse,BENCH:Stefan</code>.</div></section>`;
  }

  const { lines, bench, other } = L.layout(spots);
  const chips = lines.map((line) => line.players.map((sp, i) => {
    const x = ((i + 1) / (line.players.length + 1)) * 100;
    return `<div class="chip" style="left:${x.toFixed(1)}%;top:${line.y}%">
      <span class="sh">${esc(sp.pos)}</span><span class="nm">${esc(name(sp.player))}</span></div>`;
  }).join('')).join('');

  return `<section class="full"><h2>Line-up</h2>
    <p class="hint">Starting eleven against ${esc(opp)} on ${esc(shortDate(f.scheduled))}.
      Positions are a plan, not a promise.</p>
    <div class="pitchwrap">
      <div class="pitch"><div class="box"></div>${chips}</div>
      ${other.length ? `<div class="strip"><span class="lbl">Also</span>
        ${other.map((sp) => `<span class="sub"><b>${esc(sp.pos)}</b>${esc(name(sp.player))}</span>`).join('')}</div>` : ''}
      ${bench.length ? `<div class="strip"><span class="lbl">Bench</span>
        ${bench.map((sp) => `<span class="sub">${esc(name(sp.player))}</span>`).join('')}</div>` : ''}
    </div></section>`;
}

// A dot per match per player. The pattern is the point: a percentage hides
// who has not turned up since October.
function attendance() {
  const me = state.meta.team;
  const ours = state.fixtures
    .filter((f) => (f.home === me || f.away === me) && L.isPlayed(f))
    .sort((a, b) => (L.whenPlayed(a) < L.whenPlayed(b) ? -1 : 1));
  const logged = L.loggedFixtures(state.appearances);
  const done = ours.filter((f) => logged.has(f.id));

  if (!state.squad.length) {
    return `<div class="empty"><b>No squad yet</b>
      Add players to <code>data/squad.csv</code> — one line each, <code>id,name,active</code>.
      The id is what you type when logging a match.</div>`;
  }
  if (!done.length) {
    return `<div class="empty"><b>Nothing logged yet</b>
      One line per match in <code>data/appearances.csv</code>:
      <code>fixture_id,squad,goals,assists</code>.</div>`;
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
  const colW = ours.map((f) => (rows.some((p) => both(p, f)) ? 46 : 22));

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
      <b>${p.assists}</b> assist${p.assists === 1 ? '' : 's'}</p>
      <ul class="rows">${ms.map((m) => `
      <li><span class="dt">${esc(shortDate(m.date))}</span>
        <span class="vs">${m.home ? 'v ' : 'away to '}${esc(m.opp)}
          ${m.goals || m.assists ? `<span class="did">
            ${m.goals ? `<span>${icon('i-ball', 'ball')}${m.goals > 1 ? `×${m.goals}` : ''}</span>` : ''}
            ${m.assists ? `<span>${icon('i-boot', 'boot')}${m.assists > 1 ? `×${m.assists}` : ''}</span>` : ''}
          </span>` : ''}
          <span class="fld">${esc(shortField(m.field))}</span></span>
        <span class="sc ${m.r === 'W' ? 'w' : m.r === 'L' ? 'l' : 'd'}">${m.gf}–${m.ga}</span></li>`).join('')}
      </ul>`;
  };

  return `<p class="hint">${done.length} of ${ours.length} played matches logged.
    One cell per match, oldest on the left. Press a player for their season.</p>
    ${dataFlags()}
    <div class="attwrap"><div class="attgrid">${rows.map((p) => `
      <div class="attrow" data-player="${esc(p.id)}" tabindex="0" role="button" aria-expanded="false">
        <span class="who${p.active ? '' : ' gone'}">${esc(p.name)}</span>
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

// The two things hand-typed data gets wrong that it cannot catch itself.
function dataFlags() {
  const { offBy, unknown } = L.dataChecks(state.fixtures, state.appearances, state.squad, state.meta.team, state.formations);
  if (!offBy.length && !unknown.length) return '';
  const bits = [];
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
function tables() {
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
      <p class="hint">Points, goal difference, goals for, then goals against.
        ${twoPhases ? 'How the single round finished.' : `The top ${cutAt} go into the top group after the winter break.`}</p>
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

function season() {
  const ours = state.fixtures
    .filter((f) => f.home === state.meta.team || f.away === state.meta.team)
    .sort((a, b) => (L.whenPlayed(a) < L.whenPlayed(b) ? -1 : 1));
  if (!ours.length) return `<div class="empty"><b>No fixtures</b>Add rows to data/fixtures.csv.</div>`;
  return `<ul class="rows">${ours.map((f) => {
    let label = f.time, cls = 'tbd';
    if (L.isPlayed(f)) {
      const us = f.home === state.meta.team ? f.hs : f.as;
      const them = f.home === state.meta.team ? f.as : f.hs;
      label = `${us}–${them}`;
      cls = us > them ? 'w' : us < them ? 'l' : 'd';
    }
    const moved = f.playedOn && f.playedOn !== f.scheduled;
    return `<li><span class="dt">${esc(shortDate(L.whenPlayed(f)))}</span>
      <span class="vs">${f.home === state.meta.team ? 'v ' + esc(f.away) : 'away to ' + esc(f.home)}
        <span class="fld">${esc(shortField(f.field))}${moved ? ' <span class="moved">moved</span>' : ''}</span></span>
      <span class="sc ${cls}">${esc(label)}</span>
      ${f.note ? `<span class="nt">${esc(f.note)}</span>` : ''}</li>`;
  }).join('')}</ul>`;
}

/* ---------- events ----------
   The table is the only thing you can press: a row opens its own results
   underneath it. Everything else on the page is read-only.               */

function toggleRow(tr) {
  const det = tr.nextElementSibling;
  if (!det || !(det.classList.contains('det') || det.classList.contains('attdet'))) return;
  const open = det.hidden;
  det.hidden = !open;
  tr.classList.toggle('open', open);
  tr.setAttribute('aria-expanded', String(open));
}

document.addEventListener('click', (e) => {
  const ph = e.target.closest?.('.pswitch button');
  if (ph) { state.phaseView = Number(ph.dataset.phase); render(); return; }
  const tr = e.target.closest?.('tr[data-team],.attrow[data-player]');
  if (tr) toggleRow(tr);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const tr = e.target.closest?.('tr[data-team],.attrow[data-player]');
  if (!tr) return;
  e.preventDefault();
  toggleRow(tr);
});
