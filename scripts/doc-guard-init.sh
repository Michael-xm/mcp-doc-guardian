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
echo "  提示：工作区是放有各子项目（如 my-server、my-web）"
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
# 步骤5：Steering 注入配置
# ──────────────────────────────────────────────
echo ""
echo "[步骤5] 自定义指令同步（Steering 注入）"
echo "  Steering 注入可将文档规则自动同步到 AI 工具的规则文件，"
echo "  让 Kiro / Cursor / CodeBuddy / Claude / Trae / Cline / Windsurf 遵守你的文档规范。"
echo ""

# 检测已安装的 AI 工具
DETECTED_CLIS=""
[ -d "${HOME}/.kiro" ] || command -v kiro &>/dev/null && DETECTED_CLIS="${DETECTED_CLIS} kiro"
[ -d "${HOME}/.cursor" ] || command -v cursor &>/dev/null && DETECTED_CLIS="${DETECTED_CLIS} cursor"
[ -d "${HOME}/.codebuddy" ] && DETECTED_CLIS="${DETECTED_CLIS} codebuddy"
[ -d "${HOME}/.claude" ] || command -v claude &>/dev/null && DETECTED_CLIS="${DETECTED_CLIS} claude"
[ -d "${HOME}/.trae" ] || command -v trae &>/dev/null && DETECTED_CLIS="${DETECTED_CLIS} trae"
ls "${HOME}/.vscode/extensions/" 2>/dev/null | grep -q 'saoudrizwan.claude-dev' && DETECTED_CLIS="${DETECTED_CLIS} cline"
[ -d "${HOME}/.codeium/windsurf" ] && DETECTED_CLIS="${DETECTED_CLIS} windsurf"
DETECTED_CLIS="${DETECTED_CLIS# }"

if [ -n "${DETECTED_CLIS}" ]; then
  echo "  检测到已安装的 AI 工具: ${DETECTED_CLIS}"
else
  echo "  未检测到已安装的 AI 工具（手动填写或跳过）。"
fi
echo ""

echo -n "  是否开启 Steering 注入？[y/N]: "
read -r enable_steering
STEERING_ENABLED="false"
if [ "${enable_steering:-N}" = "y" ] || [ "${enable_steering:-N}" = "Y" ]; then
  STEERING_ENABLED="true"
fi

