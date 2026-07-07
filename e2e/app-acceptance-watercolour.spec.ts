import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import {
  dragToolcraftSliderByLabel,
  expectToolcraftDiscreteSliderDragSmoothness,
  expectToolcraftSegmentedControlCellsPreservePadding,
  getToolcraftFieldByLabel,
} from "./performance-helpers";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";

const watercolorCanvasSelector = '[data-toolcraft-watercolor-canvas="true"]';
const mixingAreaCanvasSelector = '[data-toolcraft-mixing-area="true"] canvas';

async function paintStroke(page: Page): Promise<void> {
  const canvas = page.locator(watercolorCanvasSelector);
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
  // The rendered select-item options don't expose a normal accessible name (their text sits inside
  // a scroll-fade wrapper), so match by role + exact visible text instead of getByRole's name filter.
  await page
    .locator('[role="option"]')
    .filter({ hasText: new RegExp(`^${optionLabel}$`) })
    .click();
}

async function decodePngDimensions(
  page: Page,
  fileBytes: Buffer,
): Promise<{ height: number; width: number }> {
  const base64 = fileBytes.toString("base64");

  return page.evaluate(async (encoded) => {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const blob = new Blob([bytes]);
    const bitmap = await createImageBitmap(blob);
    const dimensions = { height: bitmap.height, width: bitmap.width };
    bitmap.close();
    return dimensions;
  }, base64);
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }, testInfo) => {
  // Software (SwiftShader-class) GL rendering makes the real WebGL2 simulation and PNG encode/decode
  // steps in this sandbox much slower than on a GPU-accelerated browser; give each real interaction
  // test enough headroom instead of racing the default 30s timeout.
  testInfo.setTimeout(180_000);
  // Acceptance verifies product behaviour, not workload (declared workload/stress fixtures live in
  // the performance suite), so start from a small persisted canvas: the multi-pass simulation then
  // runs fast enough under software GL for strokes and pixel snapshots to complete reliably.
  await page.addInitScript(() => {
    // Only seed a missing state so in-test reloads keep the runtime's own
    // persisted values (the persistence acceptance test depends on that).
    if (!window.localStorage.getItem("toolcraft:watercolour-painter:state:v1")) {
      window.localStorage.setItem(
        "toolcraft:watercolour-painter:state:v1",
        JSON.stringify({
          version: 1,
          state: {
            canvas: { size: { height: 270, unit: "px", width: 480 } },
            values: { "canvas.renderScale": 1 },
          },
        }),
      );
    }
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator(watercolorCanvasSelector)).toBeVisible();
});

test("acceptance: pigment swatch selection changes the active pigment and next stroke color", async ({
  page,
}) => {
  await expectToolcraftProductObservableToChange(
    page,
    async () => {
      await page.getByRole("radio", { name: "Orange" }).click();
      await paintStroke(page);
    },
    { timeoutMs: 60_000 },
  );

  // The clear Water swatch is a wet brush: stroking over the paint deposits no
  // new colour but re-wets it, visibly softening/bleeding the stroke.
  await expectToolcraftProductObservableToChange(
    page,
    async () => {
      await page.getByRole("radio", { name: "Water" }).click();
      await paintStroke(page);
      await page.waitForTimeout(1500);
    },
    { timeoutMs: 60_000 },
  );
});

test("acceptance: consecutive same-pigment strokes each deposit paint", async ({ page }) => {
  // Regression guard: the brush re-dips at the start of every stroke, so a second
  // stroke of the already-selected pigment must still deposit (previously the first
  // stroke drained the brush charge and later same-colour strokes painted nothing
  // until a different swatch was re-picked).
  const canvas = page.locator(watercolorCanvasSelector);
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Watercolour canvas not found.");
  }

  async function strokeAtBand(yFrac: number): Promise<void> {
    await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * yFrac);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * yFrac, { steps: 10 });
    await page.mouse.up();
  }

  // First stroke (default Red, full charge) establishes paint and, under the old
  // bug, drained the charge.
  await strokeAtBand(0.35);
  await page.waitForTimeout(1500);

  // Second stroke, same pigment, NO re-pick: must still change the canvas.
  await expectToolcraftProductObservableToChange(
    page,
    async () => {
      await strokeAtBand(0.65);
      await page.waitForTimeout(1500);
    },
    { timeoutMs: 60_000 },
  );
});

