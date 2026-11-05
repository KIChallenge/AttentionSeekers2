# Preregistration: baseline reference-class forecast of health-policy draft outcomes

Version 1.0, written 2026-11-05 before any label distribution, forecast or score was computed.
At the time of writing only the raw Ministerialentwurf list (Parlament list 81) and the bill
lists (list 101) had been downloaded; no ME had been linked, labelled or scored. Any change
after this point is recorded in the "Deviations" section at the end with its date and reason,
and the original text above it is not edited.

Requirement anchors: uc2-requirements.md FR-J1a, FR-J2, FR-J3, FR-J5, FR-J7, FR-J12;
research/papers-addendum.md Part III entries 70, 73, 74 and "Proposed PRD changes" 1 to 6.

## 1. Question

Given only the proposer ministry, the governing coalition and the date of a health-related
Ministerialentwurf (ME, the first public draft), does a counted reference-class base rate
forecast its legislative outcome better than the status-quo baseline (the overall historical
base rate), out of sample and without looking ahead?

This is reference-class forecasting with counted base rates. No model is trained, and no
parameter is fitted to outcomes. Every choice below (fields, class order, minimum class size,
smoothing prior, threshold, horizon) is fixed here before scoring.

## 2. Unit and population

- Unit of forecasting (FR-J1a): the measure from its first public draft, the ME, not the tabled
  bill.
- Population: every ME in Parlament list 81 with Einlangen from 2008-01-01 that is in health
  scope by the rule in `src/svforecast/scope.py` (proposer in the health-ministry lineage
  BMGFJ, BMG, BMGF, BMASGK, BMSGPK, BMASGPK with a health or social-insurance topic, or any
  other ministry with a health topic; the regexes are in that file and are part of this
  preregistration as of this date).
- Episode: MEs that lead to the same parliamentary bill or the same BGBl number form one
  episode (connected component). Unlinked MEs are singleton episodes. The episode's first-draft
  date is the earliest Einlangen of its MEs. The episode is the scoring unit and the unit of
  leave-one-out.

## 3. Label (outcome), from the legislative record only

Schema enum (`schema/outcome-descriptor.schema.json`): implemented, partially_implemented,
rejected, lapsed, superseded, unknown. Horizon H = 730 days from the first-draft date.

- enacted: a linked bill (RV, Initiativantrag or Ausschussantrag) reached a Bundesgesetzblatt
  entry and its Nationalrat third reading lies within H.
- implemented: enacted, text similarity between the ME law text and the final adopted text is
  at least 0.75, and no VfGH repeal of the act was found within H.
- partially_implemented: enacted and (text similarity below 0.75, or a VfGH repeal of
  provisions of the act was found within H).
- Text similarity: both texts reduced to normalised lines (HTML block elements, lowercased,
  whitespace collapsed, empty lines dropped); similarity = difflib SequenceMatcher ratio
  (2M/T) over the two line sequences with autojunk off. Final adopted text = "Geändert im
  Plenum" document if present, else "Geändert im Ausschuss", else the bill's own Gesetzestext.
  The 0.75 threshold is fixed here without having looked at any similarity value.
- If enacted but either text is missing, the label is implemented with
  `modification_basis = no_text` and `needs_human = true`. Such episodes enter the binary score
  and are excluded from the 3-class score.
- rejected: a linked bill was voted down or formally withdrawn.
- superseded: not enacted, and a later in-scope ME of the same proposer group, drafted within H
  and with title-token Jaccard similarity of at least 0.5, was enacted.
- lapsed: every other not-enacted case, including enactment after H (flagged `enacted_late`).
- unknown (censored): first-draft date later than the data cutoff minus H (cutoff 2026-11-05,
  so drafts after 2024-11-05). Censored episodes are kept in the registry and excluded from
  scoring entirely, enacted or not, so that fast-passing drafts do not bias the scored set.
- Links that rest only on a title match (no identifier link) are flagged `needs_human`. They are
  used as labelled, and a sensitivity run without them is reported.

Scoring targets:
- Primary: binary, enacted (implemented or partially_implemented) versus not enacted
  (lapsed, rejected, superseded).
- Secondary: 3-class {implemented, partially_implemented, not_implemented}.

## 4. Knowability date (leakage control)

Every episode's label is treated as knowable only at first-draft date + H, whatever the class.
A uniform lag is used because using the enactment date for enacted episodes and the horizon
end for lapsed ones would let enacted cases enter the reference pool earlier and bias the base
rate upward.

## 5. Forecaster A (primary): hierarchical reference class

Features: proposer_group (health_ministry, social_ministry, finance_ministry,
other_ministry), coalition at first-draft date (from `src/svforecast/govtable.py`), and date
(through the time-respecting pool and the coalition, which is a function of date).

For a target episode with first-draft date t, the pool is every non-censored episode, other
than the target, whose knowability date is before t. Class levels, finest first:

1. same proposer_group and same coalition
2. same coalition
3. same proposer_group
4. all pool episodes (this level is the status-quo baseline)

Use the first level with n >= 5 (FR-J3 threshold). Class probability for each outcome category
c of K categories: (n_c + 0.5) / (n + 0.5 K), i.e. the Jeffreys posterior mean. The 0.5 prior is
fixed, not fitted. Every reported rate also carries a 90 percent Jeffreys equal-tailed interval
and a 90 percent Wilson interval.

## 6. Forecaster B (declared variant, secondary): k weighted analogs

Same pool. Weight of each pool episode = (1 + [same proposer_group] + [same coalition]) times
0.5 ^ (years between the two first-draft dates / 6). Probability = weighted Jeffreys mean
(weighted counts plus 0.5 per category). Weights and half-life are fixed here. Only A and B are
scored; no other variant will be reported as a result.

