# CardBox 开发与交接指南

记录日期：2026-10-10。这里区分已检查事实、建议流程和未完成验证，供后续开发使用。

## 现有资料与分析依据

新增这些文件前，项目内未发现 README、独立设计文档或开发指南。已有资料主要是源码、配置、源码注释以及 Git 提交记录。

- 功能与架构：依据 `app/(tabs)/index.tsx`、`lib/cardbox-security.ts`、`server/routers.ts` 和 `drizzle/schema.ts`。
- 技术栈与运行方式：依据 `package.json`、`app.config.ts`、`eas.json` 和其他配置。
- 验证结果：依据实际执行的 TypeScript、ESLint、Vitest 和排序回调模拟。
- 设计目标：依据用户提供的[原型图与设计说明](design/README.md)。

## Git 维护状态

本地存在 `.git` 仓库，检查时有 11 条提交，当前分支为 `main`，HEAD 为 `05c9feb`。远程地址为：

```text
git@github.com:xieyanker/cardbox-mobile.git
```

最近的提交涉及图片确认、排序、应用名称、原生依赖和 Android 版本。检查时本地 `main` 与缓存的 `origin/main` 指向同一提交；本次没有 fetch 或 push，因此不代表已确认远端最新状态，也不代表已验证 GitHub 写入权限。

设计文档和原型图纳入 Git 版本维护。后续开发建议按功能创建 `codex/` 前缀分支，分批提交可审查的修改，再运行必要检查并在设备上验收。

仓库通过 `.gitattributes` 统一文本文件的提交与检出换行为 LF，`.editorconfig` 约定 UTF-8 编码、LF 换行和文件末尾换行。原型 PNG 等二进制文件保持原始字节。

## 当前电脑环境

以下仅代表当前开发会话及常见安装位置的检测结果；工具可能安装在其他位置，或尚未加入 PATH。

| 工具 | 检测结果 | 用途 |
| --- | --- | --- |
| Git | 可用，`2.54.0.windows.1` | 查看历史、分支与提交 |
| Node.js | 可用，`v24.19.0`，来自当前应用提供的运行时 | 客户端、服务端、检查与构建命令 |
| pnpm | 当前会话有包装入口；项目声明 `pnpm@9.12.0` | 安装依赖与执行脚本 |
| 项目依赖 | 已存在 `node_modules` | 已支持类型检查、Lint 和 Vitest 启动 |
| Java / javac | PATH 未找到，`JAVA_HOME` 未设置 | 本机 Android 原生编译 |
| Android Studio / Android SDK | 已检查的常见位置未发现；SDK 环境变量未设置 | 本机编译、模拟器和调试 |
| adb / emulator / sdkmanager | PATH 未找到 | 连接 Android 设备、管理 SDK 和模拟器 |
| EAS CLI | PATH 未找到全局命令 | 可按需通过包管理器临时运行 |
| VS Code | PATH 未找到 `code` 命令，不能据此判断是否安装 | 可选编辑器，当前会话编辑代码不依赖它 |

若要在普通终端独立开发，应确认 Node.js 和与项目匹配的 pnpm 在该终端可用，不能假定当前应用提供的运行时已安装为系统工具。

## 运行与检查

在项目根目录执行。下列启动和构建命令是操作指南，本次文档归档没有启动应用或执行 APK 构建。

### 依赖

项目声明的包管理器为 `pnpm@9.12.0`。在已有对应 pnpm 的终端中运行：

```powershell
pnpm install --frozen-lockfile
```

### Web 界面预览

```powershell
pnpm exec expo start --web --port 8081
```

现有 `dev:metro` 脚本包含 POSIX 的 `${EXPO_PORT:-8081}`，`start` 脚本也使用 POSIX 环境变量赋值；在默认 Windows 脚本 shell 下需要调整。这里使用显式端口命令，便于 Windows 开发。

Web 只适合布局和普通交互检查。现有代码在 Web 上关闭后台锁定、直接切换敏感信息显示，并使用固定预览密钥；不能作为移动端安全验收环境。

