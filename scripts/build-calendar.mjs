// Writes calendar.ics for the published site, from the same fixtures.csv and the
// same code the page uses — so the file people subscribe to can never disagree
// with the page. Run by .github/workflows/pages.yml on every push to main;
// nothing is committed, the file only exists in what Pages serves.
//
//   node scripts/build-calendar.mjs _site/calendar.ics
import { readFileSync, writeFileSync } from 'node:fs';
import { readFixtures, isPlayed, whenPlayed } from '../lib/league.mjs';
import { fixturesCalendar } from '../lib/ics.mjs';

const out = process.argv[2] || 'calendar.ics';
const fixtures = readFixtures(readFileSync(new URL('../data/fixtures.csv', import.meta.url), 'utf8'));
const meta = JSON.parse(readFileSync(new URL('../data/meta.json', import.meta.url), 'utf8'));
const ics = fixturesCalendar(fixtures, meta, { isPlayed, whenPlayed });
writeFileSync(out, ics);
console.log(`${out}: ${(ics.match(/BEGIN:VEVENT/g) || []).length} matches`);
