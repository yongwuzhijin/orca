# 01 · 工程技术栈调研

> 调研对象：Orca（`orca` v1.4.121-rc.1）—— 面向并行 Agent 开发的下一代 IDE
> 调研日期：2026-07-04

## 一、整体形态

Orca 是一个 **Electron 桌面应用 + React Native 移动端伴侣 App** 的多端工程，核心是一个可以并行编排多个编码 Agent（Codex / ClaudeCode / OpenCode / Pi）的 IDE，每个 Agent 跑在自己的 git worktree 里。

- 目标平台：macOS / Windows / Linux（桌面）+ iOS / Android（移动）
- 包管理：`pnpm@10.24.0`（桌面）、`pnpm`（移动，独立 lockfile）
- Node 引擎：`node 24`（`engines.node: "24"`）

## 二、桌面端（根工程）

### 运行时框架
| 领域 | 技术 | 版本 |
| --- | --- | --- |
| 桌面容器 | Electron | ^42.3.3 |
| 构建（主/预加载/渲染） | electron-vite | ^5.0.0 |
| 打包 | electron-builder | ^26.8.1 |
| 自动更新 | electron-updater | ^6.8.3 |
| 构建底座 | Vite | ^7.3.6 |

### 前端（renderer）
- **React 19**（`react` ^19.2.5 + `react-dom`）
- **状态管理**：Zustand ^5
- **样式**：Tailwind CSS v4（`@tailwindcss/vite`）+ `tailwind-merge` + `clsx` + `class-variance-authority` + `tw-animate-css`
- **UI 组件**：shadcn（`components.json` 存在）+ Radix UI + `lucide-react` 图标 + `cmdk` 命令面板 + `sonner` toast
- **拖拽**：`@dnd-kit/core` + `@dnd-kit/sortable`
- **虚拟列表**：`@tanstack/react-virtual`
- **富文本编辑**：TipTap 3（大量 extension：table / image / link / math / task-list / markdown 等）
- **代码编辑器**：Monaco（`monaco-editor` + `@monaco-editor/react`）
- **Markdown 渲染链路**：`react-markdown` + `unified` / `remark-*`（gfm、math、frontmatter、breaks）/ `rehype-*`（highlight、katex、sanitize、slug、raw）
- **数学公式**：KaTeX；**图表**：Mermaid；**代码高亮**：lowlight / `vscode-textmate` + `vscode-oniguruma`
- **其它**：`react-colorful` 取色、`emoji-picker-react`、`html-to-image`、`pdfjs-dist`、`dompurify`

### 终端（核心特性）
- **xterm.js v6 beta**（`@xterm/xterm` + headless）
- Addon 全家桶：`addon-webgl`（WebGL 渲染）、`addon-fit`、`addon-search`、`addon-ligatures`、`addon-unicode11`、`addon-web-links`、`addon-serialize`
- PTY：`node-pty`（带自定义 patch）

### 主进程 / 后端能力（`src/main`、`src/relay`）
- **SSH**：`ssh2`（远程会话是一等公民，参见 AGENTS.md 的 "SSH Use Case"）
- **WebSocket**：`ws`（桌面↔移动 relay 通道）
- **加密**：`tweetnacl`
- **语音/ASR**：`sherpa-onnx`（按平台分包的 optionalDependencies）
- **文件监听**：`@parcel/watcher`
- **配置解析**：`yaml` / `jsonc-parser`
- **校验**：Zod 4
- **三方集成**：Linear SDK、GitLab / Bitbucket / Azure DevOps（`src/main` 下各有独立目录）、`agent-browser`、`serve-sim`
- **遥测**：`posthog-node`
- **二维码**：`qrcode`（配对移动端）
- **i18n**：`i18next` + `react-i18next`（配套一整套 localization 校验/审计脚本）

