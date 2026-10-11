# CardBox

CardBox 是使用 Expo / React Native 开发的本地银行卡管理应用，目标是提供简单、安全、纯本地的卡包体验。当前代码版本为 `3.0.2`，Android 包名为 `com.app.cardboxmobile`。作者：xieyanker；[GitHub 项目](https://github.com/xieyanker/cardbox-mobile)。

## 项目文档

- [设计说明与原型图](docs/design/README.md)：用户提供的原始设计图、页面说明、当前实现与原型的差异。
- [开发与交接指南](docs/DEVELOPMENT.md)：开发环境、运行命令、Git 状态、验证结果和后续开发顺序。
- [Android 验收步骤](docs/TESTING.md)：Expo Go 连接方式、关键功能和真机验证记录。
- [CardBox 3.0 需求与进度](docs/CARDBOX_3.0_REQUIREMENTS.md)：六项功能实现、阶段提交、自动验证与待真机验收事项。
- [版本变更记录](CHANGELOG.md)：每个版本的功能与验证状态。

## 当前实现

客户端包含卡片添加、修改、删除、查看、卡号隐藏、生物识别验证、卡面选择与裁剪、排序、密码备份和后台自动锁定。核心卡片数据通过 AsyncStorage 保存在本机，设备密钥通过 SecureStore 保存；卡片业务目前没有接入后端同步。

3.0.2 将菜单名称统一为四字：“浏览模式”用于调整首页模式顺序，“关于应用”展示版本和作者。

3.0.0 重新设计包含 CardBox 字样的应用图标，将首页添加入口移到右上角菜单第一项，简化备份管理菜单。首页增加堆叠、聚焦与钱包浏览，保留经典左右滑动及平铺浏览，并记住模式选择。备份优化复用密码派生状态、提前验证密码，并限制图片 I/O 并发；新 v4 备份保留 120,000 轮派生，可读取旧 v2 / v3。桌面 JS 对照加解密约快 4–6 倍，数据与边界见[性能记录](docs/performance/BACKUP_3.0.md)。

3.0.1 将默认浏览模式顺序改为经典、钱包、堆叠、聚焦，增加“显示模式设置”以调整并保存排列；移动端密码派生使用离线系统 WebCrypto。Android 16 真机测得单块派生从约 30 秒降至 44 毫秒，约 0.88 MB 合成内容的加密 / 解密约 2.7 秒，错误密码检查 47 毫秒；不含原生文件 I/O 和系统验证。已通过类型检查、71 条业务测试、21 项 Web 回归及浏览模式操作检查；实际用户备份流程、动画体验和 APK 图标继续按[验收说明](docs/TESTING.md)复测，目前未生成新 APK。

首轮开发已修复存储初始化、串行写入、设备密钥初始化、身份验证入口、图片持久保存和排序问题，并对照原型调整主界面。2.0.0 已通过类型检查、45 条业务测试、21 项 Web 操作回归检查和 Android 开发代码打包；2026-10-11 用户确认全部验收完成，接受本版本作为当前开发基线。

2026-10-11 后续真机反馈：用户复测 3.0.1 后表示“这次可以了，很快”，确认备份提速效果可接受。模式顺序、动画及 APK 图标的逐项验收反馈仍待记录。

2.0.0 将导入、导出归入“备份管理”二级菜单，补充作者、版本和可打开的 GitHub 地址。备份密码派生改为定时让出界面线程，保持原有参数与 v2 / v3 格式兼容；Android 目录选择返回后等待前台恢复，再保存并回读校验文件。用户通过 USB / Expo Go 完成 Android 功能验收，并确认所选目录中存在非空 `.cardbox` 导出文件。后续优化另行迭代，详见[验收记录](docs/TESTING.md)。

| 路径                                                       | 用途                                  |
| ---------------------------------------------------------- | ------------------------------------- |
| `app/(tabs)/index.tsx`                                     | 核心卡片界面及主要业务逻辑            |
| `app/_layout.tsx`                                          | 应用入口、导航、主题和 Provider       |
| `lib/cardbox-security.ts`                                  | 本地数据与备份加解密                  |
| `lib/cardbox-pbkdf2.ts`                                    | 保持界面响应的备份密码派生            |
| `components/cardbox/card-browser.tsx` / `hooks/use-cardbox-browse.ts` | 三种动画浏览模式与本机模式偏好 |
| `shared/app-info.ts`                                       | 关于页作者、仓库地址与版本信息        |
| `lib/cardbox-repository.ts` / `hooks/use-cardbox-cards.ts` | 卡片加载、串行写入及错误恢复          |
| `lib/cardbox-access.ts` / `hooks/use-cardbox-access.ts`    | 身份验证、后台遮挡及自动锁定          |
| `lib/cardbox-files.ts`                                     | 图片持久化与备份图片恢复              |
| `shared/cardbox.ts` / `components/cardbox/`                | 数据校验、排序规则及主题界面组件      |
| `server/`                                                  | Express / tRPC 后端模板及认证基础代码 |
| `drizzle/`                                                 | MySQL 用户表定义与迁移                |
| `app.config.ts`                                            | Expo 应用配置、版本和原生插件         |
| `eas.json`                                                 | Android preview APK 构建配置          |
| `docs/`                                                    | 设计与开发文档                        |

## 快速预览

准备好 Node.js、pnpm 和项目依赖后，在项目根目录运行：

```powershell
pnpm dev:mobile
```

Android 手机使用 SDK 54 对应的 Expo Go，在同一局域网扫码预览。该流程不编译 CardBox APK，不消耗 EAS 云构建次数。Web 布局预览使用 `pnpm dev:metro`；生物识别、设备密钥、图片文件及备份恢复需要在移动设备上验收。安装依赖和 APK 构建方式见[开发与交接指南](docs/DEVELOPMENT.md)。

## 版本管理

应用版本号以 `package.json` 的 `version` 为准，Expo 配置和关于页读取同一个值，无需单独维护 `VERSION` 文件。后续开发直接在 `main` 分支进行；每个版本完成并验证后，在对应的发布提交上创建同名 Git 标签（例如 `2.0.0`），再推送提交与标签。Android 构建版本号 `versionCode` 在 `app.config.ts` 中单独递增。具体操作见[开发与交接指南](docs/DEVELOPMENT.md)。

## 文档依据

文档于 2026-10-10 新增。设计目标依据用户提供的原型图；当前实现依据本地源码和配置；验证结论依据实际检查。原型图中的目标与当前已实现行为在设计说明中分别记录。
