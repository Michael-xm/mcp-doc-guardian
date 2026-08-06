<p align="center">
  <h1 align="center">mcp-doc-guardian</h1>
  <p align="center">
    <b>基于 Agent 的代码库文档管理系统</b><br/>
    让 AI Agent 持续感知代码变更，自动维护文档与代码的同步状态。
  </p>
  <p align="center">
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License"/></a>
    <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version"/>
    <img src="https://img.shields.io/badge/protocol-MCP-green.svg" alt="MCP"/>
    <img src="https://img.shields.io/badge/工具数-19-orange.svg" alt="Tools"/>

  </p>
</p>

---

## 这是什么

**mcp-doc-guardian 是一个以 Agent 为核心驱动的文档管理系统。**

它不是一个脚本，也不是一个 lint 工具——它通过 MCP 协议，把文档管理能力直接注入到你的 AI Agent（CodeBuddy / Cursor / Claude Code / Trae / Kiro / Windsurf / Cline 等）中，让 Agent 具备：

- 主动感知代码变更，判断文档是否需要更新
- 自动检测接口、数据库、页面等维度的文档漂移
- 按照你的团队规范，生成符合格式的文档内容
- 追踪每一次变更的完整生命周期，从提案到发布

**核心理念：** 你改代码，Agent 看文档，文档永不过时。

---

## 效果演示

```
你：  我刚加了一个新的 API 接口，帮我检查一下文档有没有同步。

AI：  [调用 check_api_sync]
      ⚠ 发现漂移：POST /api/v1/orders 已在代码中，但 api.md 中未记录
      → 已在 docs/project/api.md 中添加存根
      → 已创建待处理 Changelog：docs/changelogs/pending/2026-08-03-orders.md
      ✓ 变更单 #CHG-001 已创建，等待审查。
```

---

## 快速开始

详见 **[QUICK_START.md](./QUICK_START.md)**，5 步完成接入，全程约 5 分钟。

---

## 它能做什么

### 核心能力

| 能力 | 说明 |
|------|------|
| **文档自动注入到 AI 工具（Steering）** | 生成/更新文档时，自动将文档内容写入你已安装的 AI 工具的项目级规则文件（Kiro / Cursor / CodeBuddy / Claude Code / Trae / Cline / Windsurf），让 AI 每次对话自动感知项目背景，无需手动提示 |
| **API 文档同步检测** | 扫描代码里的 Controller / HTTP 调用，与 `api.md` 逐行对比，精确定位哪个接口缺少文档 |
| **数据库文档同步检测** | 扫描 Entity / Mapper / SQL 迁移文件，与 `database.md` 比对，检测新增字段、新增表是否已记录 |
| **草稿标记扫描** | 全库扫描 `[Draft]` / `[TODO]` 等待完成的文档标记，汇总成待处理清单 |
| **Changelog 自动化** | 每次检测到变更时，自动创建 pending changelog 条目；发布时一键合并到主 CHANGELOG |
| **冷启动建档** | 接手新项目时，一条指令扫描全库，自动生成所有缺失的文档骨架（幂等操作，不覆盖已有内容）|
| **文档健康评分** | 按配置的覆盖率基线，输出单项目或全团队的文档健康度百分比 |
| **变更生命周期追踪** | 从变更提案 → 认领 → 完成 → 归档，全程可追溯，支持多 Agent 并发认领防冲突 |
| **跨项目引用校验** | 检测多个项目之间的文档交叉引用是否有效，避免 "引用了但目标文档不存在" 的死链 |
| **自定义文档类型** | 除 API / 数据库外，可以对页面路由、环境变量、部署说明等任意文件变更挂载文档同步检测 |
| **多 Agent 角色隔离** | 在 `team` 模式下，可为不同 Agent 配置不同工具权限，如 "实现者可写文档，审查者只读" |

### 典型场景

