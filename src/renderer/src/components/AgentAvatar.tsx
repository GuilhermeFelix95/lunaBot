import type { BotAvatarHue } from "@lunabot/contracts/ipc";
import { createEffect, createMemo, createSignal, onSettled, Show } from "solid-js";
import {
  AvatarArt,
  type AvatarMotion,
  type AvatarPose,
  type AvatarState,
  avatarAnimationPhase,
  avatarProfile,
  avatarSeedPhase,
} from "../avatar";
import type { BotProfile } from "../data";

interface AgentAvatarProps {
  bot?: Pick<BotProfile, "avatarSeed" | "avatarHue" | "avatarUrl">;
  seed?: string;
  hue?: BotAvatarHue | null;
  url?: string | null;
  motion?: AvatarMotion;
  cycleOffset?: number;
  animationOffset?: number;
  animationState?: AvatarState;
  class?: string;
  style?: Record<string, string>;
}

export function AgentAvatar(props: AgentAvatarProps) {
  const seed = () => props.seed ?? props.bot?.avatarSeed ?? "agent";
  const hue = () => (props.hue !== undefined ? props.hue : (props.bot?.avatarHue ?? null));
  const motion = () => props.motion ?? "idle";
  const url = () => (props.url !== undefined ? props.url : (props.bot?.avatarUrl ?? null));
  const [imageFailed, setImageFailed] = createSignal(false);
  createEffect(
    () => url(),
    () => {
      setImageFailed(false);
    },
  );
  const className = () => `bot-avatar bot-avatar-motion-${motion()} ${props.class ?? ""}`;
  return (
    <Show
      when={url() && !imageFailed()}
      fallback={
        <GeneratedAvatar
          seed={seed()}
          hue={hue()}
          motion={motion()}
          cycleOffset={props.cycleOffset}
          animationOffset={props.animationOffset}
          animationState={props.animationState}
          class={className()}
          style={props.style}
        />
      }
    >
      <span class={`${className()} bot-avatar-custom`} style={props.style} aria-hidden="true">
        <img src={url() ?? ""} alt="" draggable={false} onError={() => setImageFailed(true)} />
      </span>
    </Show>
  );
}

function GeneratedAvatar(props: {
  seed: string;
  hue: BotAvatarHue | null;
  motion: AvatarMotion;
  cycleOffset?: number;
  animationOffset?: number;
  animationState?: AvatarState;
  class: string;
  style?: Record<string, string>;
}) {
  const [reducedMotion, setReducedMotion] = createSignal(prefersReducedMotion());
  const profile = createMemo(() => avatarProfile(props.seed, props.hue));
  // A mascot is never still: it only rests when the system asks for reduced motion.
  const pose = (): AvatarPose => (reducedMotion() ? "rest" : (props.animationState ?? motionState(props.motion)));

  onSettled(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const syncReducedMotion = () => setReducedMotion(media?.matches ?? false);
    syncReducedMotion();
    media?.addEventListener?.("change", syncReducedMotion);
    return () => media?.removeEventListener?.("change", syncReducedMotion);
  });

  return (
    <span
      class={`${props.class} bot-avatar-art`}
      style={props.style}
      data-animation-state={props.animationState}
      aria-hidden="true"
    >
      <AvatarArt
        mascot={profile().mascot}
        color={profile().color}
        pose={pose()}
        phase={avatarSeedPhase(props.seed) + avatarAnimationPhase(props.animationOffset, props.cycleOffset)}
      />
    </span>
  );
}

function motionState(motion: AvatarMotion): "idle" | "working" | "connecting" {
  if (motion === "working") return "working";
  if (motion === "connecting") return "connecting";
  return "idle";
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
