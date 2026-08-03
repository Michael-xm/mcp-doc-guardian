<p align="center">
  <h1 align="center">mcp-doc-guardian</h1>
  <p align="center">
    <b>为 AI 原生团队打造的文档哨兵。</b><br/>
    通过 MCP 协议，让项目文档始终与代码保持同步。
  </p>
  <p align="center">
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License"/></a>
    <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version"/>
    <img src="https://img.shields.io/badge/protocol-MCP-green.svg" alt="MCP"/>
    <img src="https://img.shields.io/badge/工具数-18-orange.svg" alt="Tools"/>
  </p>
</p>

---

> **它解决什么问题？**
> 你改了代码 → 文档没更新 → AI Agent 基于过时信息工作 → 产生 Bug 和误解。
> mcp-doc-guardian 通过 MCP 持续监控你的代码库，精确告诉 AI 哪里的文档已经跟不上代码了。

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

**第一步 — 构建**

```bash
cd mcp-doc-guardian/mcp-doc-guard
npm install && npm run build
```

**第二步 — 接入 IDE**

在 MCP 配置中添加以下内容（CodeBuddy / Cursor / Claude Desktop 均适用）：

```json
{
  "mcpServers": {
    "doc-guardian": {
      "command": "node",
      "args": ["/绝对路径/mcp-doc-guardian/mcp-doc-guard/dist/index.js"],
      "env": {
        "DOCGUARD_ROOT": "/绝对路径/你的工作区"
      }
    }
  }
}
```

**第三步 — 初始化项目**

```bash
# 为你的项目生成配置文件（选择对应技术栈）
./scripts/setup-project.sh my-server java-spring ../my-server

# 或者一键初始化所有配置
./scripts/setup-all.sh
```

**第四步 — 开始使用**

在 AI 对话框中发送：

```
请执行 doc_cold_start，为这个项目初始化文档。
```

完成。哨兵开始工作了。

---

## 它能做什么

| 场景 | 发生了什么 |
|------|-----------|
| 你新增了 API 接口 | `check_api_sync` 检测漂移，自动在 `api.md` 添加存根 |
| 你修改了数据库实体 | `check_db_sync` 检查 `database.md` 覆盖情况 |
| 你忘记更新 Changelog | `changelog_status` 标记出 pending 条目 |
| 文档中有 `[Draft]` 标记 | `scan_draft` 汇总并提示处理 |
| 你想查看团队文档健康状态 | `team_doc_status` 给出全局仪表盘 |
| 刚接手一个新项目 | `doc_cold_start` 自动生成所有缺失的文档存根 |

---

## 支持的技术栈

`java-spring` · `java-gradle` · `vue-ts` · `uniapp` · `go` · `python` · `react-ts` · `自定义`

---

## 全部 18 个工具

<details>
<summary>L0 — 原子操作工具（点击展开）</summary>

| 工具 | 说明 |
|------|------|
| `list_projects` | 列出所有已注册项目 |
| `check_api_sync` | 检测 Controller ↔ api.md 漂移（基于 git diff）|
| `scan_draft` | 扫描文档中的 `[Draft]` 标记 |
| `changelog_status` | 查询 pending changelog 状态 |
| `claim_pending` | 认领 pending 文档进行 Review（24h 超时自动释放）|
| `audit_log` | 写入工具调用审计日志 |
| `check_db_sync` | 检测 Entity ↔ database.md 漂移 |
| `check_custom_doc_sync` | 检测自定义文档触发文件同步 |
| `doc_cold_start` | 为缺失文档生成初始存根（幂等）|
| `project_change_propose` | 发起变更单 |
| `project_change_list` | 列出所有变更单 |
| `project_change_status` | 查询变更单完成进度 |
| `project_change_archive` | 归档已完成的变更单 |

</details>

<details>
<summary>L1 — 聚合分析工具（点击展开）</summary>

| 工具 | 说明 |
|------|------|
| `cross_ref_check` | 跨项目文档引用验证 |
| `team_doc_status` | 团队文档健康聚合仪表盘 |
| `project_doc_health` | 单项目文档健康评分 + SOP 合规检测 |
| `apply_doc_patch` | 写入文档存根节（需 `allow_doc_write` 开启）|
| `project_change_release` | 发布版本：合并 pending changelog |

</details>

---

## 配置文件

最简 `.doc-guard.yaml`，可直接复制使用：

```yaml
schema_version: "1.0"
project: my-server
type: java-spring          # 可选：vue-ts, go, python, react-ts, uniapp
mode: standalone

docs:
  changelog:
    path: docs/changelogs/CHANGELOG.md
    pending_path: docs/changelogs/pending

  api:
    path: docs/project/api.md
    triggers: ["controller"]
    auto_write: stub_only  # false | stub_only | full

skill:
  allow_doc_write: stub_only
```

→ 完整配置说明：[doc-guard.schema.json](./mcp-doc-guard/doc-guard.schema.json)

---

## 为什么选择 mcp-doc-guardian？

| | 手动维护文档 | Git Hooks | mcp-doc-guardian |
|--|-------------|-----------|-----------------|
| 与 AI Agent 集成 | — | — | ✓ |
| 检测 API 漂移 | — | 部分 | ✓ |
| 多项目支持 | — | — | ✓ |
| 变更生命周期追踪 | — | — | ✓ |
| SOP 合规检测 | — | — | ✓ |
| 零配置冷启动 | — | — | ✓ |

---

## 项目结构

```
mcp-doc-guardian/
├── mcp-doc-guard/        ← MCP Server（需要构建这个）
│   └── src/tools/        ← 18 个工具实现
├── scripts/
│   ├── setup-all.sh      ← 一键初始化
│   ├── setup-project.sh  ← 生成项目配置模板
│   └── doc-guard-init.sh ← 交互式初始化向导
└── docs/agents/          ← AI Agent 提示词模板
```

---

## 校验配置

```bash
# 检验所有 .doc-guard.yaml 是否合法
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
