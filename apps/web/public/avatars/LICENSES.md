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

Not used, on purpose: TalkingHead's other sample avatars (`brunette.glb` is CC BY-NC 4.0 from
Ready Player Me; `avaturn.glb`, `avatarsdk.glb` and `vroid.glb` are non-commercial), photo or
selfie based generators, stock-actor scans, Mixamo animations.

Libraries: [TalkingHead](https://github.com/met4citizen/TalkingHead) 1.8.2 (MIT, Mika Suominen)
and [three.js](https://threejs.org) 0.186 (MIT), both bundled from npm, nothing loaded from a CDN
at runtime.