| 你做了什么 | Agent 自动做什么 |
|-----------|----------------|
| 新增了一个 REST 接口 | 检测到 Controller 新增，在 `api.md` 添加存根，创建 pending changelog |
| 新建了一个数据库表 | 检测到 Entity 新增，在 `database.md` 补充表结构描述存根 |
| 修改了 `.env` 配置项 | 触发自定义文档节点，提醒更新 `docs/env.md` |
| 接手了一个从未有文档的老项目 | `doc_cold_start` 扫描全库，生成完整的文档目录骨架 |
| 准备发版 | `project_change_release` 合并所有 pending changelog，生成版本记录 |
| 想知道团队文档整体状态 | `team_doc_status` 输出每个项目的健康评分和未处理事项数 |

---

## 全部 19 个工具

> 这些工具由 Agent 按需调用，你通常只需要用自然语言描述需求即可。

<details>
<summary>L0 — 原子操作工具（点击展开）</summary>

| 工具 | 调用时机 | 说明 |
|------|---------|------|
| `list_projects` | 查看注册了哪些项目 | 列出所有已注册项目及其技术栈 |
| `check_api_sync` | 检查 API 文档是否同步 | 基于 git diff 对比 Controller / HTTP 调用与 `api.md`，输出漂移清单 |
| `check_db_sync` | 检查数据库文档是否同步 | 对比 Entity / Mapper 与 `database.md`，检测新增字段或表 |
| `check_custom_doc_sync` | 检查自定义文档是否同步 | 按 `trigger_patterns` 配置，检测任意文件变更触发的文档同步 |
| `scan_draft` | 整理文档待办 | 扫描全库文档中的 `[Draft]` / `[TODO]` 标记，汇总输出 |
| `changelog_status` | 查看待处理 changelog | 列出所有 pending 条目及其状态、创建时间 |
| `claim_pending` | 认领文档任务 | 认领一个 pending 文档进行处理（24h 超时自动释放，防多 Agent 重复处理）|
| `audit_log` | 写审计记录 | 将工具调用记录写入审计日志，供合规追溯 |
| `doc_cold_start` | 初始化/接手新项目 | 扫描项目代码，生成所有缺失的文档骨架（幂等，已存在的不覆盖）|
| `project_change_propose` | 发起变更提案 | 创建变更单，记录变更内容、影响范围、关联文档 |
| `project_change_list` | 查看变更进度 | 列出所有变更单及当前状态 |
| `project_change_status` | 查询单个变更单 | 获取指定变更单的详细信息和完成度 |
| `project_change_archive` | 归档已完成变更 | 将完成的变更单移入历史存档 |

</details>

<details>
<summary>L1 — 聚合分析工具（点击展开）</summary>

| 工具 | 调用时机 | 说明 |
|------|---------|------|
| `cross_ref_check` | 发版前 / 多项目联调时 | 校验跨项目文档引用的有效性，发现死链 |
| `team_doc_status` | 团队周会 / 项目管理 | 汇总所有项目的文档健康评分、pending 数、草稿数 |
| `project_doc_health` | 单项目质量检查 | 输出文档覆盖率评分 + SOP 合规检测结果 |
| `apply_doc_patch` | Agent 写文档时 | 向指定文档节点写入存根内容（需 `allow_doc_write` 开启）|
| `project_change_release` | 发版时 | 合并所有 pending changelog 到主 CHANGELOG，生成版本记录 |
| `sync_steering` | 手动刷新自定义指令 | 将指定文档内容写入指定 AI 工具的规则文件；支持 `cli` / `doc_types` 多选过滤，以及 `dry_run` 预览模式 |

</details>

---

## 常用命令速查

> 在 AI 对话框中直接发送，Agent 会自动选择调用哪个工具。

### 日常开发

| 场景 | 发给 AI 的内容 |
|------|--------------|
| 我刚改了接口，检查 API 文档 | `请检查 my-server 的 API 文档是否同步` |
| 我改了数据库，检查 DB 文档 | `请检查 my-server 的数据库文档是否同步` |
| 检查所有项目的文档状态 | `请查看团队文档状态` |
| 查看有哪些未完成的草稿 | `请扫描文档中的草稿标记` |
| 查看 pending changelog | `请查看 my-server 的 pending changelog 状态` |

