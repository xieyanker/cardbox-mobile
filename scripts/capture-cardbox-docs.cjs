const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { version } = require("../package.json");

const output = path.resolve("docs/images");
const protectedFiles = [
  "docs/images/android-wallet-real.jpg",
  "docs/design/images/CardBox设计原型.png",
];
const names = new Set([
  "home-classic",
  "home-wallet",
  "home-stack",
  "home-focus",
  "home-dark",
  "all-cards",
  "all-cards-search",
  "card-editor",
  "expiry-input",
  "image-editor",
  "unsaved-editor",
  "card-details",
  "card-sort",
  "card-sort-drag",
  "menu",
  "backup-menu",
  "backup-export",
  "backup-import",
  "backup-preview",
  "browse-settings",
  "lock-settings",
  "storage-management",
  "about",
]);
async function hashes() {
  return Object.fromEntries(
    await Promise.all(
      protectedFiles.map(async (file) => [
        file,
        createHash("sha256")
          .update(await fs.readFile(file))
          .digest("hex"),
      ]),
    ),
  );
}
const report = {
  version,
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  sourceWorkingTreeDirty: Boolean(
    execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
  ),
  capturedAt: new Date().toISOString(),
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  platform: "Web mobile viewport",
  fixture:
    "Isolated browser context; synthetic cards created using the app form",
  images: [],
  errors: [],
  protectedFiles: {},
};

