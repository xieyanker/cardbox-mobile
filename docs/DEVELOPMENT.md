# CardBox 开发指南

[项目首页](../README.md) · [文档目录](README.md) · [手机调试与验收](TESTING.md)

更新日期：2026-10-21。当前 **4.0.0**（Android 构建编号 8）已获用户验收与封板授权，源码标签 `4.0.0`，APK 待用户在 Expo 构建后上传 GitHub Releases。已发布 APK 为 3.0.2。历史提交与旧验证结果见[归档](history/VALIDATION_2_3.md)，本轮实现证据见 [4.0 开发记录](CARDBOX_4.0_REQUIREMENTS.md)。

## 准备环境

项目使用 Expo SDK 54、React Native、TypeScript，包管理器固定为 **pnpm 9.12.0**。在自己的终端确认 Node.js 与匹配的 pnpm 可用，再进入项目根目录安装依赖：

```powershell
pnpm install --frozen-lockfile
```

本地卡片功能不需要启动模板后端、登录账号或配置 MySQL。使用 Expo Go 调试不需要先编译 APK；本机原生编译才需要 Android SDK / JDK 等工具。

## 运行预览

### 手机：单窗口 USB 调试

当前电脑已准备 ADB，手机安装 SDK 54 对应的 Expo Go、连接数据线并授权 USB 调试后，按[单窗口启动流程](TESTING.md#usb-调试一个窗口即可)操作。那里统一维护启动命令和故障排查，不需要为普通手机调试另开服务端窗口。

Expo Go 与独立 APK 的卡包分别保存。涉及新增原生模块时需检查 Expo Go 支持情况，再决定是否使用专用开发包；当前没有配置 `expo-dev-client` 或 development profile。

### Web：界面与交互预览

```powershell
node node_modules/expo/bin/cli start --web --port 8084 --max-workers 2
```

Web 验证统一使用 8084，保留终端运行。`pnpm dev:metro` 是已有的 8081 快捷入口；使用其他地址时给测试脚本设置 `CARDBOX_TEST_URL`。Web 不能替代移动端身份验证、加密密钥存储和原生保护验收。

## 自动检查

不需要启动应用服务的检查：

```powershell
pnpm check
pnpm lint
pnpm test
```

浏览器回归需要已启动的 Web 服务和本机 Google Chrome；在另一个终端明确指定服务地址后执行。这第二个窗口用于自动测试，不是手机调试的必要步骤。

```powershell
$env:CARDBOX_TEST_URL = 'http://localhost:8084/'
pnpm test:web
pnpm test:4
pnpm test:import
pnpm test:sort
pnpm test:browse
pnpm test:mobile-feedback
```

| 脚本                   | 用途                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `test:web`             | 添加、编辑、排序、导入导出及基本布局回归。                                                             |
| `test:4`               | 4.0 新功能、旧数据兼容和关键失败场景。                                                                 |
| `test:import`          | 冲突取消 / 失败 / 采用备份、日期备份往返、隐私快照与收藏清理。                                         |
| `test:sort`            | 80 张虚构卡片跨屏拖动、边缘滚动、取消、失败及触屏操作。                                                |
| `test:browse`          | 钱包、堆叠、聚焦的手势、边界、记忆与主题。                                                             |
| `test:mobile-feedback` | 隔离 Web 触屏检查：图片 / 遮挡条拖动、CVV 明文编辑、确认框文字、卡片拖动取消、模式排序与保存失败回退。 |

这些脚本使用隔离浏览器上下文和虚构卡片，产物保存在被 Git 忽略的 `.expo/`。最近代码验证基线见[验收文档](TESTING.md#自动检查基线)，每轮按修改范围运行适用检查并记录结果。

若环境中的 pnpm 包装入口异常，已安装依赖可直接调用：

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run
```

## 代码结构

| 位置                                                                   | 职责                                                       |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| `app/(tabs)/index.tsx`                                                 | 组合业务 hooks 与页面界面。                                |
| `components/cardbox/`                                                  | 卡面、网格、排序、备份面板、图片编辑及隐私保护组件。       |
| `hooks/use-cardbox-editor.ts`                                          | 草稿、离开确认、选图、保存和删除。                         |
| `hooks/use-cardbox-backup.ts`                                          | 导入导出、预览、密码临时状态与恢复点流程。                 |
| `hooks/use-cardbox-navigation.ts`、`use-cardbox-back-navigation.ts`    | 页面、选卡、敏感信息状态和返回策略。                       |
| `hooks/use-cardbox-operations.ts`、`use-cardbox-storage-management.ts` | 验证与操作互斥、确认提示、存储清理。                       |
| `lib/`                                                                 | 卡包持久化、加密、图片文件、偏好、备份统计和排序拖动控制。 |
| `shared/`                                                              | 输入格式、校验、查找 / 合并 / 到期状态、颜色与裁剪几何。   |
| `tests/`、`scripts/`                                                   | 单元回归、浏览器操作、性能测量与截图采集。                 |
| `server/`、`drizzle/`                                                  | 原模板后端；当前本地卡包业务不依赖它。                     |

卡片写入成功后才更新界面；初始化读取不改写旧数据，无法读取时保留原始数据。新增偏好使用独立存储键；图片清理保留当前卡包、草稿与恢复点引用。具体键名、备份格式和兼容边界见[4.0 兼容说明](CARDBOX_4.0_REQUIREMENTS.md#旧数据兼容与实现边界)。

## 更新文档演示图

启动上面的 Web 服务后，在另一终端执行：

```powershell
$env:CARDBOX_TEST_URL = 'http://localhost:8084/'
node scripts/capture-cardbox-docs.cjs
```

`pnpm docs:images` 是相同入口。脚本从实际页面采集 `docs/images/` 中约定的演示 PNG，并输出[采集记录](images/demo-manifest.json)。只使用独立上下文里的虚构卡片；用户真机照片和原始设计图按 SHA-256 校验保护，历史设计截图保留。更新后检查图片与文档引用，Web 截图不增加 Android 验收结论。

## Android 构建

普通 JavaScript 与界面修改先通过 Expo Go / Fast Refresh 调试。4.0.0 已经用户确认源码封板；用户将自行在 Expo 构建 APK，本轮不由代理触发云构建。构建产物、签名、安装 / 覆盖升级与发布记录在取得 APK 后补充。

### EAS 云构建

`eas.json` 的 `preview` 配置生成内部安装用 APK。`app.config.ts` 已关联 `@xieyanker/cardbox-mobile`，Project ID 为 `9c5810b4-c04a-44b3-8ef3-9b10b00b859b`；`cli.appVersionSource: local` 使用仓库版本与构建编号。需要 Expo 项目权限与正确的 Android 签名，覆盖升级必须沿用原包名和签名。

获得构建授权后执行：

```powershell
pnpm dlx eas-cli@latest login
pnpm dlx eas-cli@latest build --platform android --profile preview
```

从 EAS 网页发起本次封板构建时，Git ref 选择 `4.0.0` 标签（如网页只提供分支，选择尚未继续开发的 `main` 并核对提交与标签一致），平台 Android，profile 填 `preview`，Environment 保持 Default。此配置未启用自动提交商店，也不是 development build。取得 APK 后将构建链接或文件交给代理，核对版本 `4.0.0`、构建编号 8、包名 `com.app.cardboxmobile` 与发布签名，再上传 GitHub Releases 并更新下载入口。

### 本机编译

准备 Android Studio、Android SDK / Platform Tools、兼容项目 SDK 54 的 JDK，以及 `JAVA_HOME`、`ANDROID_HOME` 和 PATH。随后运行 `pnpm exec expo run:android --device`。已有 `pnpm android` 只启动 Expo 并打开客户端，不是 APK 编译命令。

Windows 可开发 Android；iOS 本机编译和模拟器需要 macOS / Xcode。iOS Face ID 不能用 Expo Go 完成验收。

## 版本与提交约定

- 直接在 `main` 分阶段开发、检查、提交和推送。
- 用户宣布开始新版本时，立即更新 `package.json` 版本、`app.config.ts` Android 构建编号及当前文档；关于页和 Expo 配置读取统一版本。历史记录与已发布下载链接保持真实。
- 用户亲自验收通过并明确要求封板后，才创建 / 推送发布 tag；自动测试不能代替用户确认，不移动已有 tag。
- 保持旧本地卡包、加密数据、图片和备份可读取；到期时间仍保存为空或 `MM/YY`，掩码只用于显示。
- 文本文件使用 UTF-8 / LF，遵循 `.editorconfig` 与 `.gitattributes`；原始图片保持字节不变。

完整约束见 [AGENTS.md](../AGENTS.md)，文档分工见[文档目录](README.md#文档维护约定)。

## 官方参考

- [Expo 环境准备](https://docs.expo.dev/get-started/set-up-your-environment/)：开发环境配置。
- [SDK 54 Expo Go](https://expo.dev/go?sdkVersion=54&platform=android&device=true)：匹配项目 SDK 的 Android 客户端。
- [Android Platform Tools](https://developer.android.com/tools/releases/platform-tools)：USB 调试所需 ADB。
- [Development builds](https://docs.expo.dev/develop/development-builds/introduction/)：专用开发包的适用场景。
- [EAS 构建设置](https://docs.expo.dev/build/setup/)：云端构建与项目配置。
- [Android Studio / Emulator](https://docs.expo.dev/workflow/android-studio-emulator/)：本机环境与模拟器。
- [SDK 54 LocalAuthentication](https://docs.expo.dev/versions/v54.0.0/sdk/local-authentication/)：系统验证与 Face ID 限制。

  4.0 三卡图标已接入应用、Web、Android 自适应 / 单色图标和启动画面；资源位置、生成命令和安全范围见[图标设计](design/ICON.md)。更新图稿后先执行 `node scripts/generate-brand-assets.cjs`，再检查关于页并重采集文档演示图。安装图标与原生启动画面需要重新构建 APK，Expo Go 的桌面图标不会改变。
