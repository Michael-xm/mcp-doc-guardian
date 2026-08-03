#!/usr/bin/env bash
# ================================================================
# setup-all.sh — 一键初始化 doc-guard 环境（入口脚本）
# 执行顺序：构建 → Skills → git hooks → MCP 配置 → 校验
# ================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOC_GUARD_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# 工作区根目录：doc-guard 的父目录（monorepo 根）
REPO_ROOT="$(cd "$DOC_GUARD_DIR/.." && pwd)"

echo "================================================"
echo "  mcp-doc-guardian v1.0.0 — 一键初始化"
echo "  REPO_ROOT: $REPO_ROOT"
echo "================================================"

# ── [1/5] 构建 MCP Server ─────────────────────────────────────
echo ""
echo ">>> [1/5] 构建 MCP Server..."
cd "$DOC_GUARD_DIR/mcp-doc-guard"
npm install
npm run build
echo "    MCP Server 构建完成"

# ── [2/5] 设置 Agent Skills ──────────────────────────────────
echo ""
echo ">>> [2/5] 设置 Agent Skills..."
bash "$SCRIPT_DIR/setup-skills.sh"

# ── [3/5] 安装 git post-merge hook ──────────────────────────
echo ""
echo ">>> [3/5] 安装 git hooks..."
GIT_DIR="$REPO_ROOT/.git"
if [ -d "$GIT_DIR" ]; then
  HOOKS_DIR="$GIT_DIR/hooks"
  mkdir -p "$HOOKS_DIR"
  HOOK_FILE="$HOOKS_DIR/post-merge"

  # 检测 .review-requested/ 触发 Agent2（路径B主路）
  cat > "$HOOK_FILE" << 'HOOK'
#!/bin/bash
# doc-guard post-merge hook (v5.8)
# 检测 .review-requested/ 目录，触发 Agent2 审查流程

REVIEW_DIR=".review-requested"
REVIEW_FILE=$(find "$REVIEW_DIR" -name "*.md" -not -name ".gitkeep" 2>/dev/null | head -1)

if [ -n "$REVIEW_FILE" ]; then
  echo "[doc-guard] 检测到待审查变更，触发 Agent2..."
  SCRIPT_DIR="$(git rev-parse --show-toplevel)/doc-guard/scripts"
  if [ -f "$SCRIPT_DIR/notify-agent2.js" ]; then
    node "$SCRIPT_DIR/notify-agent2.js" "$REVIEW_FILE"
  else
    echo "[doc-guard] 警告：notify-agent2.js 未找到，请手动处理: $REVIEW_FILE"
  fi
fi

# 兼容旧路径：检测 pending changelog
PENDING=$(find . -path "*/changelogs/pending/*.md" -not -path "*/node_modules/*" 2>/dev/null | head -1)
if [ -n "$PENDING" ] && [ -z "$REVIEW_FILE" ]; then
  echo "[doc-guard] 检测到 pending changelog: $PENDING"
  echo "[doc-guard] 请手动触发 Agent2 或等待 Automation 轮询处理"
fi
HOOK

  chmod +x "$HOOK_FILE"
  echo "    已安装: $HOOK_FILE"
else
  echo "    [WARN] 未找到 .git 目录（$GIT_DIR），跳过 hook 安装"
  echo "    手动安装：将 .git/hooks/post-merge 内容复制自方案 6.5 节"
fi

# 同时在 .review-requested/ 创建 .gitkeep 确保目录存在
mkdir -p "$REPO_ROOT/.review-requested"
touch "$REPO_ROOT/.review-requested/.gitkeep"

# ── [4/5] 生成 MCP 配置 ───────────────────────────────────────
echo ""
echo ">>> [4/5] 生成 MCP 配置..."
MCP_TEMPLATE="$DOC_GUARD_DIR/.codebuddy/mcp.template.json"
MCP_OUTPUT="$DOC_GUARD_DIR/.codebuddy/mcp.json"

if [ -f "$MCP_TEMPLATE" ]; then
  sed "s|{{REPO_ROOT}}|$REPO_ROOT|g" "$MCP_TEMPLATE" > "$MCP_OUTPUT"
  echo "    已生成: $MCP_OUTPUT"
  echo "    DOCGUARD_ROOT: $REPO_ROOT"

  # 生成 Cursor 专用配置（放到 repo 根目录的 .cursor/ 下）
  CURSOR_DIR="$REPO_ROOT/.cursor"
  mkdir -p "$CURSOR_DIR"
  sed "s|{{REPO_ROOT}}|$REPO_ROOT|g" "$MCP_TEMPLATE" > "$CURSOR_DIR/mcp.json"
  echo "    已生成 Cursor 配置: $CURSOR_DIR/mcp.json"
else
  echo "    [WARN] 未找到 mcp.template.json，跳过"
fi

# ── [5/5] 校验配置 ────────────────────────────────────────────
echo ""
echo ">>> [5/5] 校验 .doc-guard.yaml 配置..."
if DOCGUARD_ROOT="$REPO_ROOT" node "$DOC_GUARD_DIR/mcp-doc-guard/dist/index.js" --validate-only 2>&1; then
  echo "    配置校验通过"
else
  echo "    [WARN] 部分配置有误或暂无 .doc-guard.yaml，请检查上方输出"
fi

# 脚本权限
chmod +x "$SCRIPT_DIR"/*.sh 2>/dev/null || true

echo ""
echo "================================================"
echo "  初始化完成！"
echo ""
echo "  下一步："
echo "  1. 运行交互式配置：bash scripts/doc-guard-init.sh"
echo "     或手动：bash scripts/gen-project-config.sh <project> <type> <dir>"
echo "  2. IDE MCP 配置已生成：.codebuddy/mcp.json"
echo "     Cursor 配置已生成：\$REPO_ROOT/.cursor/mcp.json"
echo "  3. 在 AI Agent 对话框发送：请执行 doc_cold_start"
echo "================================================"