### 发版流程

| 场景 | 发给 AI 的内容 |
|------|--------------|
| 准备发版，合并 changelog | `请为 my-server 执行版本发布，版本号 v1.2.0` |
| 发版前检查跨项目引用 | `请执行跨项目文档引用校验` |
| 查看单项目文档健康度评分 | `请检查 my-server 的文档健康度` |

### 项目管理

| 场景 | 发给 AI 的内容 |
|------|--------------|
| 接手新项目，初始化文档 | `请执行 doc_cold_start` |
| 发起一个变更提案 | `请为 my-server 发起变更提案，标题：新增订单接口` |
| 查看所有变更单进度 | `请列出 my-server 的所有变更单` |
| 归档已完成的变更 | `请归档 my-server 的变更单 CHG-001` |
| 刷新所有工具的自定义指令 | `sync steering` |
| 认领一个 pending 文档任务 | `请认领 my-server 的 pending 文档任务` |

---

## 各 CLI 自定义指令更新机制与注意事项

doc-guardian 会在生成/更新文档时，自动调用 `syncAllClis` 写入各 AI 工具的规则文件。不同工具的更新机制不同，使用前请了解以下注意事项：

### 写入方式对比

| AI 工具 | 规则文件路径 | 写入方式 | 文档更新后是否需要重新 sync |
|--------|------------|---------|--------------------------|
| **Kiro** | `.kiro/steering/<doc>.md` | 内联副本（含 frontmatter） | **需要**手动 `sync steering` |
| **Cursor** | `.cursor/rules/<doc>.mdc` | 内联副本（含 frontmatter） | **需要**手动 `sync steering` |
| **CodeBuddy** | `.codebuddy/rules/<doc>.md` | 软链接 → 源文档 | **不需要**，自动生效 |
| **Claude Code** | `CLAUDE.md`（项目根）| 追加 `@引用` 块 | **不需要**，Claude 每次读取最新源文件 |
| **Trae** | `.trae/rules/project_rules.md` | 追加引用路径行 | **部分**，Trae 1.x 支持有限，大文件有截断风险；若不生效可改用 `strategy: inline` |
| **Cline** | `.clinerules` | 追加引用路径行 | **不需要**（默认）；若注入后不生效，可改用 `strategy: inline` |
| **Windsurf** | `.windsurfrules` | 追加引用路径行 | **不需要**（默认）；若注入后不生效，可改用 `strategy: inline` |

### Kiro / Cursor：内联副本模式

- **原理**：将源文档内容 + YAML frontmatter 合并写入 wrapper 文件，AI 工具读取 wrapper 而非源文档
- **注意事项**：
  - 每次执行 `apply_doc_patch` 或 `doc_cold_start` 时会自动刷新
  - 手动编辑了源文档后需主动发送 `sync steering` 来刷新 wrapper
  - 文件头部有 `<!-- generated at <time>, source-hash: <hash> -->` 注释，用于标识是 doc-guardian 生成的，不要手动删除
  - 若文件已存在且不含上述注释（即用户手动创建的），doc-guardian 默认跳过，不会覆盖（需加 `force: true` 才会覆盖）
  - Kiro 的 `globs` 和 `inclusion: fileMatch` 字段会写入 frontmatter，控制该规则文件在哪些文件上生效
- **兼容度**：Kiro steering 机制需 Kiro 0.2+ 版本，旧版本不读取 `.kiro/steering/` 目录

### CodeBuddy：软链接模式

- **原理**：在 `.codebuddy/rules/` 目录创建指向源文档的软链接，CodeBuddy 读取软链接时自动跟随到源文档
- **注意事项**：
  - Windows 系统若无软链接权限（EPERM），自动降级为内联副本
  - 软链接只创建一次，源文档的任何修改均实时反映，无需再次 sync
- **兼容度**：需要 CodeBuddy 支持项目规则文件（`.codebuddy/rules/`）的版本

