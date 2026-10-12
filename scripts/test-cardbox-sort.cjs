const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { createDecipheriv, createHmac } = require("node:crypto");
const { Buffer } = require("node:buffer");
const { chromium } = require("playwright");

// Isolated synthetic cards only; no device, existing browser profile or real pack is read.
const cards = Array.from({ length: 80 }, (_, index) => ({
  id: `sort_${index}`,
  name: `Sort${index}`,
  number: String(1000000000000000n + BigInt(index)),
  cvv: "",
  expiry: "12/30",
  note: `Fixture ${index}`,
  tone: "#2F59C7",
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
      window.sortTestWrites = 0;
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "cardbox.cards.v1") {
          if (window.sortTestFail) throw new Error("sort storage full");
          window.sortTestWrites++;
        }
        return setItem.call(this, key, value);
      };
    }, cards);
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    const label = (value) => page.getByLabel(value, { exact: true });
    const preview = () => label("拖动中的Sort15");
    const viewport = () => page.getByTestId("card-sort-viewport");
    async function check(name, action) {
      await action();
      report.checks.push(name);
      console.log("PASS", name);
    }
    async function openSort() {
      await label("更多菜单").click();
      await label("卡片排序").click();
      await viewport().waitFor();
    }
    async function scrollElement() {
      return viewport().evaluateHandle((root) =>
        [...root.querySelectorAll("div")].find(
          (node) =>
            node.clientHeight > 0 &&
            /auto|scroll/.test(getComputedStyle(node).overflowY) &&
            node.scrollHeight > node.clientHeight,
        ),
      );
    }
    async function pack() {
      const stored = await page.evaluate(() => ({
        raw: localStorage.getItem("cardbox.cards.v1"),
        key: localStorage.getItem("cardbox.device.key.v1"),
      }));
      if (stored.raw.startsWith("[")) return JSON.parse(stored.raw);
      const envelope = JSON.parse(stored.raw);
      const key = createHmac("sha256", Buffer.from(stored.key, "base64"))
        .update("cardbox.local.encryption.v2")
        .digest();
      const decipher = createDecipheriv(
        "aes-256-cbc",
        key,
        Buffer.from(envelope.iv, "hex"),
      );
      return JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(envelope.payload, "base64")),
          decipher.final(),
        ]).toString("utf8"),
      );
    }
    async function startDrag(name) {
      const handle = label(`拖动${name}`);
      await handle.scrollIntoViewIfNeeded();
      const bounds = await handle.boundingBox();
      await page.mouse.move(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
      );
      await page.mouse.down();
      await page.waitForTimeout(400);
      await label(`拖动中的${name}`).waitFor();
    }
    await page.goto(process.env.CARDBOX_TEST_URL || "http://localhost:8084/", {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    await openSort();
    let scrolling = await scrollElement();
    await scrolling.evaluate((node) => {
      node.scrollTop = 1050;
    });
    await page.waitForTimeout(150);
    let bounds = await viewport().boundingBox();
    await check(
      "drag continues across recycled rows with a stationary pointer at the lower edge",
      async () => {
        await startDrag("Sort15");
        await page.mouse.move(bounds.x + 54, bounds.y + bounds.height - 8, {
          steps: 14,
        });
        await page.waitForFunction((node) => node.scrollTop > 4500, scrolling, {
          timeout: 15000,
        });
        await page.waitForFunction(
          () => !document.querySelector('[aria-label="拖动Sort15"]'),
        );
        await preview().waitFor();
        assert.equal(await page.evaluate(() => window.sortTestWrites), 0);
        assert.deepEqual(await pack(), cards);
      },
    );
    let downTarget;
    await check(
      "moving to the center stops scrolling and release saves the indicated order once",
      async () => {
        await page.mouse.move(bounds.x + 54, bounds.y + bounds.height / 2, {
          steps: 10,
        });
        await page.waitForTimeout(150);
        const offset = await scrolling.evaluate((node) => node.scrollTop);
        await page.waitForTimeout(300);
        assert.equal(
          await scrolling.evaluate((node) => node.scrollTop),
          offset,
        );
        downTarget =
          Number((await preview().innerText()).match(/☰\s+(\d+)/)[1]) - 1;
        await page.mouse.up();
        await page.waitForFunction(() => window.sortTestWrites === 1);
        const expected = cards.filter((card) => card.id !== "sort_15");
        expected.splice(downTarget, 0, cards[15]);
        assert.deepEqual(await pack(), expected);
        assert(downTarget > 40);
      },
    );
    await check(
      "upper edge scrolls all the way to the first row and clamps at the start",
      async () => {
        await startDrag("Sort15");
        await page.mouse.move(bounds.x + 54, bounds.y + 5, { steps: 14 });
        await page.waitForFunction((node) => node.scrollTop === 0, scrolling, {
          timeout: 15000,
        });
        await page.waitForTimeout(250);
        assert.equal(await scrolling.evaluate((node) => node.scrollTop), 0);
        await page.mouse.up();
        await page.waitForFunction(() => window.sortTestWrites === 2);
        assert.deepEqual(await pack(), [
          cards[15],
          ...cards.filter((card) => card.id !== "sort_15"),
        ]);
      },
    );
    await check(
      "leaving the sort page cancels an active edge drag without saving",
      async () => {
        const before = await pack();
        await startDrag("Sort15");
        await page.mouse.move(bounds.x + 54, bounds.y + bounds.height - 8, {
          steps: 12,
        });
        await page.waitForFunction((node) => node.scrollTop > 120, scrolling);
        // A route change while held exercises the same unmount cleanup as Android back/lock.
        await label("返回首页").evaluate((node) => node.click());
        await page.mouse.up();
        await page.waitForTimeout(300);
        assert.equal(await page.evaluate(() => window.sortTestWrites), 2);
        assert.deepEqual(await pack(), before);
        await openSort();
        scrolling = await scrollElement();
        bounds = await viewport().boundingBox();
      },
    );
    await check(
      "a failed reorder preserves the complete stored pack and resets the preview",
      async () => {
        const before = await pack();
        await page.evaluate(() => {
          window.sortTestFail = true;
        });
        await startDrag("Sort15");
        const start = await preview().boundingBox();
        await page.mouse.move(bounds.x + 54, start.y + 38 + 172, { steps: 12 });
        await page.mouse.up();
        await page.getByText("sort storage full", { exact: true }).waitFor();
        await preview().waitFor({ state: "hidden" });
        assert.deepEqual(await pack(), before);
        await page.evaluate(() => {
          window.sortTestFail = false;
        });
        await label("关闭提示").click();
      },
    );
    await check(
      "normal scrolling, arrow controls and persisted order remain usable",
      async () => {
        await page.mouse.move(bounds.x + 210, bounds.y + 200);
        await page.mouse.wheel(0, 800);
        await page.waitForFunction((node) => node.scrollTop > 100, scrolling);
        await scrolling.evaluate((node) => {
          node.scrollTop = 0;
        });
        await label("下移Sort15").click();
        await page.waitForFunction(() => window.sortTestWrites === 3);
        const saved = await pack();
        assert.equal(saved[0].id, "sort_0");
        assert.equal(saved[1].id, "sort_15");
        await page.reload({ waitUntil: "networkidle" });
        assert.deepEqual(await pack(), saved);
        await openSort();
        assert.equal(
          await page
            .locator('[aria-label^="上移"]')
            .first()
            .getAttribute("aria-label"),
          "上移Sort0",
        );
        assert.deepEqual(report.errors, []);
      },
    );
    await check(
      "touch swipes scroll normally outside the handle and long-press touch still reorders",
      async () => {
        const session = await context.newCDPSession(page);
        const touch = (type, x, y) =>
          session.send("Input.dispatchTouchEvent", {
            type,
            touchPoints: type === "touchEnd" ? [] : [{ x, y }],
          });
        scrolling = await scrollElement();
        bounds = await viewport().boundingBox();
        await touch("touchStart", bounds.x + 200, bounds.y + 650);
        for (let step = 1; step <= 10; step++) {
          await touch("touchMove", bounds.x + 200, bounds.y + 650 - step * 35);
          await page.waitForTimeout(25);
        }
        await touch("touchEnd");
        await page.waitForFunction((node) => node.scrollTop > 200, scrolling);
        await page.waitForTimeout(400);
        await scrolling.evaluate((node) => {
          node.scrollTop = 0;
        });
        await page.waitForTimeout(150);
        const before = await pack();
        const handle = await label("拖动Sort0").boundingBox();
        const x = handle.x + handle.width / 2,
          y = handle.y + handle.height / 2;
        await touch("touchStart", x, y);
        await page.waitForTimeout(400);
        await label("拖动中的Sort0").waitFor();
        for (let step = 1; step <= 10; step++) {
          await touch("touchMove", x, y + step * 17.2);
          await page.waitForTimeout(16);
        }
        await touch("touchEnd");
        await page.waitForFunction(() => window.sortTestWrites === 1);
        const expected = [...before];
        expected.splice(2, 0, expected.splice(0, 1)[0]);
        assert.deepEqual(await pack(), expected);
        assert.deepEqual(report.errors, []);
        await session.detach();
      },
    );
    await context.close();
  } finally {
    await fs.writeFile(
      ".expo/cardbox-sort-results.json",
      JSON.stringify(report, null, 2),
    );
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
