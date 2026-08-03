#!/usr/bin/env bash
# ================================================================
# setup-skills.sh — 将 Skill 模板合并到 CodeBuddy skills 目录
# ================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOC_GUARD_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$DOC_GUARD_DIR/docs/templates/skill-template.yaml"

# CodeBuddy skills 目录（可通过环境变量覆盖）
SKILLS_DIR="${CODEBUDDY_SKILLS_DIR:-$HOME/.codebuddy/skills}"

if [ ! -f "$TEMPLATE" ]; then
  echo "[WARN] skill-template.yaml 未找到: $TEMPLATE"
  exit 0
fi

mkdir -p "$SKILLS_DIR"

TARGET="$SKILLS_DIR/doc-guard.skill.yaml"

# 如果已存在，做备份
if [ -f "$TARGET" ]; then
  cp "$TARGET" "${TARGET}.bak.$(date +%Y%m%d%H%M%S)"
  echo "    已备份现有 skill 文件"
fi

cp "$TEMPLATE" "$TARGET"
echo "    Skill 文件已安装到: $TARGET"

# 处理 extra_triggers（扫描所有 .doc-guard.yaml 中的 skill.extra_triggers）
if command -v node &>/dev/null; then
  node - "$DOC_GUARD_DIR" "$TARGET" <<'EOF'
const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

async function main() {
  const [,, root, skillFile] = process.argv;
  const configs = await glob('**/.doc-guard.yaml', {
    cwd: root,
    ignore: ['**/node_modules/**'],
    absolute: true,
  });

  const extraTriggers = new Set();

  for (const cfg of configs) {
    try {
      const content = fs.readFileSync(cfg, 'utf-8');
      const match = content.match(/extra_triggers:\s*\n((?:\s+-\s+.+\n)*)/);
      if (match) {
        for (const line of match[1].split('\n')) {
          const trigger = line.trim().replace(/^-\s*/, '');
          if (trigger) extraTriggers.add(trigger);
        }
      }
    } catch {}
  }

  if (extraTriggers.size === 0) return;

  let skillContent = fs.readFileSync(skillFile, 'utf-8');
  const insertPoint = '# [extra_triggers_placeholder]';
  if (skillContent.includes(insertPoint)) {
    const triggerYaml = [...extraTriggers].map(t => `  - "${t}"`).join('\n');
    skillContent = skillContent.replace(insertPoint, triggerYaml);
    fs.writeFileSync(skillFile, skillContent, 'utf-8');
    console.log(`    已合并 ${extraTriggers.size} 个 extra_triggers`);
  }
}

main().catch(e => console.warn('[WARN] extra_triggers 合并失败:', e.message));
EOF
fi

echo "    Skills 安装完成"
