// Minimal typings for the parts of TalkingHead 1.8.2 the 3D stage uses (the package ships JS
// only). See https://github.com/met4citizen/TalkingHead#talkinghead-class.

declare module "@met4citizen/talkinghead" {
  import type { Camera, Object3D, Scene, Vector3 } from "three";

  export interface MorphTargetState {
    realtime: number | null;
    needsUpdate: boolean;
  }

  export interface TalkingHeadOptions {
    avatarOnly?: boolean;
    avatarOnlyScene?: Scene | null;
    avatarOnlyCamera?: Camera | null;
    audioCtx?: AudioContext | null;
    lipsyncModules?: string[];
    lipsyncLang?: string;
    modelFPS?: number;
    avatarIdleEyeContact?: number;
    avatarIdleHeadMove?: number;
    avatarSpeakingEyeContact?: number;
    avatarSpeakingHeadMove?: number;
    avatarMood?: string;
  }

  export interface AvatarSpec {
    url: string;
    body?: "M" | "F";
    lipsyncLang?: string;
    avatarMood?: string;
    baseline?: Record<string, number>;
  }

  export interface GltfLike {
    scene: Object3D;
  }

  export class TalkingHead {
    constructor(node: HTMLElement, opt?: TalkingHeadOptions);
    armature: Object3D;
    objectHead: Object3D;
    objectLeftEye: Object3D;
    objectRightEye: Object3D;
    camera: Camera | null;
    mtAvatar: Record<string, MorphTargetState>;
    isSpeaking: boolean;
    speakTo: TalkingHead | Object3D | Vector3 | null;
    opt: TalkingHeadOptions;
    showAvatar(
      avatar: AvatarSpec,
      onprogress?: ((e: ProgressEvent) => void) | null,
      onpreprocess?: ((gltf: GltfLike) => void) | null,
    ): Promise<void>;
    animate(dt: number): void;
    lookAtCamera(ms: number): void;
    lookAhead(ms: number): void;
    makeEyeContact(ms: number): void;
    playGesture(name: string, dur?: number, mirror?: boolean, ms?: number): void;
    stopGesture(ms?: number): void;
    speakWithHands(delay?: number, prob?: number): void;
    setMood(mood: string): void;
    start(): void;
    stop(): void;
    dispose(): void;
  }
}

declare module "@met4citizen/talkinghead/modules/lipsync-de.mjs" {
  export class LipsyncDe {
    preProcessText(s: string): string;
    wordsToVisemes(w: string): { visemes: string[]; times: number[]; durations: number[] };
  }
}

declare module "@met4citizen/talkinghead/modules/lipsync-en.mjs" {
  export class LipsyncEn {
    preProcessText(s: string): string;
    wordsToVisemes(w: string): { visemes: string[]; times: number[]; durations: number[] };
  }
}
