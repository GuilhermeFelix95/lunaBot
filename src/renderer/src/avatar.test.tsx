import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import {
  AvatarArt,
  type AvatarPose,
  avatarCandidateSeeds,
  avatarFaceKind,
  avatarHeadColor,
  avatarHueSwatch,
  avatarProfile,
  createStaticAvatarSvg,
} from "./avatar";
import { MASCOT_COUNT, MASCOTS, type MascotFaceKind, mascotAt, mascotFaceGeometry } from "./mascots";

const POSES: AvatarPose[] = ["rest", "idle", "thinking", "working", "alert", "sleep", "connecting"];
const FACE_KINDS: MascotFaceKind[] = ["neutral", "working", "alert", "sleeping"];

describe("mascot catalog", () => {
  it("holds thirty distinct mascots in four groups", () => {
    expect(MASCOT_COUNT).toBe(30);
    expect(new Set(MASCOTS.map((mascot) => mascot.id)).size).toBe(30);
    const perGroup = (group: string) => MASCOTS.filter((mascot) => mascot.group === group).length;
    expect([perGroup("objects"), perGroup("creatures"), perGroup("robots"), perGroup("symbols")]).toEqual([
      10, 8, 6, 6,
    ]);
  });

  it("draws every mascot as a body of coloured paths", () => {
    for (const mascot of MASCOTS) {
      expect(mascot.body.length, mascot.id).toBeGreaterThan(0);
      for (const part of [...mascot.body, ...mascot.accessory]) {
        expect(part.d.length, mascot.id).toBeGreaterThan(0);
        expect(part.fill !== undefined || part.stroke !== undefined, mascot.id).toBe(true);
      }
    }
  });

  it("wraps an index around the catalog", () => {
    expect(mascotAt(0).id).toBe(MASCOTS[0]?.id);
    expect(mascotAt(MASCOT_COUNT).id).toBe(mascotAt(0).id);
    expect(mascotAt(-1).id).toBe(mascotAt(MASCOT_COUNT - 1).id);
  });
});

describe("avatar profile", () => {
  it("is stable for a seed and covers every mascot and colour", () => {
    expect(avatarProfile("chief", null)).toEqual(avatarProfile("chief", null));
    const profiles = Array.from({ length: 3_000 }, (_, index) => avatarProfile(`seed-${index}`, null));
    expect(new Set(profiles.map((profile) => profile.mascot)).size).toBe(MASCOT_COUNT);
    expect(new Set(profiles.map((profile) => profile.color)).size).toBe(8);
  });

  it("maps stored hues to palette tokens", () => {
    expect(avatarProfile("chief", 215).color).toBe(4);
    expect(avatarHeadColor("chief", 215)).toBe("var(--lunabot-avatar-5)");
    expect(avatarHueSwatch(215)).toBe(avatarHeadColor("different-seed", 215));
  });

  it("offers twelve candidates that each show a different mascot", () => {
    const firstSet = avatarCandidateSeeds("chief", "chief:avatar:4:7", 0);
    const repeatedSet = avatarCandidateSeeds("chief", "chief:avatar:4:7", 0);
    const nextSet = avatarCandidateSeeds("chief", "chief:avatar:4:7", 1);

    expect(firstSet).toEqual(repeatedSet);
    expect(firstSet).toHaveLength(12);
    expect(new Set(firstSet)).toHaveLength(12);
    expect(firstSet[0]).toBe("chief:avatar:4:7");
    expect(new Set(firstSet.map((seed) => avatarProfile(seed, null).mascot)).size).toBe(12);
    expect(nextSet[0]).toBe(firstSet[0]);
    expect(nextSet.slice(1)).not.toEqual(firstSet.slice(1));
  });
});

