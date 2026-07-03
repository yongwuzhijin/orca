# 02 · Agent 特殊处理调研（Claude Code / Cursor / Codex 等）

> 调研问题：Orca 对 Claude Code、Cursor 等编码 Agent 做了哪些特殊处理？
> 调研日期：2026-07-04

## 一、总览：Orca 支持的 Agent 有多少

Orca 不是只接 Claude Code，而是把 **~35 个编码 Agent** 统一抽象成一个 `TuiAgent` 联合类型（见 `src/shared/agent-kind.ts`），每个都能在独立 worktree 里以 TUI 方式启动：

```
claude(Claude Code)、claude-agent-teams、openclaude、codex、cursor、gemini、
copilot、grok、devin、amp、opencode、aider、goose、antigravity、pi、kimi、
qwen-code、mistral-vibe、cline、continue、crush、autohand、command-code、
mimo-code、kilo、kiro、aug、codebuff、rovo、hermes、openclaw、droid、omp、ante …
```

每个 Agent 在 `src/main/<agent>/` 下可能有自己的目录（如 `claude/`、`cursor/`、`codex/`、`gemini/`、`copilot/`、`grok/`、`devin/`、`amp/`、`opencode/`、`pi/`、`antigravity/`、`kimi/`、`mimo/`、`hermes/`、`openclaude/` 等），以及配套的 `*-accounts/`、`*-usage/` 目录。

核心思路：**用一套统一的编排框架 + 针对每个 Agent CLI 差异的适配层**。以下是四类关键的"特殊处理"。

---

## 二、特殊处理之一：Managed Hooks（状态回传）

这是最核心的特殊处理。Orca 需要知道每个 Agent"在干活 / 等授权 / 空闲 / 完成"，做法是**往每个 Agent 的配置里注入一段 Orca 托管的 hook 脚本**，让 Agent 在生命周期事件时用 `curl` POST 回 Orca 本地的 HTTP 服务。

相关代码：
- `src/main/claude/hook-service.ts` + `hook-settings.ts`（Claude）
- `src/main/cursor/hook-service.ts`（Cursor，复用 Claude 兼容格式）
- `src/main/codex/hook-service.ts`（Codex）
- `src/main/agent-hooks/`（installer、server、remote installer 等公共层）
- `src/shared/agent-hook-*.ts`（类型、listener、relay、endpoint-file）

关键机制与踩坑（都写在代码注释里）：

1. **注入位置因 Agent 而异**
   - Claude / Cursor：写进各自的 `settings.json` 的 `hooks` 字段，指向一个托管脚本。
   - Codex：写进 `config.toml`（TOML 结构，另有专门的行扫描/信任块处理，见下文）。

2. **Endpoint 文件解决"Orca 重启后端口/Token 失效"**
   托管脚本启动时会 source 一个 `ORCA_AGENT_HOOK_ENDPOINT` 文件来刷新 `PORT/TOKEN`——因为一个在 Orca 重启后存活的 PTY，其环境变量里烤死的是旧实例的端口。文件不存在时回退到 PTY env（首次运行/在 Orca 外运行）。

3. **跨平台脚本**
   - Windows 生成 `.cmd`（`@echo off` + `curl.exe` POST，刻意避免再起一个 PowerShell）。
   - POSIX 生成 `.sh`（`#!/bin/sh` + `curl --data-urlencode`）。
   - 路径用 `worktreeId` 等含文件系统路径的字段，所以**不手拼 JSON**，改用 form 表单字段让接收端解析。

4. **fail-open 设计**：端口/Token/paneKey 任一为空就静默 `exit 0`，curl 加 `--connect-timeout 0.5 --max-time 1.5`，绝不阻塞 Agent。

5. **Devin 特判**：Devin 默认会导入 `.claude` 的 hooks。所以 Orca 的 Claude 托管脚本里加了 `if [ -n "$DEVIN_PROJECT_DIR" ]; then exit 0`，避免 Devin 场景下状态被错误归因到 Claude。

6. **远程（SSH）支持**：`installRemote(sftp, remoteHome)` 通过 SFTP 把 hook 脚本和配置装到远端 `~/.orca/agent-hooks/`；远端一律用 POSIX `.sh`，即使本地 Orca 跑在 Windows 上也不按本地 OS 推导。先写脚本再写 settings，保证部分失败时不会出现"settings 指向不存在脚本"。

7. **安装状态分级**：`installed` / `partial`（只装了部分事件）/ `not_installed` / `error`，侧边栏据此显示降级状态。

---

## 三、特殊处理之二：默认权限 / YOLO 参数（每个 Agent CLI 不同）

不同 Agent 跳过人工确认（"YOLO 模式"）的命令行 flag 完全不一样，Orca 在 `src/shared/tui-agent-permissions.ts` 里逐个维护：

| Agent | YOLO 参数 |
| --- | --- |
| claude / claude-agent-teams / openclaude / antigravity | `--dangerously-skip-permissions` |
| codex | `--dangerously-bypass-approvals-and-sandbox` |
| cursor / gemini(`--yolo`) / crush / command-code / kimi / rovo / hermes / copilot / ante | `--yolo` |
| aider | `--yes-always` |
| amp | `--dangerously-allow-all` |
| kiro | `--trust-all-tools` |
| autohand | `--unrestricted` |
| cline | `--auto-approve true` |
| continue | `--allow "*"` |
| mistral-vibe | `--agent auto-approve` |
| qwen-code | `--approval-mode yolo` |
| grok | `--permission-mode bypassPermissions` |
| devin | `--permission-mode bypass` |
| goose | 通过环境变量 `GOOSE_MODE=auto`（不是 flag） |