### 手机预览

```powershell
pnpm exec expo start
```

手机与电脑需要能互相访问开发服务。Android 可从 [Expo Go 下载页](https://expo.dev/go)选择与本项目 SDK 54 匹配的客户端；不要默认当前商店最新版兼容旧 SDK。

持续开发建议配置 development build。当前项目没有 `expo-dev-client` 依赖，`eas.json` 也只有 preview 配置，需要另行添加开发客户端和 development profile。iOS Face ID 无法在 Expo Go 中完成验证，需使用 development build。

### 类型、Lint 和测试

```powershell
pnpm check
pnpm lint
pnpm test
```

当前会话的 pnpm 包装入口曾在执行前自动安装依赖，随后因依赖构建脚本策略停止；因此实际检查使用已安装的本地工具入口：

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

这些步骤会使用外部构建服务。不要把当前 preview APK 配置理解为已经有可安装包，也不要把 preview 构建当作已配置好的 development build。

### 本机编译与模拟器

需要 Android Studio、Android SDK / Platform Tools、兼容的 JDK，以及 `JAVA_HOME`、`ANDROID_HOME` 和 PATH 配置。Expo 官方 Windows 指南列出 JDK 17；实际 SDK 与构建工具版本应与本项目 SDK 54 生成的原生配置一致。

准备好环境后，通过 `pnpm exec expo run:android` 本机编译；连接已启用 USB 调试的手机时可加 `--device`。已有 `pnpm android` 只是启动 Expo 并打开 Android 客户端，不等于编译 APK。

Windows 可以进行 Android 原生开发。iOS 本机编译与模拟器需要 macOS 和 Xcode；可从 Windows 使用 EAS 云端构建，但仍需要相应的 Apple 签名和设备测试条件。

当前本地卡片业务不依赖 MySQL。只有继续开发模板中的账号 / 后端功能时，才需要配置数据库、OAuth 和相关环境变量。

## 已完成与未完成的验证

| 检查 | 结果 |
| --- | --- |
| TypeScript | 通过 |
| ESLint | 0 个错误、13 个警告 |
| Vitest | 1 个测试文件、1 条测试均跳过，实际执行 0 条 |
| 排序回调模拟 | 复现索引变化后仍引用旧索引的问题 |
| 原型图片复制 | 源文件与归档文件 SHA-256 一致 |
| Web / 手机完整运行 | 尚未在本次交接中验收 |
| APK 构建与安装 | 尚未验证 |
| GitHub 远端访问与推送 | 尚未验证 |

类型检查和 Lint 通过不证明保存、加密、备份及锁定正确；需要有针对性的测试和真机验证。

## 建议继续开发顺序

1. 修复存储：初始化读取完成前不写入；读取 / 解密失败时保留原数据；串行化写入并处理错误；保护设备密钥初始化。
2. 统一身份验证：冷启动、后台返回、编辑、敏感信息展示与备份导出使用一致的认证策略；锁定时处理所有 Modal。
3. 修复核心交互：图片与编辑草稿同步、图片持久化、排序旧回调、添加后选中状态；验证移动端加密随机数能力。
4. 对照原型实现界面：首次空状态、卡片类型、独立排序页、浮层菜单、完整深色模式及备份流程。
5. 拆分业务模块：卡片存储、认证、备份、图片服务及界面组件；决定是否继续保留全栈模板功能。
6. 补充关键验证：冷启动与重启不丢数据、解密失败不覆盖、未经验证不泄露敏感字段、排序稳定、错误密码与损坏备份可处理、图片可跨设备恢复。
7. 在 Android 真机上完成验收并构建安装包，再进行后续发布或云同步开发。

## 官方参考

- [Expo 环境准备](https://docs.expo.dev/get-started/set-up-your-environment/)
- [Development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [EAS 构建设置](https://docs.expo.dev/build/setup/)
- [Android Studio / Emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [SDK 54 LocalAuthentication：Face ID 限制](https://docs.expo.dev/versions/v54.0.0/sdk/local-authentication/)
