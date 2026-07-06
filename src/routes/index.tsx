import * as React from "react";
import { ToolcraftApp } from "@/toolcraft/runtime/react";
import {
  createToolcraftPngExportCanvas,
  getToolcraftImageExportSize,
  shouldIncludeToolcraftPreviewBackground,
} from "@/toolcraft/runtime";

import { appSchema } from "../app/app-schema";
import { MixingAreaControl } from "../app/MixingAreaControl";
import { PaintSwatchesControl } from "../app/PaintSwatchesControl";
import { WatercolorCanvas, type WatercolorCanvasApi } from "../app/WatercolorCanvas";

const controlRenderers = {
  mixingArea: MixingAreaControl,
  paintSwatches: PaintSwatchesControl,
};

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AppHome(): React.JSX.Element {
  const canvasApiRef = React.useRef<WatercolorCanvasApi | null>(null);

  return (
    <ToolcraftApp
      className="h-dvh min-h-dvh"
      canvasContent={<WatercolorCanvas apiRef={canvasApiRef} />}
      controlRenderers={controlRenderers}
      onPanelAction={async ({ action, dispatch, state }) => {
        switch (action.value) {
          case "canvas-clear-painting": {
            canvasApiRef.current?.clear();
            return;
          }

          case "paper-preset-hot-press":
          case "paper-preset-cold-press":
          case "paper-preset-rough": {
            // Classic paper textures expressed through the two existing sliders,
            // so presets stay a one-shot write with a single source of truth.
            const presets: Record<string, { reliefHeight: number; roughness: number }> = {
              "paper-preset-cold-press": { reliefHeight: 50, roughness: 50 },
              "paper-preset-hot-press": { reliefHeight: 18, roughness: 14 },
              "paper-preset-rough": { reliefHeight: 82, roughness: 86 },
            };
            const preset = presets[action.value];
            dispatch({
              target: "paper.roughness",
              type: "controls.setValue",
              value: preset.roughness,
            });
            dispatch({
              target: "paper.reliefHeight",
              type: "controls.setValue",
              value: preset.reliefHeight,
            });
            return;
          }

          case "mixing-reset": {
            dispatch({
              target: "paint.mixingArea",
              type: "controls.setValue",
              value: { pixels: null },
            });
            return;
          }

          case "export-png": {
            const format = (state.values["export.image.format"] as "png" | "jpg" | undefined) ?? "png";
            const imageResolution =
              (state.values["export.image.resolution"] as "2k" | "4k" | "8k" | undefined) ?? "4k";
            const rawBackgroundColor = state.values["appearance.background"];
            const backgroundColor =
              typeof rawBackgroundColor === "string"
                ? rawBackgroundColor
                : (rawBackgroundColor as { hex?: string } | undefined)?.hex ?? "#f5eede";
            const includeBackground = shouldIncludeToolcraftPreviewBackground({ state });
            const source = canvasApiRef.current?.getCompositeCanvas();

            if (!source) {
              throw new Error("Toolcraft watercolour export produced no painted content.");
            }

            const exportCanvas = createToolcraftPngExportCanvas({
              background: backgroundColor,
              includeBackground,
              render: ({ context, cssHeight, cssWidth }) => {
                context.drawImage(source, 0, 0, cssWidth, cssHeight);
              },
              resolution: imageResolution,
              state,
            });

            const mimeType = format === "jpg" ? "image/jpeg" : "image/png";
            const blob = await new Promise<Blob | null>((resolve) => {
              exportCanvas.toBlob(resolve, mimeType);
            });

            if (!blob) {
              throw new Error("Toolcraft watercolour export failed to encode image bytes.");
            }

            const size = getToolcraftImageExportSize({ resolution: imageResolution, state });
            downloadBlob(
              blob,
              `watercolour-painting-${size.width}x${size.height}.${format === "jpg" ? "jpg" : "png"}`,
            );
            return;
          }

          default:
            return;
        }
      }}
      renderDefaultCanvasMedia={false}
      schema={appSchema}
    />
  );
}
