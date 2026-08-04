# .doc-guard.yaml 配置说明

> 本文件由 `doc-guard-init.sh` 自动生成，生成后你可以按需手动调整。  
> 完整 JSON Schema 见：[doc-guard.schema.json](../mcp-doc-guard/doc-guard.schema.json)

---

## 一份真实配置长什么样

以下是 `lhx-care-web` 项目的完整配置，后文会逐段解释每个字段的含义：

```yaml
# .doc-guard.yaml - 由 doc-guard-init.sh 生成
schema_version: "1.0"
project: lhx-care-web
type: vue-ts
mode: standalone
description: ""

api_call:
  pattern: "src/**/*.{ts,vue,js}"
  call_regex: '(http|request|api)\.(get|post|put|delete|patch)\('

docs:
  changelog:
    path: docs/changelogs/CHANGELOG.md
    pending_path: docs/changelogs/pending
    format: keepachangelog
  api:
    path: docs/api.md
    triggers:
      - "src/api/**/*.ts"
  overview:
    path: docs/overview.md
    triggers:
      - "src/**/*.vue"
      - "src/**/*.tsx"

team:
  my_role: agent1-implementer

skill:
  allow_doc_write: stub_only
  changelog_format: "- [{status}][{date}] {description}"
```

---

## 字段说明

### 顶层字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `schema_version` | 否 | 配置文件版本，目前固定填 `"1.0"` |
| `project` | 是 | 项目名称，与目录名保持一致，全局唯一 |
| `type` | 是 | 技术栈，见下方支持列表 |
| `mode` | 是 | 运行模式：`standalone`（单机）或 `team`（多 Agent 协作） |
| `description` | 否 | 项目描述，供 AI 理解项目用途 |

**`type` 支持的内置值：**

| 值 | 适用场景 |
|----|---------|
| `java-spring` | Spring Boot / Spring MVC |
| `java-gradle` | 使用 Gradle 构建的 Java 项目 |
| `vue-ts` | Vue 2/3 + TypeScript |
| `react-ts` | React + TypeScript |
| `uniapp` | uni-app 小程序 / H5 |
| `go` | Go 语言项目 |
| `python` | Python 项目（Flask / FastAPI / Django 等）|

如果你的项目不在列表中，可以用 `custom_detector`（见后文高级配置）。

---

### `api_call`（前端 / 非 Java 项目必填）

用于告诉 AI 在哪些文件里找 HTTP 请求调用，以便检测 API 文档是否同步。

```yaml
api_call:
  pattern: "src/**/*.{ts,vue,js}"   # 要扫描的文件范围（glob）
  call_regex: '(http|request|api)\.(get|post|put|delete|patch)\('
  # 匹配 HTTP 调用的正则，根据你项目的请求封装方式调整
```

**常见调整场景：**

如果你的项目用 `axios` 直接调用：

```yaml
api_call:
  pattern: "src/**/*.{ts,js}"
  call_regex: 'axios\.(get|post|put|delete|patch)\('
```

如果用自封装的 `service.get()`：

```yaml
api_call:
  pattern: "src/**/*.ts"
  call_regex: 'service\.(get|post|put|delete|patch)\('
```

---

### `controller`（Java 项目必填）

用于扫描 Spring 控制器里的路由注解。

```yaml
controller:
  pattern: "src/main/java/**/*Controller.java"
  annotation_regex: '@(GetMapping|PostMapping|PutMapping|DeleteMapping|RequestMapping|PatchMapping)'
```

---

### `docs`（必填）

配置各类文档的路径和触发条件。`changelog` 是唯一必须声明的子项，其余按需配置。

---

#### `docs.changelog`（必填）

```yaml
docs:
  changelog:
    path: docs/changelogs/CHANGELOG.md        # 主 changelog 文件路径
    pending_path: docs/changelogs/pending      # 待处理 changelog 存放目录
    format: keepachangelog                     # 格式：keepachangelog 或 timestamp
    auto_version: false                        # 是否自动推导版本号（可选）
```

---

#### `docs.api`（推荐配置）

```yaml
docs:
  api:
    path: docs/api.md           # API 文档路径
    triggers:
      - "src/api/**/*.ts"       # 这些文件变更时，AI 会提示检查 API 文档
    auto_write: stub_only       # 可选：false | stub_only | full
    auto_write_template: mcp-doc-guardian/docs/agents/api-prompt.md  # 可选：写作提示词模板路径
```

`auto_write` 三档含义：
- `false`：AI 不自动写，只提示你手动更新
- `stub_only`：AI 只追加新的存根条目，不覆盖已有内容（**推荐**）
- `full`：AI 可完整改写文档，适合文档质量要求高且已有 Review 机制的团队

**`auto_write_template` — 写作提示词模板**

当 `check_api_sync` / `check_db_sync` 检测到变更时，会把模板内容附加到返回结果里，AI 看到后会按模板规定的格式写文档，而不是自由发挥。

路径解析规则（三选一）：
- **绝对路径**：`/absolute/path/to/my-prompt.md`
- **以 `.` 开头的相对路径**：相对于项目自身目录，例如 `./.doc-guard-prompts/api.md`
- **其他相对路径**：相对于 `DOCGUARD_ROOT`（工作区根目录），例如 `mcp-doc-guardian/docs/agents/api-prompt.md`

