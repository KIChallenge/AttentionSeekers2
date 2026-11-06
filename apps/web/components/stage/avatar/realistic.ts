// "Realistisch" figure style (opt-in, PRD 2.15): textured, artist-made Microsoft Rocketbox
// characters (MIT, see public/avatars/LICENSES.md) instead of the stylized MakeHuman figure.
// None of them is a scan of a real person and none carries a name; the seat keeps its plate
// with institution and role only.
//
// The Rocketbox rig uses Mixamo bone names but 3ds Max Biped bone frames, a 0.01 root scale
// and Biped parenting (clavicles under the neck, thighs under the spine). TalkingHead's pose
// templates are absolute local rotations authored for Mixamo frames, so the rig is rebuilt at
// load: every Mixamo bone gets the bind frame of the same bone in the stylized base figure,
// swung onto the Rocketbox bone direction, the hierarchy follows Mixamo, and the skin is
// rebound. The mesh does not move; only the frames its bones are expressed in change.

import * as THREE from "three";
import type { FigureStyle } from "./figure-style";

/**
 * Bind frames of the reference rig (figure.glb, MPFB, Mixamo frames): world rotation as a
 * quaternion (x, y, z, w), then the unit direction to the bone's child where it has one.
 * Generated from the node transforms of public/avatars/figure.glb.
 */