### Claude Code：`@引用` 模式

- **原理**：在项目根 `CLAUDE.md` 的 marker 块中追加 `@<doc_path>` 语法，Claude 会主动读取引用文件
- **注意事项**：
  - 如果项目根目录没有 `CLAUDE.md`，doc-guardian 会自动创建
  - 使用 `<!-- doc-guardian:<docType> -->` 作为 marker，重复执行幂等（不重复追加）
  - 引用语法是 Claude Code CLI 特有的，不适用于 Claude 网页版
- **兼容度**：需要 Claude Code CLI（`claude` 命令）在 PATH 中可被检测到，或项目根已有 `CLAUDE.md`

### Trae / Cline / Windsurf：追加引用行模式

- **原理**：向规则文件末尾追加 `# doc-guardian:<docType>: @<path>` 引用行，幂等操作，重复执行不会重复追加
- **注意事项**：
  - **Trae 1.x**：对 `@<path>` 引用支持有限，大文件有截断风险；若注入后不生效，改用 `custom_cli` + `strategy: inline`
  - **Cline / Windsurf**：若注入后 AI 未感知文档内容，说明该版本不跟随 `@path` 引用；降级方案：在 `custom_cli` 中配置 `strategy: inline`，源文档更新后手动发送 `sync steering` 重新注入
- **Cline 的检测方式**：检测 `~/.vscode/extensions/saoudrizwan.claude-dev*` 目录是否存在（基于 VSCode 扩展）
- **Trae 的检测方式**：检测 `~/.trae` 目录或 `trae` 命令是否存在

### 全局 `inclusion` 与 `globs` 注意事项

`inclusion` 和 `globs` 字段**仅对 Kiro / Cursor（内联 wrapper 类）有效**，控制 wrapper 文件的加载时机（始终 / 匹配文件时）。对 append 类工具（Trae / Cline / Windsurf / Claude Code），这两个字段被忽略，规则文件始终随 AI 对话加载。

### 自定义不支持的工具

若你使用的工具不在内置列表中，可通过 `.doc-guard.yaml` 的 `custom_cli` 字段手动扩展，支持三种策略（详见 [yaml 配置指南](./docs/doc-guard-yaml-guide.md)）：

| 策略 | 适用场景 |
|------|---------|
| `append` | 单一规则文件，支持 `@引用` 语法 |
| `symlink` | 目录型规则，工具跟随软链接 |
| `inline` | 不支持引用语法，需完整内容注入（需手动 sync）|

---

每个业务项目根目录下放一个 `.doc-guard.yaml`，告诉 Agent 这个项目的结构和文档路径。

### 开启 Steering 注入（可选）

在 `.doc-guard.yaml` 中添加顶层 `steering:` 块，让文档更新时自动写入你已安装的 AI 工具规则文件：

```yaml
steering:
  enabled: true
  cli:                   # 留空则自动检测本机已安装的工具
    - kiro
    - cursor
    - codebuddy

docs:
  overview:
    path: docs/overview.md
    steering:
      inject: true       # 必须显式设为 true，默认不注入
      inclusion: always  # always | fileMatch（仅 Kiro / Cursor 有效）
  api:
    path: docs/api.md
    steering:
      inject: true
      inclusion: fileMatch
      globs: ["src/**/*.ts"]   # 仅 Kiro / Cursor 有效
  changelog:
    path: docs/changelogs/CHANGELOG.md
    pending_path: docs/changelogs/pending
    steering:
      inject: false      # 默认值，可省略
```