(async () => {
  await fs.mkdir(".expo", { recursive: true });
  await fs.mkdir(output, { recursive: true });
  const protectedBefore = await hashes();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({
      viewport: report.viewport,
      deviceScaleFactor: report.deviceScaleFactor,
      colorScheme: "light",
      acceptDownloads: true,
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    const label = (value) => page.getByLabel(value, { exact: true });
    const text = (value) => page.getByText(value, { exact: true });
    async function shot(name) {
      assert(names.has(name), "Only approved demo PNG names may be replaced");
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => {
        const element = document.activeElement;
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement
        )
          element.blur();
      });
      await page.waitForTimeout(350);
      await page.screenshot({
        path: path.join(output, `${name}.png`),
        style: ".__expo_fast_refresh { display: none !important; }",
      });
      report.images.push(`${name}.png`);
      console.log("CAPTURE", name);
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
    async function menu(name) {
      await label("更多菜单").click();
      if (["导出备份", "导入备份"].includes(name))
        await text("备份管理").click();
      await text(name).click();
    }
    async function select(name) {
      await label("全部卡片").click();
      await label("选择" + name).click();
    }
    const fixture = await context.newPage();
    await fixture.setViewportSize({ width: 635, height: 400 });
    await fixture.setContent(
      '<body style="margin:0;box-sizing:border-box;padding:48px;height:400px;background:linear-gradient(135deg,#204e74,#257a73);color:white;text-align:center;font:24px sans-serif"><div style="font-size:18px;letter-spacing:4px">CARDBOX DEMO</div><h1 style="font-size:40px;margin-top:60px">Travel Card</h1><p>0000 0000 0000 0000</p><small>FICTIONAL SAMPLE</small></body>',
    );
    const fixtureFile = path.resolve(".expo/cardbox-docs-fixture.png");
    await fixture.screenshot({ path: fixtureFile });
    await fixture.close();
    await page.goto(process.env.CARDBOX_TEST_URL || "http://localhost:8084/", {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    await page.addStyleTag({
      content: ".__expo_fast_refresh { display: none !important; }",
    });
    await text("还没有卡片").waitFor();
    assert.equal(
      await page.evaluate(() => localStorage.getItem("cardbox.cards.v1")),
      null,
    );
    const samples = [
      ["日常借记卡", "借记卡", "12/30"],
      ["旅行信用卡", "信用卡", "12/26"],
      ["线上虚拟卡", "虚拟卡", "08/26"],
      ["备用储蓄卡", "借记卡", "06/31"],
      ["家庭消费卡", "信用卡", "09/29"],
      ["出行信用卡", "信用卡", "05/30"],
      ["生活备用卡", "借记卡", "11/31"],
      ["订阅虚拟卡", "虚拟卡", "03/29"],
    ];
    for (const [index, [name, type, expiry]] of samples.entries()) {
      await menu("添加卡片");
      await label("卡片名称").fill(name);
      await label("卡号").fill(
        `123456789012${String(index + 1).padStart(4, "0")}`,
      );
      await label("CVV").fill("123");
      await label("到期时间").fill(expiry);
      await label("备注").fill("文档演示用虚构卡片");
      await page.getByRole("radio", { name: type, exact: true }).click();
      await label("保存卡片").click();
      await text("CardBox").waitFor();
    }
    await select("日常借记卡");
    await label("设为常用卡").click();
    await label("取消常用卡").waitFor();
    await select("旅行信用卡");
    await label("设为常用卡").click();
    await label("取消常用卡").waitFor();
    await select("日常借记卡");
    await shot("home-classic");
    await page.getByRole("radio", { name: "钱包模式", exact: true }).click();
    await select("备用储蓄卡");
    await shot("home-wallet");
    await page.getByRole("radio", { name: "堆叠模式", exact: true }).click();
    await shot("home-stack");
    await page.getByRole("radio", { name: "聚焦模式", exact: true }).click();
    await shot("home-focus");
    await page.getByRole("radio", { name: "钱包模式", exact: true }).click();
    await label("更多菜单").click();
    await shot("menu");
    await text("备份管理").click();
    await shot("backup-menu");
    await label("关闭菜单").click();
    await menu("关于应用");
    await text(`版本 ${version}`).waitFor();
    await shot("about");
    await home();
    await menu("浏览模式");
    await shot("browse-settings");
    await home();
    await menu("自动锁定");
    await label("照片隐私模式").click();
    await text("照片隐私模式：开启").waitFor();
    await shot("lock-settings");
    await home();
    await label("全部卡片").click();
    await shot("all-cards");
    await label("搜索卡片").fill("旅行");
    await text("找到 1 张卡片 · 常用卡置顶").waitFor();
    await shot("all-cards-search");
    await label("搜索卡片").fill("");
    await label("选择旅行信用卡").click();
    await label("查看卡片详情").click();
    await label("验证并显示敏感信息").waitFor();
    await shot("card-details");
    await home();
    await menu("卡片排序");
    await shot("card-sort");
    const handle = await label("拖动旅行信用卡").boundingBox();
    await page.mouse.move(
      handle.x + handle.width / 2,
      handle.y + handle.height / 2,
    );
    await page.mouse.down();
    await page.waitForTimeout(400);
    await page.mouse.move(
      handle.x + handle.width / 2,
      handle.y + handle.height / 2 + 172,
      { steps: 14 },
    );
    await label("拖动中的旅行信用卡").waitFor();
    await shot("card-sort-drag");
    await label("返回首页").evaluate((node) => node.click());
    await page.mouse.up();
    await menu("添加卡片");
    await label("卡片名称").fill("演示新卡片");
    await label("卡号").fill("1234567890123456");
    await shot("card-editor");
    await label("到期时间").evaluate((element) =>
      element.scrollIntoView({ block: "center", inline: "nearest" }),
    );
    assert.equal(await label("到期时间").inputValue(), "__/__");
    await shot("expiry-input");
    const chooser = page.waitForEvent("filechooser");
    await text("更换卡面图片").click();
    await (await chooser).setFiles(fixtureFile);
    await text("确认使用卡面").waitFor();
    await label("放大卡面").click();
    await label("添加遮挡条").click();
    await text("确认使用").waitFor();
    await shot("image-editor");
    await text("取消").click();
    await label("返回首页").click();
    await text("尚未保存").waitFor();
    await shot("unsaved-editor");
    await text("放弃修改").click();
    await menu("存储管理");
    await text("查看存储占用").click();
    await text("0 个图片文件 · 0.00 MB · 0 个无引用文件").waitFor();
    await shot("storage-management");
    await home();
    await menu("导出备份");
    await label("备份密码").fill("CardBox-Demo-2026!");
    await label("确认备份密码").fill("CardBox-Demo-2026!");
    const downloading = page.waitForEvent("download");
    await text("生成加密备份").click();
    const backupFile = path.resolve(".expo/CardBox_Demo_4.0.cardbox");
    await (await downloading).saveAs(backupFile);
    await text("备份已生成").waitFor();
    await label("关闭提示").click();
    await home();
    await menu("导出备份");
    await text("0 张卡片新增或修改，0 张已删除").waitFor();
    await shot("backup-export");
    await home();
    await menu("导入备份");
    const choosing = page.waitForEvent("filechooser");
    await text("选择备份文件").click();
    await (await choosing).setFiles(backupFile);
    await page.getByRole("radio", { name: "合并导入" }).click();
    await label("备份密码").fill("CardBox-Demo-2026!");
    await shot("backup-import");
    await text("开始导入").click();
    await text("恢复备份").waitFor();
    await shot("backup-preview");
    await text("取消").click();
    await home();
    await page.emulateMedia({ colorScheme: "dark" });
    await shot("home-dark");
    assert.equal(report.images.length, names.size);
    assert.deepEqual(report.errors, []);
    report.protectedFiles = await hashes();
    assert.deepEqual(
      report.protectedFiles,
      protectedBefore,
      "User photos and original design must remain byte-for-byte unchanged",
    );
    await fs.writeFile(
      path.join(output, "demo-manifest.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
