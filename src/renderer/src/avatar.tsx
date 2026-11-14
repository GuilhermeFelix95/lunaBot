import type { BotAvatarHue } from "@lunabot/contracts/ipc";
import { render } from "@solidjs/web";
import { For, flush, Show } from "solid-js";
import { activeTheme, type ResolvedTheme } from "./theme";

export type AvatarMotion = "hover" | "always" | "idle" | "working" | "connecting";
export type AvatarState = "idle" | "thinking" | "working" | "alert" | "sleep" | "connecting";
/** A rendered pose: a state with keyframes, or "rest" for a still avatar. */
export type AvatarPose = AvatarState | "rest";
export type AvatarFamily = "fases" | "monolito" | "quadrantes";

export interface AvatarProfile {
  shape: number;
  expression: number;
  color: number;
}

const SILHOUETTE_COUNT = 7;
const COLOR_COUNT = 8;
const CYCLE_OFFSET_SECONDS = 0.5;
/** Eye centres sit this far (times the face scale) on each side of the face centre. */
const EYE_OFFSET = 15;
/** Eye half-width factor applied to the expression's rx. */
const EYE_WIDTH = 0.9;
/** Mouth centre sits this far below the face centre (times the face scale). */
const MOUTH_OFFSET = 16;
export const MOUTH_STROKE = 2.6;

const FAMILY_BY_THEME: Record<ResolvedTheme, AvatarFamily> = {
  eclipse: "fases",
  papel: "monolito",
  quadrante: "quadrantes",
};

interface Silhouette {
  id: string;
  body: string;
  /** Subtracted from the body with the mask. */
  cut?: string;
  /** Face centre x, face centre y and face scale. */
  face: readonly [x: number, y: number, scale: number];
  /** Eyes and mouth are filled in the body colour instead of cut out. */
  ownEyes?: true;
}

interface FamilyDefinition {
  silhouettes: readonly Silhouette[];
  /** Share of min(rx, ry) used as the eye corner radius. */
  eyeCorner: number;
}

const FAMILIES: Record<AvatarFamily, FamilyDefinition> = {
  fases: {
    eyeCorner: 1,
    silhouettes: [
      { id: "cheia", body: "M50 10A40 40 0 1 1 50 90A40 40 0 1 1 50 10Z", face: [50, 52, 1] },
      {
        id: "crescente",
        body: "M50 10A40 40 0 1 1 50 90A40 40 0 1 1 50 10Z",
        cut: "M39 36A31 31 0 1 0 101 36A31 31 0 1 0 39 36Z",
        face: [30, 62, 0.7],
      },
      { id: "quarto", body: "M50 10A40 40 0 0 0 50 90Z", face: [32, 52, 0.8] },
      { id: "gibosa", body: "M72 16.6A40 40 0 1 0 72 83.4Z", face: [44, 52, 0.95] },
      {
        id: "anel",
        body: "M50 10A40 40 0 1 1 50 90A40 40 0 1 1 50 10ZM50 26A24 24 0 1 0 50 74A24 24 0 1 0 50 26Z",
        face: [50, 52, 0.8],
        ownEyes: true,
      },
      { id: "domo", body: "M8 74A42 42 0 0 1 92 74Z", face: [50, 47, 0.9] },
      { id: "ovo", body: "M50 8A32 42 0 1 1 50 92A32 42 0 1 1 50 8Z", face: [50, 50, 0.95] },
    ],
  },
  monolito: {
    eyeCorner: 0.35,
    silhouettes: [
      {
        id: "bloco",
        body: "M20 12H80A8 8 0 0 1 88 20V80A8 8 0 0 1 80 88H20A8 8 0 0 1 12 80V20A8 8 0 0 1 20 12Z",
        face: [50, 50, 1],
      },
      { id: "arco", body: "M20 90V50A30 30 0 0 1 80 50V90Z", face: [50, 58, 0.9] },
      { id: "pilula", body: "M30 24H70A26 26 0 0 1 70 76H30A26 26 0 0 1 30 24Z", face: [50, 50, 0.85] },
      { id: "hexagone", body: "M50 8L88 29V71L50 92L12 71V29Z", face: [50, 50, 0.95] },
      { id: "losango", body: "M50 6L94 50L50 94L6 50Z", face: [50, 50, 0.75] },
      { id: "chanfrein", body: "M30 10H70L90 30V70L70 90H30L10 70V30Z", face: [50, 50, 1] },
      { id: "meia-base", body: "M8 28A42 42 0 0 0 92 28Z", face: [50, 42, 0.9] },
    ],
  },
  quadrantes: {
    eyeCorner: 0,
    silhouettes: [
      { id: "quadrado", body: "M12 12H88V88H12Z", face: [50, 50, 1] },
      { id: "circulo", body: "M50 10A40 40 0 1 1 50 90A40 40 0 1 1 50 10Z", face: [50, 50, 1] },
      { id: "meio", body: "M50 10A40 40 0 0 0 50 90Z", face: [32, 50, 0.8] },
      { id: "cunha", body: "M10 90H90L10 10Z", face: [31, 66, 0.65] },
      { id: "quadrant", body: "M12 88V12A76 76 0 0 1 88 88Z", face: [38, 62, 0.65] },
      { id: "croix", body: "M35 10H65V35H90V65H65V90H35V65H10V35H35Z", face: [50, 50, 0.8] },
      { id: "chanfrein2", body: "M12 12H64L88 36V88H12Z", face: [48, 56, 0.9] },
    ],
  },
};

