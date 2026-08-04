# Doc-Guard 文档智能守护技术落地方案

> **本方案为完全独立、可直接执行的文档管理落地方案，不依赖任何现有文档体系。**
> 适用于多子项目 monorepo，支持 Java Spring / Vue.js / UniApp 等多种技术栈。

---

## 一、方案目标

### 1.1 核心问题

代码与文档之间存在"盲区窗口"：

```
Agent 改完代码
    │
    │  ← api.md 可能已不一致，此时无任何提示
    │
    ▼
提交 / 人工审查时才发现 → 补改 → 多轮往返
```

此问题在以下场景尤为突出：

- 修改后端 Controller 但忘记更新 api.md
- 新增功能但未写 changelog
- 多项目联动变更时前后端 API 文档不同步
- 多人并发开发时 changelog-pending.md 合并冲突

### 1.2 两大目标与分层设计

本方案采用 **L0（项目自治层）/ L1（团队聚合层）** 两层架构，目标相互独立、可单独使用：

**L0 目标：独立项目文档体系（项目自治层）**

每个项目拥有独立、自描述的文档配置，不依赖顶层集中管理：
- 项目级配置文件声明自身技术栈和文档结构（`.doc-guard.yaml`）
- MCP Server 动态发现项目，无需硬编码
- 支持 Java Spring / Vue.js / UniApp 等多种技术栈
- **单独拉出一个项目时，Agent 仍能完整工作**（不依赖 L1）

**L1 目标：团队并发文档管理（团队聚合层，依赖 L0）**

多人并发开发时文档无冲突、可追踪、可见性高：
- 分支级 changelog pending 目录，天然避免 git merge 冲突
- 团队文档健康状态摘要，Tech Lead 快速了解全局
- Skill 触发词团队标准化，新成员 onboarding 一键配置
- CI 自动检测文档滞后，及时提醒

> **独立使用 L0：** 只需 `.doc-guard.yaml` + MCP Server 核心工具（list_projects / check_api_sync / scan_draft / changelog_status），无需团队协作功能。
> 
> **使用完整 L0+L1：** 额外启用 cross_ref_check / team_doc_status / project_doc_health 工具 + 分支级 pending 机制。

### 1.3 "自动更新"能力层次定义（v5.3 新增，P0）

> 本方案中"自动"一词有明确的层次范围，请勿误解为 L4 级完全自动化。

| 层次 | 能力描述 | 当前状态 | 本方案立场 |
|------|---------|---------|-----------|
| **L1：自动检测偏差** | 代码变更后发现文档不同步（`check_api_sync` / `check_db_sync`） | ✅ 已实现 | 核心能力，保持 |
| **L2：自动提醒 + 引导** | 告知 Agent 需要更新哪些内容（Skill SOP + warning 输出） | ✅ 已实现 | 核心能力，保持 |
| **L3：自动写入文档框架** | 生成文档条目骨架（空白章节 / TODO 占位符，无内容填充，`apply_doc_patch stub_only`） | ⚠️ P1 可选 | 建议启用 `stub_only` 档位 |
| **L4：自动生成文档内容** | Agent1 读真实源码，生成有完整语义的文档内容（接口说明、字段含义、业务描述等） | ✅ Agent1 承担 | **MCP 工具不自动触发**；由 Agent1 在 Skill SOP 引导下执行，有人工审查兜底 |

> **L4 说明：** L4 的本质不是"技术上做不到"，而是"不由 MCP 工具无人监督地自动执行"。Agent1 在每次变更后读代码写文档，本身就是受监督的 L4 实践——你现在的 `overview.md` 和 `database.md` 即是此方式的产物。`doc_cold_start` 工具在初始化阶段为 Agent1 提供结构化任务清单（项目 × 文档类型 × 源文件 glob），使 L4 执行更系统、不遗漏。

**完整闭环 = L1 检测偏差 + L2 引导 Agent1 + L3 写框架（可选）+ L4（Agent1 读代码写内容）。**

### 1.4 设计原则

1. **Skill**：任务涉及接口/数据库/功能变更时，自动加载标准操作流程（SOP），不依赖 Agent 主动记忆
2. **MCP Server**：提供可调用的实时检查工具，在编码阶段即时反馈文档状态，不等到审查阶段
3. 两层均为**软约束**，给 Agent 实时信息辅助决策，不强制阻断任何操作
4. **完全独立**：不依赖外部 CI 系统、不依赖其他文档体系、不依赖远程 API

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                           用户任务                                    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
             ┌───────────────▼───────────────┐
             │      Skill（SOP 引导层）        │  触发词匹配时自动加载
             │      引用 implementer-prompt.md│  单一真相来源
             └───────────────┬───────────────┘
                             │ Agent 遵循 SOP 主动调用
┌────────────────────────────▼───────────────────────────────────────┐
│   MCP Server（工具层）                                               │
│                                                                      │
│  ┌─── L0：项目自治层（每个项目独立可用）───────────────────────────┐ │
│  │  list_projects           动态发现项目（含 scope 参数）           │ │
│  │  check_api_sync          多语言注解/调用 diff（含 --base 参数）  │ │
│  │  scan_draft              [Draft] 标记扫描                        │ │
│  │  changelog_status        分支级 pending 状态（按状态分类输出）   │ │
│  │  claim_pending           三态认领 + 24h 超时释放  (v5.1)        │ │
│  │  project_change_propose  发起变更提案，创建 changes/active/{id}/ (v5.1) │ │
│  │  project_change_list     列出变更清单（active/archived/all）(v5.1) │ │
│  │  project_change_status   查询任务完成率 + ready_for_archive (v5.1) │ │
│  │  project_change_archive  原子归档 + changelog 幂等写入  (v5.1)  │ │
│  │  audit_log               操作审计日志（v5.2）                    │ │
│  │  check_db_sync           Entity/Mapper diff 与 database.md 对比（v5.2）│ │
│  │  check_custom_doc_sync   自定义文档类型触发检测（v5.3）                 │ │
│  │  doc_cold_start          全量文档初始化任务清单（v5.3，冷启动用）       │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─── L1：团队聚合层（依赖 L0，多项目协作使用）──────────────────┐  │
│  │  cross_ref_check         跨项目 API 路径一致性（含 check_schema）│ │
│  │  team_doc_status         团队文档健康摘要 + SOP 合规率           │ │
│  │  project_doc_health      单项目深度分析                          │ │
│  │  project_change_release  pending → changelog.md 版本合并 (v5.1 P2) │ │
│  │  apply_doc_patch         文档写入 append_stubs 模式（v5.2 P2 架构决策）│ │
│  └──────────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬───────────────────────────────────────┘
                             │ 只读（archive 工具写 changelog）
             ┌───────────────▼─────────────────────┐
             │           本地文件系统                │
             │  {project}/                          │
             │    .doc-guard.yaml                   │  项目级配置（JSON Schema 校验）
             │    docs/changelogs/pending/           │  分支级 pending 目录
             │    docs/changes/active/{id}/          │  变更生命周期目录 (v5.1)
             │    .review-requested/                 │  Agent2 触发标记 (v5.1)
             │  git 工作区状态                       │
             └──────────────────────────────────────┘
```

| 层 | 时机 | 性质 | 作用 |
|----|------|------|------|
| Skill | 任务开始，触发词匹配时 | 软约束，自动加载 | 告诉 Agent 该做什么 |
| MCP L0 | Agent 编码过程中主动调用 | 软约束，实时反馈 | 单项目文档状态检查 |
| MCP L1 | Agent 编码过程中主动调用 | 软约束，实时反馈 | 跨项目/团队维度检查 |
| 项目配置 | MCP Server 启动时扫描 | 声明式配置 + Schema 校验 | 告诉 MCP Server 项目结构 |

---

## 三、项目级配置：`.doc-guard.yaml`

### 3.1 核心设计

每个项目根目录放置一个 `.doc-guard.yaml`，声明该项目的文档结构、技术栈和检查规则。MCP Server 启动时动态扫描所有 `.doc-guard.yaml`，不再硬编码项目列表。

**文件位置：**

```
my-server/.doc-guard.yaml
my-web/.doc-guard.yaml
my-app/.doc-guard.yaml
```

### 3.2 配置示例

**my-server/.doc-guard.yaml（Java Spring 后端）：**

```yaml
schema_version: "1.0"              # v5.1 新增（旧配置缺失时输出 WARN）
project: my-server
type: java-spring                  # 决定 check_api_sync 使用哪种注解检测策略
mode: team                         # standalone | team（v5.1 JSON Schema 必填）
team_name: my-team
description: 长护险智慧监管平台后端服务

# v5.2 新增：角色权限配置（mode=team 时生效）
# my_role 从此配置读取，MCP Server 启动时加载，不依赖 MCP 协议层传递
team:
  my_role: agent1-implementer      # 当前 MCP Server 实例角色（不同 Agent 实例部署不同值）
  roles:
    - id: agent1-implementer
      allowed_tools: ["list_projects", "check_api_sync", "scan_draft", "changelog_status",
                      "claim_pending", "project_change_propose", "project_change_list",
                      "project_change_status", "cross_ref_check", "project_doc_health", "audit_log"]
      denied_tools: ["project_change_release"]  # Agent1 不得直接发布版本
    - id: agent2-reviewer
      allowed_tools: ["*"]                       # 验收者全权限
    - id: readonly
      allowed_tools: ["list_projects", "scan_draft", "changelog_status",
                      "project_change_list", "team_doc_status", "project_doc_health"]

# v5.2 新增：Skill 触发词扩展（项目专属触发词，由 setup-skills.sh 合并到 doc-sop.yaml）
skill:
  extra_triggers:
    - "修改 Controller"
    - "修改健康记录接口"
    - "新增 JWT"
    - "修改鉴权"

# Controller 检测规则（java-spring 类型专用）
controller:
  pattern: "src/main/java/**/*Controller.java"
  annotation_regex: "@(GetMapping|PostMapping|PutMapping|DeleteMapping|RequestMapping|PatchMapping)"

# 该项目拥有的文档及其触发条件
docs:
  api:
    path: docs/api.md
    triggers: [controller_change]
    path_extract_regex: "(GET|POST|PUT|DELETE|PATCH)\\s+(/[\\w/{}/:-]+)"
    contract_path: docs/api.contract.yaml   # v5.1 可选：API 契约校验
    auto_write: stub_only                    # v5.3：stub_only（安全默认）| full（需确认）| false（禁用）
  database:
    path: docs/database.md
    triggers: [entity_change, mapper_change, migration_change]
    entity_pattern: "src/main/java/**/entity/*.java"   # v5.2：供 check_db_sync 扫描
    migration_pattern: "src/main/resources/db/migration/*.sql"  # v5.3（P2）：迁移脚本纳入 check_db_sync 检测
  overview:
    path: docs/overview.md
    triggers: [module_add, module_delete]
  changelog:
    path: docs/changelog.md
    format: keepachangelog          # v5.1 可选：keepachangelog | timestamp（默认）
    auto_version: false
    triggers: [any_code_change]
    pending_path: docs/changelogs/pending/   # 分支级目录

# v5.3 新增：trigger 名称 → 文件 glob 映射，供 check_custom_doc_sync 消费
trigger_patterns:
  pages_json_change: "pages.json"
  architecture_change: "src/config/routes/**"
  module_add: "src/modules/*/index.{ts,java}"
  migration_change: "src/main/resources/db/migration/*.sql"

# 文档覆盖率基线（低于此值时 scan 输出 WARN）
coverage_baseline:
  api: 0.80          # Controller 注解数 vs api.md 接口条目数
  database: 0.80     # domain 类 / Mapper XML 数 vs database.md 章节数

# health_score_weights 只在 team 层配置，确保跨项目评分可比（v5.1）
# health_score_weights:
#   api_coverage: 0.3
#   database_coverage: 0.2
#   changelog_compliance: 0.3
#   draft_staleness: 0.1
#   cross_ref_health: 0.1
```

**my-web/.doc-guard.yaml（Vue.js 前端）：**

```yaml
schema_version: "1.0"
project: my-web
type: vue-ts
mode: team
team_name: my-team
description: 长护险智慧监管平台前端

# 前端 API 调用检测（优化后的正则，避免误报）
api_call:
  pattern: "src/api/**/*.ts"
  call_regex: "(http|request|api)\\.(get|post|put|delete|patch)\\("

docs:
  api:
    path: docs/api.md
    triggers: [api_call_change]
    note: "前端调用的后端接口引用文档，与 server/api.md 做 cross-ref"
    path_extract_regex: "(GET|POST|PUT|DELETE|PATCH)\\s+(/[\\w/{}/:-]+)"
  overview:
    path: docs/overview.md
    triggers: [page_add, route_change]
  changelog:
    path: docs/changelog.md
    format: timestamp
    triggers: [any_code_change]
    pending_path: docs/changelogs/pending/
# 注意：前端无 database.md，此字段不声明即视为不存在

coverage_baseline:
  api: 0.70            # 前端 API 调用数 vs api.md 条目数（前端容错更高）
  overview: disabled   # 初期禁用，待格式规范稳定后启用
```

**my-app/.doc-guard.yaml（UniApp 小程序）：**

```yaml
schema_version: "1.0"
project: my-app
type: uniapp
mode: team
team_name: my-team
description: 长护险智慧监管平台移动端

api_call:
  pattern: "**/*.{vue,js,ts}"
  call_regex: "uni\\.request|http\\.(get|post|put|delete)"

# v5.2 新增：项目专属触发词
skill:
  extra_triggers:
    - "修改分包"
    - "新增页面"
    - "pages.json"

docs:
  api:
    path: docs/api.md
    triggers: [api_call_change]
    path_extract_regex: "(GET|POST|PUT|DELETE|PATCH)\\s+(/[\\w/{}/:-]+)"
  overview:
    path: docs/overview.md
    triggers: [page_add, route_change]
  pages:                            # v5.2 修复：自定义文档类型（Schema 已支持 additionalProperties）
    path: docs/pages.md             # 小程序专有：分包页面结构文档
    triggers: [pages_json_change]
    description: "UniApp 分包页面结构与路由映射"
    auto_write: stub_only           # v5.3（P2）：与内置文档类型统一语义
    auto_write_template: |
      ## {filename}

      | 页面路径 | 描述 |
      |---------|------|
      | （待填充） | （待填充） |
  changelog:
    path: docs/changelog.md
    format: timestamp
    triggers: [any_code_change]
    pending_path: docs/changelogs/pending/

