// The only copy of the league logic.
//
// Imported by lib/render.mjs (in the browser) and by scripts/snapshot.mjs
// (in Node, inside the Action). If you need to change how the table is
// computed, change it here and both sides stay in agreement. Do not
// reimplement any of this anywhere else.

const { parseDelimited, int } = await import(`./csv.mjs${new URL(import.meta.url).search}`);

/* ---------- loading ---------- */

export function readFixtures(csvText) {
  return parseDelimited(csvText).map((r) => ({
    id: String(r.id),
    scheduled: r.date,
    playedOn: r.played_on || null,
    time: r.time || '19:00',
    field: r.field || '',
    home: r.home,
    away: r.away,
    hs: int(r.home_score),
    as: int(r.away_score),
    note: r.note || '',
    phase: int(r.phase) ?? 1,
    group: r.group || '',
  }));
}

export function readSquad(csvText) {
  return parseDelimited(csvText).map((r) => ({
    id: r.id,
    name: r.name,
    active: String(r.active).toLowerCase() !== 'false',
  }));
}

// One line per match, expanded into one record per player.
//
//   fixture_id,squad,goals,assists
//   5,"tom,stefan,niels","tom:2,niels","stefan"
//
// `squad` is who played. `goals` and `assists` are slugs, `:n` for more than
// one. A scorer missing from the squad list is taken to have played — you
// cannot score in a match you were not in, and it saves a correction.
const slugs = (v) => String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean);

function tally(v) {
  const out = new Map();
  slugs(v).forEach((x) => {
    const [id, n] = x.split(':');
    const key = id.trim();
    if (key) out.set(key, (out.get(key) || 0) + (int(n) ?? 1));
  });
  return out;
}

export function readAppearances(csvText) {
  const out = [];
  parseDelimited(csvText).forEach((r) => {
    const fixture = String(r.fixture_id);
    const goals = tally(r.goals);
    const assists = tally(r.assists);
    const seen = new Set();
    const add = (player) => {
      if (!player || seen.has(player)) return;
      seen.add(player);
      out.push({ fixture, player, goals: goals.get(player) || 0, assists: assists.get(player) || 0 });
    };
    slugs(r.squad).forEach(add);
    goals.forEach((_, p) => add(p));
    assists.forEach((_, p) => add(p));
  });
  return out;
}

/* ---------- basics ---------- */

export const isPlayed = (f) => f.hs != null && f.as != null;
export const whenPlayed = (f) => f.playedOn || f.scheduled;

export function teamsFrom(fixtures) {
  const set = new Set();
  fixtures.forEach((f) => { set.add(f.home); set.add(f.away); });
  return [...set].sort();
}

/* ---------- phases ---------- */

// Phase 1 is the single round where all sixteen play each other once. After
// the winter break the league splits in two: the top eight and the bottom
// eight each play their own double round, everyone back on zero points. A
// fixture says which phase and which half it belongs to; rows with no phase
// are phase 1, so the file read the same before the split existed.

export const GROUPS = ['top', 'bottom'];
export const groupLabel = (g) => (g === 'top' ? 'Top 8' : g === 'bottom' ? 'Bottom 8' : '');

export const phaseOf = (f) => f.phase || 1;

export const inPhase = (fixtures, phase, group = null) =>
  fixtures.filter((f) => phaseOf(f) === phase && (!group || f.group === group));

export const hasPhase2 = (fixtures) => inPhase(fixtures, 2).length > 0;
export const phase2Live = (fixtures) => inPhase(fixtures, 2).some(isPlayed);

export const groupsIn = (fixtures, phase) => {
  const seen = new Set(inPhase(fixtures, phase).map((f) => f.group).filter(Boolean));
  return GROUPS.filter((g) => seen.has(g));
};

// Phase 2 starts level, so on the first matchday every team in a group is on
// zero. Their phase-1 finish breaks that tie, which keeps the chart honest
// across the break instead of scrambling the order alphabetically.
export function phase1Seeds(fixtures) {
  const seeds = new Map();
  buildTable(inPhase(fixtures, 1)).forEach((r) => seeds.set(r.team, r.pos));
  return seeds;
}

