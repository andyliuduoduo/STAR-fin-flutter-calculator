import { test, expect } from "@playwright/test";

test("point calculation responds, units round trip, independent screens work", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#root")).toHaveValue("508");
  await expect(page.locator("#sweep")).toHaveValue("152.4");
  await expect(page.locator("#sweep-help")).toContainText("Root leading edge");
  await expect(page.locator(".fin-svg")).toContainText("m 152.4 mm");
  await expect(
    page.getByRole("heading", { name: "Fin flutter, with context." }),
  ).toBeVisible();
  const before = await page
    .locator(".metric.featured .metric-value")
    .textContent();
  await page.locator("#thickness").fill("3");
  await page.locator("#thickness").blur();
  await expect(page.locator(".metric.featured .metric-value")).not.toHaveText(
    before,
  );
  await page.getByRole("button", { name: "Imperial", exact: true }).click();
  expect(Number(await page.locator("#thickness").inputValue())).toBeCloseTo(
    3 / 25.4,
    8,
  );
  await page.getByRole("button", { name: "SI", exact: true }).click();
  await expect(page.locator("#thickness")).toHaveValue("3");
  await page.locator("#material").selectOption("hybrid");
  await expect(page.getByRole("alert")).toContainText("Shear modulus");
  await page
    .getByRole("button", { name: "Vortex & modes", exact: true })
    .click();
  await page.locator("#modeFrequencies").fill("100, 500");
  await page.locator("#modeFrequencies").blur();
  await expect(
    page.getByRole("heading", { name: "Potential frequency crossings" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Mounting & mass", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Assembly mass estimate" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Method & sources", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bennett / Martin relation" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("snapshots persist, exports round trip and trajectory evaluation appears", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#name").fill("Test case");
  await page.locator("#name").blur();
  await page
    .getByRole("button", { name: "Save snapshot", exact: true })
    .click();
  await page.reload();
  await expect(page.locator("#saved-case option")).toHaveCount(2);
  await page.locator("#saved-case").selectOption("0");
  await expect(page.locator("#name")).toHaveValue("Test case");
  const d = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export case", exact: true }).click();
  const download = await d;
  const path = await download.path();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.locator("#case-file").setInputFiles(path);
  await expect(page.locator("#name")).toHaveValue("Test case");
  await page
    .locator("#trajectory-file")
    .setInputFiles({
      name: "flight.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "time_s,altitude_agl_m,speed_m_s\n0,0,0\n1,100,200\n2,300,300\n",
      ),
    });
  await expect(page.locator(".trajectory-summary")).toContainText("3 samples");
  await page
    .locator("#trajectory-file")
    .setInputFiles({
      name: "bad.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "time_s,altitude_agl_m,vertical_velocity_m_s\n0,0,0\n1,1,1",
      ),
    });
  await expect(page.getByRole("status")).toContainText("Vertical velocity");
  await expect(page.locator(".trajectory-summary")).toContainText("flight.csv");
});
test("mobile layout has no page overflow and controls remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page
    .getByRole("button", { name: "Vortex & modes", exact: true })
    .click();
  await expect(page.locator("#st")).toBeVisible();
  await page.locator("#length").fill("0");
  await page.locator("#length").blur();
  await expect(page.getByRole("alert")).toBeVisible();
});