type EyeSpec = readonly [rx: number, ry: number, tilt: number];

/** Expression table in fixed order. The second eye is optional and defaults to the first. */
const EXPRESSIONS: ReadonlyArray<readonly [name: string, eye: EyeSpec, secondEye?: EyeSpec]> = [
  ["neutre", [4, 5, 0]],
  ["attentif", [3, 6.5, 0]],
  ["surpris", [5.5, 6.5, 0]],
  ["excite", [5, 7, -8]],
  ["heureux", [4.2, 2.4, 10]],
  ["hilare", [5, 2, 16]],
  ["colere", [5, 2.2, 24]],
  ["triste", [3.4, 5.5, -22]],
  ["effraye", [5, 7.5, 0]],
  ["mefiant", [3.4, 5, 0], [3.4, 2, 0]],
  ["confus", [3, 5.5, -14], [4, 2.4, 12]],
  ["curieux", [3.6, 6.5, -6], [3, 5.5, -6]],
  ["fier", [4.5, 2, 14]],
  ["timide", [2.6, 3.8, 0]],
  ["blase", [4.5, 1.6, 0]],
  ["somnolent", [3.2, 2.6, 0]],
];

/** Mouth path per expression, in a local frame centred on (0, 0). Filled shapes are filled and stroked. */
const MOUTHS: ReadonlyArray<readonly [d: string, filled: boolean]> = [
  ["M-3.5 0H3.5", false],
  ["M-2.5 0H2.5", false],
  ["M0 -3.5A3 3.5 0 1 1 0 3.5A3 3.5 0 1 1 0 -3.5Z", true],
  ["M-5 -1Q0 7 5 -1Z", true],
  ["M-5 -1Q0 4 5 -1", false],
  ["M-6 -2Q0 8 6 -2Z", true],
  ["M-4 2Q0 -2 4 2", false],
  ["M-3.5 2.5Q0 -1.5 3.5 2.5", false],
  ["M0 -4.5A3.2 4.5 0 1 1 0 4.5A3.2 4.5 0 1 1 0 -4.5Z", true],
  ["M-4 1L4 -1", false],
  ["M-4.5 0Q-2.2 -3 0 0T4.5 0", false],
  ["M0 -2A2 2 0 1 1 0 2A2 2 0 1 1 0 -2Z", true],
  ["M-4.5 1Q0 1 4.5 -2", false],
  ["M-2 0H2", false],
  ["M-4.5 0H4.5", false],
  ["M0 -1.6A1.4 1.6 0 1 1 0 1.6A1.4 1.6 0 1 1 0 -1.6Z", true],
];

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

export function avatarFamilyFor(theme: ResolvedTheme): AvatarFamily {
  return FAMILY_BY_THEME[theme];
}