const REF: Record<string, number[]> = {
  Hips: [0.00999, 0.01486, 0.01509, 0.99973, -0.0296, 0.9993, 0.0209],
  Spine: [-0.05056, -0.00186, 9e-5, 0.99872, 0, 0.9949, -0.1011],
  Spine1: [-0.11126, 0, 0, 0.99379, 0, 0.9752, -0.2214],
  Spine2: [0.06437, 0, 0, 0.99793, 0, 0.9917, 0.1286],
  Neck: [-0.03344, 0, 0, 0.99944, 0.0109, 0.957, 0.29],
  Head: [0.07191, 0.0007, 0.0007, 0.99741],
  LeftShoulder: [0.50753, 0.53298, -0.49173, 0.46535, 0.9987, 0.0013, -0.0518],
  LeftArm: [0.69054, 0.26713, -0.62808, 0.2394, 0.6699, -0.7425, -0.0047],
  LeftForeArm: [0.74178, 0.04323, -0.45626, 0.48962, 0.5108, -0.5172, 0.6868],
  LeftHand: [0.62564, -0.19152, -0.59736, 0.46375, 0.4269, -0.5025, 0.7518],
  LeftUpLeg: [0.02473, -0.03789, -0.99745, 0.05527, 0.1084, -0.991, 0.0783],
  LeftLeg: [0.01371, 0.03296, -0.99833, 0.0454, 0.0915, -0.9937, -0.0647],
  LeftFoot: [0.05353, -0.51099, -0.85624, 0.05366, 0.0373, -0.4723, 0.8806],
  LeftToeBase: [0.05366, -0.72449, -0.68718, 0.00458],
  RightShoulder: [0.50753, -0.53298, 0.49173, 0.46535, -0.9987, 0.0013, -0.0518],
  RightArm: [0.69054, -0.26713, 0.62808, 0.2394, -0.6699, -0.7425, -0.0047],
  RightForeArm: [0.74178, -0.04323, 0.45626, 0.48962, -0.5108, -0.5172, 0.6868],
  RightHand: [0.62564, 0.19152, 0.59736, 0.46375, -0.4269, -0.5025, 0.7518],
  RightUpLeg: [0.02473, 0.03789, 0.99745, 0.05527, -0.1084, -0.991, 0.0783],
  RightLeg: [0.01371, -0.03296, 0.99833, 0.0454, -0.0915, -0.9937, -0.0647],
  RightFoot: [0.05356, 0.51099, 0.85624, 0.05367, -0.0373, -0.4723, 0.8806],
  RightToeBase: [0.05366, 0.72449, 0.68718, 0.00458],
  LeftHandThumb1: [0.52289, -0.6023, -0.6023, -0.0324, -0.6706, -0.2721, 0.6901],
  LeftHandThumb2: [0.69492, -0.45532, -0.45532, 0.32009, -0.3413, -0.3795, 0.86],
  LeftHandThumb3: [0.87587, -0.20217, -0.20217, 0.38872],
  LeftHandIndex1: [0.54938, -0.31095, -0.69761, 0.33888, 0.1344, -0.576, 0.8064],
  LeftHandIndex2: [0.67956, -0.26964, -0.62415, 0.27556, -0.0257, -0.7026, 0.7111],
  LeftHandIndex3: [0.728, -0.27663, -0.5847, 0.22721],
  LeftHandMiddle1: [0.62173, -0.16615, -0.70267, 0.30348, 0.2194, -0.7604, 0.6113],
  LeftHandMiddle2: [0.71713, -0.17673, -0.61139, 0.28407, 0.0933, -0.7785, 0.6207],
  LeftHandMiddle3: [0.8111, -0.15586, -0.50803, 0.24441],
  LeftHandRing1: [0.71382, -0.0406, -0.63164, 0.29974, 0.3187, -0.8166, 0.4813],
  LeftHandRing2: [0.80306, -0.07144, -0.52545, 0.27184, 0.1717, -0.8423, 0.511],
  LeftHandRing3: [0.79521, -0.08799, -0.56413, 0.20413],
  LeftHandPinky1: [0.74545, -0.00608, -0.62381, 0.23481, 0.2828, -0.8902, 0.357],
  LeftHandPinky2: [0.76118, -0.07454, -0.61766, 0.18315, 0.1145, -0.9224, 0.3689],
  LeftHandPinky3: [0.8166, -0.04641, -0.54569, 0.18228],
  RightHandThumb1: [0.52289, 0.6023, 0.6023, -0.0324, 0.6706, -0.2721, 0.6901],
  RightHandThumb2: [0.69492, 0.45532, 0.45532, 0.32009, 0.3413, -0.3795, 0.86],
  RightHandThumb3: [0.87587, 0.20217, 0.20217, 0.38872],
  RightHandIndex1: [0.54938, 0.31095, 0.69761, 0.33888, -0.1344, -0.576, 0.8064],
  RightHandIndex2: [0.67955, 0.26964, 0.62415, 0.27556, 0.0257, -0.7026, 0.7111],
  RightHandIndex3: [0.728, 0.27663, 0.58469, 0.22721],
  RightHandMiddle1: [0.62173, 0.16615, 0.70267, 0.30348, -0.2194, -0.7604, 0.6113],
  RightHandMiddle2: [0.71713, 0.17673, 0.61139, 0.28407, -0.0933, -0.7785, 0.6207],
  RightHandMiddle3: [0.8111, 0.15586, 0.50803, 0.24441],
  RightHandRing1: [0.71382, 0.0406, 0.63164, 0.29974, -0.3187, -0.8166, 0.4813],
  RightHandRing2: [0.80306, 0.07144, 0.52545, 0.27184, -0.1717, -0.8423, 0.511],
  RightHandRing3: [0.79521, 0.08799, 0.56413, 0.20413],
  RightHandPinky1: [0.74544, 0.00608, 0.62381, 0.23481, -0.2828, -0.8902, 0.357],
  RightHandPinky2: [0.76118, 0.07454, 0.61766, 0.18315, -0.1145, -0.9224, 0.3689],
  RightHandPinky3: [0.8166, 0.04641, 0.54569, 0.18228],
};

/** Child each bone points at (the direction REF stores); leaves inherit their parent's swing. */
export const MIXAMO_CHILD: Record<string, string> = (() => {
  const c: Record<string, string> = {
    Hips: "Spine",
    Spine: "Spine1",
    Spine1: "Spine2",
    Spine2: "Neck",
    Neck: "Head",
  };
  for (const s of ["Left", "Right"]) {
    Object.assign(c, {
      [`${s}Shoulder`]: `${s}Arm`,
      [`${s}Arm`]: `${s}ForeArm`,
      [`${s}ForeArm`]: `${s}Hand`,
      [`${s}Hand`]: `${s}HandMiddle1`,
      [`${s}UpLeg`]: `${s}Leg`,
      [`${s}Leg`]: `${s}Foot`,
      [`${s}Foot`]: `${s}ToeBase`,
    });
    for (const f of ["Thumb", "Index", "Middle", "Ring", "Pinky"]) {
      c[`${s}Hand${f}1`] = `${s}Hand${f}2`;
      c[`${s}Hand${f}2`] = `${s}Hand${f}3`;
    }
  }
  return c;
})();

