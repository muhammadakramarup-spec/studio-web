import { expect, test } from "@playwright/test";

test("Studio Shell keeps the load-to-export workflow focused and discoverable", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Open GLB" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Open project" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Turn a 3D asset into a finished visual." })).toBeVisible();
  await expect(page.locator("#panel-ai")).toBeHidden();
  await expect(page.locator("#panel-account")).toBeHidden();

  const visibleTiles = page.locator(".library-panel__tile");
  await expect(visibleTiles).toHaveCount(96);

  const exportGroup = page.getByRole("group", { name: "Export" });
  await expect(exportGroup).toBeVisible();
  const geometry = await exportGroup.evaluate((group) => {
    const groupRect = group.getBoundingClientRect();
    const toolbarRect = group.parentElement!.getBoundingClientRect();
    const appBodyRect = document.querySelector("#app-body")!.getBoundingClientRect();
    const inspectorRect = document.querySelector(".sidebar-right")!.getBoundingClientRect();
    return {
      groupLeft: groupRect.left,
      groupRight: groupRect.right,
      toolbarLeft: toolbarRect.left,
      toolbarRight: toolbarRect.right,
      scrollLeft: group.parentElement!.scrollLeft,
      viewportWidth: window.innerWidth,
      appBodyRight: appBodyRect.right,
      inspectorLeft: inspectorRect.left,
      inspectorRight: inspectorRect.right,
    };
  });

  expect(geometry.scrollLeft).toBe(0);
  expect(geometry.groupLeft).toBeGreaterThanOrEqual(geometry.toolbarLeft);
  expect(geometry.groupRight).toBeLessThanOrEqual(geometry.toolbarRight + 1);
  expect(geometry.groupRight).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.appBodyRight).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.inspectorLeft).toBeLessThan(geometry.viewportWidth);
  expect(geometry.inspectorRight).toBeLessThanOrEqual(geometry.viewportWidth + 1);
});

test("Studio Shell keeps the desktop toolbar readable without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");

  const geometry = await page.getByRole("group", { name: "Export" }).evaluate((group) => {
    const groupRect = group.getBoundingClientRect();
    const noteRect = group.querySelector(".export-note")!.getBoundingClientRect();
    const toolbar = group.parentElement!;
    return {
      groupRight: groupRect.right,
      noteWidth: noteRect.width,
      toolbarClientWidth: toolbar.clientWidth,
      toolbarScrollWidth: toolbar.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });

  expect(geometry.groupRight).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.noteWidth).toBeGreaterThanOrEqual(120);
  expect(geometry.toolbarScrollWidth).toBeLessThanOrEqual(geometry.toolbarClientWidth + 1);
});
