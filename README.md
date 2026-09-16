# Club Tower Brugge — MEL 26/27

Team dashboard for the Monday Evening League at X TU Delft. Static site, no build
step, no dependencies. Results come from a Google Sheet, pulled in automatically
once a week by a GitHub Action.

## Getting it running

1. **Publish this repo.** Settings → Pages → Source: *Deploy from a branch*,
   branch `main`, folder `/ (root)`. Use the branch deploy rather than the
   Actions-based one, so a Pages failure can never be confused with a data
   failure. The site appears at `https://<you>.github.io/<repo>/`.

2. **Publish your results sheet.** In the sheet: File → Share → *Publish to web*,
   pick the results tab, format CSV, publish. Copy the URL. It should end in
   `output=csv`.

3. **Tell the Action where it is.** Settings → Secrets and variables → Actions →
   *Variables* tab → New repository variable, named `SHEET_CSV_URL`, pasted
   value. A variable, not a secret: it shows up in logs either way, and a
   published sheet is public already.

4. **Run it once by hand.** Actions tab → *Update season data* → Run workflow.
   Check the log. Until `SHEET_CSV_URL` exists the sync step does nothing and
   exits cleanly, so this is safe to try at any point.

The sheet needs columns for `id`, `date`, `home`, `away`, `home_score` and
`away_score`. Other spellings are accepted (`hs`, `home goals`, `listed first`
and so on), and extra columns are ignored. **Do not remove the `id` column.** It
is what lets you rename a team or move a match without anything breaking.

## The weekly routine

Type scores into the sheet as they come in. Tuesday morning the Action pulls
them, recomputes the position history, and commits. You do nothing.

After your own match, open the site, hit **Log a match**, mark who played and who
scored, then copy the CSV it gives you and paste it over `data/appearances.csv`.
That is the only part that needs a commit from you, and it is the part the sheet
cannot check, because the logger reconciles player goals against the team score.

## Working on it locally

`index.html` loads ES modules and fetches the CSVs, so **opening the file
directly off disk will not work** — the browser blocks both over `file://`.
You need the folder served. In VS Code, install the *Live Server* extension,
right click `index.html`, Open with Live Server. No terminal needed.

The Action commits to `main` on its own schedule, so your local copy goes stale
without you touching anything. **Fetch and pull before every session.** That is
the whole cost of working locally.

## Layout

```
index.html               shell only, no logic and no data
lib/league.mjs           the league engine
lib/render.mjs           everything that touches the DOM
lib/csv.mjs              CSV reader and writer
data/meta.json           team, season, venue, message for the group
data/fixtures.csv        overwritten by the sync job
data/squad.csv           id, name, active
data/appearances.csv     one row per player per match
history/positions.csv    the position graph's data
scripts/sync.mjs         sheet → fixtures.csv
scripts/snapshot.mjs     fixtures.csv → positions.csv
```

### The one rule

`lib/league.mjs` is imported by the browser **and** by `scripts/snapshot.mjs`
under Node. One copy of the standings logic, two callers. If you write the table
calculation a second time anywhere, the two will drift apart by February and you
will not be able to tell which one is lying.

### How postponements work

A fixture carries two dates. `date` is when it is scheduled, `played_on` is when
it actually happened. Postponing a match means moving `date` forward in the
sheet. That removes it from the earlier week's completeness check, so that week
can still count as complete, while `played_on` keeps the table replay honest.

### Why the position graph has gaps

A matchday is only plotted when every fixture scheduled up to that point has a
score. Skip a week of data entry and the line skips it too, rather than showing
a false dip caused by teams whose results are missing. To fill a gap without
backfilling the results, add a row to `history/positions.csv` with
`source=manual` and the numbers off Playpass. Manual rows are never overwritten
and are drawn hollow on the chart.

## Worth doing later

- **Log matches from your phone.** An issue form in `.github/ISSUE_TEMPLATE/`
  plus a workflow that parses the issue and updates `appearances.csv` would turn
  match logging into filling in four boxes in the GitHub mobile app.
- **Keep the standalone export.** The single-file version of this dashboard is
  still useful for the group chat and doubles as an offline backup of a season
  that otherwise lives only in a repo and a Google Sheet.

## Deliberately not done

No token in the browser to let the page commit for itself; it would be visible
in the page source. No headless-browser scrape of the Playpass standings; that
means maintaining a scraper against someone else's markup for a number already
derivable from results you are typing anyway.