内置模板位置（直接可用，无需配置）：

| 文档类型 | 默认模板路径 |
|---------|------------|
| api | `mcp-doc-guardian/docs/agents/api-prompt.md` |
| database | `mcp-doc-guardian/docs/agents/database-prompt.md` |
| overview | `mcp-doc-guardian/docs/agents/overview-prompt.md` |
| pages（自定义类型）| `mcp-doc-guardian/docs/agents/pages-prompt.md` |

如果不配置，工具会自动加载对应的内置模板。  
如果你对格式有特殊要求，复制内置模板到任意路径修改后，用此字段指向它即可。

---

#### `docs.database`（Java 项目推荐）

```yaml
docs:
  database:
    path: docs/database.md
    triggers:
      - "**/*Entity.java"
      - "**/*Mapper.java"
      - "**/*Mapper.xml"
    entity_pattern: "src/main/java/**/*Entity.java"     # 可选，更精确的扫描范围
    migration_pattern: "src/main/resources/db/**/*.sql" # 可选，迁移脚本路径
```

---

#### `docs.overview`（可选）

```yaml
docs:
  overview:
    path: docs/overview.md
    triggers:
      - "src/**/*.vue"   # 这些文件变更时，AI 会提示检查概览文档
```

---

#### 自定义文档类型（可选）

除内置的 `api` / `database` / `overview` 外，你可以添加任意自定义文档节点：

```yaml
docs:
  # 内置节点...

  # 自定义：页面路由文档
  pages:
    path: docs/pages.md
    triggers:
      - "src/router/**/*.ts"
    description: "记录所有页面路由和权限配置"

  # 自定义：环境变量说明
  env:
    path: docs/env.md
    triggers:
      - ".env*"
      - "vite.config.ts"
```

---

### `team`（可选）

单人使用时保持默认即可。多 Agent 协作时配置角色权限。

```yaml
team:
  my_role: agent1-implementer   # 当前实例的角色

  # 多 Agent 协作时取消注释并填写：
  # roles:
  #   - id: agent1-implementer
  #     allowed_tools: ["*"]           # 所有工具权限
  #   - id: agent2-reviewer
  #     allowed_tools: ["scan_draft", "project_doc_health", "team_doc_status"]
  #     denied_tools: ["apply_doc_patch"]  # 明确禁止写文档
```

---

### `skill`（可选）

```yaml
skill:
  allow_doc_write: stub_only    # 全局写入权限，与 docs.*.auto_write 含义相同
  changelog_format: "- [{status}][{date}] {description}"  # changelog 条目格式
  extra_triggers:               # 可选：额外的自然语言触发词
    - "检查前端接口"
    - "前端文档同步"
```

---

## 高级配置

### 自定义技术栈（`custom_detector`）

当你的项目不是内置支持的技术栈时：

```yaml
type: custom-nest              # 自定义名称，随意起
custom_detector:
  source_files:
    pattern: "src/**/*.controller.ts"    # 扫描哪些文件
    route_regex: '@(Get|Post|Put|Delete|Patch)\([\'"](.*?)[\'"]\)'  # 提取路由的正则
  doc_sync_check: regex        # regex：用正则做 diff；manual：仅提示人工核对
```

---

### 触发模式别名（`trigger_patterns`）

当多个文档节点使用相同的 glob 时，可以定义别名复用：

```yaml
trigger_patterns:
  vue-components: "src/components/**/*.vue"
  api-files: "src/api/**/*.ts"

docs:
  api:
    path: docs/api.md
    triggers:
      - api-files          # 引用别名
  overview:
    path: docs/overview.md
    triggers:
      - vue-components     # 引用别名
```

---

### 覆盖率基线（`coverage_baseline`）

用于 `project_doc_health` 工具的健康度评分：

```yaml
coverage_baseline:
  api: 0.8          # API 文档覆盖率目标 80%
  database: 0.9     # 数据库文档覆盖率目标 90%
  overview: 0.5     # 概览文档覆盖率目标 50%
  changelog: 1.0    # changelog 覆盖率目标 100%
```

---

## 常见问题

**Q：`triggers` 里的路径是相对于哪里的？**

相对于 `DOCGUARD_ROOT`（即工作区根目录），不是项目目录。  
例如 `lhx-care-web` 项目的 `"src/api/**/*.ts"` 实际匹配的是 `DOCGUARD_ROOT/lhx-care-web/src/api/**/*.ts`。

**Q：`auto_write` 和 `skill.allow_doc_write` 有什么区别？**

- `docs.api.auto_write`：针对单个文档节点的写入控制
- `skill.allow_doc_write`：全局兜底值，当某个文档节点没有声明 `auto_write` 时使用此值

**Q：可以完全不配置 `docs.api`，只用 changelog 吗？**

可以，`docs` 下只有 `changelog` 是必填的，其余节点按需声明。

---

> 完整字段参考：[doc-guard.schema.json](../mcp-doc-guard/doc-guard.schema.json)
