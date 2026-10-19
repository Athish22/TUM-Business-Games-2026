# Test cases: German & English

18 cases in `cases.json`: 10 German, 6 English, 2 edge cases. Each has slides, what is said, and expected results.

## 1. Automated (analysis engine), 1 second
```
node tests/run.mjs            # all cases
node tests/run.mjs de-        # only German
```
`PASS` = as expected · `XFAIL` = known limitation (documented, not a bug) · `FAIL` = regression.

## 2. Manual (app or extension)
For each case there is:
- `decks/<id>.pptx`: upload it in step 1
- `scripts/<id>.txt`: read it aloud in **Record live** (press → at each `[Folie n]` / `[Slide n]`)
- `audio/<id>.wav`: or use **Upload audio** (English only; see below for German)

Compare the report with the "What to look for" column.

| Case | What it tests | What to look for |
|---|---|---|
| de-01-perfect | everything covered | 100%, no red chips, 0 fillers |
| de-02-skipped | skipped + half-mentioned point | ✗ „Fokus auf Mittelstand“, ~ „Hauptwettbewerber“ |
| de-03-fillers-fast | ähm/äh/also/halt/quasi, fast | filler fix + „langsamer sprechen“ |
| de-04-content-align | **upload** mode, no slide clicks | transcript lines land on the right slides |
| de-05-backtrack | going back a slide (← key) | slide 1 time includes both visits |
| de-06-um-not-filler | „um 12 Prozent“ | 0 fillers (German „um“ is not a filler) |
| de-07-long-sentence | 50-word sentence | quoted as hard to follow |
| de-08-denglisch | Forecast, Stakeholder, Go-Live | 100%, language = German |
| de-09-synonym | „neue Kunden“ vs „Neukunden“ | **known limitation**: shows missed |
| de-10-number-words | „zwölf“ vs „12%“ | **known limitation** (Whisper usually writes digits, so often fine live) |
| en-01-perfect | everything covered | 100% |
| en-02-skipped | skipped + hinted | ✗ Annual discount, ✗ Partner channel, ~ Free trial |
| en-03-fillers | um/uh/like/you know/I mean | 7 fillers + filler fix |
| en-04-slow | ~80 wpm | "Pick up the pace" |
| en-05-content-align | 5 slides, upload mode | every point covered, right slides |
| en-06-paraphrase | different words | **known limitation**: partial/missed |
| edge-01-empty | silence | no crash, 0% |
| edge-02-title-only | divider slide w/o bullets | no crash, 100% |

## 3. End-to-end results with real Whisper (base model, English audio)
All 7 English recordings produced the expected report (run on 2026-10-16). This run found and fixed two bugs:
Whisper chunks spanning a slide change, and Whisper merging words ("in appguided").

## German audio
No German Windows voice is installed, so German `.wav` files were not generated. Either read the
scripts aloud (best test anyway: real voice, real accent), or add a voice under
**Settings → Time & language → Speech → Add voices → Deutsch**, then run `python tests/make_assets.py` again.

## Product checks (extension)
- [ ] Load unpacked works, icon appears
- [ ] Mic prompt appears once; recording works
- [ ] Click icon on a Google Slides tab → deck imports
- [ ] PowerPoint Online: Download a copy → upload works
- [ ] Wi-Fi off after first model download → still transcribes (true offline)
- [ ] 10-minute rehearsal: transcription time and memory acceptable
