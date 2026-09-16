# Club Tower Brugge — MEL 26/27

Team dashboard for the Monday Evening League at X TU Delft. Static site, no build
step, no dependencies, no scheduled jobs. Four CSVs and a JSON file are the whole
database; you edit them and commit, and the page renders whatever is in them.

## Getting it running

**Publish this repo.** Settings → Pages → Source: *Deploy from a branch*, branch
`main`, folder `/ (root)`. The site appears at `https://<you>.github.io/<repo>/`.
That is the entire setup.

## The weekly routine

After the matches, open `data/fixtures.csv` and type the scores into
`home_score` and `away_score`. Add a line to `data/appearances.csv` for each of
your own players who turned up — `fixture_id,player_id,status,goals,assists`.
Commit. The page recomputes the table, the form column and the position chart
from those rows on the next load.

The published page is read-only on purpose: it renders the data and offers no way
to change it, so there is nothing for a visitor to press.

### fixtures.csv

```
id,date,played_on,time,field,home,away,home_score,away_score,note
```

`id` is what lets you rename a team or move a match without anything breaking —
**do not remove it, and do not renumber rows.** `appearances.csv` points at
fixtures by `id`.

`note` is free text and optional. Whatever you put there shows under that match
in *Our season*, so it is the place for "short two players", "moved to 1A",
"Sander's last game". Leave it empty and nothing is rendered.

A row counts as played once both score cells have a number. An empty pair means
the match is still ahead of you, whatever its date says.

## Working on it locally

`index.html` loads ES modules and fetches the CSVs, so **opening the file
directly off disk will not work** — the browser blocks both over `file://`. You
need the folder served. In VS Code, install the *Live Server* extension, right
click `index.html`, Open with Live Server. No terminal needed.

Nothing writes to `main` except you, so your local copy only goes stale if you
committed from somewhere else.

## Layout

```
index.html               shell only, no logic and no data
lib/league.mjs           the league engine
lib/render.mjs           everything that touches the DOM
lib/csv.mjs              CSV reader
data/meta.json           team, season, venue, message for the group
data/fixtures.csv        the season: one row per match, all teams
data/squad.csv           id, name, active
data/appearances.csv     one row per player per match
```

### The one rule

`lib/league.mjs` owns every number. The table, the form column, the position
chart and the panel under a team row all come out of it. If you ever compute a
standings figure inside `render.mjs` instead, the page will contradict itself
somewhere by February and you will not be able to tell which half is lying.

### How postponements work

A fixture carries two dates. `date` is when it was scheduled, `played_on` is when
it actually happened. Move a match by changing `date`; fill in `played_on` if it
ended up on a different evening. The chart and the table replay results by
`played_on`, so a rearranged match still lands on the matchday it was played on
rather than the one it was meant for.

### How the position chart works

Every team's rank after every matchday that produced at least one result,
replayed from `fixtures.csv` in the browser. Nothing is stored: fix a score and
the whole history corrects itself on the next load.

A week counts as soon as one score is in, so a half-filled matchday still moves
the lines. Teams whose own result for that week is still missing keep their
position but are drawn dimmed, which is the honest reading — they have not
dropped, they have not played. Club Tower Brugge is the gold line.

### Why the modules carry a `?v=` stamp

GitHub Pages caches `.mjs` for ten minutes. Without the stamp a deploy can leave
a stale `lib/render.mjs` running against a fresh `index.html`, which fails in
whatever way the two versions happen to disagree. `index.html` stamps the entry
module with a timestamp and it rides through `import.meta.url` into the rest, so
the whole module graph is always from one deploy.

## Deliberately not done

No token in the browser to let the page commit for itself; it would be visible in
the page source. No scrape of the Playpass standings; that means maintaining a
scraper against someone else's markup for a number already derivable from the
results you are typing anyway.
