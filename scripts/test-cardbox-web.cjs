const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const artifacts =
  process.env.CARDBOX_TEST_ARTIFACTS ||
  path.resolve(".expo/cardbox-web-artifacts");
const report = { checks: [], errors: [], screenshots: [] };
let page, context, browser;
async function step(name, action) {
  try {
    await action();
    report.checks.push({ name, passed: true });
    console.log("PASS", name);
  } catch (error) {
    report.checks.push({ name, passed: false, error: error.message });
    throw error;
  }
}
async function shot(name) {
  const filename = path.join(artifacts, `CardBox-Web-${name}.png`);
  await page.screenshot({ path: filename });
  report.screenshots.push(filename);
}
const label = (name) => page.getByLabel(name, { exact: true });
const text = (name) => page.getByText(name, { exact: true });
async function visible(name) {
  await text(name).first().waitFor({ state: "visible", timeout: 8000 });
}
async function home() {
  await label("返回首页").click();
  await visible("CardBox");
}
async function menu(name) {
  await label("更多菜单").click();
  await text(name).click();
}
async function add({ name, number, type, image = false }) {
  await label("添加卡片").click();
  await label("卡片名称").fill(name);
  await label("卡号").fill(number);
  await label("CVV").fill("123");
  await label("到期时间").fill("12/30");
  await label("备注").fill("仅用于自动测试的虚构卡片");
  if (type) await page.getByRole("radio", { name: type, exact: true }).click();
  if (image) {
    const chooser = page.waitForEvent("filechooser");
    await text("更换卡面图片").click();
    await (await chooser).setFiles(path.resolve(".expo/cardbox-fixture.png"));
    await visible("确认使用卡面");
    await text("确认使用").click();
  }
  await label("保存卡片").click();
  await visible("CardBox");
  await visible(name);
}

