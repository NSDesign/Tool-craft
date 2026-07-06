import { expect, test, type Page } from "@playwright/test";

import { appPerformance } from "../src/app/app-performance";
import {
  applyToolcraftPerformanceWorkloadFixture,
  dragToolcraftCanvasViewport,
  dragToolcraftSliderByLabel,
  dragToolcraftSliderToPerformanceStressValue,
  expectToolcraftCanvasBackingPixelsForRenderScale,
  expectToolcraftCanvasViewportStable,
  expectToolcraftDiscreteSliderDragSmoothness,
  expectToolcraftScenarioPerformanceBudget,
  getToolcraftFieldByLabel,
  getToolcraftPerformanceStressValue,
  measureToolcraftInteraction,
  zoomToolcraftCanvasViewport,
} from "./performance-helpers";

async function paintStroke(page: Page): Promise<void> {
  const canvas = page.locator('[data-toolcraft-watercolor-canvas="true"]');
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Watercolour canvas not found.");
  }

  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55, { steps: 8 });
  await page.mouse.up();
}

async function selectToolcraftOption(page: Page, label: string, optionLabel: string): Promise<void> {
  const field = await getToolcraftFieldByLabel(page, label);
  await field.locator('[data-slot="select-trigger"]').click();
  await page.getByRole("option", { name: optionLabel, exact: true }).click();
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  await expect(
    page.locator('[data-slot="field"]').filter({ hasText: /^Canvas width/ }),
  ).toBeVisible();
});

test("browser perf: watercolour simulation stays smooth at max canvas size", async ({ page }) => {
  const stress = getToolcraftPerformanceStressValue<{
    height: number;
    renderScale: number;
    width: number;
  }>(appPerformance, "watercolour-simulation-preview-render");

  const widthField = await getToolcraftFieldByLabel(page, "Canvas width");
  await widthField.locator("input").first().fill(String(stress.width));
  await page.keyboard.press("Tab");
  const heightField = await getToolcraftFieldByLabel(page, "Canvas height");
  await heightField.locator("input").first().fill(String(stress.height));
  await page.keyboard.press("Tab");
  await page.waitForTimeout(3000);
  await dragToolcraftSliderByLabel(page, "Resolution scale", stress.renderScale - 1);
  await expectToolcraftCanvasBackingPixelsForRenderScale(page, '[data-toolcraft-watercolor-canvas="true"]', stress.renderScale);

  const result = await measureToolcraftInteraction(page, async () => {
    await paintStroke(page);
  });

  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "watercolour-simulation-preview-render");
});

test("browser perf: brush size drag stays responsive at max size", async ({ page }) => {
  await applyToolcraftPerformanceWorkloadFixture(page, appPerformance, "brush-size-control-drag", {
    height: async (value) => {
      const field = await getToolcraftFieldByLabel(page, "Canvas height");
      await field.locator("input").first().fill(String(value));
      await page.keyboard.press("Tab");
    },
    renderScale: async (value) => {
      await page.waitForTimeout(3000);
      await dragToolcraftSliderByLabel(page, "Resolution scale", Number(value) - 1);
    },
    width: async (value) => {
      const field = await getToolcraftFieldByLabel(page, "Canvas width");
      await field.locator("input").first().fill(String(value));
      await page.keyboard.press("Tab");
    },
  });

  await expectToolcraftCanvasBackingPixelsForRenderScale(page, '[data-toolcraft-watercolor-canvas="true"]', 2);

  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderToPerformanceStressValue(page, "Size", appPerformance, "brush-size-control-drag");
    await paintStroke(page);
  });

  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "brush-size-control-drag");
});

test("browser perf: resolution scale drag stays responsive", async ({ page }) => {
  await applyToolcraftPerformanceWorkloadFixture(page, appPerformance, "render-scale-control-drag", {
    height: async (value) => {
      const field = await getToolcraftFieldByLabel(page, "Canvas height");
      await field.locator("input").first().fill(String(value));
      await page.keyboard.press("Tab");
    },
    renderScale: async (value) => {
      await page.waitForTimeout(3000);
      await dragToolcraftSliderByLabel(page, "Resolution scale", Number(value) - 1);
    },
    width: async (value) => {
      const field = await getToolcraftFieldByLabel(page, "Canvas width");
      await field.locator("input").first().fill(String(value));
      await page.keyboard.press("Tab");
    },
  });

  const stressValue = getToolcraftPerformanceStressValue<number>(appPerformance, "render-scale-control-drag");
  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderToPerformanceStressValue(
      page,
      "Resolution scale",
      appPerformance,
      "render-scale-control-drag",
    );
  });

  await expectToolcraftCanvasBackingPixelsForRenderScale(page, '[data-toolcraft-watercolor-canvas="true"]', stressValue);
  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "render-scale-control-drag");
  await expectToolcraftDiscreteSliderDragSmoothness(page, "Resolution scale");
});