coverage_baseline:
  api: 0.70
  overview: disabled
```

### 3.3 配置字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `project` | ✓ | 项目名称，全局唯一，MCP 工具入参使用此值 |
| `type` | ✓ | 技术栈类型，决定 `check_api_sync` 检测策略 |
| `description` | - | 项目描述，用于文档和日志 |
| `controller` | - | java-spring 专用，Controller 文件匹配规则 |
| `api_call` | - | vue-ts / uniapp 专用，API 调用文件匹配规则 |
| `docs.*` | ✓ | 该项目的文档列表，至少包含 `changelog` |
| `docs.*.path` | ✓ | 文档文件相对路径（相对于项目根目录） |
| `docs.*.path_extract_regex` | - | API 路径提取正则，默认值见 3.2 节 |
| `docs.*.pending_path` | - | changelog 专用，分支级 pending 目录路径 |
| `coverage_baseline.*` | - | 覆盖率基线，数值 0-1 或 `disabled` |

### 3.4 配置校验：JSON Schema（v4.1 新增）

**docs/agents/doc-guard.schema.json（提交 git）：**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "DocGuardConfig",
  "type": "object",
  "required": ["project", "type", "docs", "mode"],
  "properties": {
    "schema_version": { "type": "string" },
    "project": { "type": "string", "minLength": 1 },
    "type": {
      "type": "string",
      "description": "技术栈类型。内置值：java-spring / vue-ts / uniapp；自定义类型需同时声明 custom_detector。v5.2：移除 enum 限制，支持任意技术栈。"
    },
    "custom_detector": {
      "type": "object",
      "description": "type 不在内置列表时使用（v5.2 新增）",
      "properties": {
        "source_files": {
          "type": "object",
          "properties": {
            "pattern": { "type": "string" },
            "route_regex": { "type": "string" }
          },
          "required": ["pattern"]
        },
        "doc_sync_check": {
          "type": "string",
          "enum": ["manual", "regex"],
          "description": "manual：不做自动diff，仅警告需人工核对；regex：使用 source_files.route_regex 做基础 diff"
        }
      },
      "required": ["source_files", "doc_sync_check"]
    },
    "mode": {
      "type": "string",
      "enum": ["standalone", "team"]
    },
    "team_name": { "type": "string" },
    "description": { "type": "string" },
    "team": {
      "type": "object",
      "description": "角色权限配置（v5.2 新增，mode=team 时生效）",
      "properties": {
        "my_role": {
          "type": "string",
          "description": "当前 MCP Server 实例的角色 ID，从此配置读取（非 MCP 协议层传递）"
        },
        "roles": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "allowed_tools"],
            "properties": {
              "id": { "type": "string" },
              "allowed_tools": {
                "type": "array",
                "items": { "type": "string" },
                "description": "允许调用的工具列表，\"*\" 表示全权限"
              },
              "denied_tools": {
                "type": "array",
                "items": { "type": "string" },
                "description": "明确禁止调用的工具（优先级高于 allowed_tools）"
              }
            }
          }
        }
      }
    },
    "skill": {
      "type": "object",
      "description": "Skill 触发词扩展（v5.2 新增）",
      "properties": {
        "extra_triggers": {
          "type": "array",
          "items": { "type": "string" },
          "description": "项目专属触发词，由 setup-skills.sh 合并到团队 skill-template.yaml"
        },
        "allow_doc_write": {
          "description": "v5.3：apply_doc_patch 写入权限档位。stub_only（默认安全模式，只追加框架条目）| full（可覆写指定章节，需团队确认）| false（禁用所有写入，旧版默认行为）",
          "oneOf": [
            { "type": "string", "enum": ["stub_only", "full"] },
            { "type": "boolean", "enum": [false] }
          ]
        }
      }
    },
    "controller": {
      "type": "object",
      "properties": {
        "pattern": { "type": "string" },
        "annotation_regex": { "type": "string" }
      },
      "required": ["pattern", "annotation_regex"]
    },
    "api_call": {
      "type": "object",
      "properties": {
        "pattern": { "type": "string" },
        "call_regex": { "type": "string" }
      },
      "required": ["pattern", "call_regex"]
    },
    "docs": {
      "type": "object",
      "required": ["changelog"],
      "properties": {
        "changelog": {
          "type": "object",
          "required": ["path", "pending_path"],
          "properties": {
            "path": { "type": "string" },
            "pending_path": { "type": "string" },
            "triggers": { "type": "array", "items": { "type": "string" } }
          }
        },
        "api": {
          "type": "object",
          "required": ["path"],
          "properties": {
            "path": { "type": "string" },
            "triggers": { "type": "array", "items": { "type": "string" } },
            "path_extract_regex": { "type": "string" },
            "auto_write": {
              "description": "v5.3：stub_only（追加框架条目，默认安全模式）| full（覆写指定章节）| false（禁用）。继承 skill.allow_doc_write 的档位约束，不可超越 skill 层授权。",
              "oneOf": [
                { "type": "string", "enum": ["stub_only", "full"] },
                { "type": "boolean", "enum": [false] }
              ]
            },
            "auto_write_template": { "type": "string" }
          }
        },
        "database": {
          "type": "object",
          "required": ["path"],
          "properties": {
            "path": { "type": "string" },
            "triggers": { "type": "array", "items": { "type": "string" } },
            "entity_pattern": { "type": "string", "description": "v5.2：Entity 文件 glob，用于 check_db_sync" },
            "migration_pattern": { "type": "string", "description": "v5.3（P2）：Flyway/Liquibase 迁移脚本 glob，如 src/main/resources/db/migration/*.sql，check_db_sync 纳入检测" }
          }
        },
        "overview": {
          "type": "object",
          "required": ["path"],
          "properties": {
            "path": { "type": "string" },
            "triggers": { "type": "array", "items": { "type": "string" } }
          }
        }
      },
      "additionalProperties": {
        "type": "object",
        "description": "v5.2：允许任意自定义文档类型（如 pages、specs、adr 等）",
        "required": ["path"],
        "properties": {
          "path": { "type": "string" },
          "triggers": { "type": "array", "items": { "type": "string" } },
          "path_extract_regex": { "type": "string" },
          "description": { "type": "string" },
          "auto_write": {
            "description": "v5.3（P2）：与内置文档类型统一语义。stub_only（追加框架条目）| full（覆写指定章节）| false（禁用，默认）",
            "oneOf": [
              { "type": "string", "enum": ["stub_only", "full"] },
              { "type": "boolean", "enum": [false] }
            ]
          },
          "auto_write_template": { "type": "string", "description": "stub_only 模式使用的 Markdown 模板，支持 {filename} 等占位符" }
        },
        "additionalProperties": false
      }
    },
    "coverage_baseline": {
      "type": "object",
      "additionalProperties": {
        "oneOf": [
          { "type": "number", "minimum": 0, "maximum": 1 },
          { "type": "string", "enum": ["disabled"] }
        ]
      }
    }
  },
  "additionalProperties": false,
  "if": { "properties": { "type": { "const": "java-spring" } } },
  "then": { "required": ["controller"] },
  "else": {
    "if": {
      "properties": { "type": { "enum": ["vue-ts", "uniapp"] } }
    },
    "then": { "required": ["api_call"] }
  }
}
```

**config-loader.ts 中校验逻辑（v5.1：容错启动 + DOCGUARD_ROOT）：**

```typescript
import Ajv from 'ajv';
import schema from '../doc-guard.schema.json';

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

// v5.1：DOCGUARD_ROOT 支持独立 repo 场景
const DOCGUARD_ROOT = process.env.DOCGUARD_ROOT ?? process.cwd();

export function loadAndValidateConfig(filePath: string): DocGuardConfig | null {
  try {
    const raw = yaml.load(fs.readFileSync(filePath, 'utf-8'));
    if (!validate(raw)) {
      const errors = validate.errors!.map(e => `  ${e.instancePath} ${e.message}`).join('\n');
      // v5.1：配置错误改为 WARN + continue，不崩溃
      console.warn(`[WARN] 配置校验失败，跳过 (${filePath}):\n${errors}`);
      return null;
    }
    // v5.1：schema_version 旧配置兼容
    const config = raw as DocGuardConfig;
    if (!config.schema_version) {
      console.warn(`[WARN] ${filePath} 缺少 schema_version，视为 "0.x" 旧配置`);
    }
    return config;
  } catch (e) {
    console.warn(`[WARN] 读取配置失败，跳过 (${filePath}):`, e);
    return null;
  }
}

// MCP Server 启动时：收集所有成功加载的项目配置
export function loadAllProjects(): DocGuardConfig[] {
  const root = DOCGUARD_ROOT;
  const configFiles = glob.sync('**/.doc-guard.yaml', { cwd: root, ignore: ['**/node_modules/**'] });
  return configFiles
    .map(f => loadAndValidateConfig(path.join(root, f)))
    .filter((c): c is DocGuardConfig => c !== null);
}
```

**package.json 需增加依赖：**
```json
"ajv": "^8.12.0"
```

> v5.1 变更：配置错误从 throw 改为 WARN + continue，MCP Server 返回成功加载的项目列表而非崩溃退出。`DOCGUARD_ROOT` 环境变量支持独立 repo 场景（默认 `cwd()`）。`mcp.json` 模板示例中加入 `DOCGUARD_ROOT` 环境变量配置。

---

## 四、Skill 设计

### 4.1 定位

Skill 是 **SOP 动态加载器**，解决的核心问题：

- 不依赖 Agent 主动记住要读哪个文件
- 按任务场景精准加载，不污染无关任务的上下文
- 内容与 `docs/agents/implementer-prompt.md` 保持**单一真相来源**（引用文件路径，不复制内容）

### 4.2 文件位置

```
.codebuddy/
└── skills/
    └── doc-sop.yaml    # 不提交 git，加入 .gitignore
```

### 4.3 Skill 配置（团队标准模板）

**docs/agents/skill-template.yaml（提交 git，供团队共享）：**

```yaml
name: doc-sop
description: >
  文档同步 SOP 引导层。当任务涉及接口变更、数据库变更、新功能开发时自动加载，
  引导 Agent 遵循文档更新规范，并使用 MCP doc-guard 工具进行实时状态检查。

triggers:
  # 接口相关（精确短语，避免宽泛词误触发）
  - "修改接口"
  - "新增接口"
  - "接口变更"
  - "删除接口"
  - "修改 Controller"
  - "新增 Controller"
  - "api.md"
  # 数据库相关（明确上下文）
  - "修改数据库"
  - "新增数据库表"
  - "数据库表结构"
  - "修改表结构"
  - "修改 Entity"
  - "新增 Entity"
  - "修改 Mapper"
  - "新增 Mapper"
  # 功能开发
  - "新增功能"
  - "新增模块"
  - "功能变更"
  - "changelog"
  - "文档更新"
  # Bug 修复：明确场景
  - "接口 Bug"
  - "数据库 Bug"
  - "API Bug"
  
# 避免单独使用：
# ❌ "数据库"（太宽泛，用户询问概念时会误触发）
# ❌ "查询接口"（太宽泛）
# ❌ "Entity"（单词可能出现在无关上下文）
# ✅ 使用"修改 Entity"等明确动作的短语

# instructions_file 在部署时由 setup-skills.sh 填写相对路径
# instructions_file: ../../docs/agents/implementer-prompt.md
```

### 4.4 新成员 Onboarding 脚本

完整初始化链路分三步：

```
1. bash scripts/doc-guard-init.sh   ← 首次初始化：生成 docs/ 骨架 + .doc-guard.yaml
2. bash scripts/setup-all.sh        ← 启动 MCP Server + 注册 Skill
3. 在 CodeBuddy 发送：请执行 doc_cold_start  ← Agent1 读源码填充文档
```

> 场景说明：
> - **同仓库新成员**：docs/ 已在 git 中，直接从第 2 步开始。
> - **新项目接入**：从第 1 步开始，`doc-guard-init.sh` 通过问答生成所有初始文件。

---

#### 完整文件清单（v5.6，v8 §8.4）

克隆仓库后应包含的所有核心文件：

```
mcp-doc-guard/
├── src/
├── templates/                      ← P0-A（v5.5 新增）内嵌模板，解决跨仓库顺序死锁
└── README.md                       ← P0-B（v5.5 新增）快速上手指南

scripts/
├── doc-guard-init.sh               ← 新项目初始化，5步问答（v5.4）
├── setup-all.sh                    ← MCP Server + Skill 注册
└── add-custom-doc.sh               ← 自定义文档类型一站式向导（v5.5 P1-A）

docs/agents/
└── custom-detector-guide.md        ← custom_detector 实现指南（v5.5 P1-E）

.github/workflows/
└── doc-guard-validate.yml          ← Schema 校验 CI（v5.5 P1-C，需 P1-D 完成后启用）

.codebuddy/automations/
└── doc-guard-review-check/
    └── automation.toml             ← Agent2 轮询触发（v5.3 已有）
```

---

**scripts/doc-guard-init.sh（v5.4 新增 — 首次初始化工具）：**

```
bash scripts/doc-guard-init.sh [--force]
```

5步交互流程：

| Step | 内容 |
|------|------|
| 1 | 问答收集：项目名、一句话描述、团队名称 |
| 2 | 自动扫描根目录子项目，识别类型（java-spring / java-gradle / vue-ts / uniapp / go / python / react-ts）**v5.7 扩展**|
| 3 | 逐项目问答：描述、是否含数据库代码 |
| 4 | 确认预览后执行 |
| 5 | 生成 `docs/` 完整骨架 + 各子项目 `.doc-guard.yaml` |

自动生成内容：

- `docs/agents/`（implementer-prompt.md、reviewer-prompt.md、agent-rules.md）
- `docs/templates/`（api-doc.md、changelog-entry.md、feature-doc.md）
- `docs/project/`（overview/api/database/architecture/changelog.md，带 `[Draft]` 占位骨架）
- `docs/README.md`
- 各子项目 `.doc-guard.yaml`（`triggers` 按项目类型预填好）

