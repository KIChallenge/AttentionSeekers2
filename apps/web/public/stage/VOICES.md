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
(`402 paid_plan_required`, probed 2026-11-05). The eleven ElevenLabs **premade** voices verified
for German (`de-DE`) are exactly the eleven speakers. They are designed by ElevenLabs, not clones
of public figures, and their ids are the same on every account. No voice clones were created.

| Speaker | Institution | Voice | Voice id | Category | Gender, age | Speed |
| --- | --- | --- | --- | --- | --- | --- |
| moderator | Moderation | Matilda | `XrExE9yKIg1WjnnlVkGX` | premade | female, middle-aged, professional alto | 1.00 |
| gm | Gesundheitsministerium | Daniel | `onwK4e9ZLuTAKqWW03F9` | premade | male, middle-aged, steady broadcaster | 1.00 |
| sv | Sozialversicherung | Lily | `pFZP5JQG7iQjIQuC4Bku` | premade | female, middle-aged, warm and clear | 1.03 |
| ak | Ärztekammer | Bill | `pqHfZKP75CvOlQylNhV4` | premade | male, older, mature and balanced | 0.97 |
| va | Vertragsärzt:innen | Eric | `cjVigY5qzO86Huf0OWal` | premade | male, middle-aged, smooth tenor | 1.04 |
| ka | Krankenanstalten | Laura | `FGY2WhTYpPnrIDTdsKH5` | premade | female, young, lively | 1.00 |
| pf | Pflegevertretung | Jessica | `cgSgspJ2msm6clMCkdW9` | premade | female, young, bright and warm | 1.02 |
| bl | Bundesländer | Roger | `CwhRBWXzGAHq8TQ4Fs17` | premade | male, middle-aged, resonant, laid-back | 0.98 |
| pv | Patientenvertretung | Liam | `TX3LPaxmHKxFdv7VOQHJ` | premade | male, young, energetic | 1.04 |
| fm | Finanzministerium | Brian | `nPczCjzI2devNBz1zQrb` | premade | male, middle-aged, deep | 0.96 |
| expert | Experte | Will | `bIHbv24MWmeRgasZH58o` | premade | male, young, relaxed | 0.98 |

Speakers outside this table (other catalog institutions) are voiced by Azure.

### Paid plan: library voices

With a paid plan the script picks native German library voices, Austrian (`de-AT`) first for
moderator, ministry, social insurance, chamber of physicians and federal states, one distinct
voice per institution, same gender as the premade seat, conversational, educational or
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
