"use client";

import * as React from "react";
import type { ToolcraftCustomControlRenderer } from "@/toolcraft/runtime/react";

import { defaultPigmentHex, isWaterPigment } from "./pigments";

export type MixingAreaValue = {
  pixels: string | null;
};

const MIXING_AREA_CSS_SIZE = 128;
const MIXING_AREA_DAB_RADIUS = 11;
const DRAG_THRESHOLD_PX = 3;
const PALETTE_BASE_COLOR = "#F1E9DA";

function normalizeValue(rawValue: unknown): MixingAreaValue {
  if (rawValue && typeof rawValue === "object" && "pixels" in (rawValue as MixingAreaValue)) {
    return rawValue as MixingAreaValue;
  }

  return { pixels: null };
}

function toHex(component: number): string {
  return Math.max(0, Math.min(255, Math.round(component))).toString(16).padStart(2, "0");
}

export const MixingAreaControl: ToolcraftCustomControlRenderer = ({
  controlId,
  dispatch,
  setValue,
  state,
  value,
}) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const lastPersistedPixelsRef = React.useRef<string | null>(null);
  const pointerStateRef = React.useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
  } | null>(null);
  const normalized = normalizeValue(value);
  const currentPigmentHex =
    (state.values["paint.currentPigmentColor"] as { hex?: string } | undefined)?.hex ??
    defaultPigmentHex;

  const getContext = React.useCallback((): CanvasRenderingContext2D | null => {
    return canvasRef.current?.getContext("2d") ?? null;
  }, []);

  const fillBlank = React.useCallback(
    (context: CanvasRenderingContext2D) => {
      context.fillStyle = PALETTE_BASE_COLOR;
      context.fillRect(0, 0, MIXING_AREA_CSS_SIZE, MIXING_AREA_CSS_SIZE);
    },
    [],
  );

  React.useEffect(() => {
    const context = getContext();

    if (!context) {
      return;
    }

    if (normalized.pixels) {
      const image = new Image();
      image.onload = () => {
        context.clearRect(0, 0, MIXING_AREA_CSS_SIZE, MIXING_AREA_CSS_SIZE);
        context.drawImage(image, 0, 0, MIXING_AREA_CSS_SIZE, MIXING_AREA_CSS_SIZE);
      };
      image.src = normalized.pixels;
      lastPersistedPixelsRef.current = normalized.pixels;
    } else {
      fillBlank(context);
      lastPersistedPixelsRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (normalized.pixels === lastPersistedPixelsRef.current) {
      return;
    }

    const context = getContext();

    if (!context) {
      return;
    }

    if (!normalized.pixels) {
      fillBlank(context);
      lastPersistedPixelsRef.current = null;
      return;
    }

    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, MIXING_AREA_CSS_SIZE, MIXING_AREA_CSS_SIZE);
      context.drawImage(image, 0, 0, MIXING_AREA_CSS_SIZE, MIXING_AREA_CSS_SIZE);
    };
    image.src = normalized.pixels;
    lastPersistedPixelsRef.current = normalized.pixels;
  }, [normalized.pixels, getContext, fillBlank]);

  function drawDab(x: number, y: number): void {
    const context = getContext();

    if (!context) {
      return;
    }

    if (isWaterPigment(currentPigmentHex)) {
      // A water dab thins the mixed paint back toward the clean palette base
      // instead of depositing a colour.
      const gradient = context.createRadialGradient(x, y, 0, x, y, MIXING_AREA_DAB_RADIUS);
      gradient.addColorStop(0, `${PALETTE_BASE_COLOR}55`);
      gradient.addColorStop(1, `${PALETTE_BASE_COLOR}00`);
      context.globalCompositeOperation = "source-over";
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(x, y, MIXING_AREA_DAB_RADIUS, 0, Math.PI * 2);
      context.fill();
      return;
    }

    const gradient = context.createRadialGradient(x, y, 0, x, y, MIXING_AREA_DAB_RADIUS);
    gradient.addColorStop(0, `${currentPigmentHex}CC`);
    gradient.addColorStop(1, `${currentPigmentHex}00`);
    context.globalCompositeOperation = "source-over";
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, MIXING_AREA_DAB_RADIUS, 0, Math.PI * 2);
    context.fill();
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    pointerStateRef.current = {
      dragging: false,
      startX: event.clientX - rect.left,
      startY: event.clientY - rect.top,
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>): void {
    const pointerState = pointerStateRef.current;

    if (!pointerState) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (!pointerState.dragging) {
      const distance = Math.hypot(x - pointerState.startX, y - pointerState.startY);

      if (distance < DRAG_THRESHOLD_PX) {
        return;
      }

      pointerState.dragging = true;
      drawDab(pointerState.startX, pointerState.startY);
    }

    drawDab(x, y);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const pointerState = pointerStateRef.current;
    pointerStateRef.current = null;

    if (!pointerState) {
      return;
    }

    const context = getContext();

    if (!context) {
      return;
    }

    if (pointerState.dragging) {
      const canvas = canvasRef.current;
      const dataUrl = canvas?.toDataURL("image/png") ?? null;
      lastPersistedPixelsRef.current = dataUrl;
      setValue({ pixels: dataUrl });
      return;
    }

    const pixel = context.getImageData(pointerState.startX, pointerState.startY, 1, 1).data;
    const sampledHex = `#${toHex(pixel[0] ?? 0)}${toHex(pixel[1] ?? 0)}${toHex(pixel[2] ?? 0)}`;

    dispatch({
      target: "paint.currentPigmentColor",
      type: "controls.setValue",
      value: { hex: sampledHex, pickedAt: Date.now() },
    });
  }

  return (
    <div
      className="inline-flex"
      data-toolcraft-control-id={controlId}
      data-toolcraft-mixing-area="true"
    >
      <canvas
        aria-label="Mixing palette: drag to blend pigments, click to pick a colour"
        className="rounded-md border border-[color:var(--border)]"
        height={MIXING_AREA_CSS_SIZE}
        onPointerCancel={handlePointerUp}
        onPointerDown={handlePointerDown}
        onPointerLeave={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        ref={canvasRef}
        role="img"
        style={{ cursor: "crosshair", height: MIXING_AREA_CSS_SIZE, touchAction: "none", width: MIXING_AREA_CSS_SIZE }}
        width={MIXING_AREA_CSS_SIZE}
      />
    </div>
  );
};
