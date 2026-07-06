"use client";

import * as React from "react";
import { useToolcraft } from "@/toolcraft/runtime/react";
import { shouldIncludeToolcraftPreviewBackground } from "@/toolcraft/runtime";

import type { BrushShape, HairType, WatercolorParams } from "./watercolor-engine";
import { WatercolorEngine } from "./watercolor-engine";
import { defaultPigmentHex } from "./pigments";

const DEFAULT_BACKGROUND_COLOR = "#f5eede";

export type WatercolorCanvasApi = {
  clear: () => void;
  getCompositeCanvas: () => HTMLCanvasElement | null;
};

export type WatercolorCanvasProps = {
  apiRef: React.MutableRefObject<WatercolorCanvasApi | null>;
};

type CurrentPigmentValue = {
  hex: string;
  pickedAt: number;
};

const BRUSH_CHARGE_DEPLETION_PER_CSS_PIXEL = 0.0026;

function getCurrentPigmentValue(rawValue: unknown): CurrentPigmentValue {
  if (
    rawValue &&
    typeof rawValue === "object" &&
    typeof (rawValue as CurrentPigmentValue).hex === "string"
  ) {
    return rawValue as CurrentPigmentValue;
  }

  return { hex: defaultPigmentHex, pickedAt: 0 };
}

// The built-in "color" control commits {hex: string}, but a schema defaultValue is a plain string;
// accept both shapes when reading the runtime value back out.
function getColorHexValue(rawValue: unknown, fallbackHex: string): string {
  if (typeof rawValue === "string") {
    return rawValue;
  }

  if (rawValue && typeof rawValue === "object" && typeof (rawValue as { hex?: unknown }).hex === "string") {
    return (rawValue as { hex: string }).hex;
  }

  return fallbackHex;
}

