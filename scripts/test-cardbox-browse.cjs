const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const artifacts = path.resolve(
  process.env.CARDBOX_BROWSE_ARTIFACTS || ".expo/cardbox-browse-artifacts",
);
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [];
  try {
    await fs.mkdir(artifacts, { recursive: true });
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    page.on("pageerror", (e) => errors.push(e.message));
    const label = (s) => page.getByLabel(s, { exact: true });
    const text = (s) => page.getByText(s, { exact: true });
    await page.goto(process.env.CARDBOX_TEST_URL || "http://localhost:8082/", {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    await text("还没有卡片").waitFor();
    for (let index = 1; index <= 5; index++) {
      await label("更多菜单").click();
      await label("添加卡片").click();
      await label("卡片名称").fill(`测试卡 ${index}`);
      await label("卡号").fill(`123456789012345${index}`);
      await label("保存卡片").click();
      await text(`${index} / ${index}`).waitFor();
    }
    const modeOrder = () =>
      page
        .getByRole("radio")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("aria-label")),
        );
    assert.deepEqual(await modeOrder(), [
      "经典模式",
      "钱包模式",
      "堆叠模式",
      "聚焦模式",
    ]);
    await label("更多菜单").click();
    await label("显示模式设置").click();
    assert(await label("上移经典模式").isDisabled());
    assert(await label("下移聚焦模式").isDisabled());
    await label("下移经典模式").click();
    await label("下移经典模式").click();
    await label("返回首页").click();
    assert.deepEqual(await modeOrder(), [
      "钱包模式",
      "堆叠模式",
      "经典模式",
      "聚焦模式",
    ]);
    await page.reload({ waitUntil: "networkidle" });
    await label("经典模式").waitFor();
    assert.deepEqual(await modeOrder(), [
      "钱包模式",
      "堆叠模式",
      "经典模式",
      "聚焦模式",
    ]);
    await label("更多菜单").click();
    await label("显示模式设置").click();
    await label("恢复默认模式顺序").click();
    await label("返回首页").click();
    assert.deepEqual(await modeOrder(), [
      "经典模式",
      "钱包模式",
      "堆叠模式",
      "聚焦模式",
    ]);
    console.log("PASS mode order settings, boundaries, persistence and reset");
    for (let index = 0; index < 4; index++) await label("下一张卡片").click();
    await label("上一张卡片").click();
    await label("上一张卡片").click();
    for (const [mode, name] of [
      ["stack", "堆叠"],
      ["focus", "聚焦"],
      ["wallet", "钱包"],
    ]) {
      await label(`${name}模式`).click();
      const deck = page.getByTestId(`card-browser-${mode}`);
      await deck.waitFor();
      await text("3 / 5").waitFor();
      await page.waitForTimeout(450);
      await page.screenshot({
        path: path.join(artifacts, `${mode}-light.png`),
      });
      const bounds = await deck.boundingBox();
      const x = bounds.x + bounds.width / 2,
        y = bounds.y + bounds.height / 2;
      await page.mouse.move(x, y + 70);
      await page.mouse.down();
      await page.mouse.move(x, y - 100, { steps: 14 });
      await page.mouse.up();
      await text("4 / 5").waitFor({ timeout: 8000 });
      await label("查看测试卡 4详情").click();
      await text("卡片详情").waitFor();
      assert(
        !(await page.locator("body").innerText()).includes("1234567890123454"),
      );
      await label("验证并显示敏感信息").click();
      await text("1234567890123454").waitFor();
      await label("返回首页").click();
      await deck.waitFor();
      assert(
        !(await page.locator("body").innerText()).includes("1234567890123454"),
      );
      await page.waitForTimeout(450);
      await page.mouse.move(x, y - 70);
      await page.mouse.down();
      await page.mouse.move(x, y + 100, { steps: 14 });
      await page.mouse.up();
      await text("3 / 5").waitFor();
      await page.emulateMedia({ colorScheme: "dark" });
      await page.waitForFunction(
        () => document.documentElement.dataset.theme === "dark",
      );
      await page.waitForTimeout(450);
      await page.screenshot({ path: path.join(artifacts, `${mode}-dark.png`) });
      await page.emulateMedia({ colorScheme: "light" });
      console.log("PASS", mode, "gesture, details, privacy, dark scheme");
    }
    await page.reload({ waitUntil: "networkidle" });
    await page.getByTestId("card-browser-wallet").waitFor();
    assert.equal(
      await page.evaluate(() => localStorage.getItem("cardbox.browse.mode.v1")),
      "wallet",
    );
    await label("全部卡片").click();
    await text("全部卡片").waitFor();
    await text("测试卡 3").first().click();
    await text("3 / 5").waitFor();
    await label("经典模式").click();
    await label("验证并显示敏感信息").waitFor();
    await page.setViewportSize({ width: 320, height: 640 });
    await label("钱包模式").click();
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(artifacts, "wallet-small.png") });
    assert((await label("查看卡片详情").boundingBox()).y < 640);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await label("上一张卡片").click();
    await label("上一张卡片").click();
    await text("1 / 5").waitFor();
    assert(await label("上一张卡片").isDisabled());
    for (let index = 0; index < 4; index++) await label("下一张卡片").click();
    await text("5 / 5").waitFor();
    assert(await label("下一张卡片").isDisabled());
    assert.deepEqual(errors, []);
    console.log(
      "PASS persistence, retained card wall and classic mode, small screen, no browser errors",
    );
    await fs.writeFile(
      path.join(artifacts, "report.json"),
      JSON.stringify(
        { passed: true, modes: ["stack", "focus", "wallet"], errors },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