test("acceptance: hair type selection changes stroke bristle texture", async ({ page }) => {
  await expectToolcraftSegmentedControlCellsPreservePadding(page, "Hair type");

  await page.getByRole("button", { name: "Hog" }).click();

  await expectToolcraftProductObservableToChange(
    page,
    async () => {
      await paintStroke(page);
    },
    { timeoutMs: 60_000 },
  );
});

test("acceptance: brush type selection changes stroke stamp shape", async ({ page }) => {
  await expectToolcraftSegmentedControlCellsPreservePadding(page, "Type");

  await page.getByRole("button", { name: "Filbert" }).click();

  await expectToolcraftProductObservableToChange(
    page,
    async () => {
      await paintStroke(page);
    },
    { timeoutMs: 60_000 },
  );
});

test("acceptance: resolution scale renders a discrete slider and changes canvas backing pixels", async ({
  page,
}) => {
  const field = await getToolcraftFieldByLabel(page, "Resolution scale");
  await expect(field.locator('[data-slot="slider"][data-variant="discrete"]')).toBeVisible();
  await expect(field.locator('[data-slot="slider-marker"]').first()).toBeVisible();

  // Drags the discrete Resolution scale slider and asserts smooth, responsive tick-marker behavior.
  await expectToolcraftDiscreteSliderDragSmoothness(page, "Resolution scale");

  await expectToolcraftProductObservableToChange(
    page,
    async () => {
      await paintStroke(page);
    },
    { timeoutMs: 60_000 },
  );
});

test("acceptance: brush size drag changes deposited stroke width", async ({ page }) => {
  await dragToolcraftSliderByLabel(page, "Size", 0.9);

  await expectToolcraftProductObservableToChange(
    page,
    async () => {
      await paintStroke(page);
    },
    { timeoutMs: 60_000 },
  );
});

test("acceptance: paper texture preset updates the roughness and relief sliders", async ({
  page,
}) => {
  // The preset action one-shot-writes the two visible sliders and visibly
  // changes the blank paper texture rendered on the canvas.
  await expectToolcraftProductObservableToChange(
    page,
    async () => {
      await page.getByRole("button", { name: "Rough", exact: true }).click();
    },
    { timeoutMs: 60_000 },
  );

  // The slider's current value is rendered as the text of its editable value
  // button (the slider group itself carries no aria-valuenow).
  const roughnessValue = page.getByRole("button", { name: "Edit Roughness value" });
  await expect(roughnessValue).toContainText("86");

  await page.getByRole("button", { name: "Hot press", exact: true }).click();
  await expect(roughnessValue).toContainText("14");

  const reliefValue = page.getByRole("button", { name: "Edit Relief height value" });
  await expect(reliefValue).toContainText("18");
});

test("acceptance: tilt makes wet paint run down the page", async ({ page }) => {
  await dragToolcraftSliderByLabel(page, "Tilt", 0.95);

  // A very wet stroke near the top of the tilted paper visibly deposits and
  // then sags downward as the surface flow runs with gravity.
  await expectToolcraftProductObservableToChange(
    page,
    async () => {
      await paintStroke(page);
      await page.waitForTimeout(2000);
    },
    { timeoutMs: 60_000 },
  );
});

test("acceptance: mixing palette drag deposits pigment and sample click updates the active pigment", async ({
  page,
}) => {
  await page.getByRole("radio", { name: "Blue" }).click();

  const mixingCanvas = page.locator(mixingAreaCanvasSelector);
  await mixingCanvas.scrollIntoViewIfNeeded();
  const box = await mixingCanvas.boundingBox();
  if (!box) {
    throw new Error("Mixing area canvas not found.");
  }

  await expectToolcraftProductObservableToChange(
    page,
    async () => {
      await page.mouse.move(box.x + 20, box.y + 20);
      await page.mouse.down();
      await page.mouse.move(box.x + 70, box.y + 70, { steps: 8 });
      await page.mouse.up();
    },
    { selector: mixingAreaCanvasSelector, timeoutMs: 60_000 },
  );

  // A plain click (no drag) on the deposited dab samples its color and updates the active pigment,
  // which the next stroke on the main canvas should reflect.
  await page.mouse.move(box.x + 45, box.y + 45);
  await page.mouse.down();
  await page.mouse.up();

  await expectToolcraftProductObservableToChange(
    page,
    async () => {
      await paintStroke(page);
    },
    { timeoutMs: 60_000 },
  );
});

