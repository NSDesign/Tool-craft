import { describe, expect, test } from "vitest";

import { appPerformance } from "./app-performance";

function getScenario(id: string) {
  const scenario = appPerformance.scenarios.find((entry) => entry.id === id);
  if (!scenario) {
    throw new Error(`Missing performance scenario ${id}`);
  }
  return scenario;
}

describe("watercolour app performance scenarios are well-formed", () => {
  test("perf: watercolour-simulation-preview-render scenario is well-formed", () => {
    const scenario = getScenario("watercolour-simulation-preview-render");
    expect(scenario.workload).toBe(true);
    expect(scenario.budget.maxFrameGapMs).toBeGreaterThan(0);
  });

  test("perf: brush-size-control-drag scenario is well-formed", () => {
    const scenario = getScenario("brush-size-control-drag");
    expect(scenario.target).toBe("brush.size");
    expect(scenario.workloadFixture).toBeDefined();
  });

  test("perf: render-scale-control-drag scenario is well-formed", () => {
    const scenario = getScenario("render-scale-control-drag");
    expect(scenario.target).toBe("canvas.renderScale");
  });

  test("perf: canvas-width-control-change scenario is well-formed", () => {
    expect(getScenario("canvas-width-control-change").target).toBe("canvas.size.width");
  });

  test("perf: canvas-height-control-change scenario is well-formed", () => {
    expect(getScenario("canvas-height-control-change").target).toBe("canvas.size.height");
  });

  test("perf: paper-roughness-control-drag scenario is well-formed", () => {
    expect(getScenario("paper-roughness-control-drag").target).toBe("paper.roughness");
  });

  test("perf: paper-relief-height-control-drag scenario is well-formed", () => {
    expect(getScenario("paper-relief-height-control-drag").target).toBe("paper.reliefHeight");
  });

  test("perf: paper-drying-speed-control-drag scenario is well-formed", () => {
    expect(getScenario("paper-drying-speed-control-drag").target).toBe("paper.dryingSpeed");
  });

  test("perf: wetness-spread-control-drag scenario is well-formed", () => {
    expect(getScenario("wetness-spread-control-drag").target).toBe("dynamics.wetnessSpread");
  });

  test("perf: granulation-control-drag scenario is well-formed", () => {
    expect(getScenario("granulation-control-drag").target).toBe("dynamics.granulation");
  });

  test("perf: edge-darkening-control-drag scenario is well-formed", () => {
    expect(getScenario("edge-darkening-control-drag").target).toBe("dynamics.edgeDarkening");
  });

  test("perf: pigment-opacity-control-drag scenario is well-formed", () => {
    expect(getScenario("pigment-opacity-control-drag").target).toBe("dynamics.pigmentOpacity");
  });

  test("perf: pigment-swatch-control-change scenario is well-formed", () => {
    expect(getScenario("pigment-swatch-control-change").target).toBe("paint.currentPigmentColor");
  });

  test("perf: brush-type-control-change scenario is well-formed", () => {
    expect(getScenario("brush-type-control-change").target).toBe("brush.type");
  });

  test("perf: hair-type-control-change scenario is well-formed", () => {
    expect(getScenario("hair-type-control-change").target).toBe("brush.hairType");
  });

  test("perf: tilt-control-drag scenario is well-formed", () => {
    expect(getScenario("tilt-control-drag").target).toBe("dynamics.tilt");
  });

  test("perf: paper-preset-control-change scenario is well-formed", () => {
    expect(getScenario("paper-preset-control-change").target).toBe("paper.texturePreset");
  });

  test("perf: mixing-area-control-change scenario is well-formed", () => {
    expect(getScenario("mixing-area-control-change").target).toBe("paint.mixingArea");
  });

  test("perf: mixing-reset-control-change scenario is well-formed", () => {
    expect(getScenario("mixing-reset-control-change").target).toBe("paint.mixingArea.reset");
  });

  test("perf: export-include-background-control-change scenario is well-formed", () => {
    expect(getScenario("export-include-background-control-change").target).toBe(
      "export.includeBackground",
    );
  });

  test("perf: background-color-control-change scenario is well-formed", () => {
    expect(getScenario("background-color-control-change").target).toBe("appearance.background");
  });

  test("perf: canvas-clear-control-change scenario is well-formed", () => {
    expect(getScenario("canvas-clear-control-change").target).toBe("canvas.paintLayer");
  });

  test("perf: export-image-format-control-change scenario is well-formed", () => {
    expect(getScenario("export-image-format-control-change").target).toBe("export.image.format");
  });

  test("perf: export-resolution-control-change scenario is well-formed", () => {
    expect(getScenario("export-resolution-control-change").target).toBe("export.image.resolution");
  });

  test("perf: watercolour-viewport-zoom-stress scenario is well-formed", () => {
    const scenario = getScenario("watercolour-viewport-zoom-stress");
    expect(scenario.interaction).toBe("viewport-zoom-stress");
    expect(scenario.stress).toBe(true);
  });

  test("perf: watercolour-viewport-stability scenario is well-formed", () => {
    expect(getScenario("watercolour-viewport-stability").interaction).toBe("viewport-stability");
  });

  test("perf: watercolour-animation-viewport-drag scenario is well-formed", () => {
    const scenario = getScenario("watercolour-animation-viewport-drag");
    expect(scenario.interaction).toBe("animation-viewport-drag");
    expect(scenario.stress).toBe(true);
  });

  test("perf: image-export-8k scenario is well-formed", () => {
    const scenario = getScenario("image-export-8k");
    expect(scenario.target).toBe("export.image.resolution");
    expect(scenario.budget.maxExportMs).toBeGreaterThan(0);
  });
});