> **v5.5 模板来源优先级（已修复跨仓库问题）：**
> 1. 优先从 `mcp-doc-guard/templates/`（MCP 包内嵌）读取
> 2. 其次从 `docs/agents/`（同仓库本地）读取
>
> 脚本开头自动检测 `mcp-doc-guard/templates/` 是否存在；不存在则先执行 `cd mcp-doc-guard && npm install`，用户无需手动感知前置步骤：
>
> ```bash
> # doc-guard-init.sh 开头自检逻辑（v5.5）
> TEMPLATE_DIR="$(dirname "$0")/../mcp-doc-guard/templates"
> if [ ! -d "$TEMPLATE_DIR" ]; then
>   echo "[doc-guard-init] 检测到模板目录不存在，正在执行 npm install..."
>   (cd "$(dirname "$0")/../mcp-doc-guard" && npm install --silent)
> fi
> ```

---

**scripts/setup-all.sh（提交 git，P0 优化 - 统一配置）：**

```bash
#!/bin/bash
# 新成员一键配置：Skill + MCP Server
# 使用方式：bash scripts/setup-all.sh
set -e

REPO_ROOT=$(git rev-parse --show-toplevel)

echo "===== 1/3 Setting up Skill ====="
bash "$REPO_ROOT/scripts/setup-skills.sh"

echo "===== 2/3 Building MCP Server ====="
cd "$REPO_ROOT/mcp-doc-guard"
npm install
npm run build

echo "===== 3/3 Configuring MCP ====="
MCP_CONFIG="$REPO_ROOT/.codebuddy/mcp.json"
mkdir -p "$(dirname "$MCP_CONFIG")"
# v5.8（O2）：优先使用 mcp.template.json 模板生成，降低 clone 后手动修复门槛
MCP_TEMPLATE="$REPO_ROOT/.codebuddy/mcp.template.json"
if [ -f "$MCP_TEMPLATE" ]; then
  sed "s|{{REPO_ROOT}}|$REPO_ROOT|g" "$MCP_TEMPLATE" > "$MCP_CONFIG"
  echo "[setup-all] 已从 mcp.template.json 生成 mcp.json"
else
  # fallback：直接写入（保持原行为，兼容无模板的旧仓库）
  # v5.1：写入 DOCGUARD_ROOT 环境变量，确保独立 repo 场景正确扫描
  cat > "$MCP_CONFIG" <<EOF
{
  "mcpServers": {
    "doc-guard": {
      "command": "node",
      "args": ["$REPO_ROOT/mcp-doc-guard/dist/index.js"],
      "env": {
        "DOCGUARD_ROOT": "$REPO_ROOT"
      }
    }
  }
}
EOF
fi

# 同步创建 .review-requested/ 目录（v5.1 Agent2 触发机制）
mkdir -p "$REPO_ROOT/.review-requested"
if ! grep -q '\.review-requested/' "$REPO_ROOT/.gitignore" 2>/dev/null; then
  echo ".review-requested/" >> "$REPO_ROOT/.gitignore"
fi

# v5.3 新增：验证 post-merge hook 是否正确安装（P1：Agent2 触发可靠性）
if [ -f "$REPO_ROOT/.git/hooks/post-merge" ] && [ -x "$REPO_ROOT/.git/hooks/post-merge" ]; then
  echo "✅ post-merge hook 已安装"
else
  echo "⚠️  post-merge hook 未安装，Agent2 自动触发将不可用"
  echo "   手动安装：cp scripts/post-merge.hook .git/hooks/post-merge && chmod +x .git/hooks/post-merge"
fi

echo "✅ Setup complete. Please restart your IDE or CLI."
echo ""
echo "👉 下一步：在 CodeBuddy 中发送以下指令完成文档冷启动："
echo "   请执行 doc_cold_start"
```

**scripts/setup-skills.sh（提交 git，仅配置 Skill，v4.1 增加幂等性）：**

```bash
#!/bin/bash
# 单独配置 Skill（被 setup-all.sh 调用）
# 使用方式：bash scripts/setup-skills.sh

REPO_ROOT=$(git rev-parse --show-toplevel)
SKILL_DIR="$REPO_ROOT/.codebuddy/skills"
TEMPLATE="$REPO_ROOT/docs/agents/skill-template.yaml"
TARGET="$SKILL_DIR/doc-sop.yaml"

mkdir -p "$SKILL_DIR"

# v4.1 优化：hash 检查幂等性，自动更新过期配置
TEMPLATE_HASH=$(sha256sum "$TEMPLATE" | cut -d' ' -f1)
if [ -f "$TARGET" ]; then
  EXISTING_HASH=$(grep "^# template_hash:" "$TARGET" | cut -d' ' -f3)
  if [ "$EXISTING_HASH" = "$TEMPLATE_HASH" ]; then
    echo "Skill 配置已是最新：$TARGET"
    exit 0
  else
    echo "检测到模板更新，重新生成 Skill 配置..."
  fi
fi

# 生成配置并嵌入 hash 用于后续检查
{
  echo "# template_hash: $TEMPLATE_HASH"
  sed "s|# instructions_file:.*|instructions_file: ../../docs/agents/implementer-prompt.md|" "$TEMPLATE"
} > "$TARGET"

echo "已创建/更新 Skill 配置：$TARGET"
```

### 4.5 implementer-prompt.md SOP 规范

**docs/agents/implementer-prompt.md（核心 SOP，Skill 完整加载）：**

```markdown
## 【强制】双 Agent 自动启动规则（v5.3 新增）

当本提示词通过 Skill 被加载时，主 Agent 无需询问用户，**立即自动 spawn 双 Agent**：

1. `task` 工具 spawn `agent1-implementer` → 执行代码变更
2. Agent1 完成 → `send_message` 通知主 Agent
3. 主 Agent → `task` 工具 spawn `agent2-reviewer`（传入 reviewer-prompt.md 规范）
4. Agent2 完成 → `send_message` 反馈审查结论
5. 主 Agent 收到双方消息后统一汇总回复用户

> 适用范围：含代码变更、功能开发、Bug 修复的任务。纯问答/方案讨论不触发。

---

## 实现者 Agent 操作 SOP

### Step 1：任务开始前
调用 `changelog_status()` 扫描全部项目，确认是否有未处理的 pending 文件。

### Step 2：代码变更中

**接口类变更：**
1. 完成代码修改后调用 `check_api_sync({ project: "项目名" })`
2. 若 warning=true，立即更新 docs/api.md

**数据库类变更：**
1. 手动更新 docs/database.md
2. 新增字段用 [Draft] 标记

**功能类变更：**
1. 手动更新 docs/overview.md

**所有有效代码变更（必做）：**
1. 获取分支名和生成文件名：
   ```bash
   BRANCH=$(git rev-parse --abbrev-ref HEAD)
   HASH=$(echo "$BRANCH" | sha256sum | cut -c1-4)
   FILENAME=$(echo "$BRANCH" | tr '/' '-' | cut -c1-45)_${HASH}.md
   ```
2. 写入 `docs/changelogs/pending/$FILENAME`：
   ```markdown
   ---
   branch: <原始分支名>
   author: <Agent名或用户名>
   created: <YYYY-MM-DD>
   project: <项目名>
   change_type: <feature|bugfix|refactor|docs|chore>
   affects_projects: []   # 跨项目联动时填写其他项目名
   ---
   
   - [Draft][YYYY-MM-DD] <变更简述（含接口路径或功能名）>
   ```
3. 若 `affects_projects` 不为空，主动调用 `cross_ref_check()` 验证

### Step 3：代码变更后
1. 调用 `scan_draft({ project: "项目名" })`
2. 若涉及多项目，调用 `cross_ref_check()`
3. 有 warning 时先修复文档

### Step 4：通知 Agent2
说明变更文件、文档更新情况、cross_ref_check 结果。

### 禁止行为
- 不得跳过 changelog pending 更新
- 不得直接移除 [Draft] 标记（由 Agent2 负责）
- 不得在 api.md 中删除现有接口
```

### 4.6 reviewer-prompt.md（Agent2 SOP）

**docs/agents/reviewer-prompt.md（提交 git，Agent2 完整操作规范）：**

```markdown
## 验收者 Agent（Agent2）操作 SOP

> 触发条件：Agent1 完成代码变更后通知；或 git post-merge hook 检测到 pending / .review-requested/ 目录。

---

### 前置检查

1. 确认触发来源（hook 自动触发 / Agent1 send_message / 人工调用）
2. 调用 `project_change_list({ status: 'ready_for_review' })` 获取待审清单
3. 确认无并发审查冲突：调用 `claim_pending()` 认领目标文件（三态锁保证唯一性）

---

### Step 1：代码审查

1. 读取变更文件列表（来自 Agent1 通知或 pending 文件 front matter）
2. 检查代码逻辑正确性、接口变更是否与 front matter `change_type` 一致
3. 检查 `affects_projects` 字段：若不为空，调用 `cross_ref_check()` 验证跨项目 API 一致性
4. 若发现问题，记录在 `tasks.md` 中并反馈 Agent1，流程中止等待修复

---

### Step 2：文档审查与更新

**api.md 检查：**
1. 调用 `check_api_sync({ project: "项目名" })` 验证接口文档同步状态
2. 若 `warning=true`，补充更新 api.md（或要求 Agent1 补充）
3. 移除所有接口文档中的 `[Draft]` 标记，确认内容完整准确

**database.md 检查（涉及数据库变更时）：**
1. 对比代码中的 Entity/Mapper 变更
2. 确认 database.md 新增字段描述完整
3. 移除 `[Draft]` 标记

**overview.md 检查（涉及新功能/模块时）：**
1. 确认功能模块描述已更新
2. 移除 `[Draft]` 标记

**调用 `scan_draft({ project: "项目名" })` 最终确认：**
- 若仍有 `[Draft]`，必须处理后才能继续

---

### Step 3：Changelog 归档

**方式A：直接归档 pending 文件（1-2 个任务的小变更）**

1. 读取 `docs/changelogs/pending/{branch}_hash.md`
2. 移除条目中的 `[Draft]` 标记
3. 将条目追加到 `docs/changelogs/changelog.md`（格式：`### [YYYY-MM-DD] 变更摘要`）
4. 删除 pending 文件
5. 所有操作在同一 commit 中完成

**方式B：通过变更生命周期归档（3+ 任务的复杂变更）**

1. 调用 `project_change_status({ project, id })` 确认 `ready_for_archive: true`
2. 调用 `project_change_archive({ project, id })` 执行原子归档：
   - 自动在 changelog.md 追加 `<!-- change-id: {id} -->` 幂等标记
   - 自动将 `docs/changes/active/{id}/` 移至 `docs/changes/archive/{id}/`
3. 确认归档成功（`archived_to` + `changelog_appended` 均为 true）

---

### Step 4：文档一致性验证

```bash
# 运行 MCP 工具做最终验证
project_doc_health({ project: "项目名", days: 7 })
```

检查项：
- `api_coverage.ratio` 不低于 `coverage_baseline.api`（允许 ±5% 容差）
- `draft_items.count` == 0
- `pending_changelogs.count` == 0（本次变更对应文件已归档）
- `sop_compliance.rate` >= 0.8

---

### Step 5：清理触发标记

1. 删除 `.review-requested/{change-id}.md`（若存在）
2. 确认 `pending` 文件 `status` 已从 `reviewing` 变为已删除

---

### Step 6：反馈结论

向 Agent1 / 主 Agent 反馈审查结论，包含：

```
✅ Agent2 审查完成
- 项目：<project>
- 变更：<change-id or branch>
- 代码审查：通过 / 发现 N 处问题（已列举）
- 文档更新：api.md ✓ / database.md ✓ / overview.md -（不涉及）
- Draft 清理：已清理 N 处
- Changelog 归档：已追加至 changelog.md（方式 A/B）
- 健康评分：82/100
```

---

### 禁止行为

- 不得在代码未审查完成时直接归档 changelog
- 不得跳过 `scan_draft` 最终确认步骤
- 不得修改 Agent1 已写入的业务逻辑代码（文档除外）
- 不得在 changelog.md 中创建重复的 `<!-- change-id: {id} -->` 条目
- 不得在 `.review-requested/` 之外的位置写入审查触发标记
```

---

## 五、MCP Server 实现

### 5.1 技术栈

- Node.js + TypeScript
- MCP SDK: `@modelcontextprotocol/sdk`
- 本地 stdio 进程

### 5.2 目录结构

```
mcp-doc-guard/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts               # MCP Server 入口，注册所有工具
│   ├── types.ts               # 类型定义 + withTimeout
│   ├── config-loader.ts       # DOCGUARD_ROOT + 容错启动 + Ajv 校验
│   └── tools/
│       ├── list-projects.ts       # L0：扫描 .doc-guard.yaml
│       ├── check-api-sync.ts      # L0：多语言 API 检测
│       ├── scan-draft.ts          # L0：[Draft] 标记扫描
│       ├── changelog-status.ts    # L0：分支级 pending 状态
│       ├── claim-pending.ts       # L0：三态认领 + 24h 超时（v5.1）
│       ├── project-change-propose.ts  # L0：发起变更提案（v5.1）
│       ├── project-change-list.ts     # L0：列出变更清单（v5.1）
│       ├── project-change-status.ts   # L0：查询变更进度（v5.1）
│       ├── project-change-archive.ts  # L0：归档变更，原子操作（v5.1）
│       ├── audit-log.ts               # L0：操作审计日志（v5.2）
│       ├── check-db-sync.ts           # L0：数据库变更检测（v5.2）
│       ├── cross-ref-check.ts     # L1：跨项目 API 一致性
│       ├── team-doc-status.ts     # L1：团队健康摘要
│       ├── project-doc-health.ts  # L1：单项目深度分析（v4.1）
│       ├── project-change-release.ts  # L1：pending→版本合并（v5.1 P2）
│       └── apply-doc-patch.ts     # L1：文档写入（v5.2 P2 架构决策）
├── doc-guard.schema.json          # JSON Schema，由 config-loader 加载
└── README.md
```

### 5.3 类型定义（types.ts 核心部分）

```typescript
// v5.1：新增 TIMEOUT 错误码
export interface ToolError {
  error: true;
  code: 'GIT_FAILURE' | 'FILE_NOT_FOUND' | 'PARSE_ERROR' | 'NOT_GIT_REPO' | 'TIMEOUT';
  message: string;
}

