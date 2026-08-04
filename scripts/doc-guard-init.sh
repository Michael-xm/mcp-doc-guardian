#!/usr/bin/env bash
# scripts/doc-guard-init.sh
# 交互式初始化脚本：自动扫描子项目，生成 .doc-guard.yaml

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOC_GUARD_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
# 工作区根目录 = mcp-doc-guardian 的父目录（monorepo 根）
DEFAULT_ROOT="$(cd "${DOC_GUARD_DIR}/.." && pwd)"

echo "================================================"
echo "  doc-guard 初始化向导"
echo "================================================"
echo ""
echo "  mcp-doc-guardian 目录: ${DOC_GUARD_DIR}"
echo "  默认扫描工作区:        ${DEFAULT_ROOT}"
echo ""
echo "  提示：工作区是放有各子项目（如 lhx-care-server、lhx-care-web）"
echo "        的那一层目录，通常是 mcp-doc-guardian 的父目录。"
echo ""

# ──────────────────────────────────────────────
# 步骤1：确认工作区根目录
# ──────────────────────────────────────────────
echo -n "[步骤1] 工作区根目录 [${DEFAULT_ROOT}]（直接回车接受）: "
read -r custom_root
DOCGUARD_ROOT="${custom_root:-$DEFAULT_ROOT}"
echo "  → 使用: ${DOCGUARD_ROOT}"
echo ""

# ──────────────────────────────────────────────
# 步骤2：自动扫描子项目，识别技术栈
# ──────────────────────────────────────────────
echo "[步骤2] 扫描子项目..."

declare -a PROJECT_NAMES=()
declare -a PROJECT_TYPES=()
declare -a PROJECT_DIRS=()

detect_type() {
  local dir="$1"
  if [ -f "${dir}/pom.xml" ]; then
    echo "java-spring"
  elif [ -f "${dir}/build.gradle" ] || [ -f "${dir}/build.gradle.kts" ]; then
    echo "java-gradle"
  elif [ -f "${dir}/go.mod" ]; then
    echo "go"
  elif [ -f "${dir}/requirements.txt" ] || [ -f "${dir}/setup.py" ] || [ -f "${dir}/pyproject.toml" ]; then
    echo "python"
  elif grep -q '"uni-app"' "${dir}/package.json" 2>/dev/null; then
    echo "uniapp"
  elif [ -f "${dir}/manifest.json" ] && grep -q '"appid"' "${dir}/manifest.json" 2>/dev/null; then
    # uni-app 项目：有 manifest.json 且包含 appid 字段（无 package.json 的纯 uni-app）
    echo "uniapp"
  elif [ -f "${dir}/manifest.json" ] && [ ! -f "${dir}/package.json" ]; then
    # 有 manifest.json 但无 package.json，大概率也是 uni-app
    echo "uniapp"
  elif [ -f "${dir}/package.json" ] && grep -q '"react"' "${dir}/package.json" 2>/dev/null; then
    echo "react-ts"
  elif [ -f "${dir}/package.json" ]; then
    echo "vue-ts"
  else
    echo "unknown"
  fi
}

while IFS= read -r -d '' dir; do
  project_name="$(basename "${dir}")"
  # 跳过 mcp-doc-guardian 自身和隐藏目录
  if [[ "${project_name}" == "mcp-doc-guardian" ]] || [[ "${project_name}" == .* ]]; then
    continue
  fi
  if [ -f "${dir}/pom.xml" ] || [ -f "${dir}/package.json" ] || \
     [ -f "${dir}/go.mod" ] || [ -f "${dir}/requirements.txt" ] || \
     [ -f "${dir}/build.gradle" ] || [ -f "${dir}/manifest.json" ]; then
    detected_t=$(detect_type "${dir}")
    PROJECT_NAMES+=("${project_name}")
    PROJECT_TYPES+=("${detected_t}")
    PROJECT_DIRS+=("${dir}")
    echo "  发现: ${project_name}  →  ${detected_t}"
  fi
