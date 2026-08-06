# .doc-guard.yaml 配置完全指南

> 本文件由 `doc-guard-init.sh` 自动生成，生成后可按需手动调整。

---

## 一份真实配置长什么样

以下是一个 Vue + TypeScript 前端项目的完整配置，后文会逐段解释每个字段：

```yaml
schema_version: "1.0"
project: my-web
type: vue-ts
mode: standalone
description: "前台 H5 + PC 管理后台"

api_call:
  pattern: "src/**/*.{ts,vue,js}"
  call_regex: '(http|request|api)\.(get|post|put|delete|patch)\('

trigger_patterns:
  api-files: "src/api/**/*.ts"
  vue-components: "src/components/**/*.vue"

docs:
  changelog:
    path: docs/changelogs/CHANGELOG.md
    pending_path: docs/changelogs/pending
    format: keepachangelog
  api:
    path: docs/api.md
    triggers:
      - api-files
    auto_write: stub_only
  overview:
    path: docs/overview.md
    triggers:
      - vue-components
  pages:
    path: docs/pages.md
    triggers:
      - "src/router/**/*.ts"
    description: "记录所有页面路由和权限配置"

coverage_baseline:
  api: 0.8
  database: 0.9
  changelog: 1.0

team:
  my_role: agent1-implementer

skill:
  allow_doc_write: stub_only
  changelog_format: "- [{status}][{date}] {description}"
  extra_triggers:
    - "检查前端接口"
    - "前端文档同步"
```

---

## 顶层字段

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `schema_version` | 否 | string | 配置文件版本，目前填 `"1.0"` |
| `project` | **是** | string | 项目名称，全局唯一，与目录名保持一致 |
| `type` | **是** | string | 技术栈，见下方支持列表 |
| `mode` | **是** | string | `standalone`（单机）或 `team`（多 Agent 协作）|
| `team_name` | 否 | string | `mode: team` 时，当前实例所属的团队名 |
| `description` | 否 | string | 项目描述，供 AI 理解项目用途 |

### `type` 支持的内置值

| 值 | 适用场景 |
|----|---------|
| `java-spring` | Spring Boot / Spring MVC |
| `java-gradle` | 使用 Gradle 构建的 Java 项目 |
| `vue-ts` | Vue 2/3 + TypeScript |
| `react-ts` | React + TypeScript |
| `uniapp` | uni-app 小程序 / H5 |
| `go` | Go 语言项目 |
| `python` | Flask / FastAPI / Django 等 |

不在列表里的技术栈，使用 `custom_detector` 自定义（见下文）。

---

## `controller`（Java 项目必填）

Java 后端项目需要配置此节点，告诉 Agent 去哪些文件里扫描路由注解。

```yaml
controller:
  pattern: "src/main/java/**/*Controller.java"   # 扫描哪些文件（glob）
  annotation_regex: '@(GetMapping|PostMapping|PutMapping|DeleteMapping|RequestMapping|PatchMapping)'
  # 匹配路由注解的正则
```

`type: java-spring` 时此节点**必填**，其他 Java 变体同理。

---

## `api_call`（前端 / 非 Java 项目必填）

告诉 Agent 在哪些文件里找 HTTP 请求调用，以便检测 API 文档是否同步。

```yaml
api_call:
  pattern: "src/**/*.{ts,vue,js}"   # 要扫描的文件范围（glob）
  call_regex: '(http|request|api)\.(get|post|put|delete|patch)\('
  # 匹配 HTTP 调用的正则，按你的请求封装方式调整
```

`type: vue-ts` / `uniapp` 时此节点**必填**。

**常见调整场景：**

直接使用 `axios`：
```yaml
api_call:
  pattern: "src/**/*.{ts,js}"
  call_regex: 'axios\.(get|post|put|delete|patch)\('
```

自封装的 `service.xxx()`：
```yaml
api_call:
  pattern: "src/**/*.ts"
  call_regex: 'service\.(get|post|put|delete|patch)\('
```

---

## `custom_detector`（自定义技术栈必填）