test("browser perf: canvas width change stays responsive at max size", async ({ page }) => {
  await applyToolcraftPerformanceWorkloadFixture(page, appPerformance, "canvas-width-control-change", {
    height: async (value) => {
      const field = await getToolcraftFieldByLabel(page, "Canvas height");
      await field.locator("input").first().fill(String(value));
      await page.keyboard.press("Tab");
    },
    renderScale: async (value) => {
      await page.waitForTimeout(3000);
      await dragToolcraftSliderByLabel(page, "Resolution scale", Number(value) - 1);
    },
    width: async (value) => {
      const field = await getToolcraftFieldByLabel(page, "Canvas width");
      await field.locator("input").first().fill(String(value));
      await page.keyboard.press("Tab");
    },
  });
  const stressValue = getToolcraftPerformanceStressValue<number>(appPerformance, "canvas-width-control-change");
  await expectToolcraftCanvasBackingPixelsForRenderScale(page, '[data-toolcraft-watercolor-canvas="true"]', 2);

  const result = await measureToolcraftInteraction(page, async () => {
    const field = await getToolcraftFieldByLabel(page, "Canvas width");
    await field.locator("input").first().fill(String(stressValue));
    await page.keyboard.press("Tab");
    await paintStroke(page);
  });

  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "canvas-width-control-change");
});

test("browser perf: canvas height change stays responsive at max size", async ({ page }) => {
  await applyToolcraftPerformanceWorkloadFixture(page, appPerformance, "canvas-height-control-change", {
    height: async (value) => {
      const field = await getToolcraftFieldByLabel(page, "Canvas height");
      await field.locator("input").first().fill(String(value));
      await page.keyboard.press("Tab");
    },
    renderScale: async (value) => {
      await page.waitForTimeout(3000);
      await dragToolcraftSliderByLabel(page, "Resolution scale", Number(value) - 1);
    },
    width: async (value) => {
      const field = await getToolcraftFieldByLabel(page, "Canvas width");
      await field.locator("input").first().fill(String(value));
      await page.keyboard.press("Tab");
    },
  });
  const stressValue = getToolcraftPerformanceStressValue<number>(appPerformance, "canvas-height-control-change");
  await expectToolcraftCanvasBackingPixelsForRenderScale(page, '[data-toolcraft-watercolor-canvas="true"]', 2);

  const result = await measureToolcraftInteraction(page, async () => {
    const field = await getToolcraftFieldByLabel(page, "Canvas height");
    await field.locator("input").first().fill(String(stressValue));
    await page.keyboard.press("Tab");
    await paintStroke(page);
  });

  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "canvas-height-control-change");
});

test("browser perf: roughness drag stays responsive", async ({ page }) => {
  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderByLabel(page, "Roughness", 0.9);
    await paintStroke(page);
  });

  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "paper-roughness-control-drag");
});

test("browser perf: relief height drag stays responsive", async ({ page }) => {
  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderByLabel(page, "Relief height", 0.9);
    await paintStroke(page);
  });

  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "paper-relief-height-control-drag");
});

test("browser perf: drying speed drag stays responsive", async ({ page }) => {
  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderByLabel(page, "Drying speed", 0.9);
    await paintStroke(page);
  });

  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "paper-drying-speed-control-drag");
});

test("browser perf: wetness spread drag stays responsive", async ({ page }) => {
  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderByLabel(page, "Wetness spread", 0.9);
    await paintStroke(page);
  });

  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "wetness-spread-control-drag");
});

test("browser perf: granulation drag stays responsive", async ({ page }) => {
  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderByLabel(page, "Granulation", 0.9);
    await paintStroke(page);
  });

  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "granulation-control-drag");
});

