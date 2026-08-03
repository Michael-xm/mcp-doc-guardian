#!/usr/bin/env bash
# scripts/doc-guard-init.sh
# 交互式初始化脚本：自动扫描子项目，生成 .doc-guard.yaml
# v5.8：含 O3 识别结果确认交互，步骤3 含 stub_only 询问

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== doc-guard 初始化向导 ==="
echo "工作目录: ${REPO_ROOT}"
echo ""

# ──────────────────────────────────────────────
# 步骤1：确认根目录
# ──────────────────────────────────────────────
echo "[步骤1] 扫描根目录"
echo -n "  DOCGUARD_ROOT [${REPO_ROOT}]: "
read -r custom_root
DOCGUARD_ROOT="${custom_root:-$REPO_ROOT}"
echo "  → 根目录: ${DOCGUARD_ROOT}"

# ──────────────────────────────────────────────
# 步骤2：自动扫描子项目，识别技术栈
# ──────────────────────────────────────────────
echo ""
echo "[步骤2] 自动扫描子项目和技术栈..."

declare -a DETECTED_PROJECTS=()
declare -a DETECTED_TYPES_ARR=()   # 与 DETECTED_PROJECTS 等长的并行数组，bash 3.2 兼容

# 按项目名获取类型
get_type() {
  local project="$1" i
  for i in "${!DETECTED_PROJECTS[@]}"; do
    if [ "${DETECTED_PROJECTS[$i]}" = "$project" ]; then
      echo "${DETECTED_TYPES_ARR[$i]}"
      return
    fi
  done
}

# 按项目名更新类型
set_type() {
  local project="$1" type="$2" i
  for i in "${!DETECTED_PROJECTS[@]}"; do
    if [ "${DETECTED_PROJECTS[$i]}" = "$project" ]; then
      DETECTED_TYPES_ARR[$i]="$type"
      return
    fi
  done
}

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
  elif [ -f "${dir}/package.json" ] && grep -q '"react"' "${dir}/package.json" 2>/dev/null; then
    echo "react-ts"
  elif [ -f "${dir}/package.json" ]; then
    echo "vue-ts"
  else
    echo "unknown"
  fi
}

# 扫描 DOCGUARD_ROOT 下的直接子目录
while IFS= read -r -d '' dir; do
  project_name="$(basename "${dir}")"
  # 跳过 doc-guard 自身和隐藏目录
  if [[ "${project_name}" == "doc-guard" ]] || [[ "${project_name}" == .* ]]; then
    continue
  fi
  # 跳过没有代码特征的目录
  if [ -f "${dir}/pom.xml" ] || [ -f "${dir}/package.json" ] || \
     [ -f "${dir}/go.mod" ] || [ -f "${dir}/requirements.txt" ] || \
     [ -f "${dir}/build.gradle" ]; then
    detected_t=$(detect_type "${dir}")
    DETECTED_PROJECTS+=("${project_name}")
    DETECTED_TYPES_ARR+=("${detected_t}")
    echo "  发现: ${project_name} (${detected_t})"
  fi
done < <(find "${DOCGUARD_ROOT}" -maxdepth 1 -mindepth 1 -type d -print0)

if [ ${#DETECTED_PROJECTS[@]} -eq 0 ]; then
  echo "  未扫描到子项目，请手动指定。"
  echo -n "  项目名称: "
  read -r pname
  echo -n "  技术栈类型 (java-spring/java-gradle/vue-ts/uniapp/go/python/react-ts): "
  read -r ptype
  DETECTED_PROJECTS=("${pname}")
  DETECTED_TYPES_ARR=("${ptype}")
fi

# ──────────────────────────────────────────────
# v5.8 O3：步骤2/3 之间插入识别结果确认交互
# ──────────────────────────────────────────────
echo ""
echo "=== 自动识别结果，请确认（直接回车接受，输入修正值后回车覆盖）==="
for project in "${DETECTED_PROJECTS[@]}"; do
  current_type="$(get_type "${project}")"
  echo -n "  ${project}: 检测为 ${current_type}  正确类型 [回车接受]: "
  read -r correction
  if [ -n "${correction}" ]; then
    set_type "${project}" "${correction}"
    echo "  → 已修正为: ${correction}"
  fi
done
echo ""
echo "=== 识别结果确认完毕，开始逐项目配置 ==="

# ──────────────────────────────────────────────
# 步骤3：逐项目生成 .doc-guard.yaml
# ──────────────────────────────────────────────
echo ""
echo "[步骤3] 生成项目配置..."

for project in "${DETECTED_PROJECTS[@]}"; do
  project_dir="${DOCGUARD_ROOT}/${project}"
  yaml_path="${project_dir}/.doc-guard.yaml"

  if [ -f "${yaml_path}" ]; then
    echo -n "  ${project}: .doc-guard.yaml 已存在，跳过？[Y/n]: "
    read -r skip
    if [ "${skip:-Y}" = "Y" ] || [ "${skip:-Y}" = "y" ]; then
      echo "  → 跳过 ${project}"
      continue
    fi
  fi

  ptype="$(get_type "${project}")"
  echo "  配置 ${project} (${ptype})..."

  # 询问是否启用 stub_only（v5.6 新增）
  echo -n "  是否启用文档骨架自动写入（stub_only 模式）？可避免遗漏条目 [y/N]: "
  read -r enable_stub
  use_stub="false"
  if [ "${enable_stub}" = "y" ] || [ "${enable_stub}" = "Y" ]; then
    use_stub="stub_only"
    echo "  → 已启用 stub_only"
  fi

  # 生成默认 docs/ 结构
  docs_section=""
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
      ;;
  esac

  # java 类型额外需要 controller 字段
  controller_section=""
  if [ "${ptype}" = "java-spring" ] || [ "${ptype}" = "java-gradle" ]; then
    controller_section='controller:
  pattern: "src/main/java/**/*Controller.java"
  annotation_regex: "@(GetMapping|PostMapping|PutMapping|DeleteMapping|RequestMapping|PatchMapping)"
'
  fi

  # 非 java 类型需要 api_call 字段
  api_call_section=""
  if [ "${ptype}" != "java-spring" ] && [ "${ptype}" != "java-gradle" ]; then
    api_call_section='api_call:
  pattern: "src/**/*.{ts,vue,js}"
  call_regex: "(http|request|api)\\.(get|post|put|delete|patch)\\("
'
  fi

  # 写入 YAML
  cat > "${yaml_path}" <<EOF
# .doc-guard.yaml - 由 doc-guard-init.sh 生成
# Doc-Guard v5.8 配置文件
schema_version: "1.0"
project: ${project}
type: ${ptype}
mode: standalone
description: ""

${controller_section}${api_call_section}${docs_section}

team:
  my_role: agent1-implementer
  # members:
  #   - id: agent2-reviewer
  #     role: reviewer

skill:
  allow_doc_write: ${use_stub}
  changelog_format: "- [{status}][{date}] {description}"
EOF

  # 创建文档目录结构
  mkdir -p "${project_dir}/docs/changelogs/pending"
  mkdir -p "${project_dir}/docs/changelogs/released"
  mkdir -p "${project_dir}/docs/changes/active"
  mkdir -p "${project_dir}/docs/changes/archive"

  echo "  → ${yaml_path} 已生成"
  echo "  → docs/ 目录结构已创建"
done

echo ""
echo "=== 初始化完成 ==="
echo ""
echo "下一步：在 AI Agent 对话框中发送：请执行 doc_cold_start"
