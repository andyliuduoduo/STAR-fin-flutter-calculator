import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function edit(page, id, value) {
  await page.locator(`#${id}`).fill(value);
  await page.locator(`#${id}`).blur();
}
async function view(page, name) {
  await page.getByRole("button", { name, exact: true }).click();
}

test("invalid local inputs remain editable and recover in every view", async ({
  page,
}) => {
  await page.goto("/");
  await view(page, "Vortex & modes");
  await edit(page, "length", "0");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator("#length")).toHaveValue("0");
  await edit(page, "length", "5");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await edit(page, "modeFrequencies", "not a number");
  await expect(page.getByRole("alert")).toBeVisible();
  await edit(page, "modeFrequencies", "100, 250");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await edit(page, "modalMass", "-1");
  await expect(page.getByRole("alert")).toBeVisible();
  await edit(page, "modalMass", "2");
  await edit(page, "modalStiffness", "800");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await view(page, "Mounting & mass");
  await edit(page, "finCount", "3.5");
  await expect(page.getByRole("alert")).toBeVisible();
  await edit(page, "finCount", "4");
  await edit(page, "bodyOD", "-1");
  await expect(page.getByRole("alert")).toBeVisible();
  await edit(page, "bodyOD", "150");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await view(page, "Flutter envelope");
  await edit(page, "sweep", "-2000");
  await expect(page.getByRole("alert")).toContainText("ε");
  await page.locator("#method").selectOption("martin");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("editing then directly clicking or tabbing preserves actions, values and focus", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#thickness").fill("3");
  await view(page, "Imperial");
  await expect(page.locator("#thickness")).toHaveValue(
    String(Number((3 / 25.4).toPrecision(10))),
  );
  await view(page, "SI");
  await page.locator("#root").fill("500");
  await page.keyboard.press("Tab");
  await expect(page.locator("#tip")).toBeFocused();
  await page.locator("#tip").fill("200");
  await page.locator("#span").click();
  await expect(page.locator("#span")).toBeFocused();
  await expect(page.locator("#tip")).toHaveValue("200");
  await page.locator(".sidebar summary").first().click();
  await view(page, "Method & sources");
  await expect(page.locator(".sidebar details").first()).not.toHaveAttribute(
    "open",
  );
});

test("hybrid study with missing G saves and exports without fake flutter results", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#material").selectOption("hybrid");
  await expect(page.getByRole("alert")).toContainText("Shear modulus");
  await view(page, "Save snapshot");
  await expect(page.getByRole("status")).toContainText("Snapshot saved");
  const pending = page.waitForEvent("download");
  await view(page, "Export case");
  const file = await (await pending).path();
  const data = JSON.parse(await readFile(file, "utf8"));
  expect(data.inputs.shear).toBeNull();
  await view(page, "Reset");
  await page.locator("#case-file").setInputFiles(file);
  await expect(page.locator("#material")).toHaveValue("hybrid");
  await expect(page.getByRole("alert")).toContainText("Shear modulus");
  await view(page, "Mounting & mass");
  await expect(
    page.getByRole("heading", { name: "Assembly mass estimate" }),
  ).toBeVisible();
});

test("local atmosphere, presets, zero speed, CSV export and print are functional", async ({
  page,
}) => {
  await page.goto("/");
  for (const material of ["al6061", "g10", "al7075"]) {
    await page.locator("#material").selectOption(material);
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  await page.locator("#atmosphere").selectOption("local");
  await edit(page, "siteTemperature", "30");
  await edit(page, "sitePressure", "93");
  await edit(page, "altitude", "0");
  await expect(page.locator(".facts").first()).toContainText("93.0");
  await edit(page, "speed", "0");
  await expect(page.locator(".callout").first()).toContainText("nonzero");
  const templatePending = page.waitForEvent("download");
  await view(page, "Download CSV template");
  const templatePath = await (await templatePending).path();
  await page.locator("#trajectory-file").setInputFiles(templatePath);
  await expect(page.locator(".trajectory-summary")).toContainText("5 samples");
  const resultPending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export evaluated CSV" }).click();
  const resultText = await readFile(await (await resultPending).path(), "utf8");
  expect(resultText.trim().split("\n")).toHaveLength(6);
  expect(resultText).not.toMatch(/NaN|Infinity/);
  await page
    .locator("#trajectory-file")
    .setInputFiles({
      name: "roundtrip.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(resultText),
    });
  await expect(page.locator(".trajectory-summary")).toContainText(
    "roundtrip.csv",
  );
  await page.evaluate(() => {
    window.print = () => {
      window.didPrint = true;
    };
  });
  await view(page, "Print");
  expect(await page.evaluate(() => window.didPrint)).toBe(true);
});

test("malformed imports and unavailable storage do not corrupt the current study", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("star-finlab-cases-v1", "[null,42]"),
  );
  await page.goto("/");
  await expect(page.locator("#saved-case option")).toHaveCount(1);
  await page
    .locator("#case-file")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":1,"inputs":{"root":1}}'),
    });
  await expect(page.getByRole("status")).toContainText("Missing case input");
  await expect(page.locator("#root")).toHaveValue("508");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error("Storage unavailable");
    };
  });
  await view(page, "Save snapshot");
  await expect(page.getByRole("status")).toContainText("Storage unavailable");
  await expect(page.locator("#saved-case option")).toHaveCount(1);
  await edit(page, "name", '<img src=x onerror="window.injected=true">');
  await expect(page.locator("#name")).toHaveValue(
    '<img src=x onerror="window.injected=true">',
  );
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
});

test("all views remain usable on a small phone, including error recovery", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  for (const name of [
    "Flutter envelope",
    "Vortex & modes",
    "Mounting & mass",
    "Method & sources",
  ]) {
    await view(page, name);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await view(page, "Vortex & modes");
  await edit(page, "length", "0");
  await expect(page.getByRole("alert")).toBeVisible();
  await edit(page, "length", "5");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
