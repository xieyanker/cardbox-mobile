# README Android 菜单修图记录

2026-10-22，按用户要求更新 README 中旧版真机照片的菜单展示。应用版本仍为 4.0.0，Android 构建编号仍为 8。

- 原图：[`android-wallet-real.jpg`](../images/android-wallet-real.jpg)，保持原文件不变。
- 当前界面参考：[`menu.png`](../images/menu.png)。
- 修图输出：[`android-wallet-menu-4.0.png`](../images/android-wallet-menu-4.0.png)。
- 方式：内置 imagegen 图片编辑，原图为编辑目标，当前菜单截图为文字、顺序和图标参考。
- 代码依据：`app/(tabs)/index.tsx` 的一级菜单，依次为添加卡片、卡片排序、备份管理、自动锁定、立即锁定、浏览模式、存储管理、关于应用。

这是一张基于用户真机照片制作的菜单示意图，不是重新采集的 Android 真机截图，也不增加真机验收结论。原卡面内容与钱包构图作为视觉参照保留；生成式修图可能重绘细节，原始照片始终可单独查看。既有截图采集清单和原图保护哈希不修改。

输出尺寸为 862 × 1825，README 沿用 280 像素展示宽度。已在隔离 Chrome 中加载并视觉复核；八项菜单文字、顺序和图标与当前菜单参考一致，原始照片及原型图与 Git 原文件和既有 SHA-256 保护哈希一致。文档本地引用、TypeScript、Markdown 格式和差异检查通过，ESLint 0 错误 / 7 条既有模板警告。本轮不涉及应用行为或新增真机验收。

## 最终编辑提示词

```text
Use case: precise-object-edit. Asset type: CardBox README Android screenshot illustration. Image 1 is the EDIT TARGET, a 540 x 1143 portrait screenshot uploaded by the app owner. Image 2 is a SUPPORTING REFERENCE showing the CURRENT menu and its icon styles; do NOT replace Image 1's bank cards with Image 2's synthetic cards. Edit ONLY the white popup menu in the upper right of Image 1. Keep the entire rest of Image 1 visually unchanged: exact bank-card artwork and logos, blue world-map Bank of Communications card, other stacked bank cards, CardBox title, dim gray backdrop, tabs, bottom 14 / 16 indicator, bottom card detail panel and framing. Preserve Image 1's aspect ratio, crop, composition, and natural screenshot appearance. Update the menu from six rows to eight rows, extending its white rounded panel downwards to accommodate two added rows. Keep the panel's top and right edge at the same position, preserve its width and rounded corners, its blue icons, original black Chinese text size and generous uniform row spacing. Eight rows in this EXACT top-to-bottom order, with each text rendered once and no other menu items: 1 添加卡片 (blue plus outline icon), 2 卡片排序 (blue vertical swap arrows), 3 备份管理 (blue open-folder outline), 4 自动锁定 (blue padlock outline), 5 立即锁定 (blue filled padlock), 6 浏览模式 (blue horizontal sliders outline), 7 存储管理 (blue closed-folder outline), 8 关于应用 (blue circled i outline). Use Image 2 for exact spelling, order and icons only; match Image 1's existing menu typography and scale. Every Chinese label must be accurate and legible. Do not modify bank artwork or background text, do not add phone frames, watermarks, explanatory labels, status bars or borders. Output one polished edited screenshot on an opaque background.
```
