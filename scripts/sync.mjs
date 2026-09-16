// Pulls the published Google Sheet and writes data/fixtures.csv.
//
// Runs inside the Action, on GitHub's machine, which is why there is no CORS
// problem here and why the sheet never has to be reachable by your teammates.
//
//   node scripts/sync.mjs
//
// Needs SHEET_CSV_URL in the environment. In the repo: Settings, Secrets and
// variables, Actions, Variables tab, new variable SHEET_CSV_URL. Get the value
// from the sheet: File, Share, Publish to web, pick the results tab, CSV.
//
// Exits 0 and changes nothing if the URL is unset, so the workflow still runs
// cleanly before you have set it up.

import { readFile, writeFile } from 'node:fs/promises';
import { parseDelimited, toCSV } from '../lib/csv.mjs';

const OUT = 'data/fixtures.csv';
const COLUMNS = ['id', 'date', 'played_on', 'time', 'field', 'home', 'away', 'home_score', 'away_score'];

// what the sheet might call each column
const ALIASES = {
  id: 'id', match_id: 'id', fixture: 'id', fixture_id: 'id',
  date: 'date', scheduled: 'date', scheduled_date: 'date',
  played_on: 'played_on', played: 'played_on', played_date: 'played_on',
  time: 'time', kickoff: 'time', kick_off: 'time',
  field: 'field', pitch: 'field',
  home: 'home', home_team: 'home', listed_first: 'home',
  away: 'away', away_team: 'away', listed_second: 'away',
  home_score: 'home_score', hs: 'home_score', home_goals: 'home_score',
  away_score: 'away_score', as: 'away_score', away_goals: 'away_score',
};

const norm = (h) => h.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

async function main() {
  const url = process.env.SHEET_CSV_URL;
  if (!url) {
    console.log('SHEET_CSV_URL is not set, leaving fixtures.csv alone.');
    return;
  }

  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Sheet returned ${res.status}. Is it still published to the web?`);
  const body = await res.text();
  if (/<html/i.test(body)) {
    throw new Error('Got HTML instead of CSV. The publish link needs to end in output=csv.');
  }

  const raw = parseDelimited(body);
  if (!raw.length) throw new Error('The sheet came back empty. Refusing to overwrite fixtures.csv.');

  const rows = raw.map((r) => {
    const out = {};
    for (const [k, v] of Object.entries(r)) {
      const key = ALIASES[norm(k)];
      if (key) out[key] = v;
    }
    return out;
  }).filter((r) => r.home && r.away && r.date);

  if (rows.length < raw.length * 0.5) {
    throw new Error(`Only ${rows.length} of ${raw.length} rows were usable. Check the column headers.`);
  }

  // played_on defaults to the scheduled date once a score exists, so a result
  // entered against a moved fixture still lands on the right matchday.
  rows.forEach((r) => {
    const scored = r.home_score !== '' && r.home_score != null && r.away_score !== '' && r.away_score != null;
    if (scored && !r.played_on) r.played_on = r.date;
    if (!scored) r.played_on = '';
    COLUMNS.forEach((c) => { r[c] = r[c] ?? ''; });
  });

  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : Number(a.id) - Number(b.id)));

  const next = toCSV(rows, COLUMNS);
  const prev = await readFile(OUT, 'utf8').catch(() => '');
  if (next === prev) {
    console.log('Sheet matches fixtures.csv, nothing to commit.');
    return;
  }
  await writeFile(OUT, next);
  const scored = rows.filter((r) => r.home_score !== '').length;
  console.log(`Wrote ${rows.length} fixtures (${scored} with a score) to ${OUT}.`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