/** Mixamo parent for bones Biped parents elsewhere. */
const REPARENT: Record<string, string> = {
  LeftShoulder: "Spine2",
  RightShoulder: "Spine2",
  LeftUpLeg: "Hips",
  RightUpLeg: "Hips",
};

/** TalkingHead's pose templates put the hips at y = 1 m. */
const TEMPLATE_HIPS_Y = 1;

/**
 * Rebuild a Rocketbox rig into Mixamo frames in place (see the header). Call on the loaded
 * glTF scene before TalkingHead reads it.
 */
export function mixamoize(root: THREE.Object3D) {
  const skinned: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh);
  });
  const skeletons = [...new Set(skinned.map((m) => m.skeleton))];
  // The file is loaded in its bind pose. (Skeleton.pose() is not used: it treats the scaled,
  // turned Biped root as identity and would fold the whole rig into the hips.)
  root.updateMatrixWorld(true);
  const get = (n: string) => root.getObjectByName(n);

  // TalkingHead looks the eyes up by these names (gaze targets, avatar height).
  // (GLTFLoader turns the spaces in node names into underscores)
  const le = get("Bip01_LEye") ?? get("Bip01 LEye");
  const re = get("Bip01_REye") ?? get("Bip01 REye");
  if (le) le.name = "LeftEye";
  if (re) re.name = "RightEye";

  for (const [b, p] of Object.entries(REPARENT)) {
    const bone = get(b);
    const parent = get(p);
    if (bone && parent && bone.parent !== parent) parent.attach(bone);
  }
  root.updateMatrixWorld(true);

  const bones: THREE.Bone[] = [];
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
  });
  const oldW = new Map(bones.map((b) => [b, b.matrixWorld.clone()]));
  const pos = (o: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);

  // Swing of each Mixamo bone from the reference direction onto this rig's direction.
  const swing = new Map<string, THREE.Quaternion>();
  const id = new THREE.Quaternion();
  for (const [name, r] of Object.entries(REF)) {
    const bone = get(name);
    const child = MIXAMO_CHILD[name] ? get(MIXAMO_CHILD[name]) : undefined;
    if (bone && child && r.length === 7) {
      const to = pos(child).sub(pos(bone)).normalize();
      const from = new THREE.Vector3(r[4], r[5], r[6]).normalize();
      swing.set(name, new THREE.Quaternion().setFromUnitVectors(from, to));
    } else {
      const parent = bone?.parent?.name ?? "";
      swing.set(name, swing.get(parent) ?? id);
    }
  }

  const newW = new Map<THREE.Bone, THREE.Matrix4>();
  const one = new THREE.Vector3(1, 1, 1);
  for (const b of bones) {
    const r = REF[b.name];
    if (!r) {
      newW.set(b, oldW.get(b) as THREE.Matrix4);
      continue;
    }
    const q = new THREE.Quaternion(r[0], r[1], r[2], r[3]).normalize();
    q.premultiply(swing.get(b.name) ?? id);
    newW.set(b, new THREE.Matrix4().compose(pos(b), q, one));
  }

  // The top of the rig (Biped root, scaled 0.01 and turned) becomes a plain offset, so that
  // the templates' absolute hip height lands where this figure's hips are.
  const hips = get("Hips");
  const top = hips?.parent;
  if (hips && top && top !== root) {
    top.position.set(0, pos(hips).y - TEMPLATE_HIPS_Y, 0);
    top.quaternion.identity();
    top.scale.set(1, 1, 1);
    top.updateMatrixWorld(true);
  }

  const inv = new THREE.Matrix4();
  for (const b of bones) {
    const parentW =
      b.parent && newW.has(b.parent as THREE.Bone)
        ? (newW.get(b.parent as THREE.Bone) as THREE.Matrix4)
        : (b.parent?.matrixWorld ?? new THREE.Matrix4());
    inv
      .copy(parentW)
      .invert()
      .multiply(newW.get(b) as THREE.Matrix4);
    inv.decompose(b.position, b.quaternion, b.scale);
  }
  root.updateMatrixWorld(true);
  // Keep what every bone does to the mesh in the loaded pose: the file's rest pose is a
  // relaxed stance baked over a T-pose bind, so the inverse binds carry that offset.
  for (const sk of skeletons) {
    sk.boneInverses = sk.bones.map((b, i) => {
      const was = oldW.get(b);
      const now = newW.get(b);
      const ibm = sk.boneInverses[i] as THREE.Matrix4;
      if (!was || !now) return ibm;
      return now.clone().invert().multiply(was).multiply(ibm);
    });
  }
}

