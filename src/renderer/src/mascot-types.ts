/** Colour roles of a mascot: the bot colour in four shades, plus the ink, alert and muted colours of the face. */
export type MascotTone = "b" | "d" | "l" | "w" | "ink" | "alert" | "muted";

/** One filled and/or stroked path in the 64 x 64 box of a mascot. */
export interface MascotPart {
  d: string;
  transform?: string;
  fill?: MascotTone;
  stroke?: MascotTone;
  strokeWidth?: number;
}

export type MascotGroup = "objects" | "creatures" | "robots" | "symbols";

/** The motion of a mascot's accessory while its agent works. */
export type MascotAnimation = "swing" | "pulse" | "blink" | "bounce" | "spin" | "wiggle" | "float" | "flash" | "rotor";

/** Where the face sits on the mascot, in the 64 x 64 box. */
export interface MascotFace {
  /** Centre of the eyes. */
  x: number;
  y: number;
  /** Distance between the two eyes. */
  gap: number;
  eyeRadius: number;
  /** The mouth sits this far below the eyes. */
  mouthDrop: number;
  mouthWidth: number;
  /** The mascot draws its own mouth, such as a beak. */
  noMouth?: true;
}

export interface MascotDefinition {
  id: string;
  group: MascotGroup;
  animation: MascotAnimation;
  /** Transform origin of the animation, as CSS percentages of the animated part. */
  origin?: string;
  /** The whole mascot animates, not only its accessory. */
  animateAll?: true;
  face: MascotFace;
  body: readonly MascotPart[];
  accessory: readonly MascotPart[];
}

export type MascotFaceKind = "neutral" | "working" | "alert" | "sleeping";

export interface MascotFaceGeometry {
  /** One list of parts per eye. */
  eyes: readonly (readonly MascotPart[])[];
  mouth: readonly MascotPart[];
  /** The alert mark or the sleeping z's, drawn outside the animated mascot. */
  badge: readonly MascotPart[];
}