/* ---------- the table ---------- */

// Replays every result played on or before `upto` (an ISO date, or null for
// everything). Ordering is points, goal difference, goals for, goals against,
// which is what Playpass uses.
export function buildTable(fixtures, upto = null, seeds = null) {
  const rows = new Map();
  const row = (t) => {
    if (!rows.has(t)) rows.set(t, { team: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] });
    return rows.get(t);
  };
  teamsFrom(fixtures).forEach(row);

  fixtures
    .filter(isPlayed)
    .filter((f) => !upto || whenPlayed(f) <= upto)
    .sort((a, b) => (whenPlayed(a) < whenPlayed(b) ? -1 : 1))
    .forEach((f) => {
      const h = row(f.home);
      const a = row(f.away);
      h.p++; a.p++;
      h.gf += f.hs; h.ga += f.as;
      a.gf += f.as; a.ga += f.hs;
      if (f.hs > f.as) { h.w++; a.l++; h.pts += 3; h.form.push('W'); a.form.push('L'); }
      else if (f.hs < f.as) { a.w++; h.l++; a.pts += 3; a.form.push('W'); h.form.push('L'); }
      else { h.d++; a.d++; h.pts++; a.pts++; h.form.push('D'); a.form.push('D'); }
    });

  const list = [...rows.values()].map((r) => ({ ...r, gd: r.gf - r.ga }));
  const seed = (t) => (seeds && seeds.get(t)) || 99;
  list.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.ga - y.ga
    || seed(x.team) - seed(y.team) || x.team.localeCompare(y.team));
  list.forEach((r, i) => { r.pos = i + 1; });
  return list;
}

export const rowFor = (table, team) => table.find((r) => r.team === team) ?? null;

