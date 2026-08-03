# 5 分钟上手 mcp-doc-guardian

> 跟着下面 4 步走，你的 AI Agent 就能开始自动守护文档了。

---

## 准备工作

确认你已安装：

- Node.js >= 18（`node -v` 检查）
- Git
- 任意一款支持 MCP 的 AI 工具：CodeBuddy / Cursor / Claude Code CLI / VS Code+Cline

---

## 第一步：获取代码

```bash
git clone https://github.com/Michael-xm/mcp-doc-guardian
cd mcp-doc-guardian
```

---

## 第二步：构建并接入你的 IDE

### 2.1 构建 MCP Server

```bash
# 在 mcp-doc-guardian 目录下运行，自动完成 build + skills + git hooks + MCP 配置
./scripts/setup-all.sh
```

看到如下输出说明成功：

```
>>> [1/5] 构建 MCP Server...
    MCP Server 构建完成
>>> [2/5] 设置 Agent Skills...
    Skills 安装完成
>>> [3/5] 安装 git hooks...
    git hooks 安装完成
>>> [4/5] 生成 MCP 配置...
    MCP 配置已生成：.codebuddy/mcp.json
>>> [5/5] 完成！
```

---

### 2.2 接入 IDE

根据你使用的工具，选择对应方式：

---

#### CodeBuddy（推荐）

`setup-all.sh` 已自动生成 `.codebuddy/mcp.json`，只需在 CodeBuddy 中加载：

1. 打开 CodeBuddy → 点击顶部菜单「MCP」
2. 点击右上角 `+ 配置 MCP`
3. 将以下内容粘贴进去（路径已自动填好）：

```json
{
  "mcpServers": {
    "doc-guard": {
      "command": "node",
      "args": ["/你的工作区绝对路径/mcp-doc-guardian/mcp-doc-guard/dist/index.js"],
      "env": {
        "DOCGUARD_ROOT": "/你的工作区绝对路径"
      }
    }
  }
}
```

> 直接复制 `.codebuddy/mcp.json` 的内容粘贴即可，路径已由 `setup-all.sh` 替换好。

4. 点击保存，「我的 MCP」列表中出现 `doc-guard` 即为成功。

---

#### Cursor

1. 复制模板文件：

```bash
cp .codebuddy/mcp.template.json .cursor/mcp.json
```

2. 打开 `.cursor/mcp.json`，将 `{{REPO_ROOT}}` 替换为你的工作区绝对路径：

```bash
# macOS / Linux 一键替换
sed -i '' "s|{{REPO_ROOT}}|$(dirname $(pwd))|g" .cursor/mcp.json
```

3. 重启 Cursor，在「Settings → MCP」中确认 `doc-guard` 已出现。

---

#### Claude Code CLI

1. 先生成配置文件：

```bash
REPO_ROOT="$(dirname $(pwd))"
sed "s|{{REPO_ROOT}}|$REPO_ROOT|g" .codebuddy/mcp.template.json > /tmp/doc-guard-mcp.json
```

2. 启动时加载：

```bash
claude --mcp-config /tmp/doc-guard-mcp.json
```

或写入 `~/.claude/mcp.json` 永久生效：

```bash
cp /tmp/doc-guard-mcp.json ~/.claude/mcp.json
```

---

#### VS Code + Cline

1. 打开 VS Code → 侧边栏点击 Cline 图标 → 点击右上角齿轮 → 「MCP Servers」→「Edit MCP Settings」
2. 在打开的 `cline_mcp_settings.json` 中添加：

```json
{
  "mcpServers": {
    "doc-guard": {
      "command": "node",
      "args": ["/你的工作区绝对路径/mcp-doc-guardian/mcp-doc-guard/dist/index.js"],
      "env": {
        "DOCGUARD_ROOT": "/你的工作区绝对路径"
      }
    }
  }
}
```

3. 保存文件，Cline 会自动重新加载 MCP 配置。

---

> **工作区绝对路径**：指包含 `mcp-doc-guardian` 的父目录，例如你的项目根目录是 `/Users/yourname/work/qh`，则：
> - `args` 路径为：`/Users/yourname/work/qh/mcp-doc-guardian/mcp-doc-guard/dist/index.js`
> - `DOCGUARD_ROOT` 为：`/Users/yourname/work/qh`

---

## 第三步：为你的项目生成配置

```bash
# 格式：./scripts/setup-project.sh <项目名> <技术栈> <项目路径>
./scripts/setup-project.sh my-server java-spring ../my-server
./scripts/setup-project.sh my-web    vue-ts      ../my-web
```

支持的技术栈：`java-spring` · `java-gradle` · `vue-ts` · `uniapp` · `go` · `python` · `react-ts`

---

## 第四步：让 AI 初始化文档

在 AI 对话框中发送：

```
请执行 doc_cold_start
```

```
你：  请执行 doc_cold_start

AI：  [调用 doc_cold_start]
      ✓ 已为 my-server 生成：
        → docs/project/api.md（存根）
        → docs/project/database.md（存根）
        → docs/changelogs/CHANGELOG.md
      ✓ 已为 my-web 生成：
        → docs/project/api.md（存根）
      全部完成，共生成 3 个文档。
```

---

## 完成！下一步做什么？

改完代码后，直接告诉 AI：

```
我刚修改了 UserController，帮我检查文档有没有同步。
```

AI 会自动调用 `check_api_sync`，告诉你哪里没同步，并帮你补上。

---

## 常用指令速查

| 你想做什么 | 告诉 AI |
|-----------|--------|
| 初始化所有文档存根 | `请执行 doc_cold_start` |
| 查看整个团队的文档状态 | `team_doc_status()` |
| 检查某个项目文档健康度 | `project_doc_health({ project: "my-server" })` |
| 检查 API 文档是否同步 | `check_api_sync({ project: "my-server" })` |
| 发起一个变更提案 | `project_change_propose({ project: "my-server", title: "新增订单接口" })` |
| 查看 pending changelog | `changelog_status({ project: "my-server" })` |

---

## 注意事项

<details>
<summary>权限模式说明（allow_doc_write）</summary>

| 模式 | 效果 |
|------|------|
| `false` | AI 只读，不写文档 |
| `stub_only` | **推荐**：只追加骨架，不覆写已有内容 |
| `full` | AI 可完整修改文档，需团队评审后开启 |

</details>

<details>
<summary>Agent2 审查在非 CodeBuddy 环境下的行为</summary>

`notify-agent2.js` 依赖 `kiro-cli`。在其他 AI 工具中，Agent2 触发会自动 fallback，将任务写入 `.review-requested/.agent2-queue.jsonl`，等待下次轮询处理。不影响正常使用。

</details>

<details>
<summary>CI 校验（GitHub Actions）</summary>

`.github/workflows/doc-guard-validate.yml` 已预置，会在每次 PR 时自动运行 `--validate-only` 校验所有 `.doc-guard.yaml` 配置文件是否合法。

</details>

---

遇到问题？查看 [README](./README.zh.md) 或提 Issue。
