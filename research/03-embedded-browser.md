# 03 · 内置浏览器 / 打开网页能力调研

> 调研问题：当前工程有没有打开网页的功能，是否内置浏览器内核？
> 调研日期：2026-07-04

## 一、结论先行

**有，而且是一个完整的内置浏览器。** Orca 内置了基于 **Electron / Chromium** 的浏览器内核（不是简单的"用系统浏览器打开链接"），是一个一等公民功能面板，对应 README 里的 **Design Mode** 特性。它不仅能开网页，还能被 Agent 自动化操控、截图、录屏、注入输入、抓取元素 HTML/CSS 回传给 Agent。

代码分布：
- 主进程：`src/main/browser/`（~50 个文件，核心引擎与后端）
- 渲染进程：`src/renderer/src/components/browser-pane/`（浏览器面板 UI）
- 设置：`src/renderer/src/components/settings/Browser*.tsx`（一大批浏览器设置项）
- 依赖：`agent-browser ~0.27.0`（Agent 浏览器自动化库）

## 二、内核与双后端架构

内核就是 **Chromium**（随 Electron 42 内置）。`src/main/browser/browser-backend.ts` 定义了两种页面承载方式，统一注册进 `BrowserManager`：

1. **Renderer backend**：桌面渲染进程里挂一个 Electron `<webview>`（有窗口时用）。
2. **Offscreen backend**：`offscreen-browser-backend.ts`，主进程离屏 WebContents（用于 headless 的 `orca serve`，没有渲染窗口时）。

> 设计好处：无论页面怎么创建，下游命令（自动化、录屏、输入）都统一解析到一个 WebContents，差异只隔离在"建/销 tab"这一步。

## 三、能力清单

### 基础浏览器
- 地址栏 + 建议/补全：`BrowserAddressBar.tsx`、`browser-address-bar-suggestions.ts`
- 页内查找：`BrowserFind.tsx`
- 缩放 / 视口：`browser-page-zoom.ts`、`browser-page-viewport.ts`
- 导航状态、Chromium 错误页轮询：`browser-guest-navigation-state.ts`、`chromium-error-page-polling.ts`
- 工具栏菜单、上下文菜单定位：`BrowserToolbarMenu.tsx`、`context-menu-positioning.ts`

### 会话 / 配置 / 隐私
- 会话与 Profile 注册、持久化：`browser-session-registry.ts`（含 `.persistence` 测试）、`browser-session-startup.ts`
- 多 Profile：`BrowserNewProfileDialog.tsx`、`BrowserProfileRow.tsx`
- **Cookie 导入**：从 Chrome / **Comet** / **Helium** 等浏览器导入 Cookie（`browser-cookie-import.*.test.ts`）
- UA 伪装：`browser-session-ua.ts`
- **反检测**：`anti-detection.ts`（规避网站的自动化检测）
- 权限策略：`browser-session-permission-policy.ts`、媒体访问 `browser-media-access.ts`、WebAuthn `browser-webauthn-access.ts`
- 下载目标目录：`browser-download-destination.ts`
- 设置项：主页 `BrowserHomePageSetting.tsx`、搜索引擎 `BrowserSearchEngineSetting.tsx`、默认缩放、链接路由 `BrowserLinkRoutingSetting.tsx`、localhost worktree 标签等

### Agent 自动化（核心差异化）
- **CDP（Chrome DevTools Protocol）桥接**：`cdp-bridge.ts`、`cdp-ws-proxy.ts`、`electron-debugger-lease.ts` —— 把 Chromium 的 CDP 暴露给自动化层。
- **agent-browser 桥**：`agent-browser-bridge.ts` —— 让 Agent 直接驱动浏览器。
- **录屏 / 截图**：`browser-screencast-stream.ts`、`cdp-screenshot.ts`、`browser-grab-screenshot.ts`、`browser-screencast-image-size.ts`。
- **输入注入**：`browser-text-insertion.ts`、渲染侧 `remote-browser-keyboard.ts`。
- **快照引擎**：`snapshot-engine.ts` —— 生成页面结构快照供 Agent 理解。

### Grab / Design Mode（点选元素喂给 Agent）
对应 README 的 Design Mode：在真实 Chromium 窗口里点任意 UI 元素，把它的 HTML、CSS 和裁剪截图直接塞进 Agent prompt。
- `browser-grab-session-controller.ts`、`browser-grab-payload.ts`、`grab-guest-script.ts`（注入到页面的脚本）
- 渲染侧：`useGrabMode.ts`、`GrabConfirmationSheet.tsx`、`browser-annotation-output.ts`