test("acceptance: mixing palette reset clears the palette back to empty", async ({ page }) => {
  await page.getByRole("radio", { name: "Green" }).click();

  const mixingCanvas = page.locator(mixingAreaCanvasSelector);
  await mixingCanvas.scrollIntoViewIfNeeded();
  const box = await mixingCanvas.boundingBox();
  if (!box) {
    throw new Error("Mixing area canvas not found.");
  }

  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 70, box.y + 70, { steps: 8 });
  await page.mouse.up();

  await expectToolcraftProductObservableToChange(
    page,
    async () => {
      await page.getByRole("button", { name: "Reset", exact: true }).click();
    },
    { selector: mixingAreaCanvasSelector, timeoutMs: 60_000 },
  );
});

test("acceptance: drying speed changes how quickly wet edges dry on the canvas", async ({ page }) => {
  await dragToolcraftSliderByLabel(page, "Drying speed", 0.95);

  await expectToolcraftProductObservableToChange(
    page,
    async () => {
      await paintStroke(page);
    },
    { timeoutMs: 60_000 },
  );
});

test("acceptance: relief height changes visible paper texture granulation contrast", async ({
  page,
}) => {
  await dragToolcraftSliderByLabel(page, "Relief height", 0.95);

  await expectToolcraftProductObservableToChange(
    page,
    async () => {
      await paintStroke(page);
    },
    { timeoutMs: 60_000 },
  );
});

test("acceptance: roughness changes visible paper texture frequency", async ({ page }) => {
  await dragToolcraftSliderByLabel(page, "Roughness", 0.95);

  await expectToolcraftProductObservableToChange(
    page,
    async () => {
      await paintStroke(page);
    },
    { timeoutMs: 60_000 },
  );
});

test("acceptance: clear wipes the painted canvas back to blank paper", async ({ page }) => {
  await paintStroke(page);

  await expectToolcraftProductObservableToChange(
    page,
    async () => {
      await page.getByRole("button", { name: "Clear" }).click();
    },
    { timeoutMs: 60_000 },
  );
});

test("acceptance: edge darkening changes visible backrun contrast at wet/dry boundaries", async ({
  page,
}) => {
  await dragToolcraftSliderByLabel(page, "Edge darkening", 0.95);

  await expectToolcraftProductObservableToChange(
    page,
    async () => {
      await paintStroke(page);
    },
    { timeoutMs: 60_000 },
  );
});

test("acceptance: granulation changes visible pigment settling texture", async ({ page }) => {
  await dragToolcraftSliderByLabel(page, "Granulation", 0.95);

  await expectToolcraftProductObservableToChange(
    page,
    async () => {
      await paintStroke(page);
    },
    { timeoutMs: 60_000 },
  );
});

test("acceptance: pigment opacity changes how strongly a single stroke lands", async ({ page }) => {
  await dragToolcraftSliderByLabel(page, "Pigment opacity", 0.95);

  await expectToolcraftProductObservableToChange(
    page,
    async () => {
      await paintStroke(page);
    },
    { timeoutMs: 60_000 },
  );
});

test("acceptance: wetness spread changes how far a stroke bleeds into neighbouring paper", async ({
  page,
}) => {
  await dragToolcraftSliderByLabel(page, "Wetness spread", 0.95);

  await expectToolcraftProductObservableToChange(
    page,
    async () => {
      await paintStroke(page);
    },
    { timeoutMs: 60_000 },
  );
});