// v5.1：工具超时包装（所有工具必须接入，统一 30s）
const TOOL_TIMEOUT_MS = 30_000;

export function withTimeout<T>(promise: Promise<T>, ms = TOOL_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject({ error: true, code: 'TIMEOUT', message: `工具执行超时 (${ms}ms)` }),
        ms
      )
    )
  ]);
}

export interface CheckApiSyncArgs {
  project: string;
  base?: string;  // P1 优化：对比基准，默认 "HEAD"，可指定 "origin/main"
}

export interface ApiSyncResult {
  error?: false;
  warning: boolean;
  changed_annotations: string[];
  api_doc_updated: boolean;
  git_context: { 
    branch: string; 
    head_commit: string;
    base: string;  // 实际使用的对比基准
  };
  detail: string;
}

export interface ChangelogStatusResult {
  error?: false;
  has_pending: boolean;
  pending_files: string[];
  pending_branches: string[];
  pending_count: number;
}

export interface TeamDocStatusResult {
  error?: false;
  projects: ProjectDocStatus[];
  team_summary: {
    total_changes_last_30d: number;       // P2 优化：最近 30 天代码变更数（基于 merge log）
    changelog_coverage: number;            // P2 修正：有 changelog 的变更比率（基于全量 merge，非仅 pending）
    draft_pending_rate: number;            // P2：pending 文件中 [Draft] 比率
    avg_draft_age_days: number;            // P2：[Draft] 平均滞留天数
    cross_ref_warnings: number;            // 跨项目 API 不一致数量
  };
}
```

**team_doc_status 输出示例（P2 优化 + v4.1 修正 + v5.8 O4 L3 引导）：**
```
团队文档健康状态：
- 最近 30 天变更：45 次（基于 git log --merges）
- Changelog 覆盖率：91% (41/45)
  算法：扫描最近 30 天所有 merge commit，检查是否有对应 pending 文件被处理
  修正前：只统计写了 pending 的分支（虚高）
  修正后：统计所有 merge，覆盖未写 pending 的情况
- 未处理 [Draft]：7 处（平均滞留 3.2 天）
- 跨项目 API 不一致：2 处

⚠️  my-server：文档骨架自动写入未启用（allow_doc_write: false）
    启用方式：在 .doc-guard.yaml 的 skill 节点设置 allow_doc_write: stub_only
    效果：API/DB 变更时自动追加文档框架条目，减少遗漏
    建议：运行 2 周后熟悉方案再升级（false → stub_only → full）
```

**合规率计算伪代码（v4.1 修正）：**
```typescript
// 扫描最近 30 天的所有 merge commit
const merges = execSync(
  'git log --merges --since="30 days ago" --format="%H %s"'
).toString().split('\n');

let totalMerges = 0;
let mergesWithChangelog = 0;

for (const merge of merges) {
  const [hash, subject] = merge.split(' ', 2);
  // 检查该 merge commit 是否包含 pending 文件变更或 changelog.md 更新
  const files = execSync(`git diff-tree --no-commit-id --name-only -r ${hash}`)
    .toString().split('\n');
  
  const hasPendingOrChangelog = files.some(f => 
    f.includes('/changelogs/pending/') || f.endsWith('/changelog.md')
  );
  
  totalMerges++;
  if (hasPendingOrChangelog) mergesWithChangelog++;
}

const coverage = totalMerges > 0 ? mergesWithChangelog / totalMerges : 1.0;
```

> **关键修正**：原算法只统计 pending 目录中的文件（分母=有 pending 的分支数），导致"未写 pending 的分支"不进入统计，合规率虚高。v4.1 基于 `git log --merges` 全量统计所有合并事件，真实反映 SOP 执行率。

**v5.1 新增：`commit_based` 合规率统计路径（修复单仓库直推场景盲区）：**

> **问题**：`git log --merges` 仅能捕获 PR/MR 合并提交，在直接 push 到 main 的场景下（hotfix、小修改）漏统计，导致合规率虚低或盲区。
> **解决**：v5.1 新增 `commit_based` 路径，按实际提交粒度统计，与 `merge_based` 路径互为补充。

```typescript
// v5.2 性能优化：改用批量 git log --name-only，一次调用获取全部 commit + 文件列表
// 原实现对每个 commit 执行一次 git diff-tree 子进程，days=30 大型仓库可达 500+ 次调用
// 优化后：1 次 git 调用，性能提升约 10-50×

export function calcCommitBasedCompliance(
  projectRoot: string,
  days = 30
): CommitBasedComplianceResult {
  // 批量获取：--name-only 输出格式为
  //   <hash>|<subject>
  //   <file1>
  //   <file2>
  //   （空行分隔不同 commit）
  const raw = execSync(
    `git -C "${projectRoot}" log --no-merges --since="${days} days ago" --format="%H|%s" --name-only`,
    { encoding: 'utf-8' }
  ).trim();

  // 解析批量输出
  interface CommitRecord { hash: string; subject: string; files: string[] }
  const commits: CommitRecord[] = [];
  let current: CommitRecord | null = null;

  for (const line of raw.split('\n')) {
    if (!line.trim()) {
      // 空行：当前 commit 结束
      if (current) { commits.push(current); current = null; }
      continue;
    }
    if (line.includes('|') && /^[0-9a-f]{40}\|/.test(line)) {
      // 新 commit 行
      if (current) commits.push(current);
      const sepIdx = line.indexOf('|');
      current = { hash: line.slice(0, sepIdx), subject: line.slice(sepIdx + 1), files: [] };
    } else if (current) {
      current.files.push(line.trim());
    }
  }
  if (current) commits.push(current);

  let totalCommits = 0;
  let compliantCommits = 0;
  const nonCompliant: string[] = [];

  for (const commit of commits) {
    // 排除"纯文档提交"和"纯配置提交"（不计入分母）
    const hasCodeChange = commit.files.some(f =>
      !f.endsWith('.md') &&
      !f.endsWith('.gitignore') &&
      !f.endsWith('.yaml') &&
      !f.endsWith('.yml') &&
      !f.startsWith('docs/')
    );
    if (!hasCodeChange) continue;

    totalCommits++;

    // 判断该提交是否同步更新了 changelog
    const hasChangelog = commit.files.some(f =>
      f.includes('/changelogs/pending/') ||
      f.endsWith('/changelog.md') ||
      f.includes('/changes/active/')
    );

    if (hasChangelog) {
      compliantCommits++;
    } else if (nonCompliant.length < 10) {
      nonCompliant.push(commit.subject);
    }
  }

  return {
    path: 'commit_based',
    total_commits: totalCommits,
    compliant_commits: compliantCommits,
    rate: totalCommits > 0 ? compliantCommits / totalCommits : 1.0,
    non_compliant_subjects: nonCompliant,
  };
}
```

**两路统计结合策略（v5.1 `team_doc_status` 实现）：**

```typescript
// project_doc_health / team_doc_status 中同时输出两路结果，
// recommended_rate 取较低值（防止任一路径掩盖问题）
const mergeRate  = calcMergeBasedCompliance(projectRoot, days).rate;
const commitRate = calcCommitBasedCompliance(projectRoot, days).rate;

const sop_compliance = {
  merge_based_rate:  mergeRate,
  commit_based_rate: commitRate,
  recommended_rate:  Math.min(mergeRate, commitRate),  // 取较低值
};
```

**统计路径选择建议：**

| 场景 | 推荐路径 |
|------|---------|
| 标准 PR/MR 流程（feature branch → main） | `merge_based`（主）+ `commit_based`（参考） |
| 直推 main / hotfix 流程 | `commit_based`（主）|
| squash merge / rebase merge | `commit_based`（主，merge commit 无意义）|
| 两者结合（推荐） | `recommended_rate = min(merge_rate, commit_rate)` |

（其他类型定义见完整代码）

### 5.4 工具清单

**L0 工具（项目自治层，每个项目独立可用）：**

| 工具 | 功能 | 备注 |
|------|------|------|
| `list_projects` | 扫描 `.doc-guard.yaml` | 动态发现项目，Schema 校验；v5.1 新增 `scope` 参数 |
| `check_api_sync` | 接口注解/调用 diff | 支持 java-spring/vue-ts/uniapp，含 `--base`；v5.1 新增 `check_schema` |
| `scan_draft` | 扫描 [Draft] 标记 | 单项目或跨项目扫描 |
| `changelog_status` | 分支级 pending 状态 | 返回文件列表和分支名，v5.1 按状态分类输出 |
| `claim_pending` | 认领 pending 文件（v5.1 新增） | 三态 + 24h 超时自动释放（懒释放：任意工具调用入口检查） |
| `project_change_propose` | 发起变更提案（v5.1 新增） | 创建 `docs/changes/active/{id}/` 目录 |
| `project_change_list` | 列出变更清单（v5.1 新增） | 按 active/archived/all 状态筛选 |
| `project_change_status` | 查询变更进度（v5.1 新增） | 返回任务完成率 + ready_for_archive |
| `project_change_archive` | 归档变更（v5.1 新增） | 原子性：先写 changelog 再移目录，幂等 |
| `audit_log` | 操作审计日志（v5.2 新增） | 写入 `docs/.audit-log.jsonl`，记录 caller_id + 工具名 + 参数摘要 |
| `check_db_sync` | 数据库变更检测（v5.2 新增） | 对比 Entity/Mapper diff 与 database.md 覆盖情况 |

**L1 工具（团队聚合层，多项目协作使用）：**

| 工具 | 功能 | 备注 |
|------|------|------|
| `cross_ref_check` | 跨项目 API 路径一致性 | 路径参数归一化；v5.1 新增 `check_schema` 可选参数 |
| `team_doc_status` | 团队文档健康摘要 | 全局可见性 + SOP 合规率；v5.1 `recommended_rate` 取较低值 |
| `project_doc_health` | 单项目深度健康分析（v4.1 新增） | 见下节 |
| `project_change_release` | pending → changelog.md 版本合并（v5.1 新增，P2） | 按版本号聚合 pending 文件 |
| `apply_doc_patch` | 文档写入（**v5.2 新增，P2 架构决策**） | MCP 首次支持文档写入；仅 `append_stubs` 模式（追加框架条目，不覆盖现有内容）；**需团队评审接受"MCP 可写"架构转变后方可启用** |
| `aggregate_docs` | 子项目文档聚合（**v5.5 新增，P2；v5.8 O7：排期提前**） | 从各子项目 `api.md`/`overview.md` 提取摘要，更新顶层 `/docs/project/`；`dry_run` 参数可预览变更；**v5.8 调整**：排期提前至 Phase 2 开始，初期只做只读聚合（摘要提取 + 更新建议输出，不写文件），降低架构风险 |
| `compliance_trend` | 合规率趋势看板（**v5.7 新增规划，P1**） | 读取 `docs/.audit-log.jsonl`，输出最近 30 天合规率趋势（direction: improving/declining + delta_30d）；弥补 `team_doc_status` 只有当前值无趋势方向的缺失；Phase 3 实施 |
| `check_doc_quality` | 文档内容质量自检（**v5.7 新增规划，P1**） | 规则驱动（`quality_rules` 字段配置）：min_sections / has_examples / no_placeholder 三类规则；弥补现有工具只检测"是否需要更新"不检测内容质量的空白；Phase 2 实施 |

### 5.4.1 project_doc_health 工具（v4.1 新增）

**定位：** `team_doc_status` 看全局摘要，`project_doc_health` 看单项目深度分析。

**接口定义：**

```typescript
export interface ProjectDocHealthArgs {
  project: string;  // 项目名
  days?: number;    // 分析时间窗口，默认 30 天
}

export interface ProjectDocHealthResult {
  project: string;
  period_days: number;
  api_coverage: {
    ratio: number;       // 覆盖率（0-1）
    code_count: number;  // 代码侧数量（Controller 注解数 / API 调用数）
    doc_count: number;   // 文档侧数量（api.md 条目数）
    uncovered: string[]; // 代码有但文档没有的接口列表（前 10 条）
  };
  database_coverage?: {
    ratio: number;
    code_count: number;
    doc_count: number;
  };
  draft_items: {
    count: number;
    oldest_age_days: number;
    items: Array<{ file: string; line: string; age_days: number }>;
  };
  pending_changelogs: {
    count: number;
    branches: string[];
  };
  sop_compliance: {
    total_merges: number;
    compliant_merges: number;
    rate: number;         // 合规率（v4.1 修正算法）
    non_compliant: string[];  // 不合规的 merge commit subject
  };
  health_score: number;  // 0-100 综合健康分
}
```

**输出示例：**
```
my-server 项目健康报告（最近 30 天）：

API 覆盖率：75% (30/40)
  Controller 注解：30 个 | api.md 条目：40 个
  未覆盖接口（前5）：GET /api/user/profile, POST /api/health/record...

Database 覆盖率：90% (18/20)

[Draft] 未处理：3 处
  最旧：feature/auth（5天前），在 api.md line 42
  
Pending changelog：2 个分支待处理

SOP 合规率：85% (17/20 次 merge)
  不合规 merge：fix: hot patch login(3天前)...

综合健康分：82/100
```

### 5.4.2 v5.1 新增工具接口定义

**claim_pending（三态状态机 + 超时释放）：**

```typescript
interface ClaimPendingArgs {
  project: string;
  filename: string;
  reviewer_id: string;
}

type ClaimPendingResult =
  | { error: false; claimed: true; message: string }
  | { error: false; claimed: false; message: string; reviewing_since: string }
  | ToolError;

// 实现逻辑：
// 1. reviewing_since == null → 正常认领
// 2. reviewing_since 距今 > 24h → 超时重置后认领
// 3. reviewing_since 距今 < 24h → 返回冲突，claimed: false
```

**v5.2 补充：`releaseTimedOutClaims` 懒释放实现（修复"无调用则永久锁住"问题）：**

> **问题**：若 Agent2 宕机后没有任何工具调用触发，`status: reviewing` 锁会永久卡住，`claim_pending` 无法被新 Agent 认领。
> **解决**：懒释放策略——在 MCP Server `tool dispatcher` 入口，每次任意工具被调用时，先执行一次超时扫描。

```typescript
// src/index.ts（MCP Server 入口，tool dispatcher）
// v5.2：在所有工具分发前插入懒释放检查
async function dispatchTool(name: string, args: unknown, projects: DocGuardConfig[]) {
  // 懒释放：每次工具调用时检查超时认领（开销极低，仅读文件 front matter）
  await releaseTimedOutClaims(projects);
  
  // 正常工具分发
  switch (name) {
    case 'claim_pending': return claimPending(args as ClaimPendingArgs, projects);
    // ... 其他工具
  }
}