当你的项目技术栈不在内置列表时，使用 `custom_detector` 告诉 Agent 如何扫描你的代码。

```yaml
type: custom-nest           # 名字随意起，用于日志和展示
custom_detector:
  source_files:
    pattern: "src/**/*.controller.ts"                          # 扫描哪些文件（必填）
    route_regex: '@(Get|Post|Put|Delete|Patch)\([\'"](.*?)[\'"]\)'  # 提取路由的正则（可选）
  doc_sync_check: regex     # regex | manual（必填，见下方说明）
```

**`doc_sync_check` 两种模式：**

| 值 | 行为 |
|----|------|
| `regex` | Agent 使用 `route_regex` 对代码和文档做自动 diff，精确报告哪条路由缺少文档 |
| `manual` | Agent 不做自动 diff，只提示"此类文件变更了，请人工核对文档" |

建议：能写出准确 `route_regex` 的用 `regex`，无法用正则提取路由的用 `manual`。

**示例 — PHP Laravel：**

```yaml
type: custom-laravel
custom_detector:
  source_files:
    pattern: "app/Http/Controllers/**/*.php"
    route_regex: 'Route::(get|post|put|delete|patch)\([\'"](.*?)[\'"]\)'
  doc_sync_check: regex
```

**示例 — Ruby on Rails：**

```yaml
type: custom-rails
custom_detector:
  source_files:
    pattern: "app/controllers/**/*_controller.rb"
  doc_sync_check: manual    # Rails 路由在 routes.rb 里，不适合用正则提取，人工核对即可
```

**示例 — FastAPI（Python）：**

```yaml
type: custom-fastapi
custom_detector:
  source_files:
    pattern: "app/routers/**/*.py"
    route_regex: '@(router|app)\.(get|post|put|delete|patch)\([\'"](.*?)[\'"]\)'
  doc_sync_check: regex
```

---

## `docs`（必填）

配置各类文档的路径和触发条件。`changelog` 是唯一必须声明的子节点，其余按需配置。

---

### `docs.changelog`（必填）

```yaml
docs:
  changelog:
    path: docs/changelogs/CHANGELOG.md       # 主 changelog 文件路径（必填）
    pending_path: docs/changelogs/pending    # 待处理 changelog 存放目录（必填）
    format: keepachangelog                   # keepachangelog | timestamp（可选）
    auto_version: false                      # 是否自动推导版本号（可选，默认 false）
```

**`format` 两种格式：**

