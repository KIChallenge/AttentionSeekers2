# Stage voices

The stage plays one pre-rendered file per utterance (`scripts/stage-tts.ts`). Audio stays local
and gitignored; this file and the script are the only committed parts.

## Providers

| Provider | Role | Files |
| --- | --- | --- |
| Azure AI Speech (default) | Every utterance of every run, also the on-demand route for live runs | `<runId>/<lang>/<uttId>.mp3`, `manifest.json` |
| ElevenLabs (optional) | A showpiece span of the reference run, German only | `<runId>/<lang>/<uttId>.el.mp3`, `manifest.elevenlabs.json` |

The stage loads both manifests and plays the ElevenLabs file where one exists, Azure elsewhere,
for the same utterance id. The audio chip shows which provider voiced the current line; its
tooltip carries the attribution. The on-demand route `app/api/runs/[runId]/tts` always renders
with Azure, so a live run never depends on the ElevenLabs quota.

**Attribution:** voices in the ElevenLabs span are generated with ElevenLabs (elevenlabs.io) on
the free tier, which is non-commercial and requires this attribution.

## ElevenLabs voices

Model `eleven_multilingual_v2` (checked on `/v1/models`: German, style and speaker boost
supported; `eleven_v4` also lists German and can be tried with `ELEVENLABS_MODEL=eleven_v4`).
Output `mp3_44100_128`, `voice_settings` stability 0.5, similarity 0.75, style 0.15, speaker
boost on, speed per speaker below. One request per utterance, no request stitching.

All eleven are ElevenLabs **premade** voices (category `premade`, designed by ElevenLabs, not
clones of public figures), each verified for German (`de-DE`) on `eleven_multilingual_v2`. No
voice clones were created.

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

Speakers outside this table (other catalog institutions) stay on Azure.

### Why no Austrian or library voice

The voice library has native German and some Austrian (`de-AT`) voices, but on the free tier
the API rejects every library voice, also after adding it to the account:
`402 paid_plan_required: Free users cannot use library voices via the API` (probed 2026-11-05,
no characters charged). The eleven premade voices verified for German are exactly the eleven
speakers. With a paid plan, swap ids in `ELEVEN_VOICES` in `scripts/stage-tts.ts` for library
voices: prefer `de-AT` or `de-DE` voices of category `professional` or `generated` whose names
and descriptions do not reference a real person, never celebrity or impersonation voices, and
listen to their `preview_url` first (previews cost no characters). Keep one voice per
institution.

## Rendering

Azure base (all utterances, both languages; needed for the fallback):

```sh
pnpm --filter @sv/web stage:tts <runId>
```

ElevenLabs showpiece (the FR-S8 exchange the stage opens on plus neighbours, German):

```sh
pnpm --filter @sv/web stage:tts <runId> --provider elevenlabs --dry-run   # plan, no characters
pnpm --filter @sv/web stage:tts <runId> --provider elevenlabs --budget 8000
```

The script prints the planned span and characters, checks `/v1/user/subscription` before and
after, and refuses to start if the plan exceeds `--budget` or the remaining quota minus a 500
character reserve. Existing `.el.mp3` files are kept (use `--force` to redo). Any ElevenLabs
error falls back to Azure for that utterance. `--ids a,b` voices single utterances for tests.

### Full run after an upgrade

The free tier has 10,000 characters per month; the reference run is about 58,000 to 66,000
characters in German (`--span all --dry-run` prints the exact figure). The Creator plan has
100,000 characters per month; paid plans include a commercial licence (check the current terms
before dropping the attribution).

```sh
# 1. upgrade, then check the quota
curl -s -H "xi-api-key: $ELEVENLABS_API_KEY" https://api.elevenlabs.io/v1/user/subscription
# 2. optional: library voices (see above) in ELEVEN_VOICES
# 3. plan and render the whole German record; showpiece files already rendered are kept
pnpm --filter @sv/web stage:tts <runId> --provider elevenlabs --span all --budget 70000 --dry-run
pnpm --filter @sv/web stage:tts <runId> --provider elevenlabs --span all --budget 70000
# English as well (another ~60k characters): add --lang en
```

Keep voices consistent: change `ELEVEN_VOICES` only before a render and re-render the span with
`--force`, otherwise one institution speaks with two voices.
