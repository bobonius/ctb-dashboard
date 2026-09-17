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
`home_score` and `away_score`. Add **one line** to `data/appearances.csv` for
your own match. Commit. The page recomputes the table, the boards, the chart and
the attendance grid from those rows on the next load.

The published page is read-only on purpose: it renders the data and offers no way
to change it, so there is nothing for a visitor to press.

### fixtures.csv

```
id,date,played_on,time,field,home,away,home_score,away_score,note
```

`id` is what lets you rename a team or move a match without anything breaking —
**do not remove it, and do not renumber rows.** `appearances.csv` points at
fixtures by `id`.

`phase` is 1 for the single round and 2 for the split after the winter break.
`group` is empty in phase 1, then `top` or `bottom`. A row with no phase counts
as phase 1, so the file read the same before the split existed.

`note` is free text and optional. Whatever you put there shows under that match
in *Our season*, so it is the place for "short two players", "moved to 1A",
"Sander's last game". Leave it empty and nothing is rendered.

A row counts as played once both score cells have a number. An empty pair means
the match is still ahead of you, whatever its date says.

### Logging a match

One line per match, not per player:

```
fixture_id,squad,goals,assists
5,"tom,stefan,niels,bob","tom:2,niels","stefan"
```

`squad` is everyone who played. `goals` and `assists` are ids, `:n` for more
than one. Quote any field with a comma in it. A scorer missing from `squad` is
taken to have played, because you cannot score in a match you were not in.

`formation` is the starting eleven, written **before** the match:

```
14,,,,"GK:Bob,CB:Tom,CB:Marlo,CM:Loek,LM:Odin,RM:Dani,ST:Jesse,BENCH:Stefan"
```

It lives in its own column rather than inside `squad`, because `squad` means who
played — a plan written there would hand everyone an appearance for a match that
has not kicked off. Create the row before the game with only the formation,
complete it afterwards with squad, goals and assists.

Labels repeat freely (`CB:Tom,CB:Marlo`). Anything starting with L or R is
placed on that side of its line; the rest keep the order you wrote. GK, LB, CB,
RB, LWB, RWB, SW, CDM, DM, LM, CM, RM, CAM, AM, LW, RW, ST, CF and SS know where
they belong on the pitch, `BENCH` goes to the strip underneath, and a label that
is none of these is listed under "Also" rather than dropped — the positions are
fluid and inventing one should cost nothing.

There is no row for players who missed a match — absence is simply not being
listed, which halves the typing. A fixture counts as logged the moment it has a
line, so the attendance grid can tell "did not play" from "not logged yet".

The ids come from `data/squad.csv` and are yours to choose. Short lowercase
names beat numbers: you will be typing them on a phone on the way home.

Two things the file cannot check itself, so the page does, quietly, under
Attendance: player goals that do not add up to the team's score, and ids that
appear in no squad row. Both are typos.

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
data/appearances.csv     one line per match, not per player
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

### The two phases

Everyone plays everyone once, and on 11 January the league splits: the top
eight and the bottom eight each play their own double round, **everyone back on
zero points**. So phase 2 is two separate competitions that happen to share an
evening.

The table has a Phase 1 / Phase 2 switch above it once phase-2 fixtures exist,
and shows two tables in phase 2. During phase 1 a blue line under eighth place
marks who is currently heading for the top group.

A phase-2 table starts with everyone level, so where a team finished the single
round is the last tiebreak. That is the only thing phase 1 carries forward —
points, goals and form all start again.

Phase-2 ids start at 1001. `appearances.csv` points at fixtures by id, so if
Playpass numbers its second competition from 1 again, reusing those ids would
silently reassign who played in September.

### How the position chart works

Every team's rank after every matchday that produced at least one result,
replayed from `fixtures.csv` in the browser. Nothing is stored: fix a score and
the whole history corrects itself on the next load.

A week counts as soon as one score is in, so a half-filled matchday still moves
the lines. Teams whose own result for that week is still missing keep their
position but are drawn dimmed, which is the honest reading — they have not
dropped, they have not played. Club Tower Brugge is the gold line.

One chart covers both phases. Before the break a team can move anywhere in the
sixteen. After it, each group is ranked inside itself and then offset — the top
group holds rows 1-8, the bottom group rows 9-16 — so the blue line is the one
thing nobody can cross, which is the whole point of the season. A node's number
is its row in that chart; the tooltip gives the rank within the group.

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