test("browser perf: edge darkening drag stays responsive", async ({ page }) => {
  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderByLabel(page, "Edge darkening", 0.9);
    await paintStroke(page);
  });

  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "edge-darkening-control-drag");
});

test("browser perf: pigment opacity drag stays responsive", async ({ page }) => {
  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderByLabel(page, "Pigment opacity", 0.9);
    await paintStroke(page);
  });

  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "pigment-opacity-control-drag");
});

test("browser perf: pigment swatch selection stays responsive", async ({ page }) => {
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("button", { name: "Orange" }).click();
    await paintStroke(page);
  });

  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "pigment-swatch-control-change");
});

test("browser perf: brush type selection stays responsive", async ({ page }) => {
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("button", { name: "Filbert" }).click();
    await page.getByRole("button", { name: "Square" }).click();
    await page.getByRole("button", { name: "Round" }).click();
    await paintStroke(page);
  });

  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "brush-type-control-change");
});

test("browser perf: hair type selection stays responsive", async ({ page }) => {
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("button", { name: "Hog" }).click();
    await page.getByRole("button", { name: "Sable" }).click();
    await paintStroke(page);
  });

  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "hair-type-control-change");
});

test("browser perf: tilt drag stays responsive", async ({ page }) => {
  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderByLabel(page, "Tilt", 0.9);
    await paintStroke(page);
  });

  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "tilt-control-drag");
});

test("browser perf: paper texture preset stays responsive", async ({ page }) => {
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("button", { name: "Rough", exact: true }).click();
  });

  await expect(page.getByRole("button", { name: "Hot press", exact: true })).toBeVisible();
  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "paper-preset-control-change");
});

test("browser perf: mixing palette interactions stay responsive", async ({ page }) => {
  const mixingCanvas = page.locator('[data-toolcraft-mixing-area="true"] canvas');
  await mixingCanvas.scrollIntoViewIfNeeded();
  const box = await mixingCanvas.boundingBox();
  if (!box) {
    throw new Error("Mixing area canvas not found.");
  }

  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("button", { name: "Blue" }).click();

    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y + 60, { steps: 6 });
    await page.mouse.up();

    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.up();
  });

  await expect(mixingCanvas).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "mixing-area-control-change");
});

test("browser perf: mixing palette reset action stays responsive", async ({ page }) => {
  const mixingCanvas = page.locator('[data-toolcraft-mixing-area="true"] canvas');
  await mixingCanvas.scrollIntoViewIfNeeded();
  const box = await mixingCanvas.boundingBox();
  if (!box) {
    throw new Error("Mixing area canvas not found.");
  }

  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 60, { steps: 6 });
  await page.mouse.up();

  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("button", { name: "Reset", exact: true }).click();
  });

  await expect(mixingCanvas).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "mixing-reset-control-change");
});

test("browser perf: include background toggle stays responsive", async ({ page }) => {
  const includeField = await getToolcraftFieldByLabel(page, "Include");

  const result = await measureToolcraftInteraction(page, async () => {
    await includeField.getByRole("switch").click();
  });

  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "export-include-background-control-change");
});

test("browser perf: background color change stays responsive", async ({ page }) => {
  const result = await measureToolcraftInteraction(page, async () => {
    const hexInput = page.getByLabel("paperColor hex");
    await hexInput.fill("336699");
    await hexInput.press("Enter");
  });

  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "background-color-control-change");
});

test("browser perf: clear painting action stays responsive", async ({ page }) => {
  await paintStroke(page);

  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("button", { name: "Clear" }).click();
  });

  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "canvas-clear-control-change");
});

test("browser perf: image export format selection stays responsive", async ({ page }) => {
  const result = await measureToolcraftInteraction(page, async () => {
    const field = await getToolcraftFieldByLabel(page, "Format");
    await field.locator('[data-slot="select-trigger"]').click();
    await page.getByRole("option", { name: "JPEG", exact: true }).click();
  });

  await expect(page.getByRole("button", { name: "Export PNG" })).toBeVisible();
  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "export-image-format-control-change");
});