done < <(find "${DOCGUARD_ROOT}" -maxdepth 1 -mindepth 1 -type d -print0 | sort -z)

if [ ${#PROJECT_NAMES[@]} -eq 0 ]; then
  echo ""
  echo "  未在 ${DOCGUARD_ROOT} 下找到任何子项目。"
  echo "  请手动指定："
  echo -n "  项目名称: "
  read -r pname
  echo -n "  技术栈 (java-spring / vue-ts / react-ts / uniapp / go / python): "
  read -r ptype
  PROJECT_NAMES=("${pname}")
  PROJECT_TYPES=("${ptype}")
  PROJECT_DIRS=("${DOCGUARD_ROOT}/${pname}")
fi

# ──────────────────────────────────────────────
# 步骤3：确认识别结果（只在有误时才需要输入）
# ──────────────────────────────────────────────
echo ""
echo "  支持的技术栈: java-spring | java-gradle | vue-ts | react-ts | uniapp | go | python"
echo "  生成后可自行修改 .doc-guard.yaml，字段说明见："
echo "    ${DOC_GUARD_DIR}/docs/doc-guard-yaml-guide.md"
echo ""
echo "[步骤3] 确认识别结果（识别正确直接回车，有误则输入正确值）:"
echo ""

for i in "${!PROJECT_NAMES[@]}"; do
  echo -n "  ${PROJECT_NAMES[$i]} [${PROJECT_TYPES[$i]}]: "
  read -r correction
  if [ -n "${correction}" ]; then
    PROJECT_TYPES[$i]="${correction}"
    echo "    → 已修正为: ${correction}"
  fi
done

# ──────────────────────────────────────────────
# 步骤4：全局权限模式选择（只问一次）
# ──────────────────────────────────────────────
echo ""
echo "[步骤4] 文档写入权限（全部项目统一设置）:"
echo "  false      - AI 只读，不自动写文档"
echo "  stub_only  - AI 只追加骨架，不覆盖已有内容（推荐）"
echo "  full       - AI 可完整修改文档"
echo ""
echo -n "  选择模式 [stub_only]: "
read -r allow_write
allow_write="${allow_write:-stub_only}"
echo "  → 使用: ${allow_write}"

# ──────────────────────────────────────────────
# 生成配置
# ──────────────────────────────────────────────
echo ""
echo "================================================"
echo "  即将为以下项目生成 .doc-guard.yaml："
for i in "${!PROJECT_NAMES[@]}"; do
  echo "    ${PROJECT_NAMES[$i]}  (${PROJECT_TYPES[$i]})"
done
echo ""
echo -n "  确认生成？[Y/n]: "
read -r confirm
if [ "${confirm:-Y}" = "n" ] || [ "${confirm:-Y}" = "N" ]; then
  echo "  已取消。"
  exit 0
fi

echo ""
for i in "${!PROJECT_NAMES[@]}"; do
  project="${PROJECT_NAMES[$i]}"
  ptype="${PROJECT_TYPES[$i]}"
  project_dir="${PROJECT_DIRS[$i]}"
  yaml_path="${project_dir}/.doc-guard.yaml"

  if [ -f "${yaml_path}" ]; then
    echo -n "  ${project}: .doc-guard.yaml 已存在，覆盖？[y/N]: "
    read -r overwrite
    if [ "${overwrite:-N}" != "y" ] && [ "${overwrite:-N}" != "Y" ]; then
      echo "  → 跳过 ${project}"
      continue
    fi
  fi

  echo "  生成 ${project} (${ptype})..."

  # 根据技术栈构建 docs 配置段
  case "${ptype}" in
    java-spring|java-gradle)
      docs_section='docs:
  changelog:
    path: docs/changelogs/CHANGELOG.md
    pending_path: docs/changelogs/pending
    format: keepachangelog
  api:
    path: docs/api.md
    triggers:
      - "**/*Controller.java"
  database:
    path: docs/database.md
    triggers:
      - "**/*Entity.java"
      - "**/*Mapper.java"
      - "**/*Mapper.xml"
  overview:
    path: docs/overview.md
    triggers: []'
      controller_section='controller:
  pattern: "src/main/java/**/*Controller.java"
  annotation_regex: '"'"'@(GetMapping|PostMapping|PutMapping|DeleteMapping|RequestMapping|PatchMapping)'"'"'
'
      api_call_section=""
      ;;
    vue-ts|react-ts)
      docs_section='docs:
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
      - "src/**/*.tsx"'
      controller_section=""
      api_call_section='api_call:
  pattern: "src/**/*.{ts,vue,js}"
  call_regex: '"'"'(http|request|api)\.(get|post|put|delete|patch)\('"'"'