// Every result a team has, newest first. Feeds both the form column and the
// panel that opens under a team in the table.
export function teamMatches(fixtures, team) {
  return fixtures
    .filter(isPlayed)
    .filter((f) => f.home === team || f.away === team)
    .map((f) => {
      const home = f.home === team;
      const gf = home ? f.hs : f.as;
      const ga = home ? f.as : f.hs;
      return {
        id: f.id, date: whenPlayed(f), field: f.field, home, gf, ga,
        phase: phaseOf(f), group: f.group,
        opp: home ? f.away : f.home,
        r: gf > ga ? 'W' : gf < ga ? 'L' : 'D',
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* ---------- matchdays ---------- */

export function matchdays(fixtures) {
  return [...new Set(fixtures.filter(isPlayed).map(whenPlayed))].sort();
}

/* ---------- position history ---------- */

// Where every team stood after every matchday that produced at least one
// result. There is no completeness gate: a half-filled week still moves the
// lines, and each point carries whether that team actually had a result that
// week, so the chart can show the difference instead of hiding the week.
//
// One chart spans both phases. Before the break a team can move anywhere in
// the sixteen. After it, each half is ranked inside its own group and then
// offset — the top group keeps rows 1-8, the bottom group rows 9-16 — so the
// split line is the one thing nobody can cross.
export function rankHistory(fixtures) {
  const dates = matchdays(fixtures);
  const teams = teamsFrom(fixtures);
  const hasResult = new Set();
  fixtures.filter(isPlayed).forEach((f) => {
    const d = whenPlayed(f);
    hasResult.add(`${f.home}|${d}`);
    hasResult.add(`${f.away}|${d}`);
  });

  const p1 = inPhase(fixtures, 1);
  const groups = groupsIn(fixtures, 2);
  const seeds = groups.length ? phase1Seeds(fixtures) : null;

  // where each group's rows start in the chart
  const offset = new Map();
  let n = 0;
  groups.forEach((g) => {
    offset.set(g, n);
    n += teamsFrom(inPhase(fixtures, 2, g)).length;
  });
  const splitAfter = groups.length > 1 ? offset.get(groups[1]) : 0;

  const p2Dates = new Set(inPhase(fixtures, 2).filter(isPlayed).map(whenPlayed));
  const series = new Map(teams.map((t) => [t, []]));

  dates.forEach((d) => {
    if (p2Dates.has(d)) {
      groups.forEach((g) => {
        buildTable(inPhase(fixtures, 2, g), d, seeds).forEach((r) => {
          series.get(r.team)?.push({
            date: d, row: offset.get(g) + r.pos, pos: r.pos, group: g, phase: 2,
            pts: r.pts, p: r.p, played: hasResult.has(`${r.team}|${d}`),
          });
        });
      });
    } else {
      buildTable(p1, d).forEach((r) => {
        series.get(r.team).push({
          date: d, row: r.pos, pos: r.pos, group: '', phase: 1,
          pts: r.pts, p: r.p, played: hasResult.has(`${r.team}|${d}`),
        });
      });
    }
  });

  const phase2From = dates.find((d) => p2Dates.has(d)) ?? null;
  return { dates, teams, series, splitAfter, phase2From };
}

/* ---------- player numbers ---------- */

export function playerTotals(appearances, playerId) {
  const mine = appearances.filter((a) => a.player === playerId);
  return {
    apps: mine.length,
    goals: mine.reduce((n, a) => n + a.goals, 0),
    assists: mine.reduce((n, a) => n + a.assists, 0),
  };
}

export const playedIn = (appearances, playerId, fixtureId) =>
  appearances.some((a) => a.player === playerId && a.fixture === fixtureId);

// What one player did, match by match: the result joined to their own goals
// and assists. Feeds the panel that opens under a player in the grid.
export function playerMatches(fixtures, appearances, team, playerId) {
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  return appearances
    .filter((a) => a.player === playerId)
    .map((a) => {
      const f = byId.get(a.fixture);
      if (!f || !isPlayed(f)) return null;
      const home = f.home === team;
      const gf = home ? f.hs : f.as;
      const ga = home ? f.as : f.hs;
      return {
        id: f.id, date: whenPlayed(f), field: f.field, home, gf, ga,
        opp: home ? f.away : f.home,
        r: gf > ga ? 'W' : gf < ga ? 'L' : 'D',
        goals: a.goals, assists: a.assists,
      };
    })
    .filter(Boolean)
    .sort((x, y) => (x.date < y.date ? 1 : -1));
}

export const loggedFixtures = (appearances) => new Set(appearances.map((a) => a.fixture));
export const loggedMatches = (appearances) => loggedFixtures(appearances).size;

export function leaderboard(squad, appearances, key) {
  return squad
    .map((p) => ({ name: p.name, ...playerTotals(appearances, p.id) }))
    .filter((r) => r[key] > 0)
    .sort((a, b) => b[key] - a[key] || a.apps - b.apps || a.name.localeCompare(b.name));
}

// Everything the hand-typed data can contradict: scorers that do not add up to
// the score, and slugs that are in no squad row. Both are typos, and the file
// cannot catch them itself.
export function dataChecks(fixtures, appearances, squad, team) {
  const logged = loggedFixtures(appearances);
  const known = new Set(squad.map((p) => p.id));
  const offBy = fixtures
    .filter((f) => isPlayed(f) && (f.home === team || f.away === team) && logged.has(f.id))
    .map((f) => ({ fixture: f, ...reconcile(f, appearances, team) }))
    .filter((x) => x && !x.ok);
  const unknown = [...new Set(appearances.map((a) => a.player))].filter((p) => !known.has(p)).sort();
  return { offBy, unknown };
}

// Player goals in a match should add up to what the team scored.
export function reconcile(fixture, appearances, team) {
  if (!isPlayed(fixture)) return null;
  const scored = fixture.home === team ? fixture.hs : fixture.as;
  const claimed = appearances.filter((a) => a.fixture === fixture.id).reduce((n, a) => n + a.goals, 0);
  return { scored, claimed, ok: scored === claimed };
}

export const nextFixture = (fixtures, team, todayIso) => {
  const ours = fixtures
    .filter((f) => f.home === team || f.away === team)
    .sort((a, b) => (a.scheduled < b.scheduled ? -1 : 1));
  return ours.find((f) => !isPlayed(f) && f.scheduled >= todayIso) ?? ours.find((f) => !isPlayed(f)) ?? null;
};
