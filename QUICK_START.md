# mcp-doc-guardian 快速上手

> **目标**：让你的 AI Agent（CodeBuddy / Cursor / Claude Code / Trae / Kiro / Windsurf / Cline 等）能感知代码变更，并自动检查文档有没有同步更新。

---

## 前置条件

- Node.js >= 18（在终端运行 `node -v` 确认版本）
- Git
- 已安装支持 MCP 的 AI 工具：CodeBuddy / Cursor / Claude Code CLI / Trae / Kiro / Windsurf / VS Code+Cline 任一即可

---

## 整体流程

```
第一步  git clone 拉代码
   ↓
第二步  ./scripts/setup-all.sh  （一键构建 + 生成配置文件）
   ↓
第三步  把配置文件粘贴到 IDE，接入 MCP
   ↓
第四步  bash scripts/doc-guard-init.sh  （为你的项目生成 .doc-guard.yaml）
   ↓
第五步  在 AI 对话框发送 "请执行 doc_cold_start"  （生成文档骨架）
   ↓
第六步  在 AI 对话框发送 "请执行 fill_all_docs"   （一键补全所有文档内容）
```

---

## 第一步：拉取代码

将 `mcp-doc-guardian` 克隆到你的工作区目录下（和你的业务项目平级）：

```bash
# 假设你的工作区是 ~/work，业务项目也在这里
cd ~/work
git clone https://github.com/Michael-xm/mcp-doc-guardian
cd mcp-doc-guardian
```

克隆后你的目录结构应该是这样：

```
~/work/                        ← 这就是"工作区根目录"（后面会用到）
├── mcp-doc-guardian/          ← 刚克隆的
├── my-server/                 ← 你的业务项目 A
├── my-web/                    ← 你的业务项目 B
└── ...
```

---

## 第二步：一键构建并生成配置

在 `mcp-doc-guardian` 目录下运行：

```bash
./scripts/setup-all.sh
```

这个脚本会自动完成：
1. 构建 MCP Server（`npm install` + `npm run build`）
2. 安装 AI Agent Skills
3. 安装 git hooks
4. 生成 IDE 配置文件（`.codebuddy/mcp.json` 和 `.cursor/mcp.json`）

看到 `初始化完成！` 即成功。整个过程约 1~2 分钟。

---

## 第三步：把 MCP 配置接入你的 IDE

根据你使用的工具选择对应方式：

---

### CodeBuddy（推荐）

`setup-all.sh` 已自动生成 `.codebuddy/mcp.json`，路径已填好，直接复制粘贴即可：

1. 打开 `.codebuddy/mcp.json`，复制全部内容
2. 点击 CodeBuddy 顶部菜单「MCP」→ 右上角「`+ 配置 MCP`」
3. 粘贴内容，点击保存
4. 左侧「我的 MCP」列表出现 `doc-guard` 即为成功

---

### Cursor

配置已自动写入工作区根目录的 `.cursor/mcp.json`，重启 Cursor 即生效。

如需手动确认路径正确：

```bash
cat $(dirname $(pwd))/.cursor/mcp.json
```

重启 Cursor 后，在「Settings → MCP」中确认 `doc-guard` 出现即可。

---

### Claude Code CLI

```bash
# 将配置复制到 Claude 的全局 MCP 配置
cp .codebuddy/mcp.json ~/.claude/mcp.json
```

之后正常启动 `claude` 即自动加载。

---

### VS Code + Cline

1. 侧边栏点击 Cline 图标 → 右上角齿轮 → 「MCP Servers」→「Edit MCP Settings」
2. 在打开的 `cline_mcp_settings.json` 里，将 `.codebuddy/mcp.json` 的内容合并进去
3. 保存后 Cline 自动重载

---

### Trae

Trae 使用项目级规则文件来加载 MCP：

1. 在你的**工作区根目录**下创建或编辑 `.trae/mcp.json`（若不存在请新建）
2. 将 `.codebuddy/mcp.json` 的内容粘贴进去（内容结构完全一致）
3. 重启 Trae，在 MCP 面板中确认 `doc-guard` 已加载

