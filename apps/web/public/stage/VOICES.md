# Stage voices

Every utterance on the stage is voiced the first time someone plays it and cached as one mp3.
Audio stays local and gitignored; this file, the voice table `lib/stage-voices.json` and the
scripts are the committed parts.

**Attribution:** voices marked ElevenLabs are generated with ElevenLabs (elevenlabs.io) on the
free tier, which is non-commercial and requires this attribution. The stage's audio chip
tooltip carries it, together with the characters used this month.

## How a line gets its voice

`GET /api/runs/<runId>/tts/<uttId>?lang=de|en` (`app/api/runs/[runId]/tts/[uttId]/route.ts`,
logic in `lib/stage-voice.ts`):

1. cached `public/stage/<runId>/<lang>/<uttId>.el.mp3`: served at once (byte ranges supported);
2. otherwise, while an ElevenLabs key, a voice for the speaker and quota (minus a 200 credit
   reserve) are there: rendered with ElevenLabs on the streaming endpoint, streamed to the
   listener while it is written to `<uttId>.el.mp3` and merged into `manifest.elevenlabs.json`
   (temp file plus rename);
3. otherwise, or on any ElevenLabs error: the cached Azure `<uttId>.mp3`, else an Azure render,
   cached and merged into `manifest.json`.

A whole-run Azure base therefore never blocks ElevenLabs; it is the instant fallback once the
quota is spent. `STAGE_TTS_PREFER_CACHED_AZURE=1` serves cached Azure files before rendering
ElevenLabs; `STAGE_TTS_LIVE_PROVIDER=azure` turns live ElevenLabs off. Run and utterance ids are
checked against strict patterns, only utterances already completed in the record are voiced,
nothing runs through a shell, and parallel requests for one utterance share one render.
Response headers: `X-Voice-Provider` (elevenlabs or azure), `X-Voice-Cache` (hit, wait, miss),
`Server-Timing` on renders. `?meta=1` reports `{provider, state}` and never renders.

The stage player requests the current line through this route only when it plays (stepping
through lines renders nothing), fetches the next two playlist entries once the current one is
audible, and asks `?meta=1` which provider voiced it for the chip. Amplitude-driven mouths and
the 3D figures read the same audio element as before. It no longer triggers a whole-run render;
`POST /api/runs/<runId>/tts` and `scripts/stage-tts.ts` remain for offline preparation.

`GET /api/tts/usage` returns the month's ElevenLabs usage from `/v1/user/subscription`, refreshed
at most every 60 s (stale-while-revalidate, plus what this server rendered since).

Measured on 2026-11-06 (dev server, headless Chrome, free tier): cold ElevenLabs render to first
audio 966 ms (`play()` to `playing`; on the server ElevenLabs answers the first byte in about
190 ms, record and quota checks take under 2 ms once warm); a prefetched next line 15 ms; cached
responses 5 to 17 ms. Before the quota became stale-while-revalidate a cold miss took 2.9 s.

## Model

Live: `eleven_turbo_v2_5` (from `lib/stage-voices.json`, override `ELEVENLABS_LIVE_MODEL`).
Streaming first-byte probe on `/v1/text-to-speech/<voice>/stream` with an 88 character German
line: turbo v2.5 257 ms, flash v2.5 364 ms, v4 turbo 352 ms. Turbo v2.5 lists German, takes
`language_code: "de"` and bills 0.5 credits per character, so the free 10,000 credits cover about
20,000 characters. Offline renders (`scripts/stage-tts.ts`) default to `eleven_multilingual_v2`
(1 credit per character, style and speaker boost). Settings: stability 0.5, similarity 0.75,
speed per speaker, style 0.15 and speaker boost only on multilingual v2; `mp3_44100_128`; one
request per utterance, no request stitching.

## Voice table

`lib/stage-voices.json`, written by `scripts/stage-voices.ts`:

```sh
pnpm --filter @sv/web stage:voices                  # print the pick for the account's plan
pnpm --filter @sv/web stage:voices --write          # write lib/stage-voices.json
pnpm --filter @sv/web stage:voices --assume-paid    # preview the library pick from a free account
pnpm --filter @sv/web stage:voices --designed-only  # library voices from voice design only
pnpm --filter @sv/web stage:voices --write --add    # paid: also add the picks to the account
```