(async () => {
  await fs.mkdir(".expo", { recursive: true });
  await fs.mkdir(artifacts, { recursive: true });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    acceptDownloads: true,
    colorScheme: "light",
  });
  page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  const fixture = await context.newPage();
  await fixture.setViewportSize({ width: 635, height: 400 });
  await fixture.setContent(
    '<body style="margin:0;background:#3156c8;color:white;padding:40px;font:28px sans-serif;box-sizing:border-box;height:400px"><b>TEST CARD</b><p>Sample image for CardBox</p><p>0000 0000 0000 0000</p></body>',
  );
  await fixture.screenshot({ path: ".expo/cardbox-fixture.png" });
  await fixture.close();
  await page.goto("http://localhost:8081/", { waitUntil: "networkidle" });
  await step("first launch is empty without writing demo cards", async () => {
    await visible("还没有卡片");
    assert.equal(
      await page.evaluate(() => localStorage.getItem("cardbox.cards.v1")),
      null,
    );
    await shot("empty-light");
  });
  await step(
    "invalid form fields show actionable errors without saving",
    async () => {
      await label("添加卡片").click();
      await label("保存卡片").click();
      await visible("请输入卡片名称。");
      await label("卡片名称").fill("无效测试卡");
      await label("保存卡片").click();
      await visible("卡号应为 8 至 19 位数字。");
      await label("卡号").fill("1234567890123456");
      await label("到期时间").fill("13/30");
      await label("保存卡片").click();
      await visible("到期时间请使用 MM/YY 格式，例如 12/30。");
      assert.equal(
        await page.evaluate(() => localStorage.getItem("cardbox.cards.v1")),
        null,
      );
      await shot("validation-error");
      await home();
    },
  );
  await step("card image button has a usable touch area", async () => {
    await label("添加卡片").click();
    const bounds = await text("更换卡面图片")
      .locator("..")
      .locator("..")
      .boundingBox();
    assert(bounds.height >= 48);
    await home();
  });
  await step(
    "add credit card with an image and select the new card",
    async () => {
      await add({
        name: "测试卡 A",
        number: "1234567890123456",
        type: "信用卡",
        image: true,
      });
      await visible("1 / 1");
      await visible("信用卡");
      await shot("card-light");
    },
  );
  await step("persist encrypted fields and a durable Web image", async () => {
    const raw = await page.evaluate(() =>
      localStorage.getItem("cardbox.cards.v1"),
    );
    assert.equal(JSON.parse(raw).format, "cardbox-local-v2");
    assert(!raw.includes("1234567890123456"));
    assert(!raw.includes("测试卡 A"));
    await page.reload({ waitUntil: "networkidle" });
    await visible("测试卡 A");
    const image = page.getByRole("img", { name: "测试卡 A卡面", exact: true });
    await image.waitFor();
    assert(
      (await image.getAttribute("src")).startsWith("data:image/jpeg;base64,"),
    );
  });
  await step("show and hide PAN and CVV", async () => {
    assert(
      !(await page.locator("body").innerText()).includes("1234567890123456"),
    );
    await label("验证并显示敏感信息").click();
    await visible("1234567890123456");
    await visible("123");
    await label("隐藏敏感信息").click();
    await label("验证并显示敏感信息").waitFor();
    assert(
      !(await page.locator("body").innerText()).includes("1234567890123456"),
    );
  });
  await step(
    "edit name, type and notes while retaining the image",
    async () => {
      await text("修改").click();
      await label("卡片名称").fill("测试卡 A 已修改");
      await page.getByRole("radio", { name: "虚拟卡", exact: true }).click();
      await label("备注").fill("已修改的测试备注");
      await shot("editor-light");
      await label("保存卡片").click();
      await visible("测试卡 A 已修改");
      await visible("虚拟卡");
      await visible("已修改的测试备注");
      await page
        .getByRole("img", { name: "测试卡 A 已修改卡面", exact: true })
        .waitFor();
    },
  );
  await step(
    "add second and third cards and select the newest card",
    async () => {
      await add({
        name: "测试卡 B",
        number: "2345678901234567",
        type: "借记卡",
      });
      await visible("2 / 2");
      await add({
        name: "测试卡 C",
        number: "3456789012345678",
        type: "信用卡",
      });
      await visible("3 / 3");
    },
  );
  await step(
    "navigate by arrows and card wall without keeping sensitive fields revealed",
    async () => {
      await label("验证并显示敏感信息").click();
      await visible("3456789012345678");
      await label("上一张卡片").click();
      await visible("测试卡 B");
      assert(
        !(await page.locator("body").innerText()).includes("3456789012345678"),
      );
      await label("全部卡片").click();
      await visible("全部卡片");
      await shot("wall-light");
      await text("测试卡 A 已修改").first().click();
      await visible("CardBox");
      await visible("测试卡 A 已修改");
    },
  );
  await step(
    "move the same card twice using its updated position and persist the order",
    async () => {
      await menu("卡片排序");
      await label("下移测试卡 A 已修改").click();
      await label("下移测试卡 A 已修改").click();
      const names = await page
        .locator('[aria-label^="上移"]')
        .evaluateAll((elements) =>
          elements.map((element) =>
            element.getAttribute("aria-label").slice(2),
          ),
        );
      assert.deepEqual(names, ["测试卡 B", "测试卡 C", "测试卡 A 已修改"]);
      await shot("sort-light");
      await page.reload({ waitUntil: "networkidle" });
      await visible("测试卡 B");
      await visible("1 / 3");
    },
  );
  await step("cancel deletion without changing stored data", async () => {
    const before = await page.evaluate(() =>
      localStorage.getItem("cardbox.cards.v1"),
    );
    await text("删除").click();
    await visible("删除卡片");
    await text("取消").click();
    assert.equal(
      await page.evaluate(() => localStorage.getItem("cardbox.cards.v1")),
      before,
    );
  });
  let backupFile;
  await step("export an encrypted backup containing images", async () => {
    await menu("导出备份");
    await label("备份密码").fill("CardBox-test-password");
    const downloaded = page.waitForEvent("download", { timeout: 60000 });
    await text("生成加密备份").click();
    backupFile = path.resolve(".expo/cardbox-web-backup.cardbox");
    await (await downloaded).saveAs(backupFile);
    const raw = await fs.readFile(backupFile, "utf8");
    assert.equal(JSON.parse(raw).format, "cardbox-secure-v3");
    assert(!raw.includes("2345678901234567"));
    assert(!raw.includes("CardBox-test-password"));
    await visible("备份已生成");
    await home();
  });
  await step("confirm deletion and persist the remaining count", async () => {
    await text("删除").click();
    await text("确认").click();
    await visible("1 / 2");
    await page.reload({ waitUntil: "networkidle" });
    await visible("测试卡 C");
    await visible("1 / 2");
  });
  async function chooseBackup() {
    const chooser = page.waitForEvent("filechooser");
    await text("选择备份文件").click();
    await (await chooser).setFiles(backupFile);
    await page.getByText("已选择：", { exact: false }).waitFor();
  }
  await step(
    "wrong backup password preserves the existing card pack",
    async () => {
      await menu("导入备份");
      await chooseBackup();
      await label("备份密码").fill("wrong-password");
      const before = await page.evaluate(() =>
        localStorage.getItem("cardbox.cards.v1"),
      );
      await text("开始导入").click();
      await page.waitForFunction(
        () => !document.body.innerText.includes("正在处理…"),
        null,
        { timeout: 60000 },
      );
      await visible("密码不正确或备份已损坏。");
      assert.equal(
        await page.evaluate(() => localStorage.getItem("cardbox.cards.v1")),
        before,
      );
      assert.equal(await text("恢复备份").count(), 0);
    },
  );
  await step(
    "cancel a valid backup restore without changing the card pack",
    async () => {
      await label("备份密码").fill("CardBox-test-password");
      const before = await page.evaluate(() =>
        localStorage.getItem("cardbox.cards.v1"),
      );
      await text("开始导入").click();
      await visible("恢复备份");
      await text("取消").click();
      assert.equal(
        await page.evaluate(() => localStorage.getItem("cardbox.cards.v1")),
        before,
      );
    },
  );
  await step(
    "restore backup cards, ordering, edits and image contents",
    async () => {
      await text("开始导入").click();
      await visible("恢复备份");
      await text("确认").click();
      await visible("CardBox");
      await visible("测试卡 B");
      await visible("1 / 3");
      await visible("恢复完成");
      await label("上一张卡片").click();
      await visible("测试卡 A 已修改");
      await visible("已修改的测试备注");
      await page
        .getByRole("img", { name: "测试卡 A 已修改卡面", exact: true })
        .waitFor();
      await page.reload({ waitUntil: "networkidle" });
      await visible("1 / 3");
    },
  );
  await step(
    "follow system dark scheme across home, menu, grid, editor and backup pages",
    async () => {
      await page.emulateMedia({ colorScheme: "dark" });
      await page.waitForFunction(
        () => document.documentElement.dataset.theme === "dark",
      );
      await shot("card-dark");
      await label("更多菜单").click();
      await shot("menu-dark");
      await text("导入备份").click();
      await shot("backup-dark");
      await home();
      await label("全部卡片").click();
      await shot("wall-dark");
      await home();
      await text("修改").click();
      await shot("editor-dark");
      await home();
    },
  );
  await step(
    "render on a wide desktop viewport without horizontal overflow",
    async () => {
      await page.setViewportSize({ width: 1100, height: 800 });
      await page.emulateMedia({ colorScheme: "light" });
      await page.waitForFunction(
        () => document.documentElement.dataset.theme === "light",
      );
      const sizes = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      assert(sizes.scroll <= sizes.client);
      await shot("desktop-light");
      const card = page.getByText("测试卡 B", { exact: true }).first();
      assert((await card.boundingBox()).x > 200);
    },
  );
  await step("complete without uncaught browser runtime errors", async () =>
    assert.deepEqual(report.errors, []),
  );
})()
  .catch(async (error) => {
    console.error(error.stack);
    if (page) {
      console.error(
        "PAGE:",
        await page
          .locator("body")
          .innerText()
          .catch(() => "unavailable"),
      );
      await shot("failure").catch(() => {});
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await fs.writeFile(
      ".expo/cardbox-web-results.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    if (browser) await browser.close();
  });