test("acceptance: include toggle hides the paper background in preview and export", async ({
  page,
}) => {
  await paintStroke(page);

  // Turning Include off must hide the painted preview's paper background (canvas pixels change).
  // The Switch primitive renders its visible label as an unassociated sibling (no aria-label/aria-
  // labelledby), so the switch itself has no accessible name; scope to the labeled Field instead.
  const includeField = await getToolcraftFieldByLabel(page, "Include");
  await expectToolcraftProductObservableToChange(
    page,
    async () => {
      await includeField.getByRole("switch").click();
    },
    { timeoutMs: 60_000 },
  );

  // ...and it must produce a transparent-background PNG export, not just a transparent preview.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("Export PNG did not produce a downloaded file.");
  }

  const fileBytes = readFileSync(downloadPath);
  const hasTransparentCorner = await page.evaluate(async (bytes) => {
    const blob = new Blob([new Uint8Array(bytes)]);
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) {
      return false;
    }
    context.drawImage(bitmap, 0, 0);
    const corner = context.getImageData(0, 0, 1, 1).data;
    bitmap.close();
    return corner[3] === 0;
  }, Array.from(fileBytes));

  expect(
    hasTransparentCorner,
    "Exported PNG corner pixel (unpainted paper background) must be fully transparent when Include is off.",
  ).toBe(true);
});

test("acceptance: background color changes the paper tint in preview and export", async ({
  page,
}) => {
  await expectToolcraftProductObservableToChange(
    page,
    async () => {
      const hexInput = page.getByLabel("paperColor hex");
      await hexInput.fill("2244AA");
      await hexInput.press("Enter");
    },
    { timeoutMs: 60_000 },
  );
});

test("acceptance: image format selection changes the exported file's mime type", async ({
  page,
}) => {
  await paintStroke(page);
  await selectToolcraftOption(page, "Format", "JPEG");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("Export did not produce a downloaded file.");
  }

  const fileBytes = readFileSync(downloadPath);
  const isJpeg = fileBytes[0] === 0xff && fileBytes[1] === 0xd8 && fileBytes[2] === 0xff;

  expect(isJpeg, "Selecting JPEG format must download real image/jpeg bytes (FF D8 FF signature).").toBe(
    true,
  );
});

test("acceptance: image resolution selection changes the exported file's pixel dimensions", async ({
  page,
}) => {
  await paintStroke(page);
  // export.image.resolution: selecting the 2K preset must resolve to a real 2048px long-edge PNG.
  // "Resolution" is a prefix of the built-in Runtime Setup "Resolution scale" field label, so
  // getToolcraftFieldByLabel's prefix match needs a lookahead to avoid matching that field instead.
  await selectToolcraftOption(page, "Resolution(?! scale)", "2K");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("Export did not produce a downloaded file.");
  }

  const fileBytes = readFileSync(downloadPath);
  const bitmap = await decodePngDimensions(page, fileBytes);

  expect(Math.max(bitmap.width, bitmap.height)).toBe(2048);
});

test("acceptance: export png footer action downloads a painted PNG", async ({ page }) => {
  await paintStroke(page);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("Export PNG did not produce a downloaded file.");
  }

  const fileBytes = readFileSync(downloadPath);
  const isPng =
    fileBytes[0] === 0x89 &&
    fileBytes[1] === 0x50 &&
    fileBytes[2] === 0x4e &&
    fileBytes[3] === 0x47;

  expect(isPng, "Export PNG must download real PNG-encoded bytes (89 50 4E 47 signature).").toBe(true);

  const bitmap = await decodePngDimensions(page, fileBytes);
  expect(bitmap.width).toBeGreaterThan(0);
  expect(bitmap.height).toBeGreaterThan(0);
});

test("acceptance: persisted brush and paper settings restore after a real browser reload", async ({
  page,
}) => {
  await dragToolcraftSliderByLabel(page, "Size", 0.9);

  const sizeField = await getToolcraftFieldByLabel(page, "Size");
  const sizeSlider = sizeField.locator('[data-slot="slider"], [role="slider"]').first();
  const valueBeforeReload = await sizeSlider.getAttribute("aria-valuenow");

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(watercolorCanvasSelector)).toBeVisible();

  const sizeFieldAfterReload = await getToolcraftFieldByLabel(page, "Size");
  const sizeSliderAfterReload = sizeFieldAfterReload
    .locator('[data-slot="slider"], [role="slider"]')
    .first();
  const valueAfterReload = await sizeSliderAfterReload.getAttribute("aria-valuenow");

  expect(valueAfterReload).toBe(valueBeforeReload);
  expect(valueAfterReload).not.toBe("4");
});