### 源码分层（`src/`）
```
cli/       命令行入口（out/cli/index.js，暴露 orca 可执行）
main/      Electron 主进程（Agent 编排、各 git provider 集成、AI vault 等）
preload/   预加载桥接（api-types、gitlab、runtime-environment 等）
relay/     桌面↔移动/远程的中继层（agent-exec、fs-handler、hook-server）
renderer/  React 渲染进程（index.html + web-index.html 双入口，含 dev:web）
shared/    跨进程共享逻辑（agent-detection、agent-hook-* 等）
types/     全局类型声明
```
> 注：AGENTS.md 要求类型声明优先用 `.ts` 而非 `.d.ts`。

## 三、原生模块（`native/`）
Computer-use（让 Agent 操作电脑）的跨平台原生实现：
- `computer-use-macos` / `computer-use-linux` / `computer-use-windows`
- 通过 `config/scripts/build-native-for-platform.mjs`、`build-computer-macos.mjs` 构建

## 四、移动端（`mobile/`，独立子工程）

| 领域 | 技术 | 版本 |
| --- | --- | --- |
| 框架 | React Native | ^0.83.9 |
| 平台 SDK | Expo | ^55（含 expo-router、notifications、camera、secure-store 等一整套 expo-*） |
| UI/交互 | react-native-gesture-handler、reanimated 4、safe-area-context、screens、svg、webview | — |
| 状态 | Zustand ^5 | — |
| 校验 | Zod 4 | — |
| 通信/加密 | `ws` + `tweetnacl`（与桌面端一致，复用配对协议） | — |
| 构建 | Metro（`metro.config.js`）+ Vite ^8 / Vitest（测试） | — |
| 原生扩展 | 本地包 `@orca/expo-two-way-audio`（双向音频） | — |
| 发布 | Fastlane（`mobile/fastlane`） | — |

## 五、工程化与质量

- **Lint**：oxlint（`oxlint`，非 ESLint），另有多套专用配置：
  - `oxlint-react-doctor.json`（React 反模式）
  - `oxlint-switch-exhaustiveness.json`（switch 穷尽性，type-aware）
- **格式化**：oxfmt（`oxfmt`，非 Prettier）
- **类型检查**：`@typescript/native-preview`（`tsgo`，Rust 版 TS 编译器）为主，`tsc` 为备；分 node / cli / web 三套 tsconfig
- **测试**：
  - 单测：Vitest 4（`config/vitest.config.ts`）+ Testing Library + happy-dom
  - E2E：Playwright（`@playwright/test` + `@stablyai/playwright-test`），针对终端渲染/性能有大量 golden + perf 用例
  - 基准：`tools/benchmarks/`（idle-cpu、startup、daemon-coldstart）
- **Git hooks**：Husky + lint-staged（提交时跑 oxlint / react-doctor / oxfmt）
- **本地化治理**：一整套 `config/scripts/*localization*` 脚本做 catalog 校验与覆盖率审计
- **约束（见 AGENTS.md）**：
  - 禁止 `max-lines` 的 lint-disable，超行必须拆文件
  - 禁止 `helpers`/`utils`/`common` 等泛化命名
  - 所有改动需兼顾 SSH、跨平台（键盘快捷键/路径）、多 git provider（不止 GitHub）
  - UI 必须遵循 `docs/STYLEGUIDE.md` + `src/renderer/src/assets/main.css` 的 token

## 六、关键配置文件位置

| 文件 | 作用 |
| --- | --- |
| `electron.vite.config.ts` | 主/预加载/渲染三进程的 Vite 构建 |
| `vite.web.config.ts` | 纯 Web 版渲染（`dev:web`）构建 |
| `components.json` | shadcn 组件配置 |
| `config/tsconfig.*.json` | node / cli / web 分环境 TS 配置 |
| `config/electron-builder.config.cjs` | 桌面打包 |
| `config/patches/` | node-pty、xterm addon 的补丁 |
| `orca.yaml` | 应用级配置 |

## 七、一句话总结

**Electron + React 19 + Tailwind v4 + xterm(WebGL) 的桌面 IDE**，以 SSH/relay 打通远程与移动端（RN + Expo），全链路用 oxlint / oxfmt / tsgo / Vitest / Playwright 这套「Rust 系高性能工具链 + 现代测试栈」来保障质量，核心卖点是并行 Agent 编排 + git worktree 隔离 + 高性能终端。
