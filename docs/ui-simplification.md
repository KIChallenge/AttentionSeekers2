# UI simplification (branch `feat/ui-simplify`)

Status: 2026-11-06, night before the jury. Screenshots before and after live in the scratchpad
(`uisimp/before`, `uisimp/after`), 1440x900 and 1920x1080, run `reference-wartezeiten-presse`.

## Default disclosure level: Analyst

`docs/pitch.md` sets "Detailgrad Analyst" for both the desk and the projector, and steps 2 to 8
of the click path need things Executive hides: citation chips, reply links, the strategic panel,
the trajectory. So Analyst stays the default. The work below makes Analyst calm enough to carry
the path; Engineer keeps everything it had (prompts, retrieval traces, model ids, telemetry,
utterance ids, verifying models) and gains what moved out of Analyst. Executive is untouched
except where a shared component got quieter.

Rules applied on every screen:

- One primary question per screen, answered above the fold at 1440x900.
- One accent per meaning: success = verified or consensus, warning = contradicted or red line or
  blocking, info = exchange kinds, the agent hue = identity. Nothing else carries colour.
- Ids (`u2-10`, `c-1-02-1`, `rl-ak-1`, model ids) are Engineer-level or sit in a `title`.
- Requirement ids (FR-M9, FR-R8, CON-1) leave the UI copy; they live in the docs.
- Long lists collapse by default (`<details>`), with the count in the summary.
- No truncated label fragments: a label is either shown whole or replaced by a tooltip.

## Screen critiques

### 1. Negotiation `/runs/[runId]` (heart of the demo)

Primary question: "Who said what, in reply to whom, and where does the negotiation stand?"

Noise before: the full speaker timeline (350 px) sits above the transcript with twelve
truncated exchange labels ("Ple...", "T...", "Plenum · ..."); the roster repeats the institution
unit under every name and lists eight coalition rows of tiles; the right panel opens on
`u1-02` although the view starts at round 5, prints verifying-model verdicts in mono, and ends
with the mandate objective; every utterance header carries name, role, addressees, id, reply
pill with id and name, kind chip, red-line chip, proposal chips, model id; every citation chip
shows `w 0.55 · 18 Mon.`; the round summary is a four-cell grid even when three cells say
"keine"; lesson cards are open per round.

Changes:

- Timeline collapses to a compact strip (rows only, no label text) in the sticky header; one
  button expands it. Exchange labels render text only when the band is wide enough, otherwise
  the band keeps its tooltip and gets no fragment.
- Roster becomes a slim rail: tile, name, speaking indicator; the unit is a tooltip; coalitions
  live in a closed `<details>` with the count.
- Right panel defaults to the stand of the negotiation (agreement per topic, most binding
  conflict); selecting an utterance switches it to that utterance, with a way back. The
  utterance id, verifying models and telemetry move to Engineer.
- Utterance header: name, role, reply as "antwortet auf Ärztekammer", kind as quiet text,
  red-line chip only. Ids and model in Engineer. Citation chips compact in the transcript.
- Round summary: text and open conflicts first; agreement, failed proposals and new options in
  a closed details row. Red lines show their text, not their id.
- Lesson cards closed by default with the count.

### 2. Dashboard `/`

Primary question: "Which run do I open, and what came out of the reference run?"

Noise: four stat tiles that say 3, 2/3, 18/21, 6; four badges on the pinned card; two CTA
cards that duplicate the top bar; a mono line `id · 9 · 2 models` under every row.

Changes: tiles become one muted line; badges reduce to outcome and template; CTA cards go; the
mono line moves to Engineer; variant column goes (it is a filter).

### 3. Stage `/runs/[runId]/stage`

Primary question: "Who is speaking to whom right now?"

Noise: subtitle header with role, addressee, kind chip, reply with id, "Ausgewählter Austausch"
chip and an id link; the rail repeats the exchange. Not changed on this branch: the stage is
being reworked on its own branch (voices, meeting mode), so `components/stage/**` stays
untouched here. The stage only inherits the shared timeline's label rule (whole label or none).
Suggested for that branch: subtitle keeps speaker, addressee and reply by name; ids and the
exchange chip move to Engineer.

### 4. Analysis `/runs/[runId]/analysis`

Primary question: "Who moved, when, and who blocks?"

Noise: end-condition chip in the title row; incentive matrix and proposal list open below the
fold; red-line ids in the conflict cards. Changes: end condition becomes the subtitle; the
incentive matrix closes by default; red lines show text.

### 5. Agent card `/runs/[runId]/agents/[agentId]`

Primary question: "Where does this institution start, what will it never accept, and what does
it want?"

Noise: a long subtitle paragraph; a broken stance grid at 1440 (bar squeezed to 64 px, labels
wrapping); "Gespielt von" lists every utterance id; a footer of requirement ids. Changes: stance
row is a flex row with one line of numbers; the subtitle goes; utterance ids become a count with
a link (Engineer sees the list); model id to Engineer; the footer says what it means.

### 6. Outcome and result

Outcome: the four tiles show a lone "·" when a figure is missing; descriptor chips
(`measure_class`, `payer`, `15a`...) sit under every forecast. Changes: missing figures say
"nicht verfügbar"; descriptor chips move to Engineer. Result: model ids to Engineer.

### 7. Archive, setup room

Archive: facet lists show every institution; collapse after eight. Setup: model selectors per
party and the "angepasst" chip stay, the model id moves behind the chip at Analyst.

## Deliberately left

- The stage (2D tiles, 3D avatars, voices) and the replay player are untouched beyond shared
  components (timeline, utterance card, round summary, source chip).
- The inspector keeps its full layout: it is the Engineer screen by definition.
- No new strings; the few labels the new folds need reuse existing DE and EN entries.
- Executive level is unchanged except where a shared component got quieter; the stand panel
  (agreement per topic, binding conflict) now lives in the right rail at every level.