```bash
# 也可以直接复制
mkdir -p $(dirname $(pwd))/.trae
cp .codebuddy/mcp.json $(dirname $(pwd))/.trae/mcp.json
```

---

### Kiro

Kiro 支持通过 `.kiro/settings/mcp.json` 加载 MCP Server：

1. 在你的**工作区根目录**下创建或编辑 `.kiro/settings/mcp.json`
2. 将 `.codebuddy/mcp.json` 的内容粘贴进去
3. 重启 Kiro，在 MCP 面板中确认 `doc-guard` 已加载

```bash
mkdir -p $(dirname $(pwd))/.kiro/settings
cp .codebuddy/mcp.json $(dirname $(pwd))/.kiro/settings/mcp.json
```

---

### Windsurf

Windsurf 使用全局 MCP 配置文件 `~/.codeium/windsurf/mcp_config.json`：

```bash
# 将配置合并到 Windsurf 的全局 MCP 配置
# 若文件不存在直接复制；若已存在请手动将 mcpServers 中的 doc-guard 段合并进去
cp .codebuddy/mcp.json ~/.codeium/windsurf/mcp_config.json
```

保存后重启 Windsurf，在「Cascade → MCP」面板中确认 `doc-guard` 出现即可。

---

### 配置内容说明

所有 IDE 使用同一份配置结构：

```json
{
  "mcpServers": {
    "doc-guard": {
      "command": "node",
      "args": ["/你的工作区/mcp-doc-guardian/mcp-doc-guard/dist/index.js"],
      "env": {
        "DOCGUARD_ROOT": "/你的工作区"
      }
    }
  }
}
```

两个路径的含义：
- `args` 里的路径：指向 MCP Server 的入口文件（`dist/index.js`）
- `DOCGUARD_ROOT`：**工作区根目录**，即 `mcp-doc-guardian` 的父目录

> 举例：如果你克隆到 `/Users/alice/work/mcp-doc-guardian`，  
> 则 `DOCGUARD_ROOT` = `/Users/alice/work`

`setup-all.sh` 已自动把这两个路径替换好，直接用生成的文件即可，无需手动改。

---

## 第四步：为你的项目生成配置

运行交互式向导：

```bash
bash scripts/doc-guard-init.sh
```

向导会依次完成：
1. **自动扫描**工作区下的所有子项目，识别技术栈（Java/Vue/Go/Python 等）
2. **让你确认**识别结果，有误的直接输入正确值（无误直接回车跳过）
3. **一次性选择**文档写入权限，生成所有项目的 `.doc-guard.yaml`
4. **询问是否开启自定义指令注入**（Steering），并自动检测你已安装的 AI 工具

示例交互（全程大约 30 秒）：

