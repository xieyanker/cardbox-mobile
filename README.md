# CardBox

CardBox 是使用 Expo / React Native 开发的本地银行卡管理应用，目标是提供简单、安全、纯本地的卡包体验。当前应用配置版本为 `1.0.2`，Android 包名为 `com.app.cardboxmobile`。

## 项目文档

- [设计说明与原型图](docs/design/README.md)：用户提供的原始设计图、页面说明、当前实现与原型的差异。
- [开发与交接指南](docs/DEVELOPMENT.md)：开发环境、运行命令、Git 状态、验证结果和后续开发顺序。
- [Android 验收步骤](docs/TESTING.md)：Expo Go 连接方式、关键功能和真机验证记录。

## 当前实现

客户端包含卡片添加、修改、删除、查看、卡号隐藏、生物识别验证、卡面选择与裁剪、排序、密码备份和后台自动锁定。核心卡片数据通过 AsyncStorage 保存在本机，设备密钥通过 SecureStore 保存；卡片业务目前没有接入后端同步。

首轮开发已修复存储初始化、串行写入、设备密钥初始化、身份验证入口、图片持久保存和排序问题，并对照原型调整主界面。类型检查、业务测试和 Android / Web 代码打包已通过，另有 19 项 Web 操作回归检查通过；Android 真机验收仍待完成。

| 路径                                                       | 用途                                  |
| ---------------------------------------------------------- | ------------------------------------- |
| `app/(tabs)/index.tsx`                                     | 核心卡片界面及主要业务逻辑            |
| `app/_layout.tsx`                                          | 应用入口、导航、主题和 Provider       |
| `lib/cardbox-security.ts`                                  | 本地数据与备份加解密                  |
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

## 文档依据

文档于 2026-10-10 新增。设计目标依据用户提供的原型图；当前实现依据本地源码和配置；验证结论依据实际检查。原型图中的目标与当前已实现行为在设计说明中分别记录。
