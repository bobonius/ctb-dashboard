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
  }));
}

export function readSquad(csvText) {
  return parseDelimited(csvText).map((r) => ({
    id: r.id,
    name: r.name,
    active: String(r.active).toLowerCase() !== 'false',
  }));
}

export function readAppearances(csvText) {
  return parseDelimited(csvText).map((r) => ({
    fixture: String(r.fixture_id),
    player: r.player_id,
    status: r.status || '',
    goals: int(r.goals) ?? 0,
    assists: int(r.assists) ?? 0,
  }));
}

/* ---------- basics ---------- */

export const isPlayed = (f) => f.hs != null && f.as != null;
export const whenPlayed = (f) => f.playedOn || f.scheduled;

export function teamsFrom(fixtures) {
  const set = new Set();
  fixtures.forEach((f) => { set.add(f.home); set.add(f.away); });
  return [...set].sort();
}

/* ---------- the table ---------- */

// Replays every result played on or before `upto` (an ISO date, or null for
// everything). Ordering is points, goal difference, goals for, goals against,
// which is what Playpass uses.
export function buildTable(fixtures, upto = null) {
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
  list.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.ga - y.ga || x.team.localeCompare(y.team));
  list.forEach((r, i) => { r.pos = i + 1; });
  return list;
}

export const rowFor = (table, team) => table.find((r) => r.team === team) ?? null;

/* ---------- matchdays ---------- */

export function matchdays(fixtures) {
  return [...new Set(fixtures.filter(isPlayed).map(whenPlayed))].sort();
}

/* ---------- position history ---------- */

// Where every team stood after every matchday that produced at least one
// result. There is no completeness gate: a half-filled week still moves the
// lines, and each point carries whether that team actually had a result that
// week, so the chart can show the difference instead of hiding the week.
export function rankHistory(fixtures) {
  const dates = matchdays(fixtures);
  const teams = teamsFrom(fixtures);
  const hasResult = new Set();
  fixtures.filter(isPlayed).forEach((f) => {
    const d = whenPlayed(f);
    hasResult.add(`${f.home}|${d}`);
    hasResult.add(`${f.away}|${d}`);
  });
  const series = new Map(teams.map((t) => [t, []]));
  dates.forEach((d) => {
    buildTable(fixtures, d).forEach((r) => {
      series.get(r.team).push({
        date: d, pos: r.pos, pts: r.pts, p: r.p, played: hasResult.has(`${r.team}|${d}`),
      });
    });
  });
  return { dates, teams, series };
}

/* ---------- player numbers ---------- */

export function playerTotals(appearances, playerId) {
  const mine = appearances.filter((a) => a.player === playerId);
  return {
    apps: mine.filter((a) => a.status === 'in').length,
    missed: mine.filter((a) => a.status === 'out').length,
    goals: mine.reduce((n, a) => n + a.goals, 0),
    assists: mine.reduce((n, a) => n + a.assists, 0),
  };
}

export function loggedMatches(appearances) {
  return new Set(appearances.filter((a) => a.status).map((a) => a.fixture)).size;
}

export function leaderboard(squad, appearances, key) {
  return squad
    .map((p) => ({ name: p.name, ...playerTotals(appearances, p.id) }))
    .filter((r) => r[key] > 0)
    .sort((a, b) => b[key] - a[key] || a.apps - b.apps || a.name.localeCompare(b.name));
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