The script uses listing endpoints only and never spends characters.

### Free tier (current): premade voices

The free tier rejects every library voice over the API, also after adding it to the account
(`402 paid_plan_required`, probed 2026-11-05), so only the 21 ElevenLabs **premade** voices are
usable. They are designed by ElevenLabs, not clones of public figures, and their ids are the same
on every account. No voice clones were created.

**One source of truth: `lib/stage-cast.ts`.** Every seat has one presentation gender there, and
the 3D figure (body pose set and hair: short cut for men, ponytail with a jaw-length fall for
women), the ElevenLabs voice and the Azure voices (de and en) all follow it.
`lib/stage-cast.test.ts` fails if any of them disagree, and `stage:voices --write` writes this
table from the cast. The 2D tile emblem is deliberately abstract and has no gender. The mix is
5 women and 6 men on the eleven core seats, 8 and 9 over all 17 seats.

| Speaker | Institution | Gender | ElevenLabs | Voice id | German verified | Azure de | Azure en |
| --- | --- | --- | --- | --- | --- | --- | --- |
| moderator | Moderation | female | Matilda | `XrExE9yKIg1WjnnlVkGX` | yes | de-AT-Ingrid | en-GB-Sonia |
| expert | Experte | male | Will | `bIHbv24MWmeRgasZH58o` | yes | de-DE-FlorianMultilingual | en-GB-Alfie |
| gm | Gesundheitsministerium | male | Daniel | `onwK4e9ZLuTAKqWW03F9` | yes | de-AT-Jonas | en-GB-Ryan |
| sv | Sozialversicherung | female | Lily | `pFZP5JQG7iQjIQuC4Bku` | yes | de-DE-Katja | en-GB-Libby |
| ak | Ärztekammer | male | Bill | `pqHfZKP75CvOlQylNhV4` | yes | de-DE-Conrad | en-GB-Thomas |
| va | Vertragsärzt:innen | male | Eric | `cjVigY5qzO86Huf0OWal` | yes | de-CH-Jan | en-GB-Elliot |
| ka | Krankenanstalten | female | Laura | `FGY2WhTYpPnrIDTdsKH5` | yes | de-DE-Amala | en-GB-Hollie |
| pf | Pflegevertretung | female | Jessica | `cgSgspJ2msm6clMCkdW9` | yes | de-DE-Elke | en-GB-Bella |
| bl | Bundesländer | male | Roger | `CwhRBWXzGAHq8TQ4Fs17` | yes | de-DE-Killian | en-GB-Oliver |
| pv | Patientenvertretung | female | Sarah | `EXAVITQu4vr4xnSDxMaL` | no, multilingual | de-CH-Leni | en-GB-Olivia |
| fm | Finanzministerium | male | Brian | `nPczCjzI2devNBz1zQrb` | yes | de-DE-Bernd | en-GB-Noah |
| nr | Gesetzgeber (optional) | female | (Azure only) | | | de-DE-Klarissa | en-GB-Abbi |
| ph | Public-Health-Expertise (optional) | female | Alice | `Xb7hH8MSUJpSbSDYk0k2` | no, multilingual | de-DE-SeraphinaMultilingual | en-GB-AdaMultilingual |
| abk | Arbeiterkammer (optional) | female | Bella | `hpp4J3VqNfWAUOO0d1Us` | no, multilingual | de-DE-Tanja | en-GB-Abbi |
| wk | Wirtschaftskammer (optional) | male | Liam | `TX3LPaxmHKxFdv7VOQHJ` | yes | de-DE-Klaus | en-GB-OllieMultilingual |
| lk | Landwirtschaftskammer (optional) | male | George | `JBFqnCBsd6RMkjVDRZzb` | no, multilingual | de-DE-Ralf | en-GB-Ethan |
| ind | Industrie/Pharma (optional) | male | Chris | `iP95p4xoKVk53GoZ742B` | no, multilingual | de-DE-Christoph | en-GB-Ethan |