配置好后，执行 `doc_cold_start` 或 `apply_doc_patch` 时会**自动触发**注入；也可随时发送 `sync steering` 手动刷新。各工具的写入路径和策略详见["各 CLI 自定义指令更新机制与注意事项"](#各-cli-自定义指令更新机制与注意事项)章节。

> **注意**：`inject` 字段默认为 `false`，只有显式设为 `true` 的文档才会被注入，防止不必要的文档污染 AI 上下文。

### 最简配置（直接可用）

```yaml
schema_version: "1.0"
project: my-server
type: java-spring        # 见下方支持的技术栈列表
mode: standalone

docs:
  changelog:
    path: docs/changelogs/CHANGELOG.md
    pending_path: docs/changelogs/pending

  api:
    path: docs/project/api.md
    triggers: ["src/main/java/**/*Controller.java"]
    auto_write: stub_only    # false | stub_only | full

skill:
  allow_doc_write: stub_only
```

### 支持的内置技术栈

| 值 | 适用项目 |
|----|---------|
| `java-spring` | Spring Boot / Spring MVC |
| `java-gradle` | 使用 Gradle 构建的 Java 项目 |
| `vue-ts` | Vue 2/3 + TypeScript |
| `react-ts` | React + TypeScript |
| `uniapp` | uni-app 小程序 / H5 |
| `go` | Go 语言项目 |
| `python` | Flask / FastAPI / Django 等 |

### 自定义技术栈

项目不在上面列表里？用 `custom` 类型配合 `custom_detector` 告诉 Agent 怎么扫描你的代码：

```yaml
type: custom-nest               # 名称随意起，见名知意即可
custom_detector:
  source_files:
    pattern: "src/**/*.controller.ts"              # 扫描哪些文件
    route_regex: '@(Get|Post|Put|Delete|Patch)\([\'"](.*?)[\'"]\)'  # 用正则提取路由
  doc_sync_check: regex         # regex：自动 diff；manual：仅提示人工核对
```

**另一个例子 —— NestJS 项目：**

```yaml
type: custom-nestjs
custom_detector:
  source_files:
    pattern: "src/**/*.controller.ts"
    route_regex: '@(Get|Post|Put|Delete|Patch)\([''"]?(.*?)[''"]?\)'
  doc_sync_check: regex
```

**另一个例子 —— PHP Laravel 项目：**

```yaml
type: custom-laravel
custom_detector:
  source_files:
    pattern: "app/Http/Controllers/**/*.php"
    route_regex: 'Route::(get|post|put|delete|patch)\([\'"](.*?)[\'"]\)'
  doc_sync_check: regex
```

> 完整配置字段说明见 [docs/doc-guard-yaml-guide.md](./docs/doc-guard-yaml-guide.md)

---

## 为什么选择 mcp-doc-guardian？

| | 手动维护文档 | Git Hooks | mcp-doc-guardian |
|--|-------------|-----------|-----------------|
| 与 AI Agent 深度集成 | — | — | ✓ |
| 检测 API / DB 漂移 | — | 部分 | ✓ |
| 多项目支持 | — | — | ✓ |
| 变更生命周期追踪 | — | — | ✓ |
| SOP 合规检测 | — | — | ✓ |
| 零配置冷启动 | — | — | ✓ |
| 自定义文档类型 | — | — | ✓ |
| 多 Agent 协作 | — | — | ✓ |

---

## 项目结构

```
mcp-doc-guardian/
├── mcp-doc-guard/        ← MCP Server（需要构建）
│   └── src/tools/        ← 18 个工具实现
├── scripts/
│   ├── setup-all.sh      ← 一键构建 + 生成 IDE 配置（第一件事运行这个）
│   ├── doc-guard-init.sh ← 交互式向导，为业务项目生成 .doc-guard.yaml
│   └── setup-project.sh  ← 单个项目配置生成（批量场景使用）
└── docs/
    ├── doc-guard-yaml-guide.md  ← 配置文件完整说明
    └── agents/                  ← AI Agent 提示词模板
```

---

## 校验配置

```bash
# 检查所有 .doc-guard.yaml 格式是否合法
DOCGUARD_ROOT=/path/to/workspace node dist/index.js --validate-only
```

---

## 参与贡献

```bash
git clone https://github.com/Michael-xm/mcp-doc-guardian
cd mcp-doc-guardian
npm install
npm run build
npm test
```

欢迎提 PR。较大改动请先开 Issue 讨论。

---

## License

MIT · 为 AI 原生团队而建

[English →](./README.md)
