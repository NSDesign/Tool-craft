import { describe, expect, test } from "vitest";

import { appAcceptance } from "./app-acceptance";
import { appSchema } from "./app-schema";

function getAcceptance(id: string) {
  const entry = appAcceptance.find((candidate) => candidate.id === id);
  if (!entry) {
    throw new Error(`Missing acceptance entry ${id}`);
  }
  return entry;
}

function getSchemaControlByTarget(target: string) {
  for (const section of appSchema.panels.controls?.sections ?? []) {
    for (const control of Object.values(section.controls)) {
      if (control.target === target) {
        return control;
      }
    }
  }
  return undefined;
}

describe("watercolour app acceptance scenarios are well-formed", () => {
  test("acceptance: resolution scale renders a discrete slider and changes canvas backing pixels", () => {
    const entry = getAcceptance("canvas.renderScale");
    expect(entry.target).toBe("canvas.renderScale");
    expect(entry.componentType).toBe("slider");
  });

  test("acceptance: pigment swatch selection changes the active pigment and next stroke color", () => {
    const entry = getAcceptance("paint.currentPigmentColor");
    expect(entry.target).toBe("paint.currentPigmentColor");
    expect(entry.componentType).toBe("paintSwatches");
    expect(entry.builtInFitCheck?.closestBuiltIn).toBe("palette");
    expect(getSchemaControlByTarget("paint.currentPigmentColor")?.type).toBe("paintSwatches");
  });

  test("acceptance: hair type selection changes stroke bristle texture", () => {
    const entry = getAcceptance("brush.hairType");
    expect(entry.target).toBe("brush.hairType");
    expect(entry.componentType).toBe("segmented");
    expect(getSchemaControlByTarget("brush.hairType")?.type).toBe("segmented");
  });

  test("acceptance: brush type selection changes stroke stamp shape", () => {
    const entry = getAcceptance("brush.type");
    expect(entry.target).toBe("brush.type");
    expect(entry.componentType).toBe("segmented");
    expect(getSchemaControlByTarget("brush.type")?.type).toBe("segmented");
  });

  test("acceptance: brush size drag changes deposited stroke width", () => {
    const entry = getAcceptance("brush.size");
    expect(entry.target).toBe("brush.size");
    expect(entry.componentType).toBe("slider");
    expect(getSchemaControlByTarget("brush.size")?.type).toBe("slider");
  });

  test("acceptance: paper texture preset updates the roughness and relief sliders", () => {
    const entry = getAcceptance("paper.texturePreset");
    expect(entry.target).toBe("paper.texturePreset");
    expect(entry.componentType).toBe("actions");
    expect(getSchemaControlByTarget("paper.texturePreset")?.type).toBe("actions");
  });

  test("acceptance: tilt makes wet paint run down the page", () => {
    const entry = getAcceptance("dynamics.tilt");
    expect(entry.target).toBe("dynamics.tilt");
    expect(entry.componentType).toBe("slider");
    expect(getSchemaControlByTarget("dynamics.tilt")?.type).toBe("slider");
  });

  test("acceptance: mixing palette drag deposits pigment and sample click updates the active pigment", () => {
    const entry = getAcceptance("paint.mixingArea");
    expect(entry.target).toBe("paint.mixingArea");
    expect(entry.componentType).toBe("mixingArea");
    expect(entry.builtInFitCheck?.closestBuiltIn).toBe("palette");
    expect(getSchemaControlByTarget("paint.mixingArea")?.type).toBe("mixingArea");
  });

  test("acceptance: mixing palette reset clears the palette back to empty", () => {
    const entry = getAcceptance("paint.mixingArea.reset");
    expect(entry.target).toBe("paint.mixingArea.reset");
    expect(entry.componentType).toBe("actions");
    expect(getSchemaControlByTarget("paint.mixingArea.reset")?.type).toBe("actions");
  });

  test("acceptance: drying speed changes how quickly wet edges dry on the canvas", () => {
    const entry = getAcceptance("paper.dryingSpeed");
    expect(entry.target).toBe("paper.dryingSpeed");
    expect(entry.componentType).toBe("slider");
  });

  test("acceptance: relief height changes visible paper texture granulation contrast", () => {
    const entry = getAcceptance("paper.reliefHeight");
    expect(entry.target).toBe("paper.reliefHeight");
    expect(entry.componentType).toBe("slider");
  });

  test("acceptance: roughness changes visible paper texture frequency", () => {
    const entry = getAcceptance("paper.roughness");
    expect(entry.target).toBe("paper.roughness");
    expect(entry.componentType).toBe("slider");
  });

  test("acceptance: clear wipes the painted canvas back to blank paper", () => {
    const entry = getAcceptance("canvas.paintLayer");
    expect(entry.target).toBe("canvas.paintLayer");
    expect(entry.componentType).toBe("actions");
  });

  test("acceptance: edge darkening changes visible backrun contrast at wet/dry boundaries", () => {
    const entry = getAcceptance("dynamics.edgeDarkening");
    expect(entry.target).toBe("dynamics.edgeDarkening");
    expect(entry.componentType).toBe("slider");
  });

  test("acceptance: granulation changes visible pigment settling texture", () => {
    const entry = getAcceptance("dynamics.granulation");
    expect(entry.target).toBe("dynamics.granulation");
    expect(entry.componentType).toBe("slider");
  });

  test("acceptance: pigment opacity changes how strongly a single stroke lands", () => {
    const entry = getAcceptance("dynamics.pigmentOpacity");
    expect(entry.target).toBe("dynamics.pigmentOpacity");
    expect(entry.componentType).toBe("slider");
  });

  test("acceptance: wetness spread changes how far a stroke bleeds into neighbouring paper", () => {
    const entry = getAcceptance("dynamics.wetnessSpread");
    expect(entry.target).toBe("dynamics.wetnessSpread");
    expect(entry.componentType).toBe("slider");
  });

  test("acceptance: include toggle hides the paper background in preview and export", () => {
    const entry = getAcceptance("export.includeBackground");
    expect(entry.target).toBe("export.includeBackground");
    expect(entry.componentType).toBe("switch");
    expect(getSchemaControlByTarget("export.includeBackground")?.type).toBe("switch");
  });

  test("acceptance: background color changes the paper tint in preview and export", () => {
    const entry = getAcceptance("appearance.background");
    expect(entry.target).toBe("appearance.background");
    expect(entry.componentType).toBe("color");
    expect(getSchemaControlByTarget("appearance.background")?.type).toBe("color");
  });

  test("acceptance: image format selection changes the exported file's mime type", () => {
    const entry = getAcceptance("export.image.format");
    expect(entry.target).toBe("export.image.format");
    expect(entry.componentType).toBe("select");
  });

  test("acceptance: image resolution selection changes the exported file's pixel dimensions", () => {
    const entry = getAcceptance("export.image.resolution");
    expect(entry.target).toBe("export.image.resolution");
    expect(entry.componentType).toBe("select");
  });

  test("acceptance: export png footer action downloads a painted PNG", () => {
    const entry = getAcceptance("panel.actions");
    expect(entry.target).toBe("panel.actions");
    expect(entry.componentType).toBe("panelActions");
    expect(entry.actionCoverage).toContain("export-png");
  });

  test("acceptance: persisted brush and paper settings restore after a real browser reload", () => {
    const entry = getAcceptance("runtime.persistence.reload");
    expect(entry.kind).toBe("runtime");
    expect(entry.persistenceCoverage).toBe("reload");
    expect(appSchema.persistence.storage).toBe("localStorage");
  });
});