```
================================================
  doc-guard 初始化向导
================================================

  默认扫描工作区: /Users/alice/work

[步骤1] 工作区根目录 [/Users/alice/work]（直接回车接受）:
  → 使用: /Users/alice/work

[步骤2] 扫描子项目...
  发现: my-server   →  java-spring
  发现: my-web      →  vue-ts
  发现: my-app      →  uniapp

[步骤3] 确认识别结果（识别正确直接回车，有误则输入正确值）:

  my-server [java-spring]:          ← 直接回车，识别正确
  my-web [vue-ts]:                  ← 直接回车
  my-app [uniapp]:                  ← 直接回车

[步骤4] 文档写入权限（全部项目统一设置）:
  false      - AI 只读，不自动写文档
  stub_only  - AI 只追加骨架，不覆盖已有内容（推荐）
  full       - AI 可完整修改文档

  选择模式 [stub_only]:                   ← 直接回车用推荐值

[步骤5] 自定义指令同步（Steering 注入）:

  自定义指令的作用：
  doc-guardian 生成的 api.md / database.md / overview.md 等文档，默认只有
  你的 AI Agent 通过 MCP 工具主动读取时才能感知。开启"自定义指令注入"后，
  这些文档会被自动写入你的 AI 工具的项目级规则文件（如 .kiro/steering/、
  .cursor/rules/、.codebuddy/rules/ 等），让 AI 在每次对话开始时就自动
  加载项目文档背景，无需手动提示。

  检测到以下已安装的 AI 工具：
    [✓] Cursor      →  .cursor/rules/<doc>.mdc
    [✓] CodeBuddy   →  .codebuddy/rules/<doc>.md
    [ ] Kiro        （未检测到）
    [ ] Claude Code （未检测到）

  是否开启 Steering 注入？[Y/n]:            ← 回车开启
                                           ← 若输入 n：
                                              已跳过。如需后续手动开启，在 AI 对话框
                                              发送 "sync steering"，或修改
                                              .doc-guard.yaml 中 steering.enabled: true

  选择要注入的文档（空格多选，回车确认）:
    [✓] overview  - 项目概览文档（推荐始终注入）
    [✓] database  - 数据库结构文档
    [ ] api       - API 接口文档（内容较长，按需选择）

  ← 若未检测到任何工具，向导会提示：
     未检测到任何已安装的 AI 工具。
     A) 继续（steering 留空，后续手动配置）
     B) 手动输入工具名（kiro/cursor/codebuddy/claude/trae/cline/windsurf）
     请选择 [A]:

================================================
  即将为以下项目生成 .doc-guard.yaml：
    my-server  (java-spring)
    my-web     (vue-ts)
    my-app     (uniapp)

  确认生成？[Y/n]:                        ← 回车确认

  生成 my-server (java-spring)...
    ✓ /Users/alice/work/my-server/.doc-guard.yaml
  生成 my-web (vue-ts)...
    ✓ /Users/alice/work/my-web/.doc-guard.yaml
  ...

================================================
  初始化完成！
  提示：生成初始文档后，在 AI 对话框发送 "sync steering" 可随时刷新自定义指令。
```

---

## 第五步：让 AI 初始化文档骨架

在 AI 对话框（CodeBuddy / Cursor / Claude 任一）中直接发送：

```
请执行 doc_cold_start
```

AI 会自动调用 MCP 工具，为每个项目创建文档目录结构和存根文件（`api.md`、`database.md`、`CHANGELOG.md` 等），此时文件里只有标题和占位结构，**内容是空的**。

---

## 第六步：一键补全所有文档内容

骨架生成后，继续在 AI 对话框发送：

```
请执行 fill_all_docs
```

AI 会自动调用 `fill_all_docs` 工具，扫描所有项目中含 `[Draft]` 标记或缺失的文档，逐一读取对应源码并按照你配置的写作规范（`auto_write_template`）补全每个文档的实际内容。

**`fill_all_docs` 做什么：**

| 文档类型 | 读取来源 | 写作规范 |
|---------|---------|---------|
| `api` | Controller / API 调用层文件 | `docs/agents/api-prompt.md` 或你配置的模板 |
| `database` | Entity / Mapper / Migration 文件 | `docs/agents/database-prompt.md` 或你配置的模板 |
| `overview` | 项目目录结构 + 主要模块 | `docs/agents/overview-prompt.md` 或你配置的模板 |
| 自定义文档 | `.doc-guard.yaml` 中 `triggers` 指定的文件 | `auto_write_template` 指定的模板 |
| `changelog` | — | 自动跳过（由变更流程管理） |

**按项目或文档类型过滤：**

```
请执行 fill_all_docs，只处理 my-server 项目
```

```
请执行 fill_all_docs，只补全 api 和 database 类型
```

> **为什么骨架和填充分开？**
> `doc_cold_start` 只负责「建档」；`fill_all_docs` 负责「填内容」。
> 填充前你可以先看 stub 结构是否符合预期，再统一补全。

---

## 完成！日常怎么用？

改完代码后，直接告诉 AI：

```
我刚修改了 UserController，帮我检查文档有没有同步。
```

AI 会调用 `check_api_sync`，告诉你哪里没同步并帮你补上。

---

## 手动同步自定义指令

如果你在初始化时没有开启 Steering，或者后来修改了 `.doc-guard.yaml` 的 steering 配置，可以随时手动同步：

**方式一：AI 对话框（推荐）**

```
请同步自定义指令 / sync steering
```

AI 会调用 `sync_steering` 工具，检测已安装的工具，并把最新文档内容写入对应的规则文件。

