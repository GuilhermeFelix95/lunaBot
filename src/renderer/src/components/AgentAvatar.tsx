import type { BotAvatarHue } from "@lunabot/contracts/ipc";
import { createEffect, createMemo, createSignal, onSettled, Show } from "solid-js";
import {
  AvatarArt,
  type AvatarMotion,
  type AvatarPose,
  type AvatarState,
  avatarAnimationPhase,
  avatarFamilyFor,
  avatarProfile,
  avatarShapeIndex,
  type SilhouetteChoice,
} from "../avatar";
import type { BotProfile } from "../data";
import { activeTheme } from "../theme";

interface AgentAvatarProps {
  bot?: Pick<BotProfile, "avatarSeed" | "avatarHue" | "avatarUrl">;
  seed?: string;
  hue?: BotAvatarHue | null;
  url?: string | null;
  motion?: AvatarMotion;
  cycleOffset?: number;
  animationOffset?: number;
  animationState?: AvatarState;
  shape?: SilhouetteChoice;
  class?: string;
  style?: Record<string, string>;
}

export function AgentAvatar(props: AgentAvatarProps) {
  const seed = () => props.seed ?? props.bot?.avatarSeed ?? "agent";
  const hue = () => (props.hue !== undefined ? props.hue : (props.bot?.avatarHue ?? null));
  const motion = () => props.motion ?? "hover";
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
          shape={props.shape}
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
  shape?: SilhouetteChoice;
  class: string;
  style?: Record<string, string>;
}) {
  let element: HTMLSpanElement | undefined;
  const [interacting, setInteracting] = createSignal(false);
  const [reducedMotion, setReducedMotion] = createSignal(prefersReducedMotion());
  const profile = createMemo(() => avatarProfile(props.seed, props.hue));
  const family = () => avatarFamilyFor(activeTheme());
  const silhouette = () => avatarShapeIndex(family(), props.shape, profile().shape);
  const animated = () =>
    !reducedMotion() && (props.animationState !== undefined || props.motion !== "hover" || interacting());
  const pose = (): AvatarPose => (animated() ? (props.animationState ?? motionState(props.motion)) : "rest");

  onSettled(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const syncReducedMotion = () => setReducedMotion(media?.matches ?? false);
    syncReducedMotion();
    media?.addEventListener?.("change", syncReducedMotion);

    const interactionTarget = element?.closest<HTMLElement>("button, a, [role='button'], [tabindex]") ?? element;
    const startInteraction = () => setInteracting(true);
    const stopInteraction = () => setInteracting(false);
    const stopFocusInteraction = (event: FocusEvent) => {
      if (!(event.relatedTarget instanceof Node) || !interactionTarget?.contains(event.relatedTarget)) {
        stopInteraction();
      }
    };
    interactionTarget?.addEventListener("pointerenter", startInteraction);
    interactionTarget?.addEventListener("pointerleave", stopInteraction);
    interactionTarget?.addEventListener("focusin", startInteraction);
    interactionTarget?.addEventListener("focusout", stopFocusInteraction);

    return () => {
      media?.removeEventListener?.("change", syncReducedMotion);
      interactionTarget?.removeEventListener("pointerenter", startInteraction);
      interactionTarget?.removeEventListener("pointerleave", stopInteraction);
      interactionTarget?.removeEventListener("focusin", startInteraction);
      interactionTarget?.removeEventListener("focusout", stopFocusInteraction);
    };
  });

  return (
    <span
      ref={element}
      class={`${props.class} bot-avatar-art`}
      style={props.style}
      data-animation-state={props.animationState}
      aria-hidden="true"
    >
      <AvatarArt
        family={family()}
        shape={silhouette()}
        expression={profile().expression}
        color={profile().color}
        pose={pose()}
        phase={avatarAnimationPhase(props.animationOffset, props.cycleOffset)}
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