'
      ;;
    uniapp)
      docs_section='docs:
  changelog:
    path: docs/changelogs/CHANGELOG.md
    pending_path: docs/changelogs/pending
    format: keepachangelog
  api:
    path: docs/api.md
    triggers:
      - "**/*.vue"
      - "**/*.js"
      - "**/*.ts"
  overview:
    path: docs/overview.md
    triggers:
      - "pages/**/*.vue"'
      controller_section=""
      api_call_section='api_call:
  pattern: "src/**/*.{ts,vue,js}"
  call_regex: '"'"'(http|request|api)\.(get|post|put|delete|patch)\('"'"'
'
      ;;
    go)
      docs_section='docs:
  changelog:
    path: docs/changelogs/CHANGELOG.md
    pending_path: docs/changelogs/pending
    format: keepachangelog
  api:
    path: docs/api.md
    triggers:
      - "**/*.go"
  overview:
    path: docs/overview.md
    triggers: []'
      controller_section=""
      api_call_section='api_call:
  pattern: "**/*.go"
  call_regex: '"'"'http\.(Get|Post|Put|Delete|Patch)\('"'"'
'
      ;;
    python)
      docs_section='docs:
  changelog:
    path: docs/changelogs/CHANGELOG.md
    pending_path: docs/changelogs/pending
    format: keepachangelog
  api:
    path: docs/api.md
    triggers:
      - "**/*.py"
  overview:
    path: docs/overview.md
    triggers: []'
      controller_section=""
      api_call_section='api_call:
  pattern: "**/*.py"
  call_regex: '"'"'(requests|httpx)\.(get|post|put|delete|patch)\('"'"'
'
      ;;
    *)
      docs_section='docs:
  changelog:
    path: docs/changelogs/CHANGELOG.md
    pending_path: docs/changelogs/pending
    format: keepachangelog
  api:
    path: docs/api.md
    triggers: []
  overview:
    path: docs/overview.md
    triggers: []'
      controller_section=""
      api_call_section=""
      ;;
  esac

  cat > "${yaml_path}" <<EOF
# .doc-guard.yaml — 由 doc-guard-init.sh 生成
schema_version: "1.0"
project: ${project}
type: ${ptype}
mode: standalone
description: ""

${controller_section}${api_call_section}${docs_section}

team:
  my_role: agent1-implementer

skill:
  allow_doc_write: ${allow_write}
  changelog_format: "- [{status}][{date}] {description}"
EOF

  # 创建文档目录结构
  mkdir -p "${project_dir}/docs/changelogs/pending"
  mkdir -p "${project_dir}/docs/changelogs/released"
  mkdir -p "${project_dir}/docs/changes/active"
  mkdir -p "${project_dir}/docs/changes/archive"

  echo "    ✓ ${yaml_path}"
done

echo ""
echo "================================================"
echo "  初始化完成！"
echo ""
echo "  生成的 .doc-guard.yaml 已包含常用配置，"
echo "  如需调整（自定义触发路径、权限档位等），"
echo "  请参考配置说明文档："
echo "    ${DOC_GUARD_DIR}/docs/doc-guard-yaml-guide.md"
echo ""
echo "  下一步：在 AI Agent 对话框中发送："
echo "    请执行 doc_cold_start"
echo "================================================"
