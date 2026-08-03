#!/usr/bin/env node
/**
 * scripts/notify-agent2.js
 * git post-merge hook 调用：解析 .review-requested/ 标记文件，
 * 通过 kiro-cli 触发 Agent2（验收者）执行审查流程。
 *
 * 用法（由 .git/hooks/post-merge 调用）：
 *   node scripts/notify-agent2.js .review-requested/20260731-user-auth.md
 *
 * v5.8 O8：fallback 路径已从 .task.txt 迁移为 .agent2-queue.jsonl
 */

const fs   = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// ──────────────────────────────────────────────
// 1. 解析入参
// ──────────────────────────────────────────────
const reviewFile = process.argv[2];
if (!reviewFile || !fs.existsSync(reviewFile)) {
  console.error('[notify-agent2] 错误：未找到 review 标记文件：', reviewFile);
  process.exit(1);
}

// 标记文件名即变更 ID（去掉 .md 后缀）
const changeId = path.basename(reviewFile, '.md');

// ──────────────────────────────────────────────
// 2. 读取标记文件内容（YAML front matter 可选）
// ──────────────────────────────────────────────
const rawContent = fs.readFileSync(reviewFile, 'utf-8').trim();

// 尝试解析简单 key: value front matter（不引入 js-yaml 依赖）
function parseFrontMatter(content) {
  const meta = {};
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return meta;
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) meta[key.trim()] = rest.join(':').trim();
  }
  return meta;
}

const meta = parseFrontMatter(rawContent);
const project    = meta.project     || '（未指定）';
const changeType = meta.change_type || 'unknown';
const title      = meta.title       || changeId;

// ──────────────────────────────────────────────
// 3. 检查 kiro-cli 是否可用
// ──────────────────────────────────────────────
function commandExists(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────
// 4. 构造 Agent2 任务提示词
// ──────────────────────────────────────────────
const taskPrompt = [
  `[Agent2 验收任务] 变更 ID: ${changeId}`,
  `项目: ${project} | 类型: ${changeType} | 标题: ${title}`,
  '',
  '请按 docs/agents/reviewer-prompt.md 的 SOP 执行以下步骤：',
  '1. 调用 project_change_list({ status: "ready_for_review" }) 确认待审清单',
  `2. 调用 claim_pending({ project: "${project}", filename: "${changeId}", reviewer_id: "agent2" })`,
  '3. 代码审查：检查变更文件，若涉及多项目调用 cross_ref_check()',
  '4. 文档审查：调用 check_api_sync()、scan_draft()，移除所有 [Draft] 标记',
  `5. 归档：调用 project_change_archive({ project: "${project}", id: "${changeId}" })`,
  `6. 清理标记文件：删除 ${reviewFile}`,
  '7. 反馈审查结论（代码/文档/健康评分）',
].join('\n');

// ──────────────────────────────────────────────
// 5. 触发 Agent2
// ──────────────────────────────────────────────
if (commandExists('kiro-cli')) {
  console.log(`[notify-agent2] 触发 Agent2，变更 ID: ${changeId}`);
  const result = spawnSync(
    'kiro-cli',
    ['agent', '--task', taskPrompt, '--agent', 'agent2-reviewer'],
    { stdio: 'inherit', shell: false }
  );
  if (result.status !== 0) {
    console.error('[notify-agent2] kiro-cli 启动失败，退出码:', result.status);
    // 降级：写入队列文件
    appendToQueue();
    process.exit(0); // 不阻断 git hook，仅告警
  }
} else {
  // kiro-cli 不可用：写入 .agent2-queue.jsonl（v5.8 O8：废弃 .task.txt）
  appendToQueue();
  console.warn(
    `[notify-agent2] kiro-cli 不可用，已将任务追加至 .review-requested/.agent2-queue.jsonl`,
    '\n请手动执行 Agent2 审查流程，或安装 kiro-cli 后重新运行。'
  );
  // 不 exit(1)，不阻断 git hook
}

function appendToQueue() {
  const queueFile = path.join('.review-requested', '.agent2-queue.jsonl');
  const entry = JSON.stringify({
    changeId,
    project,
    title,
    changeType,
    createdAt: new Date().toISOString(),
    processed: false,
    prompt: taskPrompt
  });
  // 确保目录存在
  const dir = path.dirname(queueFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(queueFile, entry + '\n', 'utf-8');
  console.log(`[notify-agent2] 任务已追加至 ${queueFile}，changeId: ${changeId}`);
}