# ── 若开启 Steering，立即按项目逐一让用户选择要注入的文档类型 ──
# 用并行数组模拟关联数组（兼容 macOS bash 3.2 不支持 declare -A）
PROJ_STEERING_KEYS=()
PROJ_STEERING_VALS=()
if [ "${STEERING_ENABLED}" = "true" ]; then
  # 每个项目的 docs_section 需要在此处临时构建（与生成循环保持一致）
  _build_docs_section() {
    local _ptype="$1"
    case "${_ptype}" in
      java-spring|java-gradle)
        echo 'docs:
  changelog:
    path: docs/changelogs/CHANGELOG.md
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
    triggers: []
  git:
    path: docs/git.md' ;;
      vue-ts|react-ts)
        echo 'docs:
  changelog:
    path: docs/changelogs/CHANGELOG.md
  api:
    path: docs/api.md
    triggers:
      - "src/api/**/*.ts"
  env:
    path: docs/env.md
    triggers:
      - ".env*"
  overview:
    path: docs/overview.md
    triggers:
      - "src/**/*.vue"
      - "src/**/*.tsx"
  git:
    path: docs/git.md' ;;
      uniapp)
        echo 'docs:
  changelog:
    path: docs/changelogs/CHANGELOG.md
  api:
    path: docs/api.md
    triggers: []
  pages:
    path: docs/pages.md
    triggers: []
  env:
    path: docs/env.md
    triggers: []
  overview:
    path: docs/overview.md
    triggers: []
  git:
    path: docs/git.md' ;;
      *)
        echo 'docs:
  changelog:
    path: docs/changelogs/CHANGELOG.md
  api:
    path: docs/api.md
    triggers: []
  overview:
    path: docs/overview.md
    triggers: []
  git:
    path: docs/git.md' ;;
    esac
  }

  _desc_for_type() {
    case "$1" in
      overview)  echo "项目概览文档" ;;
      database)  echo "数据库结构文档" ;;
      api)       echo "接口文档" ;;
      changelog) echo "变更日志" ;;
      env)       echo "环境变量文档" ;;
      pages)     echo "页面路由文档" ;;
      git)       echo "Git 提交规范文档" ;;
      *)         echo "$1" ;;
    esac
  }

  for _pi in "${!PROJECT_NAMES[@]}"; do
    _proj="${PROJECT_NAMES[$_pi]}"
    _ptype="${PROJECT_TYPES[$_pi]}"
    _dsec="$(_build_docs_section "${_ptype}")"

    # 提取 docs_section 中的一级节点名
    _AVAIL_TYPES=()
    _AVAIL_DESCS=()
    while IFS= read -r _line; do
      if [[ "${_line}" =~ ^[[:space:]]{2}([a-zA-Z_][a-zA-Z0-9_-]*):$ ]]; then
        _tname="${BASH_REMATCH[1]}"
        _AVAIL_TYPES+=("${_tname}")
        _AVAIL_DESCS+=("$(_desc_for_type "${_tname}")")
      fi
    done <<< "${_dsec}"

    # 默认注入类型：database / overview / pages / env / git（与可用类型取交集）
    _DEFAULT_INJECT=( database overview pages env git )
    _types_str=""
    _selected_names=()
    for _dt in "${_DEFAULT_INJECT[@]}"; do
      for _at in "${_AVAIL_TYPES[@]}"; do
        if [ "${_at}" = "${_dt}" ]; then
          _types_str="${_types_str}    - ${_dt}"$'\n'
          _selected_names+=("${_dt}")
          break
        fi
      done
    done

    echo ""
    echo "  ┌─ [${_proj}] 默认注入文档类型 ─────────────────────────────"
    for _dn in "${_selected_names[@]}"; do
      echo "  │   ✓  ${_dn}  — $(_desc_for_type "${_dn}")"
    done
    echo "  └────────────────────────────────────────────────────────"
    echo ""

    PROJ_STEERING_KEYS+=("${_proj}")
    PROJ_STEERING_VALS+=("${_types_str}")
  done

  echo ""
  echo "  ╔══════════════════════════════════════════════════════════╗"
  echo "  ║  💡 自定义注入文档类型                                    ║"
  echo "  ║                                                          ║"
  echo "  ║  如需注入自定义文档类型（如 pages、env、deploy 等），      ║"
  echo "  ║  请在生成后编辑 .doc-guard.yaml：                        ║"
  echo "  ║    1. 在 docs: 下添加自定义节点                           ║"
  echo "  ║    2. 将类型名追加到 steering.doc_types 列表              ║"
  echo "  ║                                                          ║"
  echo "  ║  参考：mcp-doc-guardian/docs/doc-guard-yaml-guide.md     ║"
  echo "  ╚══════════════════════════════════════════════════════════╝"
  echo ""