## 7. Status-quo baseline

Level 4 of forecaster A: the Jeffreys-smoothed overall base rate of all pool episodes at t.

## 8. Scoring

- An episode is scored only if its pool has at least 10 episodes (burn-in).
- Binary Brier score: mean of (p - y)^2. 3-class Brier score: mean over episodes of the sum over
  the three categories of (p_c - y_c)^2 (range 0 to 2).
- Brier skill score: BSS = 1 - BS_model / BS_statusquo.
- Paired difference: D = BS_statusquo - BS_model (positive means the baseline forecaster helps).
- Leave-one-episode-out and time-respecting by construction (section 4, 5).
- Uncertainty: cluster bootstrap by legislative period (GP), 2000 resamples, seed 20261105,
  90 percent percentile intervals for BS, BSS and D. Because only about five GPs exist, an
  episode-level bootstrap (same settings) is reported beside it as secondary, and the GP
  bootstrap is primary.

## 9. Decision rule and named outcomes

On the primary target, forecaster A, GP bootstrap, 90 percent interval of D:
- interval entirely above 0: "class membership beats the status-quo baseline";
- interval entirely below 0: "class membership is worse than the status-quo baseline";
- otherwise: "inconclusive at this N". This outcome is a named, reportable result, not a failure.

The press-feature ablation of FR-J7 is out of scope here and will reuse this exact protocol.

## 10. Reported regardless of outcome

N of registry, N of episodes, N scored, label distribution, BS / BSS / D with both intervals for
A and B on both targets, the sensitivity run without title-only links, and the forecasts for the
two backtest fixtures (SV-OG 2018, XXVI 75/ME; PrimVG 2017, XXV 312/ME).

## Deviations

**Deviation 1 (2026-11-05, before any label, label distribution or score was computed):
scope rule v1.0 replaced by v1.1.** State of knowledge at the time: the ME detail pages and the
ME-to-bill links had been fetched; the list of in-scope titles and which of them had an
identifier link to a bill had been looked at; no outcome label had been computed and no bill
status had been tabulated for the in-scope set.

Reasons: (a) the v1.0 clause "THEMEN contains Gesundheit" never fired, because the real
Parlament topic label is "Gesundheit und Ernährung", which also covers food and veterinary law;
(b) matching the long description pulled in about 75 tax, justice, labour and pension omnibus
drafts (e.g. Abgabenänderungsgesetze, Zivilverfahrens-Novelle) that only list one health statute
among many amended laws; (c) two regex substrings misfired ("ivf" inside
"Alternativfinanzierungsgesetz", "pflege" inside "Rechtspfleger"); (d) title-only matching
then missed standard health-law abbreviations (GuKG, KAKuG, PatVG, GBRG, DokuG, OTA, Eltern-Kind-Pass).

v1.1 (in `src/svforecast/scope.py`): match on the title only; HEALTH_RE extended with those
abbreviations and the two substring fixes; SV_RE extended with "Notarversicherung" (companion
law of the SV-OG); every draft of a pure health ministry (BMGFJ, BMG, BMGF) is in scope unless
its title is veterinary, food, gene-technology or family/youth law. The in-scope set went from
240 (v1.0) to 165 (v1.1). Everything else in this preregistration is unchanged.
A link-quality guard was added in the same step: a title-only link is refused when both titles
carry a year and the years differ ("SVÄG 2011" is not "SVÄG 2012").

**Deviation 2 (2026-11-05, before any label or score was computed): text-similarity measure.**
State of knowledge: five line-level similarity values had been printed (0.08 to 0.43) while the
text step was running, and one pair was inspected by eye. The inspection showed that the
Parlament HTML of an ME and of its RV break the same paragraph into different visual lines and
carry different cover pages ("Entwurf" vs "... der Beilagen ... Regierungsvorlage"), so the
line-level SequenceMatcher ratio measured layout, not content. Replacement: drop everything up
to the enacting formula ("Der Nationalrat hat beschlossen"), tokenise into words, and take the
share of the draft's word 5-grams that survive in the final text (containment, |A and B| / |A|).
The 0.75 threshold is kept unchanged and was not tuned.
Amendment to this entry, same day: a symmetric Dice coefficient of the 5-gram sets was tried
first and printed for about 40 pairs. It fails when several MEs are folded into one bill (the
SV-OG RV absorbs 75/ME, 76/ME and 88/ME, so each draft looks "changed" only because the bill is
larger). Containment measures what the label is about, how much of the drafted text survived,
and was adopted before any label was built or any score computed. Added material in the bill
does not lower containment; that is a stated limitation.

**Deviation 3 (2026-11-05, before any score was computed; a first label table had been
printed and inspected for errors).** The inspection found three data-handling errors, not rule
choices, and they were fixed:
(a) "enacted" required a BGBl link on the Parlament status. Some passed bills (status 5, both
chambers, e.g. 1435 d.B. XXVII, 2445 d.B. XXIV) carry no BGBl link in the Parlament data. Rule
now: enacted = Parlament status 5, or a third-reading stage plus a Bundesrat decision stage; a
missing BGBl link is flagged `needs_human: enacted_but_no_bgbl_link_in_parlament_data`.
(b) Title-matched Ausschussberichte (AUB, the committee route used for most COVID-19 and many
health laws) have no status of their own; the AUB is now resolved to its main item
("Hauptgegenstand", usually an Initiativantrag) and labelled from that item.
(c) "rejected" matched any rejected side motion in the plenary (e.g. a rejected motion to send
a bill back to committee). Rule now: only "Gesetzesvorschlag in zweiter/dritter Lesung abgelehnt"
or a withdrawal of the bill itself, and never when the bill has status 5.
The 0.75 threshold, the horizon, the classes and the forecasting rules were not touched.