describe("mascot faces", () => {
  it("keeps both eyes apart and the mouth inside the box in every expression", () => {
    for (const mascot of MASCOTS) {
      const { x, y, gap, eyeRadius, mouthDrop, mouthWidth } = mascot.face;
      // The alert expression draws the widest eyes, 1.55 times the eye radius.
      expect(gap, mascot.id).toBeGreaterThan(2 * eyeRadius * 1.55);
      expect(x - gap / 2 - eyeRadius * 1.55, mascot.id).toBeGreaterThan(0);
      expect(x + gap / 2 + eyeRadius * 1.55, mascot.id).toBeLessThan(64);
      expect(y + mouthDrop + mouthWidth, mascot.id).toBeLessThan(62);
    }
  });

  it("gives every expression two eyes and a mouth unless the mascot has a beak", () => {
    for (const mascot of MASCOTS) {
      for (const kind of FACE_KINDS) {
        const face = mascotFaceGeometry(mascot.face, kind);
        expect(face.eyes, `${mascot.id} ${kind}`).toHaveLength(2);
        expect(face.mouth.length > 0, `${mascot.id} ${kind}`).toBe(mascot.face.noMouth !== true);
      }
    }
  });

  it("marks only the alert and sleeping expressions with a badge", () => {
    const face = mascotAt(0).face;
    expect(mascotFaceGeometry(face, "neutral").badge).toHaveLength(0);
    expect(mascotFaceGeometry(face, "working").badge).toHaveLength(0);
    expect(mascotFaceGeometry(face, "alert").badge).toHaveLength(3);
    expect(mascotFaceGeometry(face, "sleeping").badge).toHaveLength(2);
  });

  it("shows the working, alert and sleeping faces for their poses and the neutral face otherwise", () => {
    expect(avatarFaceKind("working")).toBe("working");
    expect(avatarFaceKind("alert")).toBe("alert");
    expect(avatarFaceKind("sleep")).toBe("sleeping");
    for (const pose of ["rest", "idle", "thinking", "connecting"] as const) {
      expect(avatarFaceKind(pose)).toBe("neutral");
    }
  });
});

describe("AvatarArt", () => {
  it("renders every mascot in every pose with its body, accessory and face", () => {
    for (const [index, mascot] of MASCOTS.entries()) {
      for (const pose of POSES) {
        const view = render(() => <AvatarArt mascot={index} color={3} pose={pose} />);
        const svg = view.container.querySelector("svg");
        expect(svg?.getAttribute("data-mascot"), mascot.id).toBe(mascot.id);
        expect(svg?.getAttribute("data-state"), `${mascot.id} ${pose}`).toBe(pose);
        expect(svg?.querySelectorAll(".avatar-body path"), mascot.id).toHaveLength(mascot.body.length);
        expect(svg?.querySelectorAll(".mascot-accessory path"), mascot.id).toHaveLength(mascot.accessory.length);
        expect(svg?.querySelectorAll(".avatar-eye"), mascot.id).toHaveLength(2);
        view.unmount();
      }
    }
  });

  it("animates the accessory of most mascots and the whole body of the others", () => {
    const heart = MASCOTS.findIndex((mascot) => mascot.animateAll === true);
    const envelope = MASCOTS.findIndex((mascot) => mascot.id === "envelope");
    const whole = render(() => <AvatarArt mascot={heart} color={0} pose="working" />);
    expect(whole.container.querySelector(".mascot-all")?.getAttribute("data-animation")).toBe(
      mascotAt(heart).animation,
    );
    expect(whole.container.querySelector(".mascot-accessory")?.getAttribute("data-animation") ?? null).toBeNull();
    whole.unmount();

    const accessory = render(() => <AvatarArt mascot={envelope} color={0} pose="working" />);
    expect(accessory.container.querySelector(".mascot-all")?.getAttribute("data-animation") ?? null).toBeNull();
    expect(accessory.container.querySelector(".mascot-accessory")?.getAttribute("data-animation")).toBe("wiggle");
    accessory.unmount();
  });

  it("changes the badge with the pose", () => {
    const view = render(() => <AvatarArt mascot={0} color={0} pose="alert" />);
    expect(view.container.querySelectorAll(".avatar-badge path")).toHaveLength(3);
    view.unmount();
    const resting = render(() => <AvatarArt mascot={0} color={0} pose="rest" />);
    expect(resting.container.querySelectorAll(".avatar-badge path")).toHaveLength(0);
    resting.unmount();
  });
});

describe("static avatar", () => {
  it("builds a still svg for a seed", () => {
    const svg = createStaticAvatarSvg("chief", 215);
    expect(svg.getAttribute("focusable")).toBe("false");
    expect(svg.getAttribute("data-state")).toBe("rest");
    expect(svg.getAttribute("data-mascot")).toBe(mascotAt(avatarProfile("chief", 215).mascot).id);
  });
});