// src/tools/claim-pending.ts
const CLAIM_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * 扫描所有项目的 pending 目录，释放超时的 reviewing 认领。
 * 由 tool dispatcher 在每次工具调用前触发（懒释放）。
 */
export async function releaseTimedOutClaims(projects: DocGuardConfig[]): Promise<void> {
  for (const project of projects) {
    const pendingDir = path.join(project._root, project.docs.changelog.pending_path);
    if (!fs.existsSync(pendingDir)) continue;

    const files = fs.readdirSync(pendingDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const filePath = path.join(pendingDir, file);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const meta = parseFrontMatter(raw);

      if (meta.status !== 'reviewing' || !meta.reviewing_since) continue;

      const reviewingSince = new Date(meta.reviewing_since).getTime();
      if (Date.now() - reviewingSince > CLAIM_TIMEOUT_MS) {
        // 超时：重置为 draft，清空 reviewing_since / reviewing_by
        const updated = raw
          .replace(/^status:.*$/m, 'status: draft')
          .replace(/^reviewing_since:.*$/m, 'reviewing_since: null')
          .replace(/^reviewing_by:.*$/m, 'reviewing_by: null');
        fs.writeFileSync(filePath, updated, 'utf-8');
        console.warn(
          `[claim_pending] 超时释放：${project.project}/${file}（locked since ${meta.reviewing_since}）`
        );
      }
    }
  }
}

// claim_pending 工具主函数
export async function claimPending(args: ClaimPendingArgs, projects: DocGuardConfig[]): Promise<ClaimPendingResult> {
  // releaseTimedOutClaims 已在 dispatcher 中执行，此处直接读取状态
  const project = projects.find(p => p.project === args.project);
  if (!project) return { error: true, code: 'FILE_NOT_FOUND', message: `项目 ${args.project} 未找到` };

  const filePath = path.join(project._root, project.docs.changelog.pending_path, args.filename);
  if (!fs.existsSync(filePath)) return { error: true, code: 'FILE_NOT_FOUND', message: `pending 文件 ${args.filename} 未找到` };

  const raw = fs.readFileSync(filePath, 'utf-8');
  const meta = parseFrontMatter(raw);

  if (meta.status === 'reviewing') {
    // 状态仍为 reviewing（未超时）→ 冲突
    return { error: false, claimed: false, message: `文件已被 ${meta.reviewing_by} 认领`, reviewing_since: meta.reviewing_since };
  }

  // 可认领：更新 front matter
  const now = new Date().toISOString();
  const updated = raw
    .replace(/^status:.*$/m, 'status: reviewing')
    .replace(/^reviewing_since:.*$/m, `reviewing_since: ${now}`)
    .replace(/^reviewing_by:.*$/m, `reviewing_by: ${args.reviewer_id}`);
  fs.writeFileSync(filePath, updated, 'utf-8');

  return { error: false, claimed: true, message: `认领成功：${args.filename}，reviewer: ${args.reviewer_id}` };
}
```

**变更生命周期工具（project_change_*）：**

```typescript
// project_change_propose
interface ProposeChangeArgs {
  project: string;
  id: string;                     // 格式: YYYYMMDD-feature-name
  title: string;
  change_type: 'feature' | 'bugfix' | 'refactor';
  affects_projects?: string[];
}
type ProposeChangeResult =
  | { error: false; change_dir: string; created_files: string[]; next_steps: string }
  | ToolError;

// project_change_list
interface ChangeListArgs {
  project: string;
  status?: 'active' | 'archived' | 'all';  // 默认 active
}
type ChangeListResult =
  | { error: false; changes: Array<{ id: string; title: string; completion_rate: number; status: string }> }
  | ToolError;

// project_change_status
interface ChangeStatusArgs {
  project: string;
  id: string;
}
type ChangeStatusResult =
  | {
      error: false;
      change_id: string;
      tasks_total: number;
      tasks_completed: number;
      completion_rate: number;       // 0-1
      pending_tasks: string[];
      has_draft_marks: boolean;
      ready_for_archive: boolean;    // completion_rate >= 1 && !has_draft_marks
    }
  | ToolError;

// project_change_archive（原子操作）
interface ChangeArchiveArgs {
  project: string;
  id: string;
}
type ChangeArchiveResult =
  | { error: false; archived_to: string; changelog_appended: boolean; idempotent: boolean }
  | ToolError;
// idempotent=true：changelog 已有该 change-id 标记，跳过写入直接移目录

// project_change_release（P2，pending → changelog.md 版本合并）
interface ChangeReleaseArgs {
  project: string;
  version: string;               // 格式: vX.Y.Z
}
type ChangeReleaseResult =
  | {
      error: false;
      merged_entries: number;
      version_anchor: string;
      archived_pending_files: string[];  // 移至 changelogs/released/YYYY-MM-DD/
      changelog_path: string;
    }
  | ToolError;
// merged_entries == 0 时：输出 WARNING，不创建空版本块
```

**L0 工具新增参数（v5.1）：**

```typescript
// list_projects - 新增 scope 参数
interface ListProjectsArgs {
  scope?: 'all' | 'current';
}

// cross_ref_check - 新增 check_schema 参数（默认关闭）
interface CrossRefCheckArgs {
  check_schema?: boolean;
}
```

### 5.4.3 变更目录结构（v5.1 新增）

```
{project}/docs/
├── changes/
│   ├── active/
│   │   └── 20260731-user-auth/
│   │       ├── proposal.md      # 必需
│   │       ├── tasks.md         # 必需（Agent2 验收唯一依据）
│   │       ├── design.md        # 可选
│   │       └── specs/           # 可选
│   └── archive/
└── changelogs/
    ├── pending/
    ├── released/                # project_change_release 归档后
    │   └── 2026-07-31/
    └── changelog.md
```

**使用决策树：**

```
本次变更预计任务数？
  1-2 个 → changelogs/pending/（沿用 v4.1 流程）
  3+ 个  → docs/changes/active/{YYYYMMDD-name}/（调用 project_change_propose）
```

**proposal.md 必填字段：**

```markdown
# [功能名] 提案

## 变更元信息
- **ID**: YYYYMMDD-feature-name
- **项目**: <project>
- **类型**: feature | bugfix | refactor
- **创建日期**: YYYY-MM-DD
- **关联分支**: <branch>
- **影响项目**: <空 或 逗号分隔>

## 为什么做（Why）

## 改什么（What）

## 预期影响
```

**tasks.md 必填结构：**

```markdown
# 实现任务清单

> 变更 ID: YYYYMMDD-feature-name
> 开始日期: YYYY-MM-DD

## [模块名]任务
- [ ] 1.1 任务描述

## 文档任务（Agent1 负责）
- [ ] api.md 更新（标记 [Draft]）
- [ ] database.md 更新（如涉及）

## 验收任务（Agent2 负责）
- [ ] 代码审查
- [ ] 移除所有 [Draft] 标记
- [ ] 调用 cross_ref_check()（影响多项目时）
- [ ] 调用 project_change_archive()
- [ ] 追加 changelog pending 文件

---
> 进度：0/N (0%)
```

**changelog 条目格式（v5.1）：**

```markdown
<!-- change-id: 20260731-user-auth -->
### [2026-07-31] feat: 新增 JWT 用户认证机制

- 新增 POST /api/auth/login
- 新增 POST /api/auth/refresh
- 新增 GET /api/auth/verify
- 新增 user_tokens 表
```

`<!-- change-id: {id} -->` 放在条目首行，全文 `includes` 扫描（无位置约束），用于 `project_change_archive` 幂等检查。

### 5.4.4 v5.2 新增工具接口定义

**audit_log（L0，操作审计日志）：**

```typescript
interface AuditLogArgs {
  project: string;          // 操作所属项目名
  action: string;           // 工具名称，如 "project_change_archive"
  caller_id?: string;       // 调用方身份，读自 .doc-guard.yaml team.my_role
  params_summary?: string;  // 参数摘要（非敏感内容，自由文本）
  result?: 'success' | 'failure' | 'skipped';
}

interface AuditLogEntry {
  timestamp: string;        // ISO 8601
  project: string;
  action: string;
  caller_id: string | null;
  params_summary: string | null;
  result: 'success' | 'failure' | 'skipped';
}

type AuditLogResult =
  | { ok: true; written_to: string }           // "docs/.audit-log.jsonl"
  | ToolError;
```

> 写入路径：`{project}/docs/.audit-log.jsonl`，每条操作追加一行 JSON。
> `caller_id` 从 `.doc-guard.yaml` 中的 `team.my_role` 读取；MCP 标准协议层无此字段，不依赖协议注入。

---

**check_db_sync（L0，数据库变更检测）：**

```typescript
interface CheckDbSyncArgs {
  project: string;
  base?: string;             // git diff 基准，默认 "HEAD"
}

interface DbSyncItem {
  entity_file: string;       // 变动的 Entity 或 Mapper 文件路径
  in_database_md: boolean;   // database.md 中是否有对应覆盖
  suggestion?: string;       // 缺失时的建议补全描述
}

interface CheckDbSyncResult {
  project: string;
  changed_entities: number;
  covered: number;
  uncovered: DbSyncItem[];
  coverage_ratio: number;    // 0-1
}

type CheckDbSyncOutput =
  | { ok: true; result: CheckDbSyncResult }
  | ToolError;
```

> 检测逻辑：提取 `git diff {base}` 中变动的 `*Entity.java` / `*Mapper.java` / `*Mapper.xml` 文件，
> 与 `database.md` 内容做关键词对比（表名 / 字段名），输出未覆盖清单。

---

**apply_doc_patch（L1，文档写入 — P2 架构决策，需团队评审）：**

> **架构说明**：本工具打破了 MCP 传统"只读"约束，属于 P2 架构决策，
> **必须经团队评审并在 `.doc-guard.yaml` 中配置 `skill.allow_doc_write` 为 `stub_only` 或 `full` 后方可调用**。
>
> **三档写入权限（v5.3）：**
> - `stub_only`（**默认安全模式**）：只追加框架条目（空白章节 / TODO 占位符），不覆盖任何现有内容；
> - `full`：允许覆写指定章节，须团队明确确认，高风险操作；
> - `false`（旧版默认）：禁用所有写入，调用返回 `NOT_ENABLED`。
>
> 当前 `mode: 'append_stubs'` 与 `stub_only` 档位对应；未来扩展 `mode: 'overwrite_section'` 时需 `full` 档位授权。

```typescript
type PatchMode = 'append_stubs';   // v5.2 仅支持此模式；'replace' 留作未来扩展

interface DocPatch {
  doc_type: 'api' | 'database' | 'overview' | 'architecture' | string;
  section_title: string;           // 要追加到哪个 H2/H3 章节下
  stub_content: string;            // 追加的框架内容（Markdown）
}

interface ApplyDocPatchArgs {
  project: string;
  mode: PatchMode;
  patches: DocPatch[];
  dry_run?: boolean;               // true 时只返回 diff 预览，不写入文件
}

interface PatchApplyResult {
  doc_type: string;
  file_path: string;
  lines_added: number;
  dry_run: boolean;
}

type ApplyDocPatchOutput =
  | { ok: true; applied: PatchApplyResult[] }
  | { ok: false; reason: 'NOT_ENABLED'; message: string }   // allow_doc_write 为 false 或未配置
  | ToolError;
```

> 前置检查：调用前验证 `.doc-guard.yaml` 中 `["stub_only", "full"].includes(skill.allow_doc_write)`，否则返回 `NOT_ENABLED` 错误而非静默跳过。`stub_only` 档位下 `mode` 只允许 `append_stubs`；`full` 档位解锁全部 mode。

---

**check_custom_doc_sync（L0，自定义文档类型触发检测 — v5.3 新增，P1）：**

> 消费 `.doc-guard.yaml` 中的 `trigger_patterns` 字段，对任意自定义文档类型执行 git diff 匹配，补全 `check_api_sync` / `check_db_sync` 未覆盖的检测盲区。

```typescript
interface CheckCustomDocSyncArgs {
  project: string;
  doc_type: string;      // 对应 .doc-guard.yaml 中的自定义文档 key，如 "pages"
  base?: string;         // git diff 基准，默认 "HEAD"
}

interface CheckCustomDocSyncResult {
  doc_type: string;
  trigger_matched: boolean;   // 是否有文件变更命中 trigger_patterns
  changed_files: string[];    // 命中 trigger 的文件列表
  doc_updated: boolean;       // 对应文档文件是否同步更新
  warning: boolean;           // trigger_matched && !doc_updated 时为 true
}

type CheckCustomDocSyncOutput =
  | { ok: true; result: CheckCustomDocSyncResult }
  | { ok: false; reason: 'NO_TRIGGER_PATTERNS'; message: string }  // trigger_patterns 未配置
  | ToolError;
```

> 实现逻辑：读取 `docs.{doc_type}.triggers` 数组，从 `trigger_patterns` 映射到文件 glob，对 `git diff {base} --name-only` 结果做 minimatch 匹配，判断是否命中；再检查 `docs.{doc_type}.path` 文件是否在变更列表中。

---

**doc_cold_start（L0，文档冷启动 — v5.3 新增，P0）：**

> 读取仓库内所有 `.doc-guard.yaml`，自动发现需初始化的项目和文档类型，输出结构化初始化任务清单，供 Agent1 执行全量文档生成。触发词固定为 `"请执行 doc_cold_start"`，不依赖用户记忆项目名和文档类型。

```typescript
interface DocColdStartArgs {
  force?: boolean;  // 默认 false：已存在且非空的文档跳过；true：强制覆写
}