Azure voices are `<name>Neural`. Only four premade voices are female and verified for German, so
pv and the optional women use premade voices that speak German through the multilingual models;
a 2026-11-06 check (one German sentence each on `eleven_turbo_v2_5`, transcribed back with Azure
speech-to-text) came back word for word at 0.93 to 0.95 confidence. en-GB has fewer adult
voices than seats: optional seats share some English voices, and `pickAzureVoices` swaps in an
unused voice of the same gender when two of them meet in one run.

**2026-11-06 change (gender bug):** pv looked and sounded female on Azure but spoke with a male
ElevenLabs voice (Liam); it now has Sarah, and its English Azure voice moved from a child voice
(Maisie) to Olivia. Every figure with hair used to wear the ponytail and the body pose set was a
coin flip per seat; both now follow the cast. The cached `<uttId>.el.mp3` (de) and `<uttId>.mp3`
(en) of pv were deleted from the cache and the manifests, so they re-render on the next play.

### Paid plan: library voices

With a paid plan the script picks native German library voices, Austrian (`de-AT`) first for
moderator, ministry, social insurance, chamber of physicians and federal states, one distinct
voice per institution, the gender from `lib/stage-cast.ts`, conversational, educational or
narration registers only. Library voices are recordings of consenting speakers (categories
`professional` and `high_quality`; the German library had no voice-design voices on
2026-11-06, so `--designed-only` falls back to premade). The filter drops every voice whose name
or description points at a public figure, celebrity, impression, parody, politician or actor,
and every voice titled with a full personal name. Speakers with no match keep their premade
voice. Listen to each pick's `preview_url` before writing (previews cost nothing) and record
the chosen ids, names and categories here.

Preview from the free account (`--assume-paid`, 2026-11-06), not written to the table:

| Speaker | Voice | Voice id | Category | Locale |
| --- | --- | --- | --- | --- |
| moderator | Anna | `wDvyXJwxWHsjOKSUVvpG` | professional | de-AT |
| gm | Benjamin | `gRJR8Fqocw86Vixo4cZV` | high_quality | de-AT |
| sv | SedaDa | `mekn71YL8kSYrEunOj4N` | professional | de-AT |
| ak | Chris | `l4QW1L3S9K8vu4mB7I0i` | high_quality | de-AT |
| bl | Peter | `LHOUp1qVxeUvxAUA7vdm` | professional | de-AT |
| va | Otto | `FTNCalFNG5bRnkkaP5Ug` | high_quality | de-DE |
| ka | Lea | `7eVMgwCnXydb3CikjV7a` | high_quality | de-DE |
| pf | Ava | `AnvlJBAqSLDzEevYr9Ap` | high_quality | de-DE |
| pv | Ben | `aTTiK3YzK3dXETpuDE2h` | high_quality | de-DE |
| fm | Mark | `fzqS9sNPYJhLlhsfDm0l` | high_quality | de-DE |
| expert | Alexander | `kkJxCnlRCckmfFvzDW5Q` | professional | de-DE |

Changing the table changes voices for lines rendered from then on. Delete the run's `*.el.mp3`
files (or re-render with `stage:tts --force`) so an institution does not speak with two voices.

## Offline rendering

Azure base (all utterances, both languages):

```sh
pnpm --filter @sv/web stage:tts <runId>
```

ElevenLabs span or whole run, ahead of time (voices from `lib/stage-voices.json`):

```sh
pnpm --filter @sv/web stage:tts <runId> --provider elevenlabs --dry-run   # plan, no characters
pnpm --filter @sv/web stage:tts <runId> --provider elevenlabs --budget 8000
pnpm --filter @sv/web stage:tts <runId> --provider elevenlabs --span all --budget 70000
```

The script prints the planned span and credits, checks `/v1/user/subscription` before and after,
and refuses to start if the plan exceeds `--budget` or the remaining quota minus a 500 credit
reserve. Existing `.el.mp3` files are kept (use `--force` to redo). Any ElevenLabs error falls
back to Azure for that utterance. `--ids a,b` voices single utterances. `ELEVENLABS_MODEL`
picks the offline model (for example `eleven_turbo_v2_5` to halve the cost).

The reference run is about 66,000 characters in German. The Creator plan has 100,000 characters
per month; paid plans include a commercial licence (check the current terms before dropping the
attribution).
