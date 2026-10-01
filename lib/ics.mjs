// Our fixtures as an iCalendar file, built in the browser from the same rows the
// page renders. No server, no build step: the button makes the file on the spot,
// so it is never staler than fixtures.csv.
//
// Times are written as local Delft time with a TZID, not converted to UTC, so a
// 19:00 kick-off stays 19:00 on either side of the clock change in October. The
// VTIMEZONE block is what lets strict calendars (Outlook, older Androids) read
// that correctly. Every event has a UID built from the fixture id, so importing a
// fresh copy after a match was moved updates the event instead of adding a twin
// — in Apple and Outlook at least; Google Calendar's import tends to duplicate.

const TZ = 'Europe/Amsterdam';
const VTIMEZONE = [
  'BEGIN:VTIMEZONE', `TZID:${TZ}`,
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST',
  'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET',
  'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];

// RFC 5545: backslash, semicolon and comma are escaped in text; newlines become \n.
const text = (s) => String(s ?? '').replace(/[\\;,]/g, (c) => '\\' + c).replace(/\r?\n/g, '\\n');

// Lines longer than 75 octets must be folded: CRLF plus one space, then carry on.
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = []; let cur = '', len = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (len + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0; }
    cur += ch; len += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const local = (isoDate, hhmm) => `${isoDate.replace(/-/g, '')}T${hhmm.replace(':', '').padEnd(4, '0')}00`;
const plusMinutes = (hhmm, m) => {
  const [h, mi] = hhmm.split(':').map(Number); const t = h * 60 + mi + m;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

// A team social as a calendar event: its own UID space, so a dinner and a
// match can never overwrite each other. Only dated events get one.
function eventLines(e, meta, now) {
  if (!e.date) return [];
  // a trip: all-day, from the first day through the last (the end date in iCal
  // is the day after, exclusive)
  if (e.until) {
    const next = (d) => { const [y, m, dd] = d.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, dd + 1));
      return x.toISOString().slice(0, 10).replace(/-/g, ''); };
    return ['BEGIN:VEVENT', `UID:ctb-event-${e.id}@ctb-dashboard`, `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${next(e.until)}`,
      `SUMMARY:${text(`${meta.team}: ${e.title}${e.venue ? ` · ${e.venue}` : ''}`)}`,
      ...(e.notes?.length ? [`DESCRIPTION:${text(e.notes.join('\n'))}`] : []),
      'TRANSP:TRANSPARENT', 'END:VEVENT'];
  }
  const hhmm = (t, d) => (/^\d{1,2}:\d{2}$/.test(t) ? t.padStart(5, '0') : d);
  const start = hhmm(e.start, '19:00');
  const end = hhmm(e.end, plusMinutes(start, 120));
  const where = [e.venue, e.address].filter(Boolean).join(', ');
  const desc = [...(e.notes || []), e.url].filter(Boolean).join('\n');
  return [
    'BEGIN:VEVENT',
    `UID:ctb-event-${e.id}@ctb-dashboard`,
    `DTSTAMP:${now}`,
    `DTSTART;TZID=${TZ}:${local(e.date, start)}`,
    `DTEND;TZID=${TZ}:${local(e.date, end)}`,
    `SUMMARY:${text(`${meta.team}: ${e.title}${e.venue ? ` · ${e.venue}` : ''}`)}`,
    ...(where ? [`LOCATION:${text(where)}`] : []),
    ...(desc ? [`DESCRIPTION:${text(desc)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${text(`Tonight: ${e.title}`)}`, 'TRIGGER:-PT3H', 'END:VALARM',
    'END:VEVENT',
  ];
}

const wrap = (meta, events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Club Tower Brugge//ctb-dashboard//EN',
  'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${text(meta.team)}`, `X-WR-TIMEZONE:${TZ}`,
  ...VTIMEZONE, ...events, 'END:VCALENDAR']
  .map(fold).join('\r\n') + '\r\n';

// One social on its own, for the "add this one" button on the Social page.
export const eventCalendar = (e, meta) => wrap(meta, eventLines(e, meta, stamp(new Date())));

export function fixturesCalendar(fixtures, meta, { isPlayed, whenPlayed }, socials = []) {
  const me = meta.team;
  const now = stamp(new Date());
  const ours = fixtures.filter((f) => f.home === me || f.away === me)
    .sort((a, b) => (whenPlayed(a) < whenPlayed(b) ? -1 : 1));

  const events = ours.flatMap((f) => {
    const opp = f.home === me ? f.away : f.home;
    const time = /^\d{1,2}:\d{2}$/.test(f.time) ? f.time.padStart(5, '0') : '19:00';
    const day = whenPlayed(f);
    let summary = `${me} v ${opp}`;
    if (isPlayed(f)) {
      const us = f.home === me ? f.hs : f.as, them = f.home === me ? f.as : f.hs;
      summary = `${me} ${us}–${them} ${opp}`;
    }
    const where = [meta.venue, f.field].filter(Boolean).join(' — ');
    const desc = [`${meta.league} ${meta.season}`, f.note, meta.sourceUrl].filter(Boolean).join('\n');
    return [
      'BEGIN:VEVENT',
      `UID:ctb-fixture-${f.id}@ctb-dashboard`,
      `DTSTAMP:${now}`,
      `DTSTART;TZID=${TZ}:${local(day, time)}`,
      `DTEND;TZID=${TZ}:${local(day, plusMinutes(time, 60))}`,
      `SUMMARY:${text(summary)}`,
      `LOCATION:${text(where)}`,
      `DESCRIPTION:${text(desc)}`,
      // a nudge the afternoon of the match, which is when people make plans
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${text(`Tonight: v ${opp}`)}`, 'TRIGGER:-PT3H', 'END:VALARM',
      'END:VEVENT',
    ];
  });

  return wrap(meta, [...events, ...socials.flatMap((e) => eventLines(e, meta, now))]);
}
