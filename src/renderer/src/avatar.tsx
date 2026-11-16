import type { BotAvatarHue } from "@lunabot/contracts/ipc";
import { render } from "@solidjs/web";
import { For, flush, Show } from "solid-js";
import { MASCOT_COUNT, type MascotFaceKind, type MascotPart, mascotAt, mascotFaceGeometry } from "./mascots";

export type AvatarMotion = "hover" | "always" | "idle" | "working" | "connecting";
export type AvatarState = "idle" | "thinking" | "working" | "alert" | "sleep" | "connecting";
/** A rendered pose: a state with keyframes, or "rest" for a still avatar. */
export type AvatarPose = AvatarState | "rest";

export interface AvatarProfile {
  /** Index of the mascot in the catalog. */
  mascot: number;
  color: number;
}

const COLOR_COUNT = 8;
const CYCLE_OFFSET_SECONDS = 0.5;
/** Candidate avatars offered together, each with a different mascot. */
const CANDIDATE_COUNT = 12;

/** Stored hues map onto the eight palette slots (Brasa, Ambar, Musgo, Lagoa, Mare, Ametista, Orquidea, Nevoa). */
const HUE_COLOR_INDEX: Readonly<Record<BotAvatarHue, number>> = {
  0: 0,
  30: 1,
  55: 1,
  100: 2,
  150: 2,
  185: 3,
  215: 4,
  245: 5,
  280: 5,
  320: 6,
};

export const AVATAR_HUE_OPTIONS: ReadonlyArray<{
  hue: BotAvatarHue;
  label: string;
}> = [
  { hue: 0, label: "Red" },
  { hue: 30, label: "Orange" },
  { hue: 55, label: "Yellow" },
  { hue: 100, label: "Lime" },
  { hue: 150, label: "Green" },
  { hue: 185, label: "Cyan" },
  { hue: 215, label: "Blue" },
  { hue: 245, label: "Indigo" },
  { hue: 280, label: "Violet" },
  { hue: 320, label: "Magenta" },
];

export function avatarProfile(seed: string, hue: BotAvatarHue | null): AvatarProfile {
  return {
    mascot: stableIndex(`${seed}:mascot`, MASCOT_COUNT),
    color: hue === null ? stableIndex(`${seed}:color`, COLOR_COUNT) : HUE_COLOR_INDEX[hue],
  };
}

export function avatarColorToken(color: number): string {
  return `var(--lunabot-avatar-${color + 1})`;
}

export function avatarHueSwatch(hue: BotAvatarHue): string {
  return avatarColorToken(HUE_COLOR_INDEX[hue]);
}

export function avatarHeadColor(seed: string, hue: BotAvatarHue | null): string {
  return avatarColorToken(avatarProfile(seed, hue).color);
}

/** The current seed first, then seeds that each give a different mascot. */
export function avatarCandidateSeeds(botId: string, currentSeed: string, batch: number): string[] {
  const candidates = [currentSeed];
  const usedMascots = new Set<number>([avatarProfile(currentSeed, null).mascot]);
  let index = 1;

  while (candidates.length < CANDIDATE_COUNT) {
    const candidate = `${botId}:avatar:${batch}:${index}`;
    index += 1;
    if (candidates.includes(candidate)) continue;
    const { mascot } = avatarProfile(candidate, null);
    if (usedMascots.has(mascot)) continue;
    usedMascots.add(mascot);
    candidates.push(candidate);
  }

  return candidates;
}

/** Motion phase for CSS animation-delay: a negative offset starts the keyframes part-way through. */
export function avatarAnimationPhase(animationOffset: number | undefined, cycleOffset: number | undefined): number {
  return -((animationOffset ?? 0) + (cycleOffset ?? 0) * CYCLE_OFFSET_SECONDS);
}

/** Where in its 4 second cycle a bot starts, so a row of bots does not blink and grimace in unison. */
export function avatarSeedPhase(seed: string): number {
  return -(stableIndex(`${seed}:phase`, 40) / 10);
}

export function createStaticAvatarSvg(seed: string, hue: BotAvatarHue | null): SVGSVGElement {
  const host = document.createElement("span");
  const dispose = mountStaticAvatar(host, seed, hue);
  const svg = host.querySelector("svg");
  if (!svg) {
    dispose();
    throw new Error("Avatar did not render an SVG.");
  }
  const result = svg.cloneNode(true);
  if (!(result instanceof SVGSVGElement)) {
    dispose();
    throw new Error("Avatar did not clone an SVG.");
  }
  result.setAttribute("focusable", "false");
  dispose();
  return result;
}

function mountStaticAvatar(host: HTMLElement, seed: string, hue: BotAvatarHue | null): () => void {
  const profile = avatarProfile(seed, hue);
  const dispose = render(() => <AvatarArt mascot={profile.mascot} color={profile.color} pose="rest" />, host);
  flush();
  if (!host.querySelector("svg")) {
    dispose();
    throw new Error("Avatar did not render an SVG.");
  }
  return dispose;
}

/** The face a pose shows: working, alert and sleeping have their own, every other pose keeps the neutral one. */
export function avatarFaceKind(pose: AvatarPose): MascotFaceKind {
  if (pose === "working") return "working";
  if (pose === "alert") return "alert";
  if (pose === "sleep") return "sleeping";
  return "neutral";
}

export function AvatarArt(props: { mascot: number; color: number; pose: AvatarPose; phase?: number }) {
  const definition = () => mascotAt(props.mascot);
  const face = () => mascotFaceGeometry(definition().face, avatarFaceKind(props.pose));
  const origin = () => `--mascot-origin: ${definition().origin ?? "center"};`;

  return (
    <svg
      class="avatar-svg"
      viewBox="-6 -8 76 76"
      aria-hidden="true"
      data-mascot={definition().id}
      data-state={props.pose}
      style={`--avatar-color: var(--lunabot-avatar-${props.color + 1}); --avatar-phase: ${props.phase ?? 0}s;`}
    >
      <g
        class="mascot-all"
        data-animation={definition().animateAll ? definition().animation : undefined}
        style={origin()}
      >
        <g class="avatar-body">
          <For each={definition().body}>{(part) => <MascotPath part={part} />}</For>
        </g>
        <Show when={definition().accessory.length > 0}>
          <g
            class="mascot-accessory"
            data-animation={definition().animateAll ? undefined : definition().animation}
            style={origin()}
          >
            <For each={definition().accessory}>{(part) => <MascotPath part={part} />}</For>
          </g>
        </Show>
        <g class="avatar-face">
          <g class="avatar-eyes">
            <For each={face().eyes}>
              {(eye) => (
                <g class="avatar-eye">
                  <For each={eye}>{(part) => <MascotPath part={part} />}</For>
                </g>
              )}
            </For>
          </g>
          <g class="avatar-mouth">
            <For each={face().mouth}>{(part) => <MascotPath part={part} />}</For>
          </g>
        </g>
      </g>
      <g class="avatar-badge">
        <For each={face().badge}>{(part) => <MascotPath part={part} />}</For>
      </g>
    </svg>
  );
}

function MascotPath(props: { part: MascotPart }) {
  return (
    <path
      d={props.part.d}
      transform={props.part.transform}
      class={partClass(props.part)}
      stroke-width={props.part.strokeWidth}
    />
  );
}

function partClass(part: MascotPart): string {
  const fill = part.fill ? `avatar-fill-${part.fill}` : "avatar-fill-none";
  return part.stroke ? `${fill} avatar-stroke-${part.stroke}` : fill;
}

function stableIndex(value: string, length: number): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % length;
}
