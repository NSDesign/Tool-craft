import { expect, test } from "@playwright/test";

test.beforeEach(({}, testInfo) => {
  // First-load under this sandbox's software GL rendering combines Vite's cold
  // module transform with slow initial WebGL frames; the default 30s timeout is
  // borderline when other spec files run concurrently.
  testInfo.setTimeout(90_000);
});

test("browser: watercolour app renders the product controls shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await expect(page.getByRole("application", { name: "Canvas viewport" })).toBeVisible();
  await expect(page.locator('[data-toolcraft-watercolor-canvas="true"]')).toBeVisible();

  await expect(page.getByRole("radio", { name: "Red" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Water" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export PNG" })).toBeVisible();

  await expect(page.getByText("Toolcraft App Template Controls")).toHaveCount(0);
  await expect(page.getByText("Prompt")).toHaveCount(0);
  await expect(page.getByText("Dur:")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Play playback|Pause playback/ })).toHaveCount(0);
});

test("browser: watercolour canvas does not accept arbitrary file uploads", async ({ page }) => {
  await page.goto("/");

  const upload = await page.evaluateHandle(() => {
    const dataTransfer = new DataTransfer();
    const file = new File(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="96"><rect width="128" height="96" fill="#888"/></svg>',
      ],
      "unexpected-upload.svg",
      { type: "image/svg+xml" },
    );

    dataTransfer.items.add(file);
    return dataTransfer;
  });

  await page
    .getByRole("application", { name: "Canvas viewport" })
    .dispatchEvent("drop", { dataTransfer: upload });

  // This product's canvas is a direct-painting surface (canvas.upload: false); it must not accept
  // a dropped file as a new media/background layer.
  await expect(page.getByRole("img", { name: "unexpected-upload.svg" })).toHaveCount(0);
});