/** Skin texels: warm hue, moderately saturated, not dark (leather and wood stay clothing). */
const SKIN_MASK = /* glsl */ `
  float sMax = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
  float sMin = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
  float sSat = (sMax - sMin) / max(sMax, 1e-3);
  float skin = step(diffuseColor.b, diffuseColor.g) * step(diffuseColor.g, diffuseColor.r)
    * smoothstep(0.38, 0.5, sMax) * smoothstep(0.12, 0.2, sSat) * (1.0 - smoothstep(0.62, 0.75, sSat));
`;

function patch(
  mat: THREE.MeshStandardMaterial,
  key: string,
  uniforms: Record<string, THREE.IUniform>,
  glsl: string,
) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    const decl = Object.keys(uniforms)
      .map((u) => `uniform vec3 ${u};`)
      .join("\n");
    shader.fragmentShader = `${decl}\n${shader.fragmentShader}`.replace(
      "#include <map_fragment>",
      `#include <map_fragment>\n${glsl}`,
    );
  };
  mat.customProgramCacheKey = () => key;
  mat.needsUpdate = true;
}

/**
 * Per-seat variation of a realistic figure, on the GPU so the textures stay shared: clothing
 * recoloured toward the institution colour (texels outside the skin mask), a skin tone shift,
 * and a hair tint on the hair cards.
 */
export function tintRealistic(root: THREE.Object3D, st: FigureStyle) {
  const suit = new THREE.Color(st.suit);
  const skin = new THREE.Color(st.skinShift);
  const hair = new THREE.Color(st.hair ?? "#ffffff");
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.frustumCulled = false;
    const src = m.material as THREE.MeshStandardMaterial;
    const name = (src.name ?? "").toLowerCase();
    const mat = src.clone();
    m.material = mat;
    if (name.endsWith("_body")) {
      patch(
        mat,
        "rb-body",
        { uSuit: { value: suit }, uSkin: { value: skin } },
        `
        ${SKIN_MASK}
        float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 cloth = mix(diffuseColor.rgb, uSuit * (0.35 + 1.5 * lum), 0.78);
        diffuseColor.rgb = mix(cloth, diffuseColor.rgb * uSkin, skin);
      `,
      );
    } else if (name.endsWith("_head")) {
      // uniform on the face: a per-texel mask leaves blotches where make-up or shadow is baked
      patch(
        mat,
        "rb-head",
        { uSkin: { value: skin } },
        `
        diffuseColor.rgb *= uSkin;
      `,
      );
    } else if (name.endsWith("_opacity")) {
      // hair cards, lashes and brows: alpha-tested so they sort cleanly in every viewport
      mat.transparent = false;
      mat.alphaTest = 0.35;
      mat.depthWrite = true;
      patch(
        mat,
        "rb-hair",
        { uHair: { value: hair } },
        `
        diffuseColor.rgb *= uHair;
      `,
      );
    }
  });
}

/** One rebuild per loaded glTF: Rocketbox rig into Mixamo frames, then the seat's tints. */
export function prepareRealistic(root: THREE.Object3D, st: FigureStyle) {
  mixamoize(root);
  tintRealistic(root, st);
}