> 即使在初始化时选择了不开启 Steering（`steering.enabled: false`），手动发送 `sync steering` 仍然会执行写入。`enabled` 只控制文档更新时的**自动触发**，手动命令始终有效。

**方式二：指定工具或文档类型**

```
请只把 overview 文档同步到 Cursor 的自定义指令
```

```
请只同步 Kiro 和 CodeBuddy 的自定义指令
```

**支持多选的场景：**

`sync_steering` 工具支持 `cli` 参数（指定哪些工具）和 `doc_types` 参数（指定哪些文档），两者都支持多选：

| 你想做什么 | 发给 AI 的内容 |
|-----------|--------------|
| 刷新所有工具的自定义指令 | `sync steering` |
| 只刷新 Cursor 的 | `sync steering，只刷新 Cursor` |
| 只刷新 overview 文档 | `sync steering，只刷新 overview 文档` |
| 预览会写哪些文件（不实际写入）| `dry run sync steering` |

**各 AI 工具的规则文件位置：**

| AI 工具 | 规则文件路径 | 写入方式 |
|--------|------------|---------|
| Kiro | `.kiro/steering/<doc>.md` | 内联副本（含 frontmatter），文档更新后需重新 sync |
| Cursor | `.cursor/rules/<doc>.mdc` | 内联副本（含 frontmatter），文档更新后需重新 sync |
| CodeBuddy | `.codebuddy/rules/<doc>.md` | 软链接，源文档更新自动生效 |
| Claude Code | `CLAUDE.md`（项目根）| `@引用` 块，源文档更新自动生效 |
| Trae | `.trae/rules/project_rules.md` | 追加引用路径行，源文档更新自动生效 |
| Cline | `.clinerules` | 追加引用路径行，源文档更新自动生效 |
| Windsurf | `.windsurfrules` | 追加引用路径行，源文档更新自动生效 |

> Kiro / Cursor 使用内联副本，每次源文档更新后需手动发送 `sync steering` 刷新。  
> 其他工具使用引用或软链接，源文档改动后无需操作。

---

## 常用指令速查

在 AI 对话框中直接发送，无需在终端操作：

| 你想做什么 | 发给 AI 的内容 |
|-----------|--------------|
| 初始化所有文档存根 | `请执行 doc_cold_start` |
| 一键补全所有文档内容 | `请执行 fill_all_docs` |
| 只补全某项目的文档 | `请执行 fill_all_docs，只处理 my-server` |
| 检查某项目 API 文档是否同步 | `请检查 my-server 的 API 文档是否同步` |
| 检查数据库文档是否同步 | `请检查 my-server 的数据库文档是否同步` |
| 查看整个团队的文档健康状态 | `请查看团队文档状态` |
| 查看单个项目文档健康度 | `请检查 my-server 的文档健康度` |
| 刷新所有工具的自定义指令 | `sync steering` |
| 发起一个变更提案 | `请为 my-server 发起变更提案，标题：新增订单接口` |
| 查看 pending changelog | `请查看 my-server 的 pending changelog 状态` |

---

## 常见问题

**Q：运行 setup-all.sh 报 "Permission denied"**

```bash
chmod +x scripts/setup-all.sh
./scripts/setup-all.sh
```

**Q：doc-guard-init.sh 扫描不到我的项目**

确认项目目录下有以下文件之一：`pom.xml`、`package.json`、`go.mod`、`requirements.txt`、`build.gradle`。如果没有，向导会让你手动输入项目名和技术栈。

**Q：IDE 里 MCP 列表没有出现 doc-guard**

- 确认配置 JSON 格式正确（可用 [jsonlint.com](https://jsonlint.com) 校验）
- 确认 `dist/index.js` 文件存在（第二步构建成功后才有）
- 重启 IDE

**Q：`doc_cold_start` 报错说找不到项目**

确认 `DOCGUARD_ROOT` 路径下有 `.doc-guard.yaml` 文件（第四步生成的）。

---

遇到其他问题？查看 [README.zh.md](./README.zh.md) 或提 [Issue](https://github.com/Michael-xm/mcp-doc-guardian/issues)。