### 远程（SSH）浏览器
- `remote-browser-tab-ownership.ts`、`remote-browser-frame-style.ts`、`remote-browser-keyboard.ts` —— 远程环境下的浏览器 tab 归属与交互。

## 三点五、如何触发 / 打开浏览器

浏览器 tab 的创建统一走 Zustand store 的 `createBrowserTab(worktreeId, url, options)`（Web/远程运行时则走 `createWebRuntimeSessionBrowserTab`）。触发它的入口有多条：

1. **快捷键**（最直接）：`tab.newBrowser`，默认 **`Cmd/Ctrl+Shift+B`**（`src/shared/keybindings.ts:555`，`Mod+Shift+B`，全平台）。按下后打开一个指向 `browserDefaultUrl`（默认 `about:blank`）的新浏览器 tab 并聚焦地址栏。相关：`Terminal.tsx` 的 `handleNewBrowserTab`、`FloatingTerminalPanel.tsx`。

2. **Tab 栏"+"新建 tab 输入框**：`tab-create-entry-action.ts` + `tab-create-entry-classifier.ts`。在新建 tab 时输入内容会被分类，若识别为 URL（`explicit-url` / `host-url`）就开浏览器 tab，若是文件路径则开编辑器——**输入网址即打开网页**。

3. **点击检测到的 dev-server 端口**：`WorktreeCardPorts.tsx`、`right-sidebar/PortsPanel.tsx` —— worktree 跑起本地服务后，点端口直接在内置浏览器打开对应 `localhost` URL。

4. **应用菜单 / 加速键 → IPC**：主进程 `browser-guest-ui.ts:366` 命中 `tab.newBrowser` 后 `renderer.send('ui:newBrowserTab')`，渲染进程 `onNewBrowserTab`（`preload/index.ts:3013`）监听并新建。

5. **命令面板 / 跳转面板**：`WorktreeJumpPalette.tsx` + `lib/browser-palette-search.ts` —— 可搜索并聚焦已打开的浏览器页面（`queueBrowserFocusRequest` / `ORCA_BROWSER_FOCUS_REQUEST_EVENT`）。

6. **从终端点链接 / 打开文件**：`Terminal.tsx`（点终端里的 URL）、`terminal-file-open-routing.ts`（用 `file://` 在浏览器打开文件）。

7. **页面内右键"在 Orca tab 打开链接"**：`BrowserPane.tsx` 上下文菜单调用 `createBrowserTab`；主进程 `browser-manager.ts:1790` 也会 `send('browser:open-link-in-orca-tab')` 把 target=_blank / 弹窗路由回 Orca tab。

8. **Agent 自动化触发**：Agent 通过 `agent-browser-bridge.ts` / CDP 驱动，可自行创建/导航页面（含 headless `orca serve` 的离屏后端）。

> 小结：**用户手动最快是 `Cmd/Ctrl+Shift+B`**，或在"+"新建 tab 里直接敲网址；此外点端口、命令面板、终端链接、右键、以及 Agent 自动化都会触发。

## 四、与"打开系统浏览器"的区别

Orca 也有把链接路由到内置浏览器还是外部浏览器的设置（`BrowserLinkRoutingSetting.tsx`），但主体是**内置 Chromium 面板**，而非依赖系统默认浏览器。

## 五、另一个"内核"：Computer Use（跨平台桌面操控）

除了浏览器，`src/main/computer/` + `native/computer-use-*` 提供**操控整个桌面**的能力（macOS/Linux/Windows 原生 provider + sidecar），可截屏、点击、键盘、剪贴板粘贴等，供 Agent 做 GUI 自动化。这与浏览器内核是两套独立能力，但同属"让 Agent 看/操作图形界面"这条线。

## 六、一句话总结

Orca **内置了完整的 Chromium 浏览器内核**（Electron webview + 离屏 WebContents 双后端），不仅能打开网页，还围绕 Agent 自动化建了一整套能力：CDP 桥接、agent-browser 驱动、录屏截图、输入注入、页面快照、点选元素抓取（Design Mode）、Cookie 导入、反检测、多 Profile、远程浏览器等。核心代码在 `src/main/browser/` 与 `src/renderer/src/components/browser-pane/`。