interface ColdStartTask {
  project: string;           // 子项目名，来自 .doc-guard.yaml 所在目录
  doc_type: string;          // api | database | overview | 自定义类型
  doc_path: string;          // 目标文档路径
  status: 'pending'          // 待生成
         | 'skipped'         // 已存在且非空（force=false 时跳过）
         | 'force_overwrite'; // force=true 时覆写
  source_globs: string[];    // Agent1 应读取的源文件 glob（来自 .doc-guard.yaml triggers）
}

interface DocColdStartResult {
  total: number;
  pending: number;
  skipped: number;
  tasks: ColdStartTask[];
}

type DocColdStartOutput =
  | { ok: true; result: DocColdStartResult }
  | { ok: false; reason: 'NO_PROJECTS_FOUND'; message: string }
  | ToolError;
```

> 实现逻辑：递归扫描 `DOCGUARD_ROOT` 下所有 `.doc-guard.yaml`，按 `docs` 节点枚举文档类型；检查对应 `path` 文件是否存在且非空，决定 `status`；返回任务清单由 Agent1 逐项读代码生成文档。Agent1 收到清单后按 `source_globs` 定向读取源码，**无需猜测读哪些文件**。

### 5.5 check_api_sync 多语言支持

**java-spring：**检测 `*Controller.java` 文件中的 `@*Mapping` 注解变动

**vue-ts：**检测 `src/api/**/*.ts` 文件中的 `(http|request|api).(get|post|...)` 调用变动

**uniapp：**检测 `**/*.{vue,js,ts}` 文件中的 `uni.request` 调用变动

**base 参数（P1 优化）：**

默认使用 `git diff HEAD`，适用于 feature branch 开发流。特殊场景可指定对比基准：

```typescript
// 场景1：在 main 分支直接操作
check_api_sync({ project: "my-server", base: "origin/main" })

// 场景2：rebase 后避免误报
check_api_sync({ project: "my-server", base: "main" })

// 默认：feature branch 开发
check_api_sync({ project: "my-server" })  // base = "HEAD"
```

### 5.6 cross_ref_check 路径归一化

```typescript
function normalizePath(p: string): string {
  return p
    .replace(/\{[^}]+\}/g, '{*}')    // {id} → {*}
    .replace(/:[a-zA-Z_]\w*/g, '{*}'); // :id → {*}
}
```

分类结果：
- `warnings`：归一化后仍不匹配，真实缺失
- `probable_matches`：原始不同但归一化后匹配，风格不一致

### 5.7 MCP 配置

**.codebuddy/mcp.json（不提交 git）：**

```json
{
  "mcpServers": {
    "doc-guard": {
      "command": "node",
      "args": ["mcp-doc-guard/dist/index.js"],
      "env": {
        "DOCGUARD_ROOT": "/path/to/your/workspace"
      }
    }
  }
}
```

> v5.1：`DOCGUARD_ROOT` 环境变量支持独立 repo 场景（默认 `cwd()`）。配置错误时 WARN + continue，不崩溃。

---

## 六、分支级 Changelog 管理

### 6.1 目录结构

```
{project}/docs/
├── changes/                          # v5.1 新增：变更生命周期管理
│   ├── active/
│   │   └── 20260731-user-auth/
│   │       ├── proposal.md           # 必需：变更提案
│   │       ├── tasks.md              # 必需：任务清单（Agent2 验收依据）
│   │       ├── design.md             # 可选：技术设计
│   │       └── specs/               # 可选：详细规格
│   └── archive/                      # project_change_archive 后移入
└── changelogs/
    ├── pending/
    │   ├── feat-user-health.md
    │   ├── fix-login-error.md
    │   └── refactor-permission.md
    ├── released/                     # v5.1 新增：project_change_release 归档后
    │   └── 2026-07-31/
    └── changelog.md
```

**目录使用决策树：**

```
本次变更预计任务数？
  1-2 个 → changelogs/pending/（沿用 v4.1 流程）
  3+ 个  → docs/changes/active/{YYYYMMDD-name}/（调用 project_change_propose）
```

### 6.2 分支名转文件名规则（P0+P1 修复）

```bash
# 算法（带 hash 后缀防止截断冲突）
BRANCH=$(git rev-parse --abbrev-ref HEAD)
HASH=$(echo "$BRANCH" | sha256sum | cut -c1-4)
FILENAME=$(echo "$BRANCH" | tr '/' '-' | cut -c1-45)_${HASH}.md

# 示例：
feature/user-health-record 
  → feature-user-health-record_a3f2.md

feature/api/user-management-health-records-query-v1
  → feature-api-user-management-health-records_b7c4.md

feature/api/user-management-health-records-query-v2
  → feature-api-user-management-health-records_e9d1.md
  # hash 后缀确保唯一性
```

**冲突场景修复：**
- 原算法：长分支名截断后可能重复
- 优化算法：截断前 45 字符 + 4 位 hash 后缀 = 唯一性保证

### 6.3 Pending 文件格式（v4.1 扩展 front matter）

**文件名示例：** `feature-user-health-record_a3f2.md`（见 6.2 节规则）

```markdown
---
branch: feature/user-health-record
author: Alice
created: 2026-07-31
status: draft                     # v5.1 新增：draft | ready_for_review | reviewing
reviewing_since: null             # v5.1 新增：Agent2 开始时写入 ISO8601 时间戳；> 24h 自动重置
reviewing_by: null                # v5.1 新增：Agent2 session id
project: my-server          # 所属项目（多项目 monorepo 必填）
change_type: feature               # feature | bugfix | refactor | docs | chore
affects_projects:                  # 本次变更影响的其他项目（跨项目联动时填写）
  - my-web
  - my-app
---

- [Draft][2026-07-31] 新增健康记录查询接口（GET /api/health/records）
- [Draft][2026-07-31] 新增分页参数 page / pageSize
```

**字段说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `branch` | ✓ | 原始分支名（含斜杠） |
| `author` | ✓ | Agent 名或用户名 |
| `created` | ✓ | 创建日期 YYYY-MM-DD |
| `project` | ✓（多项目）| 所属项目名，与 `.doc-guard.yaml` 的 `project` 字段一致 |
| `change_type` | - | 变更类型，用于 team_doc_status 分类统计 |
| `affects_projects` | - | 跨项目联动时填写，触发 cross_ref_check 警告 |

> `affects_projects` 不为空时，Agent1 应主动调用 `cross_ref_check()` 验证跨项目 API 一致性。

### 6.4 存量迁移 SOP（P0 修复）

**一次性人工执行，在实施 Phase 2 前完成：**

```bash
# 1. 创建 pending 目录
mkdir -p */docs/changelogs/pending

# 2. 迁移存量内容
for project in my-team-*; do
  if [ -f "$project/docs/changelog-pending.md" ]; then
    cat > "$project/docs/changelogs/pending/migration-baseline.md" <<EOF
---
branch: main
author: migration
created: $(date +%Y-%m-%d)
---

EOF
    cat "$project/docs/changelog-pending.md" >> \
      "$project/docs/changelogs/pending/migration-baseline.md"
    git rm "$project/docs/changelog-pending.md"
  fi
done

# 3. 提交
git commit -m "docs: 迁移到分支级 pending 目录"
```

### 6.5 Agent2 触发机制（v5.1：路径B主路 + 路径A辅路）

**路径B（主路，git hook 层）：**

```bash
# .git/hooks/post-merge
#!/bin/bash
# v5.1：检测 .review-requested/ 目录（.gitignore 中排除，不被追踪）
REVIEW_DIR=".review-requested"
REVIEW_FILE=$(find "$REVIEW_DIR" -name "*.md" 2>/dev/null | head -1)
if [ -n "$REVIEW_FILE" ]; then
  echo "检测到待审查变更，触发 Agent2..."
  node scripts/notify-agent2.js "$REVIEW_FILE"
fi

# 兼容旧路径：仍检测 pending changelog
PENDING=$(find docs/changelogs/pending -name "*.md" 2>/dev/null | head -1)
if [ -n "$PENDING" ]; then
  echo "检测到 pending changelog，触发 Agent2..."
  kiro-cli agent --task "处理 pending changelog" --agent agent2-reviewer
fi
```

**`.review-requested/` 目录说明（v5.1 新增）：**
- 加入 `.gitignore`，标记文件不被追踪
- Agent1 完成大功能后创建 `.review-requested/{change-id}.md`
- Agent2 处理完成后删除对应标记文件
- `pending status` 设为 `reviewing` 时同步写入 `reviewing_since`

**scripts/notify-agent2.js 完整实现（v5.1 新增）：**

```javascript
#!/usr/bin/env node
/**
 * scripts/notify-agent2.js
 * git post-merge hook 调用：解析 .review-requested/ 标记文件，
 * 通过 kiro-cli 触发 Agent2（验收者）执行审查流程。
 *
 * 用法（由 .git/hooks/post-merge 调用）：
 *   node scripts/notify-agent2.js .review-requested/20260731-user-auth.md
 */

const fs   = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// ──────────────────────────────────────────────
// 1. 解析入参
// ──────────────────────────────────────────────
const reviewFile = process.argv[2];
if (!reviewFile || !fs.existsSync(reviewFile)) {
  console.error('[notify-agent2] 错误：未找到 review 标记文件：', reviewFile);
  process.exit(1);
}

// 标记文件名即变更 ID（去掉 .md 后缀）
const changeId = path.basename(reviewFile, '.md');

// ──────────────────────────────────────────────
// 2. 读取标记文件内容（YAML front matter 可选）
// ──────────────────────────────────────────────
const rawContent = fs.readFileSync(reviewFile, 'utf-8').trim();

// 尝试解析简单 key: value front matter（不引入 js-yaml 依赖）
function parseFrontMatter(content) {
  const meta = {};
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return meta;
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) meta[key.trim()] = rest.join(':').trim();
  }
  return meta;
}

const meta = parseFrontMatter(rawContent);
const project    = meta.project    || '（未指定）';
const changeType = meta.change_type || 'unknown';
const title      = meta.title      || changeId;