fi

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
    triggers: []
  git:
    path: docs/git.md
    auto_write_template: mcp-doc-guardian/docs/agents/git-prompt.md'
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
    auto_write_template: mcp-doc-guardian/docs/agents/api-prompt.md
  env:
    path: docs/env.md
    triggers:
      - ".env*"
    auto_write_template: mcp-doc-guardian/docs/agents/env-prompt.md
  overview:
    path: docs/overview.md
    triggers:
      - "src/**/*.vue"
      - "src/**/*.tsx"
    auto_write_template: mcp-doc-guardian/docs/agents/overview-prompt.md
  git:
    path: docs/git.md
    auto_write_template: mcp-doc-guardian/docs/agents/git-prompt.md'
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
    auto_write_template: mcp-doc-guardian/docs/agents/api-prompt.md
  pages:
    path: docs/pages.md
    triggers:
      - "src/pages/**"
    auto_write_template: mcp-doc-guardian/docs/agents/pages-prompt.md
  env:
    path: docs/env.md
    triggers:
      - ".env*"
    auto_write_template: mcp-doc-guardian/docs/agents/env-prompt.md
  overview:
    path: docs/overview.md
    triggers:
      - "pages/**/*.vue"
    auto_write_template: mcp-doc-guardian/docs/agents/overview-prompt.md
  git:
    path: docs/git.md
    auto_write_template: mcp-doc-guardian/docs/agents/git-prompt.md'
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
    triggers: []
  git:
    path: docs/git.md
    auto_write_template: mcp-doc-guardian/docs/agents/git-prompt.md'
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
    triggers: []
  git:
    path: docs/git.md
    auto_write_template: mcp-doc-guardian/docs/agents/git-prompt.md'
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
    triggers: []
  git:
    path: docs/git.md
    auto_write_template: mcp-doc-guardian/docs/agents/git-prompt.md'
      controller_section=""
      api_call_section=""
      ;;
  esac

  # ── 从步骤5预先收集的并行数组取该项目的 steering.doc_types ──
  STEERING_DOC_TYPES=""
  for _ki in "${!PROJ_STEERING_KEYS[@]}"; do
    if [ "${PROJ_STEERING_KEYS[$_ki]}" = "${project}" ]; then
      STEERING_DOC_TYPES="${PROJ_STEERING_VALS[$_ki]}"
      break
    fi
  done

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

  # 构建 cli 列表（回填检测到的工具）
  CLI_YAML=""
  if [ -n "${DETECTED_CLIS}" ]; then
    for _cli_item in ${DETECTED_CLIS}; do
      CLI_YAML="${CLI_YAML}    - ${_cli_item}"$'\n'
    done
    CLI_YAML="  cli:"$'\n'"${CLI_YAML}"
  else
    CLI_YAML="  cli: []"$'\n'
  fi

  # 追加 steering 配置
  if [ "${STEERING_ENABLED}" = "true" ]; then
    printf '\nsteering:\n  enabled: true\n  doc_types:\n%s%s' \
      "${STEERING_DOC_TYPES}" "${CLI_YAML}" >> "${yaml_path}"

    # 给 doc_types 里每个 doc 节点注入 steering.inject: true
    # 用 Python 解析 YAML，避免 sed 误伤
    _inject_types=""
    for _line in ${STEERING_DOC_TYPES}; do
      _type="${_line#- }"
      _inject_types="${_inject_types} ${_type}"
    done
    python3 - "${yaml_path}" ${_inject_types} <<'PYEOF'
import sys, re

yaml_path = sys.argv[1]
inject_types = set(sys.argv[2:])

with open(yaml_path, 'r') as f:
    lines = f.readlines()

result = []
i = 0
in_docs = False
current_doc = None
doc_indent = '  '

while i < len(lines):
    line = lines[i]
    stripped = line.rstrip('\n')

    # 进入 docs: 块
    if re.match(r'^docs:\s*$', stripped):
        in_docs = True
        result.append(line)
        i += 1
        continue

    # 离开 docs: 块（遇到同级或更高级的非空行）
    if in_docs and stripped and not stripped.startswith(' ') and not stripped.startswith('\t'):
        in_docs = False
        current_doc = None

    if in_docs:
        # 匹配二级 doc 节点名（如 "  database:"）
        m = re.match(r'^  ([a-zA-Z_][a-zA-Z0-9_-]*):\s*$', stripped)
        if m:
            current_doc = m.group(1)
            result.append(line)
            i += 1
            # 收集该 doc 的子行，找合适的位置插入 steering.inject
            if current_doc in inject_types:
                sub_lines = []
                has_steering = False
                while i < len(lines):
                    sub = lines[i].rstrip('\n')
                    # 遇到同级或更高级节点，停止
                    if sub and not sub.startswith('   ') and not sub.startswith('\t'):
                        break
                    if re.match(r'^    steering:\s*$', sub):
                        has_steering = True
                        sub_lines.append(lines[i])
                        i += 1
                        # 检查 inject 是否已存在
                        inject_exists = False
                        while i < len(lines):
                            s2 = lines[i].rstrip('\n')
                            if s2 and not s2.startswith('     ') and not re.match(r'^      ', s2):
                                break
                            if re.match(r'^      inject:', s2):
                                inject_exists = True
                            sub_lines.append(lines[i])
                            i += 1
                        if not inject_exists:
                            sub_lines.append('      inject: true\n')
                        break
                    else:
                        sub_lines.append(lines[i])
                        i += 1
                result.extend(sub_lines)
                if not has_steering:
                    result.append('    steering:\n')
                    result.append('      inject: true\n')
            continue
        result.append(line)
        i += 1
        continue

    result.append(line)
    i += 1

with open(yaml_path, 'w') as f:
    f.writelines(result)

print(f"  → inject 注入完成: {inject_types}")
PYEOF
  else
    printf '\nsteering:\n  enabled: false\n  doc_types: []\n  cli: []\n' >> "${yaml_path}"
  fi

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