export function avatarProfile(seed: string, hue: BotAvatarHue | null): AvatarProfile {
  return {
    shape: stableIndex(`${seed}:shape`, SILHOUETTE_COUNT),
    expression: stableIndex(`${seed}:expression`, EXPRESSIONS.length),
    color: hue === null ? stableIndex(`${seed}:color`, COLOR_COUNT) : HUE_COLOR_INDEX[hue],
  };
}

/** A silhouette chosen by its index, or by its name ("cercle" is the first silhouette of every family). */
export type SilhouetteChoice = { kind: "index"; index: number } | { kind: "name"; name: string };

/** Resolves a SilhouetteChoice to a silhouette index of the family. */
export function avatarShapeIndex(family: AvatarFamily, shape: SilhouetteChoice | undefined, fallback: number): number {
  if (shape === undefined) return fallback;
  if (shape.kind === "index") return ((shape.index % SILHOUETTE_COUNT) + SILHOUETTE_COUNT) % SILHOUETTE_COUNT;
  if (shape.name === "cercle") return 0;
  return Math.max(
    0,
    FAMILIES[family].silhouettes.findIndex((silhouette) => silhouette.id === shape.name),
  );
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

export function avatarCandidateSeeds(botId: string, currentSeed: string, batch: number): string[] {
  const candidates = [currentSeed];
  const firstProfile = avatarProfile(currentSeed, null);
  const unseenSilhouettes = new Set<number>(Array.from({ length: SILHOUETTE_COUNT }, (_, index) => index));
  const usedExpressions = new Set<number>([firstProfile.expression]);
  unseenSilhouettes.delete(firstProfile.shape);
  let index = 1;

  while (unseenSilhouettes.size > 0) {
    const candidate = `${botId}:avatar:${batch}:${index}`;
    index += 1;
    if (candidates.includes(candidate)) continue;
    const profile = avatarProfile(candidate, null);
    if (!unseenSilhouettes.delete(profile.shape)) continue;
    candidates.push(candidate);
    usedExpressions.add(profile.expression);
  }

  while (candidates.length < 12) {
    const candidate = `${botId}:avatar:${batch}:${index}`;
    index += 1;
    if (candidates.includes(candidate)) continue;
    const profile = avatarProfile(candidate, null);
    if (usedExpressions.has(profile.expression)) continue;
    candidates.push(candidate);
    usedExpressions.add(profile.expression);
  }

  return candidates;
}

/** Motion phase for CSS animation-delay: a negative offset starts the keyframes part-way through. */
export function avatarAnimationPhase(animationOffset: number | undefined, cycleOffset: number | undefined): number {
  return -((animationOffset ?? 0) + (cycleOffset ?? 0) * CYCLE_OFFSET_SECONDS);
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
  const dispose = render(
    () => (
      <AvatarArt
        family={avatarFamilyFor(activeTheme())}
        shape={profile.shape}
        expression={profile.expression}
        color={profile.color}
        pose="rest"
      />
    ),
    host,
  );
  flush();
  if (!host.querySelector("svg")) {
    dispose();
    throw new Error("Avatar did not render an SVG.");
  }
  return dispose;
}

let maskSequence = 0;

export function AvatarArt(props: {
  family: AvatarFamily;
  shape: number;
  expression: number;
  color: number;
  pose: AvatarPose;
  phase?: number;
}) {
  maskSequence += 1;
  const maskId = `avatar-mask-${maskSequence}`;
  const geometry = () => avatarFaceGeometry(props.family, props.shape, props.expression);
  const silhouette = () => geometry().silhouette;

  return (
    <svg
      class="avatar-svg"
      viewBox="0 0 100 100"
      aria-hidden="true"
      data-family={props.family}
      data-state={props.pose}
      style={`--avatar-color: var(--lunabot-avatar-${props.color + 1}); --avatar-phase: ${props.phase ?? 0}s;`}
    >
      <Show when={!silhouette().ownEyes}>
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
            <rect x="0" y="0" width="100" height="100" fill="#fff" />
            <Show when={silhouette().cut !== undefined}>
              <path d={silhouette().cut} fill="#000" />
            </Show>
            <FaceMarks family={props.family} face={geometry()} own={false} />
          </mask>
        </defs>
      </Show>
      <path
        class="avatar-body"
        d={silhouette().body}
        fill-rule="evenodd"
        mask={silhouette().ownEyes ? undefined : `url(#${maskId})`}
      />
      <Show when={silhouette().ownEyes}>
        <FaceMarks family={props.family} face={geometry()} own={true} />
      </Show>
    </svg>
  );
}

function FaceMarks(props: { family: AvatarFamily; face: AvatarFaceGeometry; own: boolean }) {
  const mouth = () => props.face.mouth;
  return (
    <g class="avatar-face">
      <g class="avatar-eyes">
        <For each={props.face.eyes}>
          {(eye) => (
            <g transform={`rotate(${eye.tilt} ${eye.cx} ${eye.cy})`}>
              <rect
                class={props.own ? "avatar-eye avatar-eye-own" : "avatar-eye"}
                x={eye.x}
                y={eye.y}
                width={eye.width}
                height={eye.height}
                rx={eye.radius}
                ry={eye.radius}
                fill={props.own ? undefined : "#000"}
              />
            </g>
          )}
        </For>
      </g>
      <g class="avatar-mouth">
        <g transform={`translate(${mouth().x} ${mouth().y}) scale(${mouth().scale})`}>
          <path
            class={`avatar-mouth-shape${props.own ? " avatar-mouth-own" : ""}${mouth().filled ? "" : " avatar-mouth-line"}`}
            d={mouth().d}
            fill={props.own ? undefined : mouth().filled ? "#000" : "none"}
            stroke={props.own ? undefined : "#000"}
            stroke-width={MOUTH_STROKE}
            stroke-linecap={props.family === "quadrantes" ? "square" : "round"}
            stroke-linejoin={props.family === "quadrantes" ? "miter" : "round"}
          />
        </g>
      </g>
    </g>
  );
}

export interface EyeGeometry {
  cx: number;
  cy: number;
  tilt: number;
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

export interface MouthGeometry {
  d: string;
  filled: boolean;
  x: number;
  y: number;
  scale: number;
}

export interface AvatarFaceGeometry {
  silhouette: Silhouette;
  eyes: EyeGeometry[];
  mouth: MouthGeometry;
}

/** Eyes and mouth in viewBox units for one family, silhouette and expression. Shared by the renderer and its geometry tests. */
export function avatarFaceGeometry(family: AvatarFamily, shape: number, expression: number): AvatarFaceGeometry {
  const definition = FAMILIES[family];
  const silhouette = requiredItem(definition.silhouettes, shape);
  return {
    silhouette,
    eyes: eyeGeometry(silhouette, expression, definition.eyeCorner),
    mouth: mouthGeometry(silhouette, expression),
  };
}

function eyeGeometry(silhouette: Silhouette, expression: number, eyeCorner: number): EyeGeometry[] {
  const [, first, second] = requiredItem(EXPRESSIONS, expression);
  const [faceX, faceY, scale] = silhouette.face;
  return [0, 1].map((index) => {
    const [rx, ry, tilt] = index === 0 ? first : (second ?? first);
    const halfWidth = rx * scale * EYE_WIDTH;
    const halfHeight = ry * scale;
    const cx = faceX + (index === 0 ? -EYE_OFFSET : EYE_OFFSET) * scale;
    return {
      cx,
      cy: faceY,
      tilt: index === 0 ? tilt : -tilt,
      x: cx - halfWidth,
      y: faceY - halfHeight,
      width: halfWidth * 2,
      height: halfHeight * 2,
      radius: Math.min(halfWidth, halfHeight) * eyeCorner,
    };
  });
}

function mouthGeometry(silhouette: Silhouette, expression: number): MouthGeometry {
  const [d, filled] = requiredItem(MOUTHS, expression);
  const [faceX, faceY, scale] = silhouette.face;
  return { d, filled, x: faceX, y: faceY + MOUTH_OFFSET * scale, scale };
}

function stableIndex(value: string, length: number): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % length;
}

function requiredItem<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error("Avatar catalog is empty.");
  return item;
}
