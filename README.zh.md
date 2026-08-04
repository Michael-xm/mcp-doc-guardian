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
    <img src="https://img.shields.io/badge/工具数-18-orange.svg" alt="Tools"/>
  </p>
</p>

---

## 这是什么

**mcp-doc-guardian 是一个以 Agent 为核心驱动的文档管理系统。**

它不是一个脚本，也不是一个 lint 工具——它通过 MCP 协议，把文档管理能力直接注入到你的 AI Agent（CodeBuddy / Cursor / Claude Code 等）中，让 Agent 具备：

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

## 全部 18 个工具

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
| 认领一个 pending 文档任务 | `请认领 my-server 的 pending 文档任务` |

---

## 配置文件

每个业务项目根目录下放一个 `.doc-guard.yaml`，告诉 Agent 这个项目的结构和文档路径。

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