配套逻辑：
- 权限模式抽象成 `yolo | manual | mixed`，可全局一键切换（`applyAgentPermissionMode`）。
- **不支持的参数会被清洗**：`src/shared/agent-detection.ts` 里 `UNSUPPORTED_TUI_AGENT_ARGS` 声明 `opencode`、`kilo` 不支持 `--dangerously-skip-permissions`，启动前 `sanitizeTuiAgentLaunchArgs` 会把它们剔除——因为这些 Agent 移除/改名/从未暴露过 Claude 风格的跳权限 flag。

---

## 四、特殊处理之三：配置隔离与镜像（以 Codex 为典型）

Orca 不直接改用户系统里的 Agent 配置，而是维护一份"托管配置目录"，把系统配置**镜像+合并**进来。以 Codex 为例（`src/main/codex/codex-config-mirror.ts`）：

- 区分 `getSystemCodexHomePath()`（系统 CODEX_HOME）与 `getOrcaManagedCodexHomePath()`（Orca 托管的运行时 CODEX_HOME）。
- `syncSystemConfigIntoManagedCodexHome()` 把系统 `config.toml` 同步进托管目录：
  - **重写相对路径**（`rewriteRelativePathConfigValues`）——因为配置里的相对路径基准目录变了。
  - **剥离运行时自有的 TOML 段**（`stripRuntimeOwnedTomlSections`）——比如 trust 块引用的是 hooks.json 路径，系统目录里的信任项在 Orca 运行时 CODEX_HOME 里无效，要等 install 重映射。
  - 原子写（`writeFileAtomically`），合并时只在内容真变化才写盘。
- 另有 `codex-config-path-reference-rewrite.ts`、`config-toml-line-scan.ts`、`config-toml-trust.ts`、`codex-home-paths.ts`、`codex-session-bridge.ts`、`codex-session-file-listing.ts` 等一系列 Codex 专属处理（会话桥接、信任配置、废弃 hook feature flag 归一化等）。

Claude 侧对应的是 `hook-settings.ts` 里对 `settings.json` 的读写与托管命令注入。

---

## 五、特殊处理之四：账号 / 用量 / 状态识别

- **账号管理**：`claude-accounts/`、`codex-accounts/`（多账号切换、凭证存储）。
- **用量统计**：`claude-usage/`、`codex-usage/`、`opencode-usage/` + `src/shared/*-usage-types.ts`。
- **认证错误与重启保持**：`src/main/agent-auth-restart-preservation.ts`、`src/shared/codex-auth-errors.ts`。
- **状态识别（不依赖 hook 时的兜底）**：`src/shared/agent-detection.ts` 通过解析终端 **OSC 标题**里的特征符号来判断状态，每个 Agent 的符号不同：
  - Claude Code idle 前缀 `✳`（U+2733）；
  - Gemini：working `✦`、silent-working `⏲`、idle `◇`、permission `✋`；
  - 通用关键词：`ready/idle/done` → idle，`working/thinking/running` → working。
- **标题装饰 / 合成标题**：`agent-title-decoration.ts`、`synthetic-agent-title.ts`、`terminal-title-agent-type.ts` 等，把 Agent 类型体现到 tab 标题上。
- **遥测归一**：`agent-kind.ts` 把每个 TuiAgent 映射到封闭的 telemetry 枚举，未知值兜底为 `other`，保证埋点不因脏数据丢失。

---

## 六、启动参数/环境变量的解析与覆盖

`src/shared/tui-agent-launch-defaults.ts` 提供：
- `resolveTuiAgentLaunchArgs` / `resolveTuiAgentLaunchEnv`：用户没配就用默认（YOLO）值，配了就用用户的。
- `normalizeTuiAgentArgsRecord` / `normalizeTuiAgentEnvRecord`：从持久化设置里安全读取，顺带做不支持参数清洗。

---

## 七、结论

Orca 对 Agent 的"特殊处理"可以概括为一层**统一编排 + 逐 Agent 适配**的架构：

1. **Managed Hooks**：往每个 Agent 配置注入 curl 回调脚本，跨本地/远程/三平台，做状态回传（最核心）。
2. **权限适配**：为 ~25 个 Agent 各自维护 YOLO flag，并清洗不兼容参数。
3. **配置隔离**：以托管目录镜像+合并系统配置（Codex 最典型），不污染用户原配置。
4. **账号/用量/状态**：多账号、用量统计、OSC 标题状态识别、认证保持等按 Agent 定制。

针对 **Claude Code** 的额外特判：Devin 导入 `.claude` 时跳过托管 hook、Windows 用 curl.exe 而非二次 PowerShell、`claude agents` 管理态标题识别正则。
针对 **Cursor**：复用 Claude 兼容的 hook 格式（`cursor/hook-service.ts`）。
针对 **Codex**：独立的 TOML 配置镜像/信任块/会话桥接体系。
