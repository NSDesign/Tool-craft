export type PigmentId =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "black"
  | "white";

export type Pigment = {
  hex: string;
  id: PigmentId;
  name: string;
};

export const pigments: readonly Pigment[] = [
  { hex: "#B23A2E", id: "red", name: "Red" },
  { hex: "#D9782D", id: "orange", name: "Orange" },
  { hex: "#E8C547", id: "yellow", name: "Yellow" },
  { hex: "#4C7A4A", id: "green", name: "Green" },
  { hex: "#2A5CA8", id: "blue", name: "Blue" },
  { hex: "#6B4A8A", id: "purple", name: "Purple" },
  { hex: "#2B2B2B", id: "black", name: "Black" },
  { hex: "#F5F0E6", id: "white", name: "White" },
] as const;

export const defaultPigmentHex: string = pigments[0].hex;

/**
 * Sentinel swatch value for the clear-water "wet brush": painting with it deposits
 * surface water only (diluting and re-wetting paint) instead of pigment.
 */
export const waterPigmentValue = "water";

export function isWaterPigment(value: string): boolean {
  return value.toLowerCase() === waterPigmentValue;
}

export function hexToRgb01(hex: string): [number, number, number] {
  if (isWaterPigment(hex)) {
    return [1, 1, 1];
  }

  const normalized = hex.replace("#", "");
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  return [r, g, b];
}

export function isWhitePigment(hex: string): boolean {
  return hex.toLowerCase() === pigments.find((pigment) => pigment.id === "white")?.hex.toLowerCase();
}
