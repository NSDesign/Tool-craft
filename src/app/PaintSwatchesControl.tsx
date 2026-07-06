"use client";

import * as React from "react";
import type { ToolcraftCustomControlRenderer } from "@/toolcraft/runtime/react";

import { defaultPigmentHex, isWaterPigment } from "./pigments";

type CurrentPigmentValue = {
  hex: string;
  pickedAt: number;
};

function normalizeValue(rawValue: unknown): CurrentPigmentValue {
  if (
    rawValue &&
    typeof rawValue === "object" &&
    typeof (rawValue as CurrentPigmentValue).hex === "string"
  ) {
    return rawValue as CurrentPigmentValue;
  }

  return { hex: defaultPigmentHex, pickedAt: 0 };
}

export const PaintSwatchesControl: ToolcraftCustomControlRenderer = ({
  control,
  controlId,
  setValue,
  value,
}) => {
  const current = normalizeValue(value);
  const options = control.options ?? [];

  return (
    <div
      className="flex flex-wrap gap-2"
      data-toolcraft-control-id={controlId}
      data-toolcraft-paint-swatches="true"
      role="radiogroup"
    >
      {options.map((option) => {
        const isSelected = option.value.toLowerCase() === current.hex.toLowerCase();
        const isWater = isWaterPigment(option.value);

        return (
          <button
            aria-checked={isSelected}
            aria-label={option.label}
            className="size-8 shrink-0 rounded-full border-2 transition-transform"
            data-toolcraft-pigment-swatch={option.label.toLowerCase()}
            key={option.value}
            onClick={() => {
              setValue({ hex: option.value, pickedAt: Date.now() });
            }}
            role="radio"
            style={{
              // The clear-water "wet brush" swatch reads as a droplet of clean
              // water instead of a solid pigment disc.
              background: isWater
                ? "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.9), rgba(151,196,235,0.55) 55%, rgba(88,142,196,0.75))"
                : option.value,
              borderColor: isSelected
                ? "var(--foreground)"
                : isWater
                  ? "color-mix(in oklab, var(--foreground) 30%, transparent)"
                  : "transparent",
              borderStyle: isWater && !isSelected ? "dashed" : "solid",
              transform: isSelected ? "scale(1.08)" : "scale(1)",
            }}
            title={option.label}
            type="button"
          />
        );
      })}
    </div>
  );
};