test("browser perf: image export resolution selection stays responsive", async ({ page }) => {
  await applyToolcraftPerformanceWorkloadFixture(page, appPerformance, "export-resolution-control-change", {
    height: async (value) => {
      const field = await getToolcraftFieldByLabel(page, "Canvas height");
      await field.locator("input").first().fill(String(value));
      await page.keyboard.press("Tab");
    },
    renderScale: async (value) => {
      await page.waitForTimeout(3000);
      await dragToolcraftSliderByLabel(page, "Resolution scale", Number(value) - 1);
    },
    width: async (value) => {
      const field = await getToolcraftFieldByLabel(page, "Canvas width");
      await field.locator("input").first().fill(String(value));
      await page.keyboard.press("Tab");
    },
  });
  const stressValue = getToolcraftPerformanceStressValue<string>(
    appPerformance,
    "export-resolution-control-change",
  );
  await expectToolcraftCanvasBackingPixelsForRenderScale(page, '[data-toolcraft-watercolor-canvas="true"]', 2);

  const result = await measureToolcraftInteraction(page, async () => {
    const field = await getToolcraftFieldByLabel(page, "Resolution");
    await field.locator('[data-slot="select-trigger"]').click();
    await page.getByRole("option", { name: stressValue.toUpperCase(), exact: true }).click();
  });

  await expect(page.getByRole("button", { name: "Export PNG" })).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "export-resolution-control-change");
});

test("browser perf: viewport zoom stays stable while painted", async ({ page }) => {
  const stress = getToolcraftPerformanceStressValue<{
    height: number;
    renderScale: number;
    width: number;
  }>(appPerformance, "watercolour-viewport-zoom-stress");

  const widthField = await getToolcraftFieldByLabel(page, "Canvas width");
  await widthField.locator("input").first().fill(String(stress.width));
  await page.keyboard.press("Tab");
  const heightField = await getToolcraftFieldByLabel(page, "Canvas height");
  await heightField.locator("input").first().fill(String(stress.height));
  await page.keyboard.press("Tab");
  await page.waitForTimeout(3000);
  await dragToolcraftSliderByLabel(page, "Resolution scale", stress.renderScale - 1);
  await expectToolcraftCanvasBackingPixelsForRenderScale(page, '[data-toolcraft-watercolor-canvas="true"]', stress.renderScale);
  await paintStroke(page);

  const result = await measureToolcraftInteraction(page, async () => {
    await zoomToolcraftCanvasViewport(page);
  });

  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "watercolour-viewport-zoom-stress");
});

test("browser perf: canvas viewport stays stable during painting", async ({ page }) => {
  const result = await expectToolcraftCanvasViewportStable(page, async () => {
    await paintStroke(page);
    await page.getByRole("button", { name: "Filbert" }).click();
  });

  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "watercolour-viewport-stability");
});

test("browser perf: viewport drag keeps simulation animating smoothly", async ({ page }) => {
  const stress = getToolcraftPerformanceStressValue<{
    height: number;
    renderScale: number;
    width: number;
  }>(appPerformance, "watercolour-animation-viewport-drag");

  const widthField = await getToolcraftFieldByLabel(page, "Canvas width");
  await widthField.locator("input").first().fill(String(stress.width));
  await page.keyboard.press("Tab");
  const heightField = await getToolcraftFieldByLabel(page, "Canvas height");
  await heightField.locator("input").first().fill(String(stress.height));
  await page.keyboard.press("Tab");
  await page.waitForTimeout(3000);
  await dragToolcraftSliderByLabel(page, "Resolution scale", stress.renderScale - 1);
  await expectToolcraftCanvasBackingPixelsForRenderScale(page, '[data-toolcraft-watercolor-canvas="true"]', stress.renderScale);
  await paintStroke(page);

  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftCanvasViewport(page);
  });

  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "watercolour-animation-viewport-drag");
});

test("browser perf: 8K export completes within budget", async ({ page }) => {
  const stressValue = getToolcraftPerformanceStressValue<string>(appPerformance, "image-export-8k");
  await paintStroke(page);
  await selectToolcraftOption(page, "Resolution", stressValue.toUpperCase());

  let downloadPath: string | null = null;
  const result = await measureToolcraftInteraction(page, async () => {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export PNG" }).click();
    const download = await downloadPromise;
    downloadPath = await download.path();
  });

  expect(downloadPath).toBeTruthy();
  expectToolcraftScenarioPerformanceBudget(
    { ...result, exportMs: result.durationMs },
    appPerformance,
    "image-export-8k",
  );
});
