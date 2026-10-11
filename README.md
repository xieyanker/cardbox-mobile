<p align="center">
  <img src="assets/images/icon.png" width="120" align="middle" alt="CardBox 应用图标：包含 CardBox 字样的卡包与叠放卡片" />
  &nbsp;&nbsp;
  <img src="docs/images/android-wallet-real.jpg" width="210" align="middle" alt="CardBox Android 真机截图：实际添加的银行卡在钱包模式中展示，右上角首页菜单展开" />
</p>

<p align="center">Android 真机截图 · 钱包模式与首页菜单</p>

# CardBox

**把银行卡装进自己的数字卡包。** CardBox 是一款无需账号、资料保存在本机的卡片管理应用，支持自定义卡面、四种浏览模式、敏感信息隐藏和密码加密备份。

当前开发版本 **4.0.0** · Android 构建编号 **8** · 作者 **xieyanker** · 待用户验收封板

**[下载已发布的 3.0.2 Android APK](https://github.com/xieyanker/cardbox-mobile/releases/download/3.0.2/CardBox-3.0.2-android.apk)** · [3.0.2 发布页](https://github.com/xieyanker/cardbox-mobile/releases/tag/3.0.2) · [完整功能与使用说明](docs/FEATURES.md)

4.0.0 已加入到期时间自动格式输入：单个输入框显示 `__/__`，连续输入 `0726` 自动显示 `07/26`。旧卡包与备份读取格式保持兼容；后续功能和真机验收见 [4.0 开发记录](docs/CARDBOX_4.0_REQUIREMENTS.md)。

## 四种卡包，一眼看懂

首页默认按 **经典 → 钱包 → 堆叠 → 聚焦** 排列，点击顶部选项即可切换，也可以在“浏览模式”中调整顺序。

<table>
  <tr><th>经典 · 左右切换</th><th>钱包 · 卡槽层次</th><th>堆叠 · 卡片叠放</th><th>聚焦 · 当前卡片突出</th></tr>
  <tr>
    <td><img src="docs/images/home-classic.png" width="190" alt="经典模式：首页卡面及隐藏敏感信息的详情" /></td>
    <td><img src="docs/images/home-wallet.png" width="190" alt="钱包模式：卡片像实体钱包一样分层排列" /></td>
    <td><img src="docs/images/home-stack.png" width="190" alt="堆叠模式：多张卡片叠放显示" /></td>
    <td><img src="docs/images/home-focus.png" width="190" alt="聚焦模式：突出选中的卡片，展示前后卡片" /></td>
  </tr>
</table>

钱包、堆叠和聚焦支持上下滑动、点击卡片查看详情；经典保留左右滑动和直接查看详情。应用会记住上次选择的模式与模式排列顺序。

上述四种浏览模式及下方页面示例采集自 **已发布的 3.0.2 界面的 Web 移动视口预览**，使用虚构卡片，卡号与 CVV 保持隐藏；README 开头为用户提供的 Android 真机使用截图。示例保留采集时的版本信息，4.0.0 的到期时间掩码以当前代码为准。Android 的系统验证、文件选择器和状态栏以安装后的应用为准。点击图片可查看大图。

## 可以做什么

| 功能 | 使用体验 |
| --- | --- |
| 卡片管理 | 添加、修改和删除卡片；支持借记卡、信用卡、虚拟卡，以及名称、卡号、CVV、到期时间和备注；到期时间输入四位数字自动添加斜杠。 |
| 自定义卡面 | 从本机选择卡面图片，按卡片比例裁剪并预览确认。 |
| 四种浏览模式 | 经典、钱包、堆叠、聚焦；支持切换、顺序调整、自动保存和恢复默认顺序。 |
| 全部卡片与排序 | 双列平铺浏览全部卡片，使用上下按钮调整卡片顺序。 |
| 敏感信息保护 | 卡号与 CVV 默认隐藏，显示信息及敏感操作使用系统身份验证。 |
| 后台自动锁定 | 切到后台遮挡内容，可设置立即、1 分钟、5 分钟或不自动锁定；冷启动仍需验证。 |
| 加密备份 | 导出包含卡片资料与卡面图片的 `.cardbox` 文件；输入密码后导入，替换前再次确认。 |
| 浅色 / 深色主题 | 页面配色跟随系统，卡包、菜单和设置保持一致风格。 |

## 主要页面

<table>
  <tr><th>全部卡片</th><th>添加卡片</th><th>卡片详情</th></tr>
  <tr>
    <td><img src="docs/images/all-cards.png" width="250" alt="全部卡片双列浏览页面" /></td>
    <td><img src="docs/images/card-editor.png" width="250" alt="添加卡片页面：卡面预览、类型和资料填写" /></td>
    <td><img src="docs/images/card-details.png" width="250" alt="卡片详情页面：隐藏卡号和 CVV，提供修改与删除" /></td>
  </tr>
  <tr><th>四字菜单</th><th>浏览模式排序</th><th>加密备份</th></tr>
  <tr>
    <td><img src="docs/images/menu.png" width="250" alt="首页右上角菜单，第一项为添加卡片" /></td>
    <td><img src="docs/images/browse-settings.png" width="250" alt="浏览模式设置：上下调整顺序与恢复默认" /></td>
    <td><img src="docs/images/backup-export.png" width="250" alt="导出备份页面：设置密码并生成加密备份" /></td>
  </tr>
  <tr><th>自动锁定</th><th>深色钱包</th><th>图标与关于应用</th></tr>
  <tr>
    <td><img src="docs/images/lock-settings.png" width="250" alt="自动锁定设置：立即、1 分钟、5 分钟、不自动锁定" /></td>
    <td><img src="docs/images/home-dark.png" width="250" alt="系统深色主题下的钱包浏览模式" /></td>
    <td><img src="docs/images/about.png" width="250" alt="关于应用：CardBox 新图标、3.0.2 版本、作者与 GitHub 入口" /></td>
  </tr>
</table>

更多页面和操作步骤见 [完整功能与使用说明](docs/FEATURES.md)，包括卡片排序、备份二级菜单与导入流程。

## 下载与开始使用

1. 从 [已发布的 3.0.2 GitHub Release](https://github.com/xieyanker/cardbox-mobile/releases/tag/3.0.2) 下载 `CardBox-3.0.2-android.apk`，安装到 Android 手机。4.0.0 正在开发，尚未发布 APK。
2. 首次打开完成系统身份验证，在右上角菜单选择“添加卡片”。
3. 添加卡片后选择喜欢的浏览模式，并定期通过“备份管理 → 导出备份”保存加密备份。

APK 可以独立运行。Expo Go 中的卡包与独立安装的 CardBox 分开，如需迁移，请先在 Expo Go 导出备份，再在 CardBox 中导入。应用的本地卡片功能无需登录或云同步。

## 数据与备份

卡片字段在本机加密保存，移动端设备密钥保存在系统安全存储中。自定义卡面图片保存在应用私有目录；导出的备份会把卡片字段和图片一起加密。卡号隐藏控制应用绘制的文字，卡面照片中的号码需要自行遮挡。

当前版本导出 v4 格式 `.cardbox`，兼容导入旧 v2 / v3 备份；2.0.0 无法导入新 v4 备份。导入会替换当前卡包，请在确认前备份现有卡片，并保管好备份文件与密码。

3.0.1 的备份提速已得到用户 Android 真机复测确认。具体测量条件、结果和文件 I/O 边界见 [备份性能记录](docs/performance/BACKUP_3.0.md)。

## 开发与项目文档

项目使用 Expo SDK 54、React Native、TypeScript 和 pnpm。准备好 Node.js 与 `pnpm@9.12.0` 后：

```sh
pnpm install --frozen-lockfile
pnpm dev:mobile
```

手机预览使用 SDK 54 对应的 Expo Go。Web 预览可运行 `pnpm dev:metro`。开发预览与 APK 编译的环境准备、检查命令和具体步骤见 [开发与交接指南](docs/DEVELOPMENT.md)。

| 文档 | 内容 |
| --- | --- |
| [功能与使用说明](docs/FEATURES.md) | 最新功能、截图、菜单和使用步骤。 |
| [设计说明与原型图](docs/design/README.md) | 原始原型与设计演进。 |
| [图标设计](docs/design/ICON.md) | 图标、Android 自适应 / 单色图标与启动画面素材。 |
| [开发与交接指南](docs/DEVELOPMENT.md) | 环境、架构、编译和 Git 约定。 |
| [Android 验收步骤](docs/TESTING.md) | 真机复测步骤及已确认的结果。 |
| [CardBox 4.0 开发记录](docs/CARDBOX_4.0_REQUIREMENTS.md) | 当前开发范围、兼容要求与待验收项目。 |
| [CardBox 3.0 需求与进度](docs/CARDBOX_3.0_REQUIREMENTS.md) | 功能实现、阶段提交与验收进度。 |
| [版本变更记录](CHANGELOG.md) | 各版本变化与检查记录。 |

后续开发直接在 `main` 上进行。每次开始新版本时立即更新代码和当前文档版本号；应用版本统一由 `package.json` 管理，Android 构建编号由 `app.config.ts` 管理。用户亲自验证通过并明确授权后才创建封板 tag，文档与展示图片更新只提交到 `main`。4.0 当前开发与旧数据兼容要求见 [4.0 开发记录](docs/CARDBOX_4.0_REQUIREMENTS.md)。
