const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createCipheriv, pbkdf2Sync } = require("node:crypto");
const { Buffer } = require("node:buffer");
const { chromium } = require("playwright");
const report = { checks: [], errors: [] };

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      permissions: ["clipboard-read", "clipboard-write"],
      acceptDownloads: true,
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    const label = (name) => page.getByLabel(name, { exact: true });
    const text = (name) => page.getByText(name, { exact: true });
    async function check(name, action) {
      await action();
      report.checks.push(name);
      console.log("PASS", name);
    }
    async function menu(name) {
      await label("更多菜单").click();
      if (["导入备份", "导出备份"].includes(name))
        await text("备份管理").click();
      await text(name).click();
    }
    async function home() {
      await label("返回首页").click();
      if (
        await text("放弃修改")
          .isVisible()
          .catch(() => false)
      )
        await text("放弃修改").click();
      await text("CardBox").waitFor();
    }
    async function select(name) {
      await label("全部卡片").click();
      await label("选择" + name).click();
    }
    async function add(name, number, type = "借记卡", image = false) {
      await menu("添加卡片");
      await label("卡片名称").fill(name);
      await label("卡号").fill(number);
      await label("CVV").fill("123");
      await label("到期时间").fill("07/2026");
      assert.equal(
        await label("卡号").inputValue(),
        number.match(/.{1,4}/g).join(" "),
      );
      assert.equal(await label("到期时间").inputValue(), "07/26");
      await page.getByRole("radio", { name: type, exact: true }).click();
      if (image) {
        const fixture = await context.newPage();
        await fixture.setViewportSize({ width: 635, height: 400 });
        await fixture.setContent(
          '<body style="margin:0;background:#3156c8;color:white;padding:40px;font:28px sans-serif"><b>FAKE CARD</b><p>Test fixture only</p></body>',
        );
        const filename = path.resolve(".expo/cardbox-4-fixture.png");
        await fixture.screenshot({ path: filename });
        await fixture.close();
        const chooser = page.waitForEvent("filechooser");
        await text("更换卡面图片").click();
        await (await chooser).setFiles(filename);
        await text("确认使用卡面").waitFor();
        await label("放大卡面").click();
        await label("旋转卡面").click();
        await page.waitForFunction(
          () =>
            document
              .querySelector('[aria-label="旋转卡面"]')
              .getAttribute("aria-disabled") !== "true",
        );
        await label("添加遮挡条").click();
        await text("确认使用").click();
        await text("确认使用卡面").waitFor({ state: "hidden" });
      }
      if (name === "Beta") {
        await label("返回首页").click();
        await text("保存修改").click();
      } else await label("保存卡片").click();
      await text(name).first().waitFor();
    }
    await page.goto(process.env.CARDBOX_TEST_URL || "http://localhost:8084/", {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    await check(
      "grouped card number, four-digit year, crop/zoom/rotation and saved redaction pixels",
      async () => {
        await add("Alpha", "1234567890123456", "信用卡", true);
        const src = await page
          .getByRole("img", { name: "Alpha卡面" })
          .getAttribute("src");
        const pixel = await page.evaluate(async (source) => {
          const image = new Image();
          image.src = source;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0);
          return [
            ...context.getImageData(
              Math.floor(image.width * 0.5),
              Math.floor(image.height * 0.62),
              1,
              1,
            ).data,
          ];
        }, src);
        assert(
          Math.abs(pixel[0] - 20) < 8 &&
            Math.abs(pixel[1] - 24) < 8 &&
            Math.abs(pixel[2] - 32) < 8,
          JSON.stringify(pixel),
        );
        await add("Beta", "2345678901234567");
        await add("Gamma", "3456789012345678", "虚拟卡");
      },
    );
    await check(
      "duplicate warning can cancel without adding a card",
      async () => {
        await menu("添加卡片");
        await label("卡片名称").fill("Duplicate");
        await label("卡号").fill("1234567890123456");
        await label("保存卡片").click();
        await text("卡号重复").waitFor();
        await text("取消").click();
        await home();
        await text("3 / 3").waitFor();
      },
    );
    await check(
      "failed card write keeps both old data and the editable draft",
      async () => {
        const before = await page.evaluate(() =>
          localStorage.getItem("cardbox.cards.v1"),
        );
        await menu("添加卡片");
        await label("卡片名称").fill("Failure draft");
        await label("卡号").fill("5678901234567890");
        await page.evaluate(() => {
          window.cardboxTestSetItem = Storage.prototype.setItem;
          Storage.prototype.setItem = function (key, value) {
            if (key === "cardbox.cards.v1") throw new Error("storage full");
            return window.cardboxTestSetItem.call(this, key, value);
          };
        });
        await label("保存卡片").click();
        await text("storage full").waitFor();
        assert.equal(await label("卡片名称").inputValue(), "Failure draft");
        assert.equal(
          await page.evaluate(() => localStorage.getItem("cardbox.cards.v1")),
          before,
        );
        await page.evaluate(() => {
          Storage.prototype.setItem = window.cardboxTestSetItem;
        });
        await home();
      },
    );
    await check(
      "failed favorite write does not falsely acknowledge a saved preference",
      async () => {
        await select("Alpha");
        await page.evaluate(() => {
          window.cardboxTestSetItem = Storage.prototype.setItem;
          Storage.prototype.setItem = function (key, value) {
            if (key === "cardbox.preferences.v1")
              throw new Error("preference full");
            return window.cardboxTestSetItem.call(this, key, value);
          };
        });
        await label("设为常用卡").click();
        await text("preference full").waitFor();
        await label("设为常用卡").waitFor();
        await page.evaluate(() => {
          Storage.prototype.setItem = window.cardboxTestSetItem;
        });
      },
    );
    await check(
      "name/suffix search, type filter, favorites and persistence",
      async () => {
        await select("Alpha");
        await label("设为常用卡").click();
        await label("取消常用卡").waitFor();
        await label("全部卡片").click();
        assert.equal(
          await page
            .locator('[aria-label^="选择"]')
            .first()
            .getAttribute("aria-label"),
          "选择Alpha",
        );
        await label("搜索卡片").fill("4567");
        assert.equal(await page.locator('[aria-label^="选择"]').count(), 1);
        await label("选择Beta").waitFor();
        await label("搜索卡片").fill("Alpha");
        await label("信用卡筛选").click();
        await label("选择Alpha").waitFor();
        await label("借记卡筛选").click();
        await text("没有匹配的卡片").waitFor();
        await label("全部筛选").click();
        await label("搜索卡片").fill("");
        await label("只看常用卡").click();
        assert.equal(await page.locator('[aria-label^="选择"]').count(), 1);
        await label("选择Alpha").click();
        await page.reload({ waitUntil: "networkidle" });
        await label("取消常用卡").waitFor();
      },
    );
    await check(
      "copy keeps fields hidden and relaunch remembers the selected card",
      async () => {
        await label("全部卡片").click();
        await label("选择Beta").click();
        await label("验证并复制卡号").click();
        assert.equal(
          await page.evaluate(() => navigator.clipboard.readText()),
          "2345678901234567",
        );
        await label("验证并复制CVV").click();
        assert.equal(
          await page.evaluate(() => navigator.clipboard.readText()),
          "123",
        );
        assert(
          !(await page.locator("body").innerText()).includes(
            "2345 6789 0123 4567",
          ),
        );
        await page.reload({ waitUntil: "networkidle" });
        await text("Beta").first().waitFor();
        await text("2 / 3").waitFor();
      },
    );
    await check(
      "photo privacy, timed sensitive hiding, expired state and immediate lock",
      async () => {
        await select("Alpha");
        await text("已到期").waitFor();
        await menu("自动锁定");
        await label("照片隐私模式").click();
        await home();
        assert.equal(
          await page.getByRole("img", { name: "Alpha卡面" }).count(),
          0,
        );
        await page.clock.install();
        await label("验证并显示敏感信息").click();
        await page.getByRole("img", { name: "Alpha卡面" }).waitFor();
        await page.clock.fastForward(31000);
        await label("验证并显示敏感信息").waitFor();
        assert.equal(
          await page.getByRole("img", { name: "Alpha卡面" }).count(),
          0,
        );
        await page.clock.resume();
        await menu("立即锁定");
        await text("CardBox 已锁定").waitFor();
        await text("指纹 / 锁屏密码解锁").click();
        await text("CardBox").waitFor();
      },
    );
    await check("long-press drag commits one new card order", async () => {
      await menu("卡片排序");
      const bounds = await label("拖动Alpha").boundingBox();
      await page.mouse.move(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
      );
      await page.mouse.down();
      await page.waitForTimeout(400);
      await page.mouse.move(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2 + 170,
        { steps: 16 },
      );
      await page.mouse.up();
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll('[aria-label^="上移"]')]
            .map((node) => node.getAttribute("aria-label"))
            .join(",") === "上移Beta,上移Gamma,上移Alpha",
      );
      await home();
    });
    let backupFile;
    await check(
      "password confirmation, successful backup record and text-only export",
      async () => {
        await menu("导出备份");
        await label("备份密码").fill("test-password");
        await label("确认备份密码").fill("different");
        await text("生成加密备份").click();
        await text("两次备份密码不一致，请重新输入。").waitFor();
        await label("确认备份密码").fill("test-password");
        await label("包含卡面图片").click();
        const download = page.waitForEvent("download");
        await text("生成加密备份").click();
        backupFile = path.resolve(".expo/cardbox-4-text.cardbox");
        await (await download).saveAs(backupFile);
        await text("备份已生成").waitFor();
        assert.equal(
          JSON.parse(await fs.readFile(backupFile, "utf8")).format,
          "cardbox-secure-v4",
        );
        const record = await page.evaluate(() =>
          localStorage.getItem("cardbox.backup-record.v1"),
        );
        assert.equal(JSON.parse(record).format, "cardbox-local-v2");
        await home();
        await menu("导出备份");
        await page
          .getByText("0 张卡片新增或修改，0 张已删除", { exact: true })
          .waitFor();
        await home();
      },
    );
    async function choose(file) {
      const chooser = page.waitForEvent("filechooser");
      await text("选择备份文件").click();
      await (await chooser).setFiles(file);
      await page.getByText("已选择：", { exact: false }).waitFor();
    }
    await check(
      "failed restore-point write aborts import before changing the current pack",
      async () => {
        const before = await page.evaluate(() =>
          localStorage.getItem("cardbox.cards.v1"),
        );
        await menu("导入备份");
        await choose(backupFile);
        await label("备份密码").fill("test-password");
        await page.evaluate(() => {
          window.cardboxTestSetItem = Storage.prototype.setItem;
          Storage.prototype.setItem = function (key, value) {
            if (key === "cardbox.restore-point.v1")
              throw new Error("restore point full");
            return window.cardboxTestSetItem.call(this, key, value);
          };
        });
        await text("开始导入").click();
        await text("恢复备份").waitFor();
        await text("确认").click();
        await text("restore point full").waitFor();
        assert.equal(
          await page.evaluate(() => localStorage.getItem("cardbox.cards.v1")),
          before,
        );
        await page.evaluate(() => {
          Storage.prototype.setItem = window.cardboxTestSetItem;
        });
        await home();
      },
    );
    await check(
      "replacement preview, encrypted restore point and restoration of image references",
      async () => {
        await menu("导入备份");
        await choose(backupFile);
        await label("备份密码").fill("test-password");
        await text("开始导入").click();
        await text("恢复备份").waitFor();
        await text("确认").click();
        await text("恢复完成").waitFor();
        await select("Alpha");
        await label("验证并显示敏感信息").click();
        assert.equal(
          await page.getByRole("img", { name: "Alpha卡面" }).count(),
          0,
        );
        const point = await page.evaluate(() =>
          localStorage.getItem("cardbox.restore-point.v1"),
        );
        assert.equal(JSON.parse(point).format, "cardbox-local-v2");
        assert(!point.includes("1234567890123456"));
        await menu("导入备份");
        await label("恢复上次导入前卡包").click();
        await text("恢复上次卡包").waitFor();
        await text("确认").click();
        await text("恢复完成").waitFor();
        await select("Alpha");
        await label("验证并显示敏感信息").click();
        await page.getByRole("img", { name: "Alpha卡面" }).waitFor();
      },
    );
    await check(
      "legacy v2 backup and short password still import through merge",
      async () => {
        const card = {
          id: "legacy",
          name: "Legacy",
          number: "4567890123456789",
          cvv: "",
          expiry: "12/30",
          note: "旧备份",
          tone: "#2F59C7",
        };
        const salt = Buffer.alloc(16, 1),
          iv = Buffer.alloc(16, 2);
        const key = pbkdf2Sync("a", salt, 120000, 32, "sha256");
        const cipher = createCipheriv("aes-256-cbc", key, iv);
        const payload = Buffer.concat([
          cipher.update(JSON.stringify({ version: 2, cards: [card] }), "utf8"),
          cipher.final(),
        ]).toString("base64");
        const filename = path.resolve(".expo/cardbox-4-legacy.cardbox");
        await fs.writeFile(
          filename,
          JSON.stringify({
            format: "cardbox-secure-v2",
            salt: salt.toString("hex"),
            iv: iv.toString("hex"),
            payload,
          }),
        );
        await menu("导入备份");
        await choose(filename);
        await page.getByRole("radio", { name: "合并导入" }).click();
        await label("备份密码").fill("a");
        await text("开始导入").click();
        await text("恢复备份").waitFor();
        await text("确认").click();
        await text("恢复完成").waitFor();
        await label("全部卡片").click();
        await label("选择Legacy").waitFor();
        await label("选择Alpha").waitFor();
        await home();
        await menu("导入备份");
        await choose(filename);
        await label("备份密码").fill("a");
        await text("开始导入").click();
        await text("恢复备份").waitFor();
        await text("确认").click();
        await text("恢复完成").waitFor();
        assert(
          (await page.locator("body").innerText()).includes(
            "跳过 1 张重复卡片",
          ),
        );
      },
    );
    await check(
      "storage manager is available and browser runs without uncaught errors",
      async () => {
        await menu("存储管理");
        await text("查看存储占用").click();
        await text("0 个图片文件 · 0.00 MB · 0 个无引用文件").waitFor();
        await home();
        assert.deepEqual(report.errors, []);
      },
    );
    const many = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const cards = Array.from({ length: 1000 }, (_, index) => ({
      id: `many_${index}`,
      name: `Card ${index}`,
      number: String(1000000000000000n + BigInt(index)),
      cvv: "",
      expiry: "",
      note: "",
      type: "debit",
      tone: "#2F59C7",
    }));
    await many.addInitScript(
      (values) =>
        localStorage.setItem("cardbox.cards.v1", JSON.stringify(values)),
      cards,
    );
    const listPage = await many.newPage();
    await listPage.goto(
      process.env.CARDBOX_TEST_URL || "http://localhost:8084/",
      { waitUntil: "networkidle" },
    );
    await check(
      "1000 legacy cards render bounded grid and sorting rows without migration writes",
      async () => {
        await listPage.getByLabel("全部卡片", { exact: true }).click();
        const count = await listPage
          .locator('[aria-label^="选择Card "]')
          .count();
        assert(count > 0 && count < 100, `Grid rendered ${count}`);
        await listPage.getByLabel("排序管理", { exact: true }).click();
        const rows = await listPage
          .locator('[aria-label^="拖动Card "]')
          .count();
        assert(rows > 0 && rows < 100, `Sort rendered ${rows}`);
        assert(
          (
            await listPage.evaluate(() =>
              localStorage.getItem("cardbox.cards.v1"),
            )
          ).startsWith("["),
        );
      },
    );
    await many.close();
    await check(
      "unreadable privacy preferences hide photos and preserve both original stores",
      async () => {
        const image = await page.evaluate(() => {
          const canvas = document.createElement("canvas");
          canvas.width = 32;
          canvas.height = 20;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#3156c8";
          ctx.fillRect(0, 0, 32, 20);
          return canvas.toDataURL();
        });
        const raw = JSON.stringify([
          {
            id: "broken-prefs",
            name: "Privacy fallback",
            number: "1234567890123456",
            cvv: "",
            expiry: "",
            note: "",
            type: "debit",
            tone: "#2F59C7",
            image,
          },
        ]);
        const isolated = await browser.newContext();
        await isolated.addInitScript((value) => {
          localStorage.setItem("cardbox.cards.v1", value);
          localStorage.setItem("cardbox.preferences.v1", "broken");
        }, raw);
        const guardPage = await isolated.newPage();
        await guardPage.goto(
          process.env.CARDBOX_TEST_URL || "http://localhost:8084/",
          { waitUntil: "networkidle" },
        );
        await guardPage
          .getByText("Privacy fallback", { exact: true })
          .first()
          .waitFor();
        assert.equal(
          await guardPage
            .getByRole("img", { name: "Privacy fallback卡面" })
            .count(),
          0,
        );
        assert.equal(
          await guardPage.evaluate(() =>
            localStorage.getItem("cardbox.cards.v1"),
          ),
          raw,
        );
        assert.equal(
          await guardPage.evaluate(() =>
            localStorage.getItem("cardbox.preferences.v1"),
          ),
          "broken",
        );
        await isolated.close();
      },
    );
    await context.close();
  } finally {
    await fs.writeFile(
      ".expo/cardbox-4-results.json",
      JSON.stringify(report, null, 2),
    );
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
