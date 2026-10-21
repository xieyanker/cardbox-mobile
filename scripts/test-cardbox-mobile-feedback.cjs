const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

// Web touch regressions with synthetic data; Android acceptance remains a separate user check.
const cards = Array.from({ length: 8 }, (_, index) => ({
  id: `feedback_${index}`,
  name: `Feedback${index}`,
  number: `411111111111110${index}`,
  cvv: "123",
  expiry: "12/30",
  note: "Synthetic touch fixture",
  tone: "#3156c8",
  type: "debit",
}));
const report = { checks: [], errors: [] };
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    await context.addInitScript((values) => {
      if (!localStorage.getItem("cardbox.cards.v1"))
        localStorage.setItem("cardbox.cards.v1", JSON.stringify(values));
      window.feedbackWrites = { cards: 0, modes: 0 };
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "cardbox.cards.v1") window.feedbackWrites.cards++;
        if (key === "cardbox.browse.order.v1") {
          if (window.failModeSave) throw new Error("mode storage full");
          window.feedbackWrites.modes++;
        }
        return original.call(this, key, value);
      };
    }, cards);
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    const label = (name) => page.getByLabel(name, { exact: true });
    const text = (name) => page.getByText(name, { exact: true });
    const session = await context.newCDPSession(page);
    const touch = (type, x, y) =>
      session.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: ["touchEnd", "touchCancel"].includes(type)
          ? []
          : [{ x, y }],
      });
    async function drag(x, y, dx, dy, hold = false, cancel = false) {
      await touch("touchStart", x, y);
      if (hold) await page.waitForTimeout(400);
      for (let step = 1; step <= 12; step++) {
        await touch("touchMove", x + (dx * step) / 12, y + (dy * step) / 12);
        await page.waitForTimeout(20);
      }
      await touch(cancel ? "touchCancel" : "touchEnd");
    }
    async function menu(name) {
      await label("更多菜单").click();
      await text(name).click();
    }
    async function check(name, action) {
      await action();
      report.checks.push(name);
      console.log("PASS", name);
    }
    const modeOrder = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("cardbox.browse.order.v1")),
      );
    await page.goto(process.env.CARDBOX_TEST_URL || "http://localhost:8084/", {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    await check(
      "CVV is readable when creating and editing, while unsaved changes can be discarded",
      async () => {
        await menu("添加卡片");
        await label("CVV").fill("456");
        assert.notEqual(await label("CVV").getAttribute("type"), "password");
        assert.equal(await label("CVV").inputValue(), "456");
        await label("返回首页").click();
        await text("放弃修改").click();
        await text("修改").click();
        assert.equal(await label("CVV").inputValue(), "123");
        assert.notEqual(await label("CVV").getAttribute("type"), "password");
        await label("卡片名称").fill("Unsaved fixture");
        await label("返回首页").click();
      },
    );
    await check(
      "all three unsaved-dialog labels fit visible buttons on narrow and normal screens",
      async () => {
        for (const width of [320, 390]) {
          await page.setViewportSize({ width, height: 640 });
          for (const name of ["保存修改", "放弃修改", "继续编辑"]) {
            const fits = await text(name).evaluate((node) => {
              const labelRect = node.getBoundingClientRect();
              const buttonRect = node.parentElement.getBoundingClientRect();
              return (
                buttonRect.height >= 48 &&
                labelRect.height > 10 &&
                labelRect.top >= buttonRect.top &&
                labelRect.bottom <= buttonRect.bottom &&
                buttonRect.top >= 0 &&
                buttonRect.bottom <= innerHeight
              );
            });
            assert(fits, `${name} must remain visible at width ${width}`);
          }
        }
        await page.screenshot({ path: ".expo/cardbox-feedback-dialog.png" });
        await text("继续编辑").click();
        assert.equal(await label("卡片名称").inputValue(), "Unsaved fixture");
        await label("返回首页").click();
        await text("放弃修改").click();
        assert.equal(await page.evaluate(() => window.feedbackWrites.cards), 0);
        await page.setViewportSize({ width: 390, height: 844 });
      },
    );
    await check(
      "touch dragging moves the crop image and mask independently without scrolling the sheet",
      async () => {
        await text("修改").click();
        const fixture = await context.newPage();
        await fixture.setViewportSize({ width: 800, height: 600 });
        await fixture.setContent(
          '<body style="margin:0;background:linear-gradient(45deg,#3156c8,#40b8a8);font:60px sans-serif;color:white">SYNTHETIC IMAGE</body>',
        );
        const filename = path.resolve(".expo/cardbox-feedback-fixture.png");
        await fixture.screenshot({ path: filename });
        await fixture.close();
        const chooser = page.waitForEvent("filechooser");
        await text("更换卡面图片").click();
        await (await chooser).setFiles(filename);
        await text("确认使用卡面").waitFor();
        await label("放大卡面").click();
        await label("放大卡面").click();
        const image = page.getByRole("img", { name: "卡面裁剪预览" });
        const surface = page.getByTestId("card-image-crop-surface");
        const bounds = await surface.boundingBox();
        const before = await image.boundingBox();
        await drag(
          bounds.x + bounds.width * 0.4,
          bounds.y + bounds.height * 0.25,
          -30,
          22,
        );
        const after = await image.boundingBox();
        assert(after.x < before.x - 20 && after.y > before.y + 15);
        assert.deepEqual(await surface.boundingBox(), bounds);
        await label("添加遮挡条").click();
        const mask = label("照片遮挡条");
        const maskBefore = await mask.boundingBox();
        const surfaceBeforeMask = await surface.boundingBox();
        const imageBeforeMask = await image.boundingBox();
        await drag(
          maskBefore.x + maskBefore.width / 2,
          maskBefore.y + maskBefore.height / 2,
          6,
          -25,
        );
        const maskAfter = await mask.boundingBox();
        assert(
          maskAfter.x > maskBefore.x + 3 && maskAfter.y < maskBefore.y - 18,
        );
        assert.deepEqual(await image.boundingBox(), imageBeforeMask);
        assert.deepEqual(await surface.boundingBox(), surfaceBeforeMask);
        await page.screenshot({ path: ".expo/cardbox-feedback-crop.png" });
        await text("取消").click();
        await label("返回首页").click();
        assert.equal(await page.evaluate(() => window.feedbackWrites.cards), 0);
      },
    );
    await check(
      "long-pressing the card body with a pointer reorders once, while cancelled handle touch does not save",
      async () => {
        await menu("卡片排序");
        let handle = await label("拖动Feedback0").boundingBox();
        await drag(
          handle.x + handle.width / 2,
          handle.y + handle.height / 2,
          0,
          172,
          true,
          true,
        );
        assert.equal(await page.evaluate(() => window.feedbackWrites.cards), 0);
        handle = await label("拖动Feedback0").boundingBox();
        const x = handle.x + 120;
        const y = handle.y + handle.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.waitForTimeout(400);
        await label("拖动中的Feedback0").waitFor();
        await page.mouse.move(x, y + 172, { steps: 12 });
        await page.mouse.up();
        await page.waitForFunction(() => window.feedbackWrites.cards === 1);
        assert.equal(
          await page
            .locator('[aria-label^="上移"]')
            .first()
            .getAttribute("aria-label"),
          "上移Feedback1",
        );
        await label("返回首页").click();
      },
    );
    await check(
      "touch mode sorting saves once and the order survives reload",
      async () => {
        await menu("浏览模式");
        const handle = await label("拖动经典模式").boundingBox();
        await drag(
          handle.x + handle.width / 2,
          handle.y + handle.height / 2,
          0,
          172,
          true,
        );
        await page.waitForFunction(() => window.feedbackWrites.modes === 1);
        assert.deepEqual(await modeOrder(), [
          "wallet",
          "stack",
          "classic",
          "focus",
        ]);
        await page.reload({ waitUntil: "networkidle" });
        assert.deepEqual(await modeOrder(), [
          "wallet",
          "stack",
          "classic",
          "focus",
        ]);
        await menu("浏览模式");
        assert.equal(
          await page
            .locator('[aria-label^="上移"]')
            .first()
            .getAttribute("aria-label"),
          "上移钱包模式",
        );
      },
    );
    await check(
      "failed mode drag preserves the old order and arrow/default controls remain usable",
      async () => {
        const before = await modeOrder();
        await page.evaluate(() => {
          window.failModeSave = true;
        });
        const handle = await label("拖动钱包模式").boundingBox();
        await drag(
          handle.x + handle.width / 2,
          handle.y + handle.height / 2,
          0,
          86,
          true,
        );
        await text("mode storage full").waitFor();
        assert.deepEqual(await modeOrder(), before);
        assert.equal(
          await page
            .locator('[aria-label^="上移"]')
            .first()
            .getAttribute("aria-label"),
          "上移钱包模式",
        );
        await page.evaluate(() => {
          window.failModeSave = false;
        });
        await label("关闭提示").click();
        await label("下移钱包模式").click();
        await page.waitForFunction(() => window.feedbackWrites.modes === 1);
        assert.deepEqual(await modeOrder(), [
          "stack",
          "wallet",
          "classic",
          "focus",
        ]);
        await label("恢复默认模式顺序").click();
        await page.waitForFunction(() => window.feedbackWrites.modes === 2);
        assert.deepEqual(await modeOrder(), [
          "classic",
          "wallet",
          "stack",
          "focus",
        ]);
        assert.deepEqual(report.errors, []);
      },
    );
    await session.detach();
    await context.close();
  } finally {
    await fs.writeFile(
      ".expo/cardbox-mobile-feedback-results.json",
      JSON.stringify(report, null, 2),
    );
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
