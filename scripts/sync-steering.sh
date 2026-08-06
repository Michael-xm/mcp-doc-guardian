#!/usr/bin/env bash
# ============================================================
# sync-steering.sh — 手动同步文档到 AI 工具规则文件
# 用法: bash scripts/sync-steering.sh [options]
#
# 选项:
#   --cli <cli1,cli2,...>   目标 AI 工具（逗号分隔），不填则自动检测
#   --doc-types <t1,t2,...> 文档类型（逗号分隔），不填则使用配置
#   --dry-run               预览模式，不实际写入
#   --force                 强制覆盖（绕过 enabled:false 和 hash 跳过）
#   --help, -h              显示帮助
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_DIR="$SCRIPT_DIR/../mcp-doc-guard"
CLI_JS="$MCP_DIR/dist/cli/sync-steering-cli.js"

if [ ! -d "$MCP_DIR" ]; then
  echo "错误: 未找到 mcp-doc-guard 目录: $MCP_DIR" >&2
  exit 1
fi

if [ ! -f "$CLI_JS" ]; then
  echo "错误: CLI 文件未构建，请先执行: cd $MCP_DIR && npm run build" >&2
  exit 1
fi

exec node "$CLI_JS" "$@"