export function WatercolorCanvas({ apiRef }: WatercolorCanvasProps): React.JSX.Element {
  const { state } = useToolcraft();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const engineRef = React.useRef<WatercolorEngine | null>(null);
  const lastPigmentPickedAtRef = React.useRef<number>(0);
  const lastPointerCssPosRef = React.useRef<{ x: number; y: number } | null>(null);
  const drawingRef = React.useRef(false);

  const cssWidth = state.canvas.size.width;
  const cssHeight = state.canvas.size.height;
  const renderScaleValue = state.values["canvas.renderScale"];
  const renderScale = typeof renderScaleValue === "number" ? renderScaleValue : 2;

  const brushType = (state.values["brush.type"] as BrushShape | undefined) ?? "round";
  const brushSize = (state.values["brush.size"] as number | undefined) ?? 4;
  const brushHairType = (state.values["brush.hairType"] as HairType | undefined) ?? "sable";
  const roughness = ((state.values["paper.roughness"] as number | undefined) ?? 50) / 100;
  const reliefHeight = ((state.values["paper.reliefHeight"] as number | undefined) ?? 50) / 100;
  const dryingSpeed = ((state.values["paper.dryingSpeed"] as number | undefined) ?? 40) / 100;
  const wetnessSpread = ((state.values["dynamics.wetnessSpread"] as number | undefined) ?? 55) / 100;
  const granulation = ((state.values["dynamics.granulation"] as number | undefined) ?? 35) / 100;
  const edgeDarkening = ((state.values["dynamics.edgeDarkening"] as number | undefined) ?? 45) / 100;
  const pigmentOpacity = ((state.values["dynamics.pigmentOpacity"] as number | undefined) ?? 55) / 100;
  const tilt = ((state.values["dynamics.tilt"] as number | undefined) ?? 0) / 100;
  const currentPigment = getCurrentPigmentValue(state.values["paint.currentPigmentColor"]);
  const backgroundColor = getColorHexValue(
    state.values["appearance.background"],
    DEFAULT_BACKGROUND_COLOR,
  );
  const includeBackground = shouldIncludeToolcraftPreviewBackground({ state });

  const backingWidth = Math.max(1, Math.round(cssWidth * getDevicePixelRatio() * renderScale));
  const backingHeight = Math.max(1, Math.round(cssHeight * getDevicePixelRatio() * renderScale));

  React.useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const engine = new WatercolorEngine(canvas, backingWidth, backingHeight, buildParams());
    engineRef.current = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    engineRef.current?.resize(backingWidth, backingHeight);
  }, [backingWidth, backingHeight]);

  function buildParams(): WatercolorParams {
    return {
      backgroundColor,
      brushHairType,
      brushShape: brushType,
      brushSize,
      dryingSpeed,
      edgeDarkening,
      granulation,
      includeBackground,
      pigmentHex: currentPigment.hex,
      pigmentOpacity,
      reliefHeight,
      roughness,
      tilt,
      wetnessSpread,
    };
  }

  React.useEffect(() => {
    engineRef.current?.setParams(buildParams());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    brushType,
    brushSize,
    brushHairType,
    roughness,
    reliefHeight,
    dryingSpeed,
    wetnessSpread,
    granulation,
    edgeDarkening,
    pigmentOpacity,
    tilt,
    currentPigment.hex,
    backgroundColor,
    includeBackground,
  ]);

  React.useEffect(() => {
    if (currentPigment.pickedAt !== lastPigmentPickedAtRef.current) {
      lastPigmentPickedAtRef.current = currentPigment.pickedAt;
      engineRef.current?.setBrushCharge(1);
    }
  }, [currentPigment.pickedAt]);

  React.useImperativeHandle(
    apiRef,
    () => ({
      clear: () => {
        engineRef.current?.clear();
      },
      getCompositeCanvas: () => engineRef.current?.getCompositeCanvas() ?? null,
    }),
    [cssWidth, cssHeight],
  );

  function getUvFromPointerEvent(event: React.PointerEvent<HTMLCanvasElement>): {
    uv: [number, number];
    cssX: number;
    cssY: number;
  } {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    const cssX = rect ? event.clientX - rect.left : 0;
    const cssY = rect ? event.clientY - rect.top : 0;
    const uvX = rect ? cssX / rect.width : 0;
    const uvY = rect ? 1 - cssY / rect.height : 0;
    return { cssX, cssY, uv: [uvX, uvY] };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const { uv, cssX, cssY } = getUvFromPointerEvent(event);
    lastPointerCssPosRef.current = { x: cssX, y: cssY };
    engineRef.current?.beginStroke(uv[0], uv[1]);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (!drawingRef.current) {
      return;
    }

    const { uv, cssX, cssY } = getUvFromPointerEvent(event);
    const lastPos = lastPointerCssPosRef.current;

    if (lastPos) {
      const distance = Math.hypot(cssX - lastPos.x, cssY - lastPos.y);
      const engine = engineRef.current;

      if (engine) {
        const depleted = engine.getBrushCharge() - distance * BRUSH_CHARGE_DEPLETION_PER_CSS_PIXEL;
        engine.setBrushCharge(depleted);
      }
    }

    lastPointerCssPosRef.current = { x: cssX, y: cssY };
    engineRef.current?.moveStroke(uv[0], uv[1]);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    drawingRef.current = false;
    lastPointerCssPosRef.current = null;
    engineRef.current?.endStroke();
  }

  return (
    <div
      className="pointer-events-auto absolute inset-0 flex items-center justify-center"
      ref={containerRef}
    >
      <canvas
        data-toolcraft-watercolor-canvas="true"
        height={backingHeight}
        onPointerCancel={handlePointerUp}
        onPointerDown={handlePointerDown}
        onPointerLeave={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        ref={canvasRef}
        style={{
          cursor: "crosshair",
          height: cssHeight,
          touchAction: "none",
          width: cssWidth,
        }}
        width={backingWidth}
      />
    </div>
  );
}

function getDevicePixelRatio(): number {
  return typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
}
