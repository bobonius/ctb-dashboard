// The link preview: a 1200×630 match poster for whoever pastes the site into a
// chat, plus the <meta> tags that point WhatsApp (and iMessage, Slack, Teams) at
// it. Run by the Pages workflow on every push; nothing here is committed.
//
//   node scripts/build-card.mjs _site https://<you>.github.io/<repo>/
//
// Chat apps do not run JavaScript, so a preview has to be a real image and the
// tags have to be in the HTML as served. The image is rendered by the Chrome the
// GitHub runner already has (CHROME_PATH), from plain HTML, so it can use the
// same fonts and faces as the page. Dates are absolute, never "in 3 days": the
// card is only rebuilt on push, and a relative date would go stale in hours.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import * as L from '../lib/league.mjs';

const [site = '_site', base = ''] = process.argv.slice(2);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const meta = JSON.parse(read('data/meta.json'));
const fixtures = L.readFixtures(read('data/fixtures.csv'));
const squad = L.readSquad(read('data/squad.csv'));
const apText = read('data/appearances.csv');
const formations = L.readFormations(apText);
const me = meta.team;

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();   // the workflow sets TZ=Europe/Amsterdam
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const asDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const longDate = (s) => asDate(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- what the card says ----
const next = L.nextFixture(fixtures, me, today);
const ours = fixtures.filter((f) => (f.home === me || f.away === me) && L.isPlayed(f))
  .sort((a, b) => (L.whenPlayed(a) < L.whenPlayed(b) ? -1 : 1));
const last = ours[ours.length - 1];
const phase = next ? L.phaseOf(next) : 1;
const table = L.buildTable(L.inPhase(fixtures, phase, next?.group || null), null,
  phase === 2 ? L.phase1Seeds(fixtures) : null);
const row = L.rowFor(table, me);
const standing = row && row.p ? `${ordinal(row.pos)} · ${row.pts} pt${row.pts === 1 ? '' : 's'}` : '';
const lastLine = last ? (() => {
  const home = last.home === me, us = home ? last.hs : last.as, them = home ? last.as : last.hs;
  return `${us > them ? 'W' : us < them ? 'L' : 'D'} ${us}–${them} v ${home ? last.away : last.home}`;
})() : '';

const faceUri = (id) => {
  const p = squad.find((s) => s.id === id)?.photo;
  if (!p || p.includes('/')) return null;
  const file = new URL(`../data/faces/${p}`, import.meta.url);
  return existsSync(file) ? `data:image/webp;base64,${readFileSync(file).toString('base64')}` : null;
};
const nameOf = (id) => squad.find((s) => s.id === id)?.name || id;
const mug = (id, cls) => {
  const u = faceUri(id);
  return u ? `<img class="${cls}" src="${u}">` : `<span class="${cls} sil"></span>`;
};

// Right-hand side: the line-up on grass if one is logged, otherwise the faces
// we have, because a wall of teammates is the next most recognisable thing.
let side = '';
const spots = next && formations.get(next.id);
if (spots) {
  const { lines, bench } = L.layout(spots);
  const chips = lines.map((ln) => ln.players.map((sp, i) => {
    const x = ((i + 1) / (ln.players.length + 1)) * 100;
    return `<div class="chip" style="left:${x}%;top:${ln.y}%">${mug(sp.player, 'ph')}
      <b>${esc(sp.pos)}</b><span class="nm">${esc(nameOf(sp.player))}</span></div>`;
  }).join('')).join('');
  side = `<div class="pitch"><i class="half"></i><i class="circle"></i><i class="box"></i><i class="box top"></i>${chips}</div>
    ${bench.length ? `<div class="bench">Bench · ${bench.map((b) => esc(nameOf(b.player))).join(', ')}</div>` : ''}`;
} else {
  const withPhoto = squad.filter((s) => s.active && faceUri(s.id));
  side = `<div class="wall">${withPhoto.slice(0, 9).map((s) => `<figure>${mug(s.id, 'wf')}
    <figcaption>${esc(s.name)}</figcaption></figure>`).join('')}</div>`;
}

const opp = next ? (next.home === me ? next.away : next.home) : 'Season complete';
const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,900&family=Inter:wght@500;700;800&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;background:#0b0c10;color:#eef2f7;font-family:Inter,sans-serif;position:relative}
body::before{content:"";position:absolute;inset:0 0 auto 0;height:10px;background:repeating-linear-gradient(90deg,#0f6fc6 0 26px,#05060a 26px 52px)}
.stripes{position:absolute;top:0;bottom:0;left:48%;right:-10%;opacity:.55;
  background:repeating-linear-gradient(115deg,rgba(15,111,198,.5) 0 34px,rgba(5,6,10,0) 34px 68px);
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 55%)}
.l{position:absolute;left:60px;top:58px;width:640px}
.team{display:flex;align-items:center;gap:14px;font-weight:800;font-size:24px;letter-spacing:.06em;text-transform:uppercase;font-style:italic}
.crest{width:44px;height:44px;border-radius:50%;border:3px solid #eef2f7;background:repeating-linear-gradient(115deg,#0f6fc6 0 8px,#05060a 8px 16px)}
.tab{display:inline-block;position:relative;margin:40px 0 14px;padding:8px 22px 8px 16px;color:#05060a;font-weight:800;font-size:17px;letter-spacing:.16em;text-transform:uppercase}
.tab::before{content:"";position:absolute;inset:0;z-index:-1;background:#e8b43a;transform:skewX(-11deg)}
.opp{font-family:Fraunces,serif;font-style:italic;font-weight:900;text-transform:uppercase;line-height:.9;letter-spacing:-.03em;font-size:${opp.length > 14 ? 76 : 96}px}
.rule{height:6px;width:440px;margin:22px 0 22px;background:linear-gradient(90deg,#e8b43a,rgba(232,180,58,0))}
.meta{display:flex;gap:30px;font-size:28px;font-weight:700}
.meta span{color:#8c97a8;font-weight:500}
.foot{position:absolute;left:60px;bottom:48px;display:flex;gap:14px}
.bug{position:relative;padding:10px 20px;font-size:20px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}
.bug::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-11deg);background:rgba(15,111,198,.28);box-shadow:inset 0 0 0 2px rgba(87,174,240,.6)}
.bug.g{color:#e8b43a}.bug.g::before{background:rgba(232,180,58,.12);box-shadow:inset 0 0 0 2px #e8b43a}
.r{position:absolute;right:56px;top:40px;width:400px}
.pitch{position:relative;height:500px;border-radius:14px;overflow:hidden;box-shadow:inset 0 0 0 3px rgba(255,255,255,.28);
  background:repeating-linear-gradient(180deg,#1f5c37 0 50px,#1a4f2f 50px 100px)}
.pitch .half{position:absolute;left:0;right:0;top:50%;border-top:3px solid rgba(255,255,255,.3)}
.pitch .circle{position:absolute;left:50%;top:50%;width:110px;height:110px;margin:-55px 0 0 -55px;border:3px solid rgba(255,255,255,.3);border-radius:50%}
.pitch .box{position:absolute;left:22%;right:22%;bottom:0;height:16%;border:3px solid rgba(255,255,255,.3);border-bottom:0}
.pitch .box.top{top:0;bottom:auto;border:3px solid rgba(255,255,255,.3);border-top:0}
.chip{position:absolute;transform:translate(-50%,-50%);display:grid;justify-items:center;width:110px}
.chip .ph{width:70px;height:70px;border-radius:12px;object-fit:cover;filter:drop-shadow(0 4px 6px rgba(0,0,0,.55))}
.chip b{position:absolute;left:20px;top:52px;background:#0f6fc6;color:#fff;font-size:12px;padding:3px 6px;font-style:italic}
.chip .nm{margin-top:4px;background:rgba(5,12,8,.72);padding:3px 10px;font-size:16px;font-weight:700}
.sil{display:block;background:radial-gradient(circle at 50% 38%,#5b6a83 0 17%,transparent 18%),radial-gradient(ellipse 36% 30% at 50% 100%,#5b6a83 0 98%,transparent 100%) #2b3444}
.bench{margin-top:12px;font-size:18px;color:#8c97a8;font-weight:700}
.wall{display:grid;grid-template-columns:repeat(3,1fr);gap:22px 16px;margin-top:40px}
.wall figure{text-align:center}
.wall .wf{width:104px;height:104px;border-radius:50%;object-fit:cover;background:#1c212a;box-shadow:inset 0 0 0 2px #2e3644}
.wall figcaption{margin-top:6px;font-weight:700;font-size:18px}
</style></head><body><div class="stripes"></div>
<div class="l">
  <div class="team"><i class="crest"></i>${esc(me)}</div>
  <div class="tab">${next ? 'Next up' : esc(meta.season)}</div>
  <div class="opp">${esc(opp)}</div>
  <div class="rule"></div>
  ${next ? `<div class="meta"><div>${esc(longDate(next.scheduled))}</div><div>${esc(next.time)} <span>kick-off</span></div>
    <div>${esc(next.field.replace('Football Field', 'Football').replace('Hockey Field', 'Hockey'))}</div></div>` : ''}
</div>
<div class="foot">${standing ? `<div class="bug g">${esc(standing)}</div>` : ''}${lastLine ? `<div class="bug">Last: ${esc(lastLine)}</div>` : ''}</div>
<div class="r">${side}</div>
</body></html>`;

// ---- render ----
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: `${site}/card.png`, type: 'png' });
await browser.close();

// ---- the tags, written into the index.html that gets published ----
const title = next ? `${me} v ${opp} · ${longDate(next.scheduled)} ${next.time}` : `${me} · ${meta.season}`;
const desc = [standing && `${standing} in the ${meta.league}`, lastLine && `last: ${lastLine}`].filter(Boolean).join(' — ');
const img = base ? new URL('card.png', base).href : 'card.png';
const stamp = (process.env.GITHUB_SHA || String(Date.now())).slice(0, 8);   // new image URL per deploy
const tags = `
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}?v=${stamp}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
${base ? `<meta property="og:url" content="${esc(base)}">` : ''}
<meta name="twitter:card" content="summary_large_image">`;
const indexPath = `${site}/index.html`;
writeFileSync(indexPath, readFileSync(indexPath, 'utf8').replace('</title>', `</title>${tags}`));
console.log(`card.png + preview tags: "${title}" — ${desc}`);
