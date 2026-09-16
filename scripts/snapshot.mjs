// Recomputes history/positions.csv from the results.
//
//   node scripts/snapshot.mjs
//
// Derived rows are rebuilt from scratch every run, so correcting a score in the
// sheet fixes the graph retroactively instead of leaving a wrong point behind.
// Rows marked source=manual are never touched, and win over a derived row for
// the same date. Add one by hand when you want the official Playpass number for
// a week you never fully filled in.

import { readFile, writeFile } from 'node:fs/promises';
import { toCSV } from '../lib/csv.mjs';
import { readFixtures, readPositions, derivePositions, mergePositions, isComplete, matchdays } from '../lib/league.mjs';

const OUT = 'history/positions.csv';

async function main() {
  const meta = JSON.parse(await readFile('data/meta.json', 'utf8'));
  const fixtures = readFixtures(await readFile('data/fixtures.csv', 'utf8'));
  const stored = readPositions(await readFile(OUT, 'utf8').catch(() => 'date,position,points,source\n'));

  const derived = derivePositions(fixtures, meta.team);
  const merged = mergePositions(derived, stored);

  const next = toCSV(
    merged.map((p) => ({ date: p.date, position: p.pos, points: p.pts, source: p.source })),
    ['date', 'position', 'points', 'source'],
  );

  const prev = await readFile(OUT, 'utf8').catch(() => '');
  if (next === prev) {
    console.log('Position history unchanged.');
  } else {
    await writeFile(OUT, next);
    console.log(`Position history now has ${merged.length} point(s).`);
  }

  const incomplete = matchdays(fixtures).filter((d) => !isComplete(fixtures, d));
  if (incomplete.length) {
    console.log(`Skipped ${incomplete.length} matchday(s) with missing results: ${incomplete.join(', ')}`);
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
