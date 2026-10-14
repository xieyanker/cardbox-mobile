const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  createCipheriv,
  createDecipheriv,
  createHmac,
  pbkdf2Sync,
  randomBytes,
} = require("node:crypto");
const { Buffer } = require("node:buffer");
const { chromium } = require("playwright");
const card = {
  id: "local",
  name: "Local credit",
  number: "1234567890123456",
  cvv: "123",
  expiry: "12/30",
  note: "old",
  tone: "#2F59C7",
  type: "credit",
};
const checks = [];
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const text = (name) => page.getByText(name, { exact: true });
  const label = (name) => page.getByLabel(name, { exact: true });
  const check = async (name, action) => {
    await action();
    checks.push(name);
    console.log("PASS", name);
  };
  const rawCards = () =>
    page.evaluate(() => localStorage.getItem("cardbox.cards.v1"));
  async function readCards() {
    const raw = await rawCards();
    if (raw.startsWith("[")) return JSON.parse(raw);
    const value = JSON.parse(raw);
    const key = Buffer.from(
      await page.evaluate(() => localStorage.getItem("cardbox.device.key.v1")),
      "base64",
    );
    const encryption = createHmac("sha256", key)
      .update("cardbox.local.encryption.v2")
      .digest();
    const cipher = createDecipheriv(
      "aes-256-cbc",
      encryption,
      Buffer.from(value.iv, "hex"),
    );
    return JSON.parse(
      Buffer.concat([
        cipher.update(Buffer.from(value.payload, "base64")),
        cipher.final(),
      ]).toString(),
    );
  }
  async function home() {
    await label("返回首页").click();
    await text("CardBox").waitFor();
  }
  async function menu(name) {
    await label("更多菜单").click();
    if (["导入备份", "导出备份"].includes(name)) await text("备份管理").click();
    await text(name).click();
  }
  async function importFile(file, merge = true, password = "a") {
    await menu("导入备份");
    const chooser = page.waitForEvent("filechooser");
    await text("选择备份文件").click();
    await (await chooser).setFiles(file);
    await page.getByText("已选择：", { exact: false }).waitFor();
    await page
      .getByRole("radio", {
        name: merge ? "合并导入" : "替换卡包",
        exact: true,
      })
      .click();
    await label("备份密码").fill(password);
    await text("开始导入").click();
  }
  try {
    await page.goto(process.env.CARDBOX_TEST_URL || "http://localhost:8084/", {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    await page.evaluate((initial) => {
      localStorage.setItem("cardbox.cards.v1", JSON.stringify([initial]));
      localStorage.setItem(
        "cardbox.preferences.v1",
        JSON.stringify({
          favorites: [initial.id, "deleted"],
          lastSelectedId: initial.id,
          privateImages: false,
        }),
      );
    }, card);
    await page.reload({ waitUntil: "networkidle" });
    await text(card.name).first().waitFor();
    await check(
      "credit dates validate, survive reload and remain optional",
      async () => {
        await text("修改").click();
        assert.equal(await label("账单日").inputValue(), "");
        await label("账单日").fill("32");
        await label("保存卡片").click();
        await text("账单日请填写 1 至 31，也可以留空。").waitFor();
        await label("账单日").fill("5");
        await label("还款日").fill("25");
        await label("保存卡片").click();
        await text("每月 5 日").waitFor();
        await page.reload({ waitUntil: "networkidle" });
        await text("每月 25 日").waitFor();
        assert.equal((await readCards())[0].billingDay, "5");
      },
    );
    const incoming = {
      ...card,
      id: "backup",
      name: "Imported credit",
      note: "new",
      cvv: "987",
      billingDay: "10",
      repaymentDay: "30",
    };
    const salt = randomBytes(16),
      iv = randomBytes(16);
    const cipher = createCipheriv(
      "aes-256-cbc",
      pbkdf2Sync("a", salt, 120000, 32, "sha256"),
      iv,
    );
    const payload = Buffer.concat([
      cipher.update(JSON.stringify({ version: 3, cards: [incoming] })),
      cipher.final(),
    ]).toString("base64");
    const file = path.resolve(".expo/cardbox-import-review.cardbox");
    await fs.writeFile(
      file,
      JSON.stringify({
        format: "cardbox-secure-v2",
        salt: salt.toString("hex"),
        iv: iv.toString("hex"),
        payload,
      }),
    );
    await check(
      "comparison and cancellation leave the card pack unchanged and hide CVV",
      async () => {
        const before = await rawCards();
        await importFile(file);
        await text("导入冲突比较").waitFor();
        await page
          .getByRole("radio", { name: "冲突1保留本机", checked: true })
          .waitFor();
        assert(!(await page.locator("body").innerText()).includes("987"));
        assert.equal(await rawCards(), before);
        await text("取消导入").click();
        assert.equal(await rawCards(), before);
        await home();
      },
    );
    await check(
      "failed writes preserve cards, then replacing a conflict retains identity and favorite",
      async () => {
        await importFile(file);
        await label("冲突1采用备份").click();
        const before = await rawCards();
        await page.evaluate(() => {
          window.testWrite = Storage.prototype.setItem;
          Storage.prototype.setItem = function (key, value) {
            if (key === "cardbox.cards.v1")
              throw new Error("test write failed");
            return window.testWrite.call(this, key, value);
          };
        });
        await text("确认导入选择").click();
        await text("确认").click();
        await text("test write failed").waitFor();
        assert.equal(await rawCards(), before);
        await page.evaluate(() => {
          Storage.prototype.setItem = window.testWrite;
        });
        await text("确认导入选择").click();
        await text("确认").click();
        await text("恢复完成").waitFor();
        assert.deepEqual(await readCards(), [{ ...incoming, id: "local" }]);
        await label("取消常用卡").waitFor();
      },
    );
    await check(
      "restoring the pre-import snapshot preserves newly enabled photo privacy",
      async () => {
        await menu("自动锁定");
        await label("照片隐私模式").click();
        await home();
        await menu("导入备份");
        await label("恢复上次导入前卡包").click();
        await text("确认").click();
        await text("恢复完成").waitFor();
        assert.equal((await readCards())[0].billingDay, "5");
        const preferences = await page.evaluate(() =>
          JSON.parse(localStorage.getItem("cardbox.preferences.v1")),
        );
        assert.equal(preferences.privateImages, true);
        assert.deepEqual(preferences.favorites, ["local"]);
      },
    );
    let exported;
    await check(
      "new dates survive encrypted v4 export and re-import",
      async () => {
        await menu("导出备份");
        await label("备份密码").fill("test-password");
        await label("确认备份密码").fill("test-password");
        const download = page.waitForEvent("download");
        await text("生成加密备份").click();
        exported = path.resolve(".expo/cardbox-import-dates.cardbox");
        await (await download).saveAs(exported);
        await text("备份已生成").waitFor();
        await home();
        await importFile(exported, false, "test-password");
        await text("确认").click();
        await text("恢复完成").waitFor();
        const saved = (await readCards())[0];
        assert.equal(saved.billingDay, "5");
        assert.equal(saved.repaymentDay, "25");
      },
    );
    await check(
      "deleting a favorite cleans its preference reference",
      async () => {
        await text("删除").click();
        await text("确认").click();
        await text("还没有卡片").waitFor();
        const preferences = await page.evaluate(() =>
          JSON.parse(localStorage.getItem("cardbox.preferences.v1")),
        );
        assert.deepEqual(preferences.favorites, []);
        assert.equal(preferences.lastSelectedId, null);
      },
    );
    assert.deepEqual(errors, []);
  } finally {
    await fs.writeFile(
      ".expo/cardbox-import-results.json",
      JSON.stringify({ checks, errors }, null, 2),
    );
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