`keepachangelog`（推荐）— 符合 [Keep a Changelog](https://keepachangelog.com) 规范：
```markdown
## [Unreleased]
### Added
- POST /api/v1/orders 新增订单接口
```

`timestamp` — 每条记录带时间戳：
```markdown
- [2026-08-03] 新增 POST /api/v1/orders
```

---

### `docs.api`（推荐配置）

```yaml
docs:
  api:
    path: docs/api.md                  # API 文档路径（必填）
    triggers:                          # 这些文件变更时，AI 提示检查 API 文档
      - "src/api/**/*.ts"
    auto_write: stub_only              # false | stub_only | full（可选）
    auto_write_template: docs/agents/api-prompt.md  # 自定义写作提示词模板路径（可选）
    path_extract_regex: ""             # 从代码中提取接口路径的正则（可选，高级用法）
    contract_path: ""                  # API 合约文件路径，如 openapi.yaml（可选）
    note: ""                           # 给 AI 的额外备注（可选）
```

**`auto_write` 三档含义：**

| 值 | 行为 |
|----|------|
| `false` | AI 只检测漂移，不自动写文档，仅告诉你需要手动更新 |
| `stub_only` | AI 只追加新的存根条目，不修改已有内容（**推荐，适合大多数团队**）|
| `full` | AI 可完整改写文档，适合已有 Review 机制的团队 |

**`auto_write_template` — 自定义写作模板**

控制 AI 以什么格式生成文档内容。不配置时使用内置模板。

内置模板位置（直接可用，无需配置）：

| 文档类型 | 内置模板路径 |
|---------|------------|
| `api` | `mcp-doc-guardian/docs/agents/api-prompt.md` |
| `database` | `mcp-doc-guardian/docs/agents/database-prompt.md` |
| `overview` | `mcp-doc-guardian/docs/agents/overview-prompt.md` |
| 自定义类型 | `mcp-doc-guardian/docs/agents/pages-prompt.md` |

如需自定义格式，复制内置模板到任意路径修改，然后用此字段指向它：

```yaml
auto_write_template: ./.doc-guard-prompts/api.md   # 相对于项目自身目录
# 或
auto_write_template: mcp-doc-guardian/docs/agents/api-prompt.md  # 相对于 DOCGUARD_ROOT
# 或
auto_write_template: /absolute/path/to/my-prompt.md              # 绝对路径
```

---

### `docs.database`（Java 项目推荐）

```yaml
docs:
  database:
    path: docs/database.md               # 数据库文档路径（必填）
    triggers:
      - "**/*Entity.java"
      - "**/*Mapper.java"
      - "**/*Mapper.xml"
    entity_pattern: "src/main/java/**/*Entity.java"      # 更精确的实体扫描范围（可选）
    migration_pattern: "src/main/resources/db/**/*.sql"  # SQL 迁移脚本路径（可选）
```

---

### `docs.overview`（可选）

```yaml
docs:
  overview:
    path: docs/overview.md
    triggers:
      - "src/**/*.vue"
      - "src/**/*.tsx"
```

---

### 自定义文档类型（可选）

除内置的 `api` / `database` / `overview` 外，可以添加任意自定义文档节点，节点名即文档类型名：

```yaml
docs:
  # 自定义：页面路由文档
  pages:
    path: docs/pages.md
    triggers:
      - "src/router/**/*.ts"
    description: "记录所有页面路由和权限配置"   # 给 AI 的说明
    auto_write: stub_only

  # 自定义：环境变量说明
  env:
    path: docs/env.md
    triggers:
      - ".env*"
      - "vite.config.ts"
    description: "记录所有环境变量及其默认值"

  # 自定义：部署说明
  deploy:
    path: docs/deploy.md
    triggers:
      - "Dockerfile"
      - "docker-compose*.yml"
      - ".github/workflows/**/*.yml"
```

自定义节点支持的字段与 `docs.api` 相同：`path`、`triggers`、`description`、`auto_write`、`auto_write_template`、`path_extract_regex`。

---

## `trigger_patterns`（可选）

当多个文档节点使用相同的 glob 时，可以定义别名复用，避免重复书写：

```yaml
trigger_patterns:
  vue-components: "src/components/**/*.vue"
  api-files: "src/api/**/*.ts"

docs:
  api:
    path: docs/api.md
    triggers:
      - api-files            # 引用别名，等价于 "src/api/**/*.ts"
  overview:
    path: docs/overview.md
    triggers:
      - vue-components       # 引用别名
```

---

## `coverage_baseline`（可选）

用于 `project_doc_health` 工具的健康度评分。各文档类型的覆盖率目标（0~1 之间，或 `"disabled"` 禁用该项评分）：

```yaml
coverage_baseline:
  api: 0.8          # API 文档覆盖率目标 80%
  database: 0.9     # 数据库文档覆盖率目标 90%
  overview: 0.5     # 概览文档覆盖率目标 50%
  changelog: 1.0    # changelog 覆盖率目标 100%
  pages: "disabled" # 该项不计入健康度评分
```

---

## `team`（可选）

单人使用时不需要配置。多 Agent 协作时，用 `team` 节点控制各角色的工具权限。

```yaml
team:
  my_role: agent1-implementer   # 当前 MCP Server 实例的角色 ID

  roles:
    - id: agent1-implementer
      allowed_tools: ["*"]      # 所有工具权限

    - id: agent2-reviewer
      allowed_tools:
        - scan_draft
        - project_doc_health
        - team_doc_status
        - changelog_status
      denied_tools:
        - apply_doc_patch       # 明确禁止写文档（优先级高于 allowed_tools）

    - id: agent3-readonly
      allowed_tools:
        - list_projects
        - team_doc_status
        - project_doc_health
```

**`denied_tools` 优先级高于 `allowed_tools`**：即使 `allowed_tools` 里有 `"*"`，`denied_tools` 里列出的工具仍会被拒绝。

---

## `skill`（可选）

```yaml
skill:
  allow_doc_write: stub_only    # 全局写入权限兜底值（见下方说明）
  changelog_format: "- [{status}][{date}] {description}"  # changelog 条目格式模板
  extra_triggers:               # 项目专属触发词，AI 识别到这些词时自动执行文档检查
    - "检查前端接口"
    - "前端文档同步"
    - "check frontend api"
```

**`allow_doc_write` 和 `docs.*.auto_write` 的区别：**

- `docs.api.auto_write`：针对**单个文档节点**的写入控制
- `skill.allow_doc_write`：**全局兜底值**，当某文档节点没有声明 `auto_write` 时使用此值

优先级：`docs.节点.auto_write` > `skill.allow_doc_write`

---

## `steering`（可选）

控制文档自动注入到 AI 工具的行为。开启后，每次执行 `apply_doc_patch` 或 `doc_cold_start` 时，doc-guardian 会自动将指定文档写入已检测到的 AI 工具规则文件中。

```yaml
steering:
  enabled: true                  # 是否开启 Steering（默认 false）
  doc_types:                     # 要注入的文档类型（对应 docs.* 的节点名）
    - overview
    - database
    # - api                      # 内容较长，按需开启
  clis:                          # 要注入的 AI 工具（不填则注入所有检测到的工具）
    - kiro
    - cursor
    - codebuddy
    - claude-code
    - trae
    - cline
    - windsurf
  inclusion: always              # always（始终加载）或 fileMatch（仅匹配文件时加载，仅 Kiro / Cursor 有效）
  globs: []                      # inclusion: fileMatch 时生效的文件 glob 列表
  force: false                   # true：覆盖用户手动创建的同名文件（默认 false）
  custom_cli:                    # 扩展不在内置列表中的 AI 工具
    - id: my-tool
      name: "My Custom IDE"
      detect:                    # 检测该工具是否已安装的条件（满足任意一项即视为已安装）
        bin: my-tool             # 可执行文件名（在 PATH 中搜索）
        dir: "~/.my-tool"        # 目录是否存在
        env: MY_TOOL_HOME        # 环境变量是否存在
      strategy: append           # append | symlink | inline
      target: ".my-tool/rules/project.md"   # 规则文件路径（相对于项目根目录）
```

### `steering.enabled`

| 值 | 行为 |
|----|------|
| `true` | 每次生成/更新文档时，自动调用 `syncAllClis`，写入规则文件 |
| `false`（默认）| 不自动写入，仅在手动发送 `sync steering` 时执行 |

### `steering.doc_types`

指定哪些文档节点会被注入到 AI 工具的规则文件中。必须是 `docs.*` 下已声明的节点名。

- 不填：默认注入所有 `docs.*` 下的节点
- 推荐组合：`[overview, database]`（内容精简，适合始终加载）
- `api` 文档通常较长，建议仅在项目接口稳定后按需加入

### `steering.clis`

指定要注入哪些 AI 工具。可用值：`kiro` / `cursor` / `codebuddy` / `claude-code` / `trae` / `cline` / `windsurf`。

- 不填：注入所有**检测到已安装**的工具
- 指定时：只注入列表内的工具（即使未检测到也会尝试写入）

### `steering.inclusion` 和 `steering.globs`

**仅对 Kiro / Cursor（内联 wrapper 类）有效**，控制 wrapper 文件何时被 AI 加载：

| `inclusion` 值 | 行为 |
|---------------|------|
| `always`（默认）| 对话开始时始终加载该规则文件 |
| `fileMatch` | 只有当当前对话中打开的文件匹配 `globs` 时才加载 |

`fileMatch` 示例（只在编辑 Java 文件时加载数据库文档）：

```yaml
steering:
  enabled: true
  doc_types: [database]
  inclusion: fileMatch
  globs:
    - "**/*.java"
    - "**/*Mapper.xml"
```

对其他工具（Trae / Cline / Windsurf / Claude Code），`inclusion` 和 `globs` 字段被忽略，规则文件始终随会话加载。

### `steering.custom_cli`

扩展自定义 AI 工具。每个条目包含：

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 工具标识符，全局唯一 |
| `name` | 否 | 显示名称（用于日志输出）|
| `detect.bin` | 否 | 在 `$PATH` 中搜索的可执行文件名 |
| `detect.dir` | 否 | 检测目录是否存在（支持 `~` 展开）|
| `detect.env` | 否 | 检测环境变量是否设置 |
| `strategy` | 是 | `append` / `symlink` / `inline` |
| `target` | 是 | 规则文件路径（相对于**每个业务项目**根目录）|

`strategy` 三种写入策略详解：

| 策略 | 行为 | 何时需要重新 sync |
|------|------|----------------|
| `append` | 在 `target` 文件末尾追加引用行（幂等）| 不需要，工具读取时跟随源文件 |
| `symlink` | 在 `target` 目录下创建软链接（若 `target` 是目录则在目录内创建）| 不需要，软链接自动跟随 |
| `inline` | 将源文档完整内容写入 `target`（含 doc-guardian header）| 需要，源文档更新后手动发送 `sync steering` |

> **Trae / Cline / Windsurf 降级说明**：若注入后 AI 工具未能感知文档内容，说明该工具版本不跟随 `@path` 引用。此时可在 `custom_cli` 中为该工具配置 `strategy: inline`（内联副本），源文档更新后手动发送 `sync steering` 即可重新注入。

---

### 初始化向导与 steering 配置

运行 `bash scripts/doc-guard-init.sh` 时，向导会根据你的选择自动将以下字段写入每个项目的 `.doc-guard.yaml`：

| 向导操作 | 写入的字段 |
|---------|-----------|
| 选择开启 Steering | `steering.enabled: true` |
| 选择文档类型 overview | `docs.overview.steering.inject: true` |
| 不选择某个文档类型 | `docs.<type>.steering.inject: false` |
| 检测到已安装的工具 | `steering.cli: [仅检测到的工具]` |
| 选择 "n"（不开启）| `steering.enabled: false` |

以下字段**不由向导生成**，需手动配置：`docs.<type>.steering.inclusion`、`docs.<type>.steering.globs`、`steering.force`、`steering.custom_cli`。

向导写入示例（检测到 cursor + codebuddy，选择注入 overview + database）：

```yaml
steering:
  enabled: true
  cli:
    - cursor
    - codebuddy

docs:
  overview:
    steering:
      inject: true
      inclusion: always
  database:
    steering:
      inject: true
      inclusion: fileMatch
  api:
    steering:
      inject: false
```

向导执行完成后可直接使用，也可按上方字段说明手动调整。

---



**Q：`triggers` 里的路径是相对于哪里的？**

相对于 `DOCGUARD_ROOT`（工作区根目录），不是项目自身目录。  
例如 `my-app` 项目配置 `"src/api/**/*.ts"`，实际匹配的是 `DOCGUARD_ROOT/my-app/src/api/**/*.ts`。

**Q：`type` 写了 `custom-xxx`，但没写 `custom_detector`，会怎样？**

Agent 会报错提示配置缺失。只要 `type` 不在内置列表里，就必须同时声明 `custom_detector`。

**Q：可以完全不配置 `docs.api`，只用 changelog 吗？**

可以。`docs` 下只有 `changelog` 是必填的，其余节点按需声明。

**Q：`auto_write: full` 安全吗？会不会覆盖已有内容？**

`stub_only` 模式只追加不覆盖，是最安全的选项。  
`full` 模式下 AI 可以修改已有内容，建议配合 Git 版本控制和 Review 流程使用。

**Q：`custom_detector` 里不写 `route_regex` 可以吗？**

可以，但此时 `doc_sync_check` 必须设为 `manual`，否则 Agent 不知道如何 diff 代码和文档。
