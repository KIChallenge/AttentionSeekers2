# Avatar assets: sources and licences

The 3D stage (PRD 2.15) shows one stylized figure per institution, plus moderation and the
expert. Every figure is the same generic base model, recoloured and varied at runtime. None is
modelled on, scanned from or generated from a real person, and none carries a personal name:
each figure is labelled by institution code, institution name and delegate role only
(CON-1, CON-2, FR-S7).

| File | Source | Licence | Notes |
|---|---|---|---|
| `figure.glb` (about 3 MB) | `avatars/mpfb.glb` from [met4citizen/TalkingHead](https://github.com/met4citizen/TalkingHead) at commit `6318ff8c798e4a661fcd70c9373c4ab789c822bb`, SHA-256 `63c645a2a863b9972e9a9c2ed576a1de4c390b8475508e1473e69c87a3ee299c` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Made with Blender and the [MPFB](https://static.makehumancommunity.org/mpfb.html) (MakeHuman) extension, as stated in the TalkingHead README credits. Parametric MakeHuman base mesh, Mixamo-compatible rig, 52 ARKit and 15 Oculus viseme blend shapes. |

Changes made by `apps/web/scripts/avatar-asset.ts` (`pnpm --filter @sv/web avatar:asset`):
skin, clothing, hair, teeth and tongue textures removed (the stage paints flat toon colours, so
no photographic skin ships with the repo); geometry quantized and meshopt-compressed. Bones,
blend shapes and the eye texture are unchanged. At runtime the stage varies clay tone, clothing
colour (the institution colour), hair colour or no hair, body proportions and glasses.

## Realistic figures (opt-in, "Realistisch")

The stage header can switch the 3D and meeting views to realistic figures (the
"Stilisiert | Realistisch" toggle, or `?figures=realistic`; the default stays stylized). These
are characters from the [Microsoft Rocketbox avatar library](https://github.com/microsoft/Microsoft-Rocketbox),
released by Microsoft under the MIT licence (Copyright (c) 2020 Microsoft). They are fictional,
artist-made characters: the library paper states that "Microsoft Rocketbox avatars are based on
sculpting" (Gonzalez-Franco et al., 2020, Frontiers in Virtual Reality,
[10.3389/frvir.2020.561558](https://doi.org/10.3389/frvir.2020.561558)), so they are not scans
of real people. Library ids such as `Female_Adult_07` are catalogue numbers, not personal names;
the files here carry neutral names only, and the stage labels each seat by institution and role.

| File | Rocketbox source | Converted by | SHA-256 |
|---|---|---|---|
| `realistic/female-a.glb` (4.5 MB) | `Female_Adult_07` | shipped as `assets/avatars/ananya.glb` in [927tanmay/react-ai-voice-avatar](https://github.com/927tanmay/react-ai-voice-avatar) (MIT) | `da87409e17292434ce468113888e40e1ce2259ccfe27214a775f8b1cd58066dd` |
| `realistic/male-a.glb` (4.7 MB) | `Male_Adult_04` | same project, shipped as `aarav.glb` | `ebe6b1596256f314d1356cfc2f42d28203b5bf1864d0bf139845cb9d13ee6500` |
| `realistic/female-b.glb` (5.0 MB) | `Assets/Avatars/Adults/Female_Adult_01/Export/Female_Adult_01_facial.fbx` | us, with that project's `scripts/convert-rocketbox.py` (MIT), unchanged, `--texture-size 512` | `1dbab911602b64c24fad4ada4cb13eed887b4bfb1583bdb953a9dd253ad09b09` |
| `realistic/female-c.glb` (5.3 MB) | `Female_Adult_04`, `_facial.fbx` | same | `c3402d2a0cf686153bf8d0f6e922a0f8141b7f7bd03b4158604a71f63d12ae2d` |
| `realistic/male-b.glb` (4.3 MB) | `Male_Adult_01`, `_facial.fbx` | same | `dfc49f6b85f8b331951e68fd072b0a13715e8015715a0b6fc24204384be8ba02` |
| `realistic/male-c.glb` (4.3 MB) | `Male_Adult_08`, `_facial.fbx` | same | `e36be2c7f892595b69d1abe17edf84a79309180427210ecf6079aaa7ff378f83` |

The conversion renames the Biped skeleton to Mixamo bone names and the facial blend shapes to the
52 ARKit and 15 Oculus viseme names (the ARKit set is Rocketbox's own June 2022 release), bakes a
relaxed standing pose and repacks the textures at 512 px; it changes no geometry. At runtime
(`components/stage/avatar/realistic.ts`) the rig is re-expressed in Mixamo bone frames so that
TalkingHead's poses apply, the clothing is recoloured toward the institution colour, and skin and
hair get a mild per-seat tint. About 27 MB in total, served from `public/` like the base figure.

MIT notice, as the licence requires for the Rocketbox assets ("Copyright (c) 2020 Microsoft")
and for the converter and the two converted files ("Copyright (c) 2026 Tanmay (927tanmay) and
contributors"):

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software
> and associated documentation files (the "Software"), to deal in the Software without
> restriction, including without limitation the rights to use, copy, modify, merge, publish,
> distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
> Software is furnished to do so, subject to the following conditions: The above copyright
> notice and this permission notice shall be included in all copies or substantial portions of
> the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
> PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
> LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
> OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
> DEALINGS IN THE SOFTWARE.

Not used, on purpose: TalkingHead's other sample avatars (`brunette.glb` is CC BY-NC 4.0 from
Ready Player Me; `avaturn.glb`, `avatarsdk.glb` and `vroid.glb` are non-commercial), photo or
selfie based generators, stock-actor scans, Mixamo animations.

Libraries: [TalkingHead](https://github.com/met4citizen/TalkingHead) 1.8.2 (MIT, Mika Suominen)
and [three.js](https://threejs.org) 0.186 (MIT), both bundled from npm, nothing loaded from a CDN
at runtime.