// ──────────────────────────────────────────────
// 3. 检查 kiro-cli 是否可用
// ──────────────────────────────────────────────
function commandExists(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────
// 4. 构造 Agent2 任务提示词
// ──────────────────────────────────────────────
const taskPrompt = [
  `[Agent2 验收任务] 变更 ID: ${changeId}`,
  `项目: ${project} | 类型: ${changeType} | 标题: ${title}`,
  '',
  '请按 docs/agents/reviewer-prompt.md 的 SOP 执行以下步骤：',
  '1. 调用 project_change_list({ status: "ready_for_review" }) 确认待审清单',
  `2. 调用 claim_pending({ project: "${project}", filename: "${changeId}", reviewer_id: "agent2" })`,
  '3. 代码审查：检查变更文件，若涉及多项目调用 cross_ref_check()',
  '4. 文档审查：调用 check_api_sync()、scan_draft()，移除所有 [Draft] 标记',
  `5. 归档：调用 project_change_archive({ project: "${project}", id: "${changeId}" })`,
  `6. 清理标记文件：删除 ${reviewFile}`,
  '7. 反馈审查结论（代码/文档/健康评分）',
].join('\n');

// ──────────────────────────────────────────────
// 5. 触发 Agent2
// ──────────────────────────────────────────────
if (commandExists('kiro-cli')) {
  console.log(`[notify-agent2] 触发 Agent2，变更 ID: ${changeId}`);
  const result = spawnSync(
    'kiro-cli',
    ['agent', '--task', taskPrompt, '--agent', 'agent2-reviewer'],
    { stdio: 'inherit', shell: false }
  );
  if (result.status !== 0) {
    console.error('[notify-agent2] kiro-cli 启动失败，退出码:', result.status);
    // 降级：输出任务描述到标准输出，供人工处理
    console.log('\n────── Agent2 待处理任务（请手动执行）──────');
    console.log(taskPrompt);
    console.log('────────────────────────────────────────────\n');
    process.exit(0);  // 不阻断 git hook，仅告警
  }
} else {
  // kiro-cli 不可用时：写入 .agent2-queue.jsonl（v5.8 O8：Phase 0 迁移落地，废弃 .task.txt）
  const queueFile = path.join('.review-requested', '.agent2-queue.jsonl');
  const entry = JSON.stringify({
    changeId,
    project: reviewMeta.project,
    title: reviewMeta.title,
    createdAt: new Date().toISOString(),
    prompt: taskPrompt
  });
  fs.appendFileSync(queueFile, entry + '\n', 'utf-8');
  console.warn(
    `[notify-agent2] kiro-cli 不可用，已将任务追加至 ${queueFile}`,
    '\n请手动执行 Agent2 审查流程，或安装 kiro-cli 后重新运行。'
  );
  // 不 exit(1)，不阻断 git hook
}
```

> **v5.8 O8 迁移说明：** fallback 路径已从 `.task.txt`（一任务一文件）迁移为 `.agent2-queue.jsonl`（单文件 JSONL 追加）。Automation 轮询从"遍历目录"变为"读单文件取第一条未处理记录"，效率更高。已完成任务在处理后通过标记 `processed: true` 字段标注，不删除行（保持 append-only）。老项目升级：删除 `.review-requested/*.task.txt` 文件，`setup-all.sh` 将在下次运行时输出迁移提示。

**标记文件格式（`.review-requested/{change-id}.md`）：**

```markdown
---
project: my-server
change_type: feature
title: 新增 JWT 用户认证机制
created: 2026-07-31T18:30:00+08:00
agent1_session: agent1-implementer
---

变更已完成，请 Agent2 执行验收审查。

涉及文件：
- src/main/java/.../AuthController.java
- docs/api.md（已更新，含 [Draft] 标记）
- docs/changelogs/pending/feature-user-auth_a3f2.md
```

**路径A（辅路，IDE 轮询层）：**

CodeBuddy Automation 定期调用：
```typescript
project_change_list({ status: 'ready_for_review' })
```
发现待审查变更时在 IDE 内提示触发 Agent2。

**路径A Automation 配置示例（v5.3 新增，P1）：**

```toml
# .codebuddy/automations/doc-guard-review-check/automation.toml
name = "doc-guard-review-check"
prompt = "调用 project_change_list({ status: 'ready_for_review' })，若有待审查变更，按 docs/agents/reviewer-prompt.md SOP 执行 Agent2 验收流程。"
rrule = "FREQ=HOURLY;INTERVAL=1"
status = "ACTIVE"
```

> 两路互为冗余，任一路径触发即可。路径B 无需人工干预，路径A 覆盖 hook 失效场景。

**兜底路径：PR 模板检查清单（v4.1 保留，防止 hook 失效）**

创建 `.github/PULL_REQUEST_TEMPLATE.md`：

```markdown
## PR 检查清单

### 文档检查（由 Agent 自动完成，PR 提交前确认）

- [ ] 若有接口变更：已更新 `docs/api.md`
- [ ] 若有数据库变更：已更新 `docs/database.md`
- [ ] 已创建 `docs/changelogs/pending/{branch}_hash.md`（front matter 完整）
- [ ] `affects_projects` 不为空时：已调用 `cross_ref_check()` 并无 warning

### Agent2 验收（合并后执行）

- [ ] 已触发 Agent2 处理 pending changelog（post-merge hook 或手动）
- [ ] main 分支无残留 pending 文件（CI 检查通过）
```

> **两种保障并行，互不替代：**
> - hook 自动触发 → 正常路径，无需人工干预
> - PR 模板检查清单 → hook 失效时的兜底，同时对 PR reviewer 可见

### 6.6 Agent2 合并流程

PR merge 后（由 6.5 节机制触发）：
1. 读取 `pending/{branch-name}_hash.md`
2. 移除 `[Draft]` 标记
3. 追加到 `changelog.md`
4. 删除 pending 文件
5. 同一 commit 完成

### 6.7 CI 检测

```bash
# 检测 main 分支是否残留 pending 文件
PENDING=$(find . -path "*/changelogs/pending/*.md" \
  -not -path "*/node_modules/*")

if [ -n "$PENDING" ]; then
  echo "错误：main 分支发现未处理的 pending changelog"
  echo "文件列表: $PENDING"
  exit 1
fi
```

---

## 七、项目文档规范

### 7.1 文档覆盖率定义

**java-spring：**
- `api`：Controller 注解数 / api.md 接口条目数
- `database`：Entity+Mapper 数 / database.md 章节数

**vue-ts / uniapp：**
- `api`：API 调用函数数 / api.md 条目数
- `overview`：页面文件数 / overview.md 表格行数（可设 `disabled`）

**输出格式（P1 优化）：**
```
api 覆盖率：80% (32 / 40)
- Controller 注解数：32
- api.md 接口条目数：40
- 缺失接口：8

database 覆盖率：85% (17 / 20)
- Entity+Mapper 数：17
- database.md 章节数：20
```

**复杂场景说明：**
- 继承、AOP 等场景可能导致误报，建议设置 `coverage_baseline: disabled`
- 输出原始数值便于判断是否为统计误差

### 7.2 有效代码变更定义

**触发 changelog 更新的变更：**
- 修改业务逻辑代码
- 新增/修改接口
- 数据库 schema 变更
- 新增/删除功能模块

**不触发 changelog 的变更：**
- 仅修改注释或空白字符
- 仅修改 `*.md` 文档
- 仅修改 `.gitignore` 等配置
- 修改测试文件
- 自动生成文件格式化

### 7.3 [Draft] 标记生命周期

- Agent1 创建时写入 `[Draft]`
- Agent2 审查确认后移除
- 必须在同一 PR 内处理完毕
- 可用 `scan_draft` 检测残留

### 7.4 项目自描述性

每个项目的 `docs/README.md` 新增"文档体系说明"节：

```markdown
## 文档体系说明

### 本项目文档列表
- `api.md`：接口文档
- `database.md`：数据库设计（后端专有）
- `overview.md`：功能模块概览
- `changelog.md`：变更记录

### 文档维护规则
- Agent1 负责：代码变更时同步更新文档 + 追加 [Draft] changelog
- Agent2 负责：审查文档一致性 + 移除 [Draft] + 归档

### 团队文档状态
调用 MCP 工具查看全局状态：
\`\`\`
team_doc_status()
\`\`\`
```

### 7.5 changelog 路径规范说明（v5.3 新增，P1）

> **与主 Agent 记忆规则的对齐说明**

当前项目记忆规则（ID: 23005412）要求：每次代码变更后直接追加 `changelog.md`。

本方案的 changelog 写入路径与记忆规则有差异：

| 写入方式 | 路径 | 时机 |
|---------|------|------|
| 记忆规则（旧行为） | 直接追加 `changelog.md` | 代码变更后即时写入 |
| 本方案（新行为） | 先写入 `docs/changelogs/pending/{branch}_hash.md` | Agent1 写，Agent2 验收后归档到 `changelog.md` |

**本方案中 changelog 的 pending → 归档流程替代了直接追加 `changelog.md` 的行为**，目的是引入 Agent2 审查环节，避免未审查内容直接进入主记录。

实际执行时：
- **单 Agent 模式（无 Agent2）**：Agent1 直接写 `changelog.md`，不需要 pending 流程；
- **双 Agent 模式**：Agent1 写 `pending/`，Agent2 归档后进入 `changelog.md`。

记忆规则 ID 23005412 在双 Agent 模式下应理解为"最终写入 changelog.md（通过 pending 流程）"，而非"绕过 pending 直接追加"。

### 7.6 顶层 /docs/project/ 与各子项目 docs/ 的关系（v5.3 新增，P2）

当前项目存在两套文档目录，职责不同：

```
顶层 /docs/project/              ← 主 Agent 维护，面向整体项目概览（手动维护）
  ├── overview.md                  （全项目功能概览）
  ├── api.md                       （整体概览，手动维护）
  └── architecture.md              （系统架构文档）

各子项目 /{project}/docs/        ← MCP Doc-Guard 维护，面向单项目详情
  ├── api.md                       （该子项目接口文档）
  ├── database.md                  （该子项目数据库设计）
  └── changelog.md                 （该子项目变更记录）
```

**关键区别：**
- 顶层 `/docs/project/` 是主 Agent 按记忆规则（ID: 23005412）维护的整体文档，**不被 MCP Doc-Guard 监控**；
- 各子项目 `/{project}/docs/` 是 MCP Doc-Guard 的工作范围，受 `.doc-guard.yaml` 配置约束；
- 顶层 `/docs/project/api.md` 为整体概览（手动维护），不是各子项目 `api.md` 的自动聚合视图。

---

## 八、实施计划

### Phase -1：补全核心实现（P0 优先 - 2-3 天）

**目标：** 确保每个 MCP 工具有可运行的 MVP 实现

**交付物：**
1. `list-projects.ts` - 扫描并解析 `.doc-guard.yaml`（含 JSON Schema 校验）
2. `check-api-sync.ts` - 至少支持 java-spring 检测（含 `--base` 参数）
3. `changelog-status.ts` - 扫描分支级 pending 目录
4. `scan-draft.ts` - [Draft] 标记扫描
5. 基础单元测试
6. **`index.ts` 支持 `--validate-only` CLI 参数（v5.5 新增，P1 CI workflow 前置条件）**：

```typescript
// mcp-doc-guard/src/index.ts 入口
if (process.argv.includes('--validate-only')) {
  // 扫描所有 .doc-guard.yaml，执行 Ajv Schema 校验，输出 pass/warn/error
  // 存在 error 级别时 process.exit(1)，否则 process.exit(0)
  // 不启动 MCP Server，不等待连接
  runValidateOnly().then(ok => process.exit(ok ? 0 : 1));
} else {
  startMcpServer();
}
```

> ⚠️ **CI workflow `.github/workflows/doc-guard-validate.yml` 必须在本条目实现合并后方可启用**，否则 `--validate-only` 参数不存在会导致 CI 流程挂起。

7. **`doc-guard-init.sh` 步骤3 新增交互询问 stub_only（v5.6 新增，与 P0-A 一并交付）**：

在逐项目配置步骤中增加询问，将 `allow_doc_write` 配置门槛从"手动改 YAML"降低为"初始化时选择"，同时保持默认值 `false` 不变（安全默认关闭原则）：

```bash
# doc-guard-init.sh 步骤3 逐项目配置片段
echo "是否启用文档骨架自动写入（stub_only 模式）？可避免遗漏条目 [y/N]"
read -r enable_stub
if [ "$enable_stub" = "y" ] || [ "$enable_stub" = "Y" ]; then
  echo "  skill:" >> "$yaml_path"
  echo "    allow_doc_write: stub_only" >> "$yaml_path"
fi
```

> 说明：默认值 `false` 保持不变，不存在 breaking change。已部署项目升级后行为不受影响。`stub_only` 档位仅追加框架条目，不覆写现有内容，是推荐的最佳实践。

**v5.8 O3：步骤2/3 之间插入识别结果确认交互（防止自动识别错误导致后续检测全部偏差）：**

```bash
# doc-guard-init.sh 步骤2 自动扫描后，步骤3 逐项目配置前 —— 插入确认步骤
echo ""
echo "=== 自动识别结果，请确认（直接回车接受，输入修正值后回车覆盖）==="
for project in "${DETECTED_PROJECTS[@]}"; do
  current_type="${DETECTED_TYPES[$project]}"
  echo -n "  $project: 检测为 ${current_type}  正确类型 [回车接受]: "
  read -r correction
  if [ -n "$correction" ]; then
    DETECTED_TYPES[$project]="$correction"
    echo "  → 已修正为: $correction"
  fi
done
echo ""
echo "=== 识别结果确认完毕，开始逐项目配置 ==="`
```

> 支持技术栈类型：java-spring / java-gradle / vue-ts / uniapp / go / python / react-ts（v5.7 扩展）及任意自定义类型（需同时配置 `custom_detector`）。

8. **`scripts/setup-project.sh` 一键 bootstrap 脚本（v5.7 新增，P0，与 P0-A 一并交付）**：

整合现有 npm install + doc-guard-init.sh + setup-all.sh + --validate-only 校验，他人 clone 后单命令完成所有初始化，消除"手动执行多脚本 + 记忆触发词"的体验障碍：

```bash
#!/bin/bash
# scripts/setup-project.sh - 项目一键初始化（clone 后首次运行）
set -e

echo "=== mcp-doc-guard 项目初始化 ==="

echo "[1/5] 安装 MCP 包..."
npm install

echo "[2/5] 初始化文档系统配置..."
bash "$(dirname "$0")/doc-guard-init.sh"

echo "[3/5] 安装 git hooks 和 Agent Skill..."
bash "$(dirname "$0")/setup-all.sh"

echo "[4/5] 校验 .doc-guard.yaml..."
npx mcp-doc-guard --validate-only

echo "[5/5] 配置完成！"
echo ""
echo "下一步：在 AI Agent 对话框中发送以下指令生成初始文档："
echo "  请执行 doc_cold_start"
echo ""
echo "初始化完成。"
```

9. **`QUICK_START.md`（v5.7 新增，与 Phase -1 一并交付）**：

提供 5 分钟快速体验路径，将 `doc_cold_start` 触发词显式写入流程第4步，消除用户"不知道下一步怎么做"的摩擦点：

```markdown
## Quick Start（5 分钟体验）

1. git clone <this-repo>
2. cd <your-project>
3. bash path/to/setup-project.sh
4. 在 AI Agent 对话框发送：**请执行 doc_cold_start**
5. 完成！查看 docs/ 目录中自动生成的文档

## 适用场景
- 单人项目文档自动化
- 小团队（2-10人）并发开发
- Java Spring / Vue / UniApp / Go / Python / React 混合项目
- 需要 changelog 自动管理的项目

## 系统要求
- Node.js >= 18
- AI Agent（CodeBuddy / Cursor / Claude Code CLI / VS Code+Cline）
- MCP 支持

## IDE 适配（v5.8 新增）

| IDE / Agent | MCP 配置方式 | Skill 等效方式 |
|------------|-------------|--------------|
| CodeBuddy | `setup-all.sh` 自动生成 `.codebuddy/mcp.json` | `.codebuddy/skills/doc-sop.yaml` |
| Cursor | `.cursor/mcp.json`（手动复制 `.codebuddy/mcp.template.json` 并替换 `{{REPO_ROOT}}`） | Cursor Rules（手动引用 `docs/agents/implementer-prompt.md`） |
| Claude Code (CLI) | `--mcp-config` 参数指向 mcp.template.json 替换后的文件 | 无原生 Skill，通过 system prompt 引用 `implementer-prompt.md` |
| VS Code + Cline | 参考 Cline MCP 配置文档，使用 mcp.template.json 模板 | 无原生 Skill |

> 注意：`notify-agent2.js` 硬编码了 `kiro-cli` 命令。非 CodeBuddy 环境下，Agent2 触发将自动 fallback 到 `.agent2-queue.jsonl` 文件等待人工或 Automation 轮询处理。
```

**check-api-sync.ts 参考实现（v4.1 新增伪代码，降低实现不确定性）：**

```typescript
import { execSync } from 'child_process';
import fs from 'fs';

export async function checkApiSync(args: CheckApiSyncArgs): Promise<ApiSyncResult> {
  const { project, base = 'HEAD' } = args;
  
  // 1. 加载项目配置
  const config = loadAndValidateConfig(`${project}/.doc-guard.yaml`);
  
  // 2. 获取 git diff 范围内的文件变更
  const changedFiles = execSync(
    `git diff ${base} --name-only`
  ).toString().split('\n').filter(Boolean);
  
  // 3. 根据技术栈类型筛选相关文件
  let relevantFiles: string[];
  let annotationPattern: RegExp;
  
  if (config.type === 'java-spring') {
    const pattern = config.controller.pattern; // e.g., "**/*Controller.java"
    relevantFiles = changedFiles.filter(f => minimatch(f, pattern));
    annotationPattern = new RegExp(config.controller.annotation_regex);
  } else if (config.type === 'vue-ts') {
    const pattern = config.api_call.pattern; // e.g., "src/api/**/*.ts"
    relevantFiles = changedFiles.filter(f => minimatch(f, pattern));
    annotationPattern = new RegExp(config.api_call.call_regex);
  } else if (config.type === 'uniapp') {
    relevantFiles = changedFiles.filter(f => minimatch(f, config.api_call.pattern));
    annotationPattern = new RegExp(config.api_call.call_regex);
  } else if (config.type === 'java-gradle') {
    // java-gradle 与 java-spring 注解策略相同，只是构建工具不同
    const pattern = config.controller?.pattern ?? '**/*Controller.java';
    relevantFiles = changedFiles.filter(f => minimatch(f, pattern));
    annotationPattern = new RegExp(config.controller?.annotation_regex ?? '@(GetMapping|PostMapping|PutMapping|DeleteMapping|RequestMapping)');
  } else if (config.type === 'go') {
    const pattern = config.api_call?.pattern ?? '**/*.go';
    relevantFiles = changedFiles.filter(f => minimatch(f, pattern));
    annotationPattern = new RegExp(config.api_call?.call_regex ?? '\\.(GET|POST|PUT|DELETE|PATCH)\\(');
  } else if (config.type === 'python') {
    const pattern = config.api_call?.pattern ?? '**/*.py';
    relevantFiles = changedFiles.filter(f => minimatch(f, pattern));
    annotationPattern = new RegExp(config.api_call?.call_regex ?? '@(app|router)\\.(get|post|put|delete|patch)');
  } else if (config.type === 'react-ts') {
    const pattern = config.api_call?.pattern ?? 'src/**/*.{ts,tsx}';
    relevantFiles = changedFiles.filter(f => minimatch(f, pattern));
    annotationPattern = /fetch\(|axios\.(get|post|put|delete|patch)/;
  } else if (config.custom_detector) {
    // 已配置 custom_detector，走插件化检测分支
    return handleCustomDetector(config, changedFiles, base);
  } else {
    // 未知技术栈类型：输出 WARN 而非静默跳过
    return {
      warning: true,
      changed_annotations: [],
      api_doc_updated: false,
      git_context: { branch: getCurrentBranch(), head_commit: getHeadCommit(), base },
      detail: `未知技术栈类型 "${config.type}"，请配置 custom_detector 或使用内置类型（java-spring/java-gradle/vue-ts/uniapp/go/python/react-ts）`
    };
  }
  
  if (relevantFiles.length === 0) {
    return {
      warning: false,
      changed_annotations: [],
      api_doc_updated: false,
      git_context: { branch: getCurrentBranch(), head_commit: getHeadCommit(), base },
      detail: '未检测到接口相关文件变更'
    };
  }
  
  // 4. 提取变更的注解/调用
  const changedAnnotations: string[] = [];
  for (const file of relevantFiles) {
    const diff = execSync(`git diff ${base} -- ${file}`).toString();
    const addedLines = diff.split('\n').filter(line => line.startsWith('+'));
    
    for (const line of addedLines) {
      const match = line.match(annotationPattern);
      if (match) {
        changedAnnotations.push(`${file}: ${match[0]}`);
      }
    }
  }
  
  if (changedAnnotations.length === 0) {
    return {
      warning: false,
      changed_annotations: [],
      api_doc_updated: false,
      git_context: { branch: getCurrentBranch(), head_commit: getHeadCommit(), base },
      detail: '接口文件变更但无注解/调用变更'
    };
  }
  
  // 5. 检查 api.md 是否同步更新
  const apiDocPath = config.docs.api.path;
  const apiDocUpdated = changedFiles.includes(apiDocPath);
  
  return {
    warning: !apiDocUpdated,
    changed_annotations: changedAnnotations,
    api_doc_updated: apiDocUpdated,
    git_context: { branch: getCurrentBranch(), head_commit: getHeadCommit(), base },
    detail: apiDocUpdated 
      ? `检测到 ${changedAnnotations.length} 处接口变更，api.md 已更新` 
      : `检测到 ${changedAnnotations.length} 处接口变更，api.md 未更新`
  };
}
```

**关键实现细节：**
- `base` 参数默认 `HEAD`，支持 `origin/main` 等自定义基准
- 使用 `git diff ${base} --name-only` 获取变更文件
- 使用 `minimatch` 库匹配 glob 模式（`npm i minimatch`）
- 提取 diff 中的新增行（`+` 开头）并匹配注解正则
- 返回结构化结果，由 Agent 决策是否更新文档

**验收标准：**
```bash
cd mcp-doc-guard
npm test  # 单元测试通过
npm run build
node dist/index.js  # MCP Server 可启动
```

**风险提示：** 此阶段缺失会导致 Phase 2-4 停滞，必须优先完成。

---

### Phase -0.5：文档系统初始化（v5.4 新增，新项目专用）

> **仅适用于全新接入场景**（项目尚无 docs/ 目录）。已有 docs/ 的项目直接跳过此步骤。

```bash
bash scripts/doc-guard-init.sh
```

按提示完成 5 步问答，自动生成 `docs/` 骨架和各子项目 `.doc-guard.yaml`。完成后进入 Phase 0。

---

### Phase 0：存量迁移（半天，人工执行）

1. ✓ 为三个项目创建 `.doc-guard.yaml`（见第三节示例；若已由 `doc-guard-init.sh` 生成则跳过）
2. ✓ 执行 changelog-pending.md 迁移脚本（见 6.4 节）
3. ✓ 提交迁移 commit，不涉及 Agent

### Phase 0.5：文档冷启动（v5.3 新增，P0）

**目标：** 在工具链就绪后，由 Agent1 执行一次全量文档初始化，建立后续增量维护的 baseline。

**执行时机：** `setup-all.sh` 执行完成、MCP Server 验证可用之后，日常增量维护开始之前。

**触发方式：手动触发（固定一句话）。** `setup-all.sh` 是 shell 脚本，执行完毕即退出，无法自动唤醒 AI Agent。脚本末尾打印提示，用户在 IDE 中发送固定指令即可，无需记忆项目名和文档类型——这些由 `doc_cold_start` 工具自动从 `.doc-guard.yaml` 读取。

**步骤：**
1. `setup-all.sh` 执行完毕后，终端打印提示语（见脚本末尾）；用户在 CodeBuddy 中发送：
   > "请执行 doc_cold_start"
2. Agent1 调用 `doc_cold_start()` 工具，获取结构化任务清单（每个子项目 × 每种文档类型 × 应读取的源文件 glob）
3. Agent1 按清单逐项读取源码，生成各项目完整初始文档：
   - `docs/api.md`（接口清单，含方法、路径、参数说明）
   - `docs/database.md`（表结构、字段含义、约定说明）
   - `docs/project/overview.md`（功能模块概览、技术栈、启动方式）
   - 以及 `.doc-guard.yaml` 中定义的任意自定义文档类型
2. Agent1 写入 `docs/changelogs/pending/` 初始化 changelog 条目，标注 `[Draft]`
3. Agent2 审查文档完整性、一致性，移除 `[Draft]`，归档 changelog
4. 提交 commit，标注 `docs: 初始化文档 baseline (v0.1.0)`

**验收标准：**
- 所有子项目的 `docs/api.md` 无空章节、无 TODO 占位
- `docs/database.md` 覆盖所有已知表结构
- `docs/project/overview.md` 技术栈版本与实际依赖一致

> **重要说明：** 冷启动完成后，系统进入增量维护模式。此后每次代码变更（通过 AI Agent 参与），Skill SOP 自动加载，Agent1 调用 MCP 工具检测偏差并更新对应文档章节，Agent2 验收归档——形成完整闭环。

---

### Phase 1：Skill 层 + Schema 校验（1-2 小时，v4.1 调整）

1. 创建 `docs/agents/doc-guard.schema.json`（3.4 节 JSON Schema）
2. 创建 `docs/agents/skill-template.yaml`（4.3 节配置）
3. 创建 `docs/agents/implementer-prompt.md`（4.5 节 SOP，含 v4.1 扩展的 front matter）
4. 创建 `scripts/setup-all.sh` 和 `scripts/setup-skills.sh`（4.4 节脚本，含幂等性 hash 检查）
5. 执行 `bash scripts/setup-all.sh` 完成 Skill + MCP + Schema 配置
6. 验证：发起含触发词任务，确认 Skill 自动加载；修改 `.doc-guard.yaml` 触发 Schema 校验报错

### Phase 2-4：MCP Server 迭代交付（按工具优先级分批 - 2-3 天）

**Iteration 1（核心检测 - 优先）：**
1. 实现 `list-projects.ts` + `check-api-sync.ts`（java-spring，含 `--base` 参数）
2. 验证：修改 Controller → 检测生效

**Iteration 2（changelog 管理）：**
1. 实现 `changelog-status.ts`（分支级 pending 支持）
2. 实现 Agent2 触发机制（git hook 或人工调用）
3. 验证：创建 pending 文件 → 状态正确 → Agent2 处理流程

**Iteration 3（团队可见性 - L1 层）：**
1. 实现 `cross-ref-check.ts`（动态项目发现 + 路径归一化）
2. 实现 `team-doc-status.ts`（含 v4.1 修正的 SOP 合规率算法）
3. 实现 `project-doc-health.ts`（v4.1 新增，单项目深度分析）
4. 各项目 `docs/README.md` 新增 Team Dashboard 入口（7.4 节）

**Iteration 4（多语言扩展）：**
1. 扩展 `check-api-sync.ts`（vue-ts + uniapp）
2. 实现 `scan-draft.ts`
3. 验证：前端 API 调用检测 + Draft 扫描

### Phase 5：CI 集成 + Agent2 双重保障（1 小时，v4.1 强化）

1. 创建 `.git/hooks/post-merge`（6.5 节 git hook 自动触发）
2. 创建 `.github/PULL_REQUEST_TEMPLATE.md`（6.5 节 PR 模板兜底）
3. 创建 `.github/workflows/check-doc-status.yml`（6.7 节 pending 检测）
4. **v5.8 O10 新增**：创建 `.github/workflows/doc-health-badge.yml`（文档健康评分 Badge）：
   ```yaml
   - name: Generate doc health score
     run: node mcp-doc-guard/dist/index.js --health-report --output docs/health-badge.json
   - name: Create Badge
     uses: schneegans/dynamic-badges-action@v1.7.0
     with:
       label: Doc Health
       message: ${{ env.HEALTH_SCORE }}/100
       color: ${{ env.BADGE_COLOR }}
   ```
5. 验证：
   - merge PR 触发 hook → Agent2 自动处理
   - hook 失效场景下 PR 模板检查清单可见
   - push to main 时 CI 检测残留 pending 并报错

**v5.8 O9 新增：`.devcontainer/devcontainer.json`（GitHub Codespaces / VS Code Dev Containers 支持）：**

```json
{
  "name": "doc-guard-dev",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:20",
  "postCreateCommand": "bash scripts/setup-project.sh --skip-mcp-interactive",
  "features": {
    "ghcr.io/devcontainers/features/git:1": {}
  }
}
```

> `--skip-mcp-interactive`：setup-project.sh 在 CI/容器环境跳过 doc-guard-init.sh 的交互步骤，仅执行 npm install + build + --validate-only 校验。与 O11（`--non-interactive` 模式）配套使用。

**v5.8 O11 新增：`doc-guard-init.sh --non-interactive` 模式（支持 CI 流水线自动初始化）：**

```bash
bash scripts/doc-guard-init.sh \
  --non-interactive \
  --team-name my-team \
  --projects "my-server:java-spring,my-web:vue-ts,my-app:uniapp"
