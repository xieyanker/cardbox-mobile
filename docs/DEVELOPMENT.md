# CardBox 开发与交接指南

更新日期：2026-10-11，当前应用版本为 `2.0.0`。作者：xieyanker；仓库：[GitHub](https://github.com/xieyanker/cardbox-mobile)。这里区分已检查事实、开发结果和未完成验证，供后续开发使用。

## 现有资料与分析依据

新增这些文件前，项目内未发现 README、独立设计文档或开发指南。已有资料主要是源码、配置、源码注释以及 Git 提交记录。

- 功能与架构：依据 `app/(tabs)/index.tsx`、`lib/cardbox-security.ts`、`server/routers.ts` 和 `drizzle/schema.ts`。
- 技术栈与运行方式：依据 `package.json`、`app.config.ts`、`eas.json` 和其他配置。
- 验证结果：依据实际执行的 TypeScript、ESLint、Vitest 和排序回调模拟。
- 设计目标：依据用户提供的[原型图与设计说明](design/README.md)。

## Git 维护状态

本地存在 `.git` 仓库。首次分析时有 11 条提交，`main` 为 `05c9feb`；补充文档随后提交为 `9bed7fd`。首轮代码开发位于 `codex/cardbox-development` 分支。远程地址为：

```text
https://github.com/xieyanker/cardbox-mobile.git
```

首轮开发与浏览器验证已经推送并合并到 `main`，提交为 `a23c7b9`。2026-10-11 用户确认 2.0.0 全部验收完成，并授权将本轮修复及文档提交、推送至 `main`；后续优化单独迭代。具体提交与远端状态以 Git 记录为准。

应用版本统一在 `package.json` 定义，`app.config.ts` 和关于页读取同一版本。2.0.0 对应 Android `versionCode: 4`；应用版本与备份格式的 v2 / v3 编号互不影响。

2.0.0 增加“备份管理 → 导出备份 / 导入备份”二级菜单与作者、GitHub 说明，调整标题避免 Android 字形边缘被裁切。备份密码派生使用 `@noble/hashes` 的 HMAC-SHA256，按原有 PBKDF2 参数（120,000 次、v2 32 字节 / v3 64 字节）计算，并通过定时器让出界面线程；使用独立 Node.js PBKDF2 结果及旧算法备份验证兼容性。Android 导出等待系统选择器返回前台后继续；写入后回读校验，失败清理本次创建的不完整文件，取消或失败有明确提示。USB 连接方法与真机复测顺序见[验收文档](TESTING.md)。

本轮检查：TypeScript / ESLint 通过、45 条业务测试通过、21 项浏览器回归通过；Android 2.0.0 Metro 开发代码包已在手机请求后成功生成。用户确认真机导出提示成功，且所选目录中存在非空 `.cardbox` 文件，随后确认本版本全部验收完成。为避免与手机服务冲突，浏览器可使用独立的 8082 端口，在测试终端设置 `$env:CARDBOX_TEST_URL = 'http://localhost:8082/'` 后运行 `pnpm test:web`。

设计文档和原型图纳入 Git 版本维护。后续开发建议按功能创建 `codex/` 前缀分支，分批提交可审查的修改，再运行必要检查并在设备上验收。

仓库通过 `.gitattributes` 统一文本文件的提交与检出换行为 LF，`.editorconfig` 约定 UTF-8 编码、LF 换行和文件末尾换行。原型 PNG 等二进制文件保持原始字节。

## 当前电脑环境

以下仅代表当前开发会话及常见安装位置的检测结果；工具可能安装在其他位置，或尚未加入 PATH。

| 工具                         | 检测结果                                      | 用途                                 |
| ---------------------------- | --------------------------------------------- | ------------------------------------ |
| Git                          | 可用，`2.54.0.windows.1`                      | 查看历史、分支与提交                 |
| Node.js                      | 可用，`v24.19.0`，来自当前应用提供的运行时    | 客户端、服务端、检查与构建命令       |
| pnpm                         | 当前会话有包装入口；项目声明 `pnpm@9.12.0`    | 安装依赖与执行脚本                   |
| 项目依赖                     | 已存在 `node_modules`                         | 已支持类型检查、Lint 和 Vitest 启动  |
| Java / javac                 | PATH 未找到，`JAVA_HOME` 未设置               | 本机 Android 原生编译                |
| Android Studio / Android SDK | 已检查的常见位置未发现；SDK 环境变量未设置    | 本机编译、模拟器和调试               |
| adb / emulator / sdkmanager  | PATH 未找到                                   | 连接 Android 设备、管理 SDK 和模拟器 |
| EAS CLI                      | PATH 未找到全局命令                           | 可按需通过包管理器临时运行           |
| VS Code                      | PATH 未找到 `code` 命令，不能据此判断是否安装 | 可选编辑器，当前会话编辑代码不依赖它 |

若要在普通终端独立开发，应确认 Node.js 和与项目匹配的 pnpm 在该终端可用，不能假定当前应用提供的运行时已安装为系统工具。

## 运行与检查

在项目根目录执行。首轮开发已启动本机 Metro 并检查 Android / Web 开发代码包，没有执行 APK 编译或 EAS 云构建。

### 依赖

项目声明的包管理器为 `pnpm@9.12.0`。在已有对应 pnpm 的终端中运行：

```powershell
pnpm install --frozen-lockfile
```

### Web 界面预览

```powershell
pnpm dev:metro
```

`dev:metro` 已使用显式端口 8081，`start` 通过 cross-env 设置环境变量，支持 Windows 与 Linux。需要其他端口时可运行 `pnpm exec expo start --web --port 其他端口`。

Web 只适合布局和普通交互检查。Web 不执行原生身份验证或后台锁定，使用每个浏览器生成的随机密钥；该密钥与数据同处浏览器存储，不能作为移动端安全验收环境。旧固定预览密钥仅用于兼容读取旧数据。

### 手机预览

```powershell
pnpm dev:mobile
```

手机与电脑需要能互相访问开发服务。Android 从 [SDK 54 Expo Go 下载页](https://expo.dev/go?sdkVersion=54&platform=android&device=true)安装匹配客户端；不要默认当前商店最新版兼容旧 SDK。开发服务与 APK 编译是不同步骤，Expo Go 与 Fast Refresh 调试不消耗 EAS 云构建额度。

当前约定先在 Android Expo Go 调试，普通界面和 JavaScript 逻辑变更无需重复编译。遇到 Expo Go 不支持的原生功能时，再考虑 development build。当前没有添加 `expo-dev-client` 或 development profile；iOS Face ID 无法在 Expo Go 中完成验证。任何 EAS 云构建都需用户明确确认。

### 类型、Lint 和测试

```powershell
pnpm check
pnpm lint
pnpm test
```

当前会话的 pnpm 包装入口可能自动安装依赖；首轮开发使用项目指定的 pnpm 9.12.0 维护锁文件，禁用依赖安装脚本。实际检查也可使用已安装的本地工具入口：

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run
```

## Android 构建方式

### 云端构建：不要求电脑先安装 Android Studio

已有 `eas.json` 的 `preview` 配置会生成内部安装用 APK。需要 Expo 账号、对应项目权限和 Android 签名配置；现有文件没有配置 EAS project ID，需要确认关联情况。

在配置完成后，可运行：

```powershell
pnpm dlx eas-cli@latest login
pnpm dlx eas-cli@latest build --platform android --profile preview
```

这些步骤会使用外部构建服务并可能消耗额度，只有用户明确确认云构建后才执行。不要把当前 preview APK 配置理解为已经有可安装包，也不要把 preview 构建当作已配置好的 development build。

### 本机编译与模拟器

需要 Android Studio、Android SDK / Platform Tools、兼容的 JDK，以及 `JAVA_HOME`、`ANDROID_HOME` 和 PATH 配置。Expo 官方 Windows 指南列出 JDK 17；实际 SDK 与构建工具版本应与本项目 SDK 54 生成的原生配置一致。

准备好环境后，通过 `pnpm exec expo run:android` 本机编译；连接已启用 USB 调试的手机时可加 `--device`。已有 `pnpm android` 只是启动 Expo 并打开 Android 客户端，不等于编译 APK。

Windows 可以进行 Android 原生开发。iOS 本机编译与模拟器需要 macOS 和 Xcode；可从 Windows 使用 EAS 云端构建，但仍需要相应的 Apple 签名和设备测试条件。

当前本地卡片业务不依赖 MySQL。只有继续开发模板中的账号 / 后端功能时，才需要配置数据库、OAuth 和相关环境变量。

## 已完成与未完成的验证

| 检查                       | 结果                                                                       |
| -------------------------- | -------------------------------------------------------------------------- |
| TypeScript                 | 通过                                                                       |
| ESLint                     | 通过，无错误                                                               |
| Vitest                     | 7 个 CardBox 测试文件、45 条测试通过；原模板 1 条跳过                      |
| 排序                       | 已改为按卡片 ID 移动最新数据，连续移动回归测试通过                         |
| 原型图片复制               | 源文件与归档文件 SHA-256 一致                                              |
| Android / Web Metro 代码包 | 均成功生成；Web 页面及代码包 HTTP 200                                      |
| Web 交互 / 视觉验收        | 21 项隔离 Chrome 操作检查通过，已检查浅色 / 深色截图；不操作当前内置浏览器 |
| Android 真机功能验收       | 2026-10-11 用户确认 2.0.0 全部验收完成，使用 USB / Expo Go                 |
| APK 构建与安装             | 尚未验证                                                                   |
| GitHub 远端访问与推送      | 已通过 HTTPS 登录并完成首轮推送、合并；本轮按用户授权提交至 main           |

类型检查和 Lint 通过不证明保存、加密、备份及锁定正确；需要有针对性的测试和真机验证。

## 开发顺序与当前进度

1. 已实现存储修复：初始化只读取；失败保留原始数据；写入排队；写入成功后更新界面；设备密钥初始化使用单次共享请求。明确确认备份恢复后，先另存无法读取的原始数据。
2. 已统一认证入口：原生冷启动、敏感信息、编辑、删除、导入、导出和安全设置；后台遮挡、超时锁定；所有业务浮层处于锁定门禁之后。用户已确认本版本 Android 功能验收完成。
3. 已修复核心交互：受控编辑草稿、图片确认与持久保存、按 ID 排序、保存后选中新卡片。加密随机数改用 Expo Crypto 的原生异步接口，避免 CryptoJS 在 Hermes 中自行寻找随机数来源。
4. 已对照原型调整：空状态、卡片类型、独立编辑 / 排序 / 备份页、浮层菜单、关于和系统主题。月份选择器与交互裁剪尚未增加，作为后续优化；Web 检查与用户 Android 验收已完成。
5. 已拆分存储、认证、校验、图片服务和界面组件；保留既有模板服务端，卡片业务仍无需后端账号或 MySQL。
6. 已添加关键回归测试：本地完整性校验、v3 备份完整性校验、旧格式兼容、图片恢复失败清理、连续排序、锁定和错误恢复。用户整体验收结果与后续回归清单记录在验收文档。
7. 当前基线为用户已接受的 2.0.0。后续优化按新需求迭代；需要安装包时再决定构建方式，不得为了普通代码修改频繁运行 EAS。

本地新格式保护卡片字段；卡面文件位于应用私有目录，未单独加密。导出备份统一加密字段和图片。首次读取兼容旧格式，只有正常修改时改写为新加密格式。新备份为 `cardbox-secure-v3`，同时兼容原有 v2 备份读取。

## 官方参考

- [Expo 环境准备](https://docs.expo.dev/get-started/set-up-your-environment/)
- [Development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [EAS 构建设置](https://docs.expo.dev/build/setup/)
- [Android Studio / Emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [SDK 54 LocalAuthentication：Face ID 限制](https://docs.expo.dev/versions/v54.0.0/sdk/local-authentication/)
