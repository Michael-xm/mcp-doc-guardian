#!/usr/bin/env bash
# ================================================================
# setup-project.sh — 在指定目录生成 .doc-guard.yaml 配置模板
# 用法: ./setup-project.sh <project-name> <type> [project-dir]
# 示例: ./setup-project.sh lhx-care-server java-spring ../lhx-care-server
# ================================================================
set -euo pipefail

PROJECT_NAME="${1:-my-project}"
PROJECT_TYPE="${2:-java-spring}"
PROJECT_DIR="${3:-.}"

mkdir -p "$PROJECT_DIR"

YAML_FILE="$PROJECT_DIR/.doc-guard.yaml"

if [ -f "$YAML_FILE" ]; then
  echo "[INFO] .doc-guard.yaml 已存在: $YAML_FILE"
  echo "       如需重新生成，请先删除该文件"
  exit 0
fi

case "$PROJECT_TYPE" in
  java-spring|java-gradle)
    cat > "$YAML_FILE" << YAML
schema_version: "1.0"
project: "$PROJECT_NAME"
type: "$PROJECT_TYPE"
mode: standalone
description: ""

controller:
  pattern: "src/main/java/**/*Controller.java"
  annotation_regex: "@(GetMapping|PostMapping|PutMapping|DeleteMapping|RequestMapping|PatchMapping)"

docs:
  changelog:
    path: docs/changelogs/CHANGELOG.md
    pending_path: docs/changelogs/pending
    format: keepachangelog
    auto_version: false
    triggers: ["feat", "fix", "refactor"]

  api:
    path: docs/project/api.md
    triggers: ["controller", "service"]
    path_extract_regex: '(@RequestMapping|@GetMapping|@PostMapping)\("([^"]+)"\)'
    auto_write: stub_only
    note: "RESTful API 文档"

  database:
    path: docs/project/database.md
    triggers: ["entity", "mapper", "migration"]
    entity_pattern: "src/main/java/**/*Entity.java"
    migration_pattern: "src/main/resources/db/migration/*.sql"

  overview:
    path: docs/project/overview.md
    triggers: ["pom", "application.yml", "build.gradle"]

# skill:
#   extra_triggers: []
#   allow_doc_write: stub_only

# coverage_baseline:
#   api: 0.8
#   database: 0.7
YAML
    ;;

  vue-ts|uniapp)
    cat > "$YAML_FILE" << YAML
schema_version: "1.0"
project: "$PROJECT_NAME"
type: "$PROJECT_TYPE"
mode: standalone
description: ""

api_call:
  pattern: "src/api/**/*.ts"
  call_regex: "(http|request|api)\\.(get|post|put|delete|patch)\\("

docs:
  changelog:
    path: docs/changelogs/CHANGELOG.md
    pending_path: docs/changelogs/pending
    format: keepachangelog

  api:
    path: docs/project/api.md
    triggers: ["api", "request"]
    auto_write: stub_only

  overview:
    path: docs/project/overview.md
    triggers: ["package.json", "vite.config"]

# skill:
#   allow_doc_write: stub_only
YAML
    ;;

  go)
    cat > "$YAML_FILE" << YAML
schema_version: "1.0"
project: "$PROJECT_NAME"
type: go
mode: standalone
description: ""

api_call:
  pattern: "**/*.go"
  call_regex: "\\.(GET|POST|PUT|DELETE|PATCH)\\("

docs:
  changelog:
    path: docs/changelogs/CHANGELOG.md
    pending_path: docs/changelogs/pending
    format: keepachangelog

  api:
    path: docs/project/api.md
    triggers: ["handler", "router"]
    auto_write: stub_only

  overview:
    path: docs/project/overview.md
    triggers: ["go.mod", "main.go"]
YAML
    ;;

  python)
    cat > "$YAML_FILE" << YAML
schema_version: "1.0"
project: "$PROJECT_NAME"
type: python
mode: standalone
description: ""

api_call:
  pattern: "**/*.py"
  call_regex: "@(app|router)\\.(get|post|put|delete|patch)"

docs:
  changelog:
    path: docs/changelogs/CHANGELOG.md
    pending_path: docs/changelogs/pending
    format: keepachangelog

  api:
    path: docs/project/api.md
    triggers: ["router", "view", "api"]
    auto_write: stub_only

  overview:
    path: docs/project/overview.md
    triggers: ["requirements.txt", "setup.py", "pyproject.toml"]
YAML
    ;;

  react-ts)
    cat > "$YAML_FILE" << YAML
schema_version: "1.0"
project: "$PROJECT_NAME"
type: react-ts
mode: standalone
description: ""

api_call:
  pattern: "src/**/*.{ts,tsx}"
  call_regex: "fetch\\(|axios\\.(get|post|put|delete|patch)"

docs:
  changelog:
    path: docs/changelogs/CHANGELOG.md
    pending_path: docs/changelogs/pending
    format: keepachangelog

  api:
    path: docs/project/api.md
    triggers: ["api", "service", "hook"]
    auto_write: stub_only

  overview:
    path: docs/project/overview.md
    triggers: ["package.json", "tsconfig.json"]
YAML
    ;;

  *)
    cat > "$YAML_FILE" << YAML
schema_version: "1.0"
project: "$PROJECT_NAME"
type: "$PROJECT_TYPE"
mode: standalone
description: ""

# 未知类型需配置 custom_detector
custom_detector:
  source_files:
    pattern: "src/**/*"
    route_regex: ""
  doc_sync_check: manual

docs:
  changelog:
    path: docs/changelogs/CHANGELOG.md
    pending_path: docs/changelogs/pending
    format: keepachangelog
YAML
    ;;
esac

# 创建必要的文档目录
mkdir -p "$PROJECT_DIR/docs/changelogs/pending"
mkdir -p "$PROJECT_DIR/docs/project"
mkdir -p "$PROJECT_DIR/docs/changes"

# 初始化 CHANGELOG.md
CHANGELOG="$PROJECT_DIR/docs/changelogs/CHANGELOG.md"
if [ ! -f "$CHANGELOG" ]; then
  cat > "$CHANGELOG" << MD
# Changelog

All notable changes to "$PROJECT_NAME" will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

MD
fi

echo "[OK] 已生成: $YAML_FILE"
echo "[OK] 已创建: docs/changelogs/, docs/project/, docs/changes/"
echo ""
echo "下一步：编辑 $YAML_FILE 填写实际配置，然后运行 setup-all.sh 重新验证"