```

> 跳过所有交互询问（包括 O3 识别确认和 v5.6 stub_only 询问），直接按参数写入 `.doc-guard.yaml`。与 devcontainer `postCreateCommand` 和 GitHub Actions 初始化流水线配套使用。

### Phase 6：联调与优化（按需）

1. 端到端验证：Skill 触发 → Agent1 调用 MCP → Agent2 验收
2. Agent2 触发机制验收（6.5 节）
3. 根据实际使用调整触发词、覆盖率基线
4. 补充 README 和 onboarding 文档

**预计总工期：** 3-4 周（Phase -1 至 Phase 6）

---

## 九、使用限制与边界

**核心前提：本方案适用于"通过 AI Agent 参与代码开发"的工作方式。** 若开发者直接修改代码而不经过 Agent，Skill SOP 不会被触发，文档不会自动更新。增量维护闭环成立的条件是：代码变更由 Agent1 执行或 Agent1 参与审查。

| 限制 | 说明 |
|------|------|
| **适用前提** | 代码变更须通过 AI Agent 参与，直接手动改代码不触发文档更新 |
| Skill 软约束 | Agent 可以不遵循 SOP，无硬阻断 |
| MCP 只读 | 不修改任何文件，由 Agent 决策 |
| git diff 基准 | 默认 `HEAD`，支持 `--base` 参数指定对比基准（P1 优化） |
| 多语言支持 | 当前支持 java-spring / vue-ts / uniapp，其他语言需扩展 |
| 覆盖率精确度 | 依赖文件匹配规则和正则，复杂场景（继承、AOP）可能误报，建议输出原始数值辅助判断 |
| cross_ref_check 边界 | 仅比对路径，不比对 schema（请求/响应字段），后续版本可扩展 |
| Skill 触发词 | 已优化为精确短语（4.3 节），避免宽泛词误触发 |
| 本地工具 | 仅本地开发环境，不接入远程 API |
| 不依赖外部体系 | 完全独立，不依赖其他文档管理方案 |

---

## 十、与现有方案的关系

本方案为**完全独立方案**，可单独使用，也可与以下方案兼容：

| 现有方案 | 兼容关系 |
|---------|---------|
| `git-integrated-doc-system.md` | 可兼容。本方案不干预 CI Job 和软链接聚合，可作为其扩展层 |
| 其他文档规范 | 完全独立，不依赖任何外部文档体系 |

---

## 附录：完整代码清单

### A. package.json

```json
{
  "name": "mcp-doc-guard",
  "version": "5.2.0",
  "description": "独立项目文档智能守护 MCP Server",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "jest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "ajv": "^8.12.0",
    "glob": "^10.3.10",
    "js-yaml": "^4.1.0",
    "minimatch": "^9.0.4"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "@types/minimatch": "^5.1.2",
    "@types/node": "^20.0.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.2",
    "typescript": "^5.4.0"
  }
}
```

### B. tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

### C. .gitignore 补充

```
# Skill 本地配置
.codebuddy/skills/

# MCP Server 构建产物
mcp-doc-guard/dist/
mcp-doc-guard/node_modules/

# MCP 配置（含本地路径）
.codebuddy/mcp.json

# v5.1：Agent2 触发标记目录（本地专用，不追踪）
.review-requested/
```

---

