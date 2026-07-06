import { describe, expect, it } from "vitest";

import { appPerformance } from "./app-performance";
import { appSchema } from "./app-schema";

describe("appSchema", () => {
  it("publishes the watercolour painter's product app contract for AI assembly", () => {
    expect(appSchema.canvas.draggable).toBe(false);
    expect(appSchema.canvas.enabled).toBe(true);
    expect(appSchema.canvas.sizing).toEqual({ mode: "editable-output" });
    expect(appSchema.canvas.upload).toBe(false);
    expect(appSchema.canvas.renderScale).toMatchObject({ enabled: true });
    expect(appSchema.panels.controls?.sections[0]?.title).toBe("Setup");
    expect(appSchema.panels.controls?.sections[0]?.controls.settingsTransfer).toMatchObject({
      target: "runtime.settingsTransfer",
      type: "settingsTransfer",
    });
    expect(appSchema.panels.controls?.sections[0]?.controls.canvasAspectRatio).toMatchObject({
      target: "canvas.aspectRatio",
      type: "aspectRatio",
    });
    expect(appSchema.panels.controls?.sections[0]?.controls.canvasWidth).toMatchObject({
      target: "canvas.size.width",
      type: "text",
    });
    expect(appSchema.panels.controls?.sections[0]?.controls.canvasHeight).toMatchObject({
      target: "canvas.size.height",
      type: "text",
    });
    expect(appSchema.panels.layers).toBeUndefined();
    expect(appSchema.panels.timeline).toBeUndefined();
    expect(appSchema.toolbar).toEqual({
      history: false,
      radar: true,
      theme: true,
      zoom: true,
    });
    expect(appSchema.assembly.components).toEqual([
      "canvas",
      "controlsPanel",
      "toolbar",
    ]);
    expect(appSchema.assembly.capabilities).toEqual(
      expect.arrayContaining([
        "canvas.editableSize",
        "canvas.renderScale",
        "controls.defaults",
        "controls.panel",
        "toolbar.radar",
        "toolbar.theme",
        "toolbar.zoom",
      ]),
    );
    // No canvas dragging/upload, undo/redo history, or timeline for this continuous WebGL simulation.
    expect(appSchema.assembly.capabilities).not.toContain("canvas.draggable");
    expect(appSchema.assembly.capabilities).not.toContain("canvas.upload");
    expect(appSchema.assembly.capabilities).not.toContain("toolbar.history");
    expect(appSchema.assembly.capabilities).not.toContain("timeline.playback");
    expect(appSchema.assembly.capabilities).not.toContain("timeline.keyframes");
    expect(appSchema.assembly.commands).toEqual(
      expect.arrayContaining([
        "canvas.center",
        "canvas.setSize",
        "canvas.zoomIn",
        "controls.reset",
        "controls.setValue",
      ]),
    );
    expect(appSchema.assembly.commands).not.toContain("canvas.setViewport");
    expect(appSchema.assembly.commands).not.toContain("history.undo");
    expect(appSchema.assembly.commands).not.toContain("media.delete");
    expect(appSchema.assembly.commands).not.toContain("media.import");
    expect(appSchema.assembly.commands).not.toContain("timeline.setCurrentTime");
  });

  it("declares the watercolour painter's product controls sections after runtime Setup", () => {
    const productSectionTitles =
      appSchema.panels.controls?.sections
        .filter((section) => section.title !== "Setup")
        .map((section) => section.title) ?? [];

    expect(appSchema.panels.controls?.sections[0]?.title).toBe("Setup");
    expect(productSectionTitles).toEqual([
      "Pigments",
      "Brush",
      "Mixing",
      "Paper",
      "Watercolour Dynamics",
      "Background",
      "Image Export",
      "Export",
    ]);
    expect(appSchema.panels.layers).toBeUndefined();
    expect(appSchema.panels.timeline).toBeUndefined();
  });

  it("does not imply timeline behavior for this continuous WebGL simulation", () => {
    expect(appSchema.assembly.capabilities).not.toContain("timeline.playback");
    expect(appSchema.assembly.capabilities).not.toContain("timeline.keyframes");
    expect(appSchema.assembly.commands).not.toContain("timeline.toggleControlKeyframes");
    expect(appSchema.assembly.commands).not.toContain("timeline.moveKeyframe");
  });

  it("declares real performance coverage for every performance-sensitive control", () => {
    expect(appPerformance.scenarios.length).toBeGreaterThan(0);
    expect(appPerformance.workloadTargets).toEqual([
      "canvas.renderScale",
      "canvas.size.width",
      "canvas.size.height",
      "export.image.resolution",
      "brush.size",
    ]);
  });
});
