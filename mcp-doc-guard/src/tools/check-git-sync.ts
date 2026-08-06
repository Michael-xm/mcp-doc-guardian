import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type {
  CheckGitSyncArgs,
  CheckGitSyncResult,
  GitCommitInfo,
  GitBranchInfo,
  ToolError,
} from '../types';
import type { DocGuardConfig } from '../types';
import { PACKAGE_ROOT } from '../config-loader';

// ── Commit 规范 ───────────────────────────────────────────────

/** 合规的 commit type 枚举 */
const VALID_TYPES = new Set([
  'feat', 'fix', 'perf', 'refactor', 'docs',
  'types', 'test', 'ci', 'revert', 'chore',
]);

/**
 * 匹配 "type: message" 或 "type(scope): message"
 * 要求：英文冒号、冒号后有空格、message 非空
 */
const COMMIT_FORMAT_RE = /^([a-z]+)(\([^)]+\))?!?: .+/;

function parseCommit(subject: string): Pick<GitCommitInfo, 'compliant' | 'type' | 'violation'> {
  const trimmed = subject.trim();

  // 空白或 Merge/Revert commit 跳过规范检查
  if (!trimmed || /^(Merge|Revert)\b/i.test(trimmed)) {
    return { compliant: true, type: null };
  }

  const match = COMMIT_FORMAT_RE.exec(trimmed);
  if (!match) {
    return {
      compliant: false,
      type: null,
      violation: `格式不合规：应为 "type: message" 或 "type(scope): message"，实际为 "${trimmed}"`,
    };
  }

  const type = match[1];
  if (!VALID_TYPES.has(type)) {
    return {
      compliant: false,
      type,
      violation: `type "${type}" 不在枚举范围内（${[...VALID_TYPES].join('/')}）`,
    };
  }

  // message 长度检查（含 type: 前缀）
  if (trimmed.length > 72) {
    return {
      compliant: false,
      type,
      violation: `提交信息超过 72 个字符（当前 ${trimmed.length} 字符），请将详情写入 commit body`,
    };
  }

  return { compliant: true, type };
}

// ── 分支规范 ───────────────────────────────────────────────────

const BRANCH_PATTERNS: Array<{ re: RegExp; type: string }> = [
  { re: /^main$|^master$/, type: 'main' },
  { re: /^develop$/, type: 'develop' },
  { re: /^feat\//, type: 'feat' },
  { re: /^fix\//, type: 'fix' },
  { re: /^release\//, type: 'release' },
  { re: /^hotfix\//, type: 'hotfix' },
  { re: /^gh-pages$/, type: 'gh-pages' },
  { re: /^chore\//, type: 'chore' },
  { re: /^refactor\//, type: 'refactor' },
  { re: /^docs\//, type: 'docs' },
  { re: /^test\//, type: 'test' },
];

function parseBranch(name: string): GitBranchInfo {
  for (const { re, type } of BRANCH_PATTERNS) {
    if (re.test(name)) {
      return { name, compliant: true, branch_type: type };
    }
  }
  return {
    name,
    compliant: false,
    branch_type: null,
    violation: `分支名 "${name}" 不符合规范，应以 feat/、fix/、release/、hotfix/ 等前缀开头，或为 main/master/develop/gh-pages`,
  };
}

// ── Git 工具函数 ───────────────────────────────────────────────

function getCurrentBranch(root: string): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: root, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function getHeadCommit(root: string): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf-8' }).trim().slice(0, 8);
  } catch {
    return 'unknown';
  }
}

function getChangedFiles(root: string, base: string): string[] {
  try {
    return execSync(`git diff ${base} --name-only`, { cwd: root, encoding: 'utf-8' })
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * 获取 base..HEAD 范围内的提交列表
 * 格式：hash\x1fsubject\x1fauthor\x1fdate
 */
function getCommitLog(root: string, base: string): GitCommitInfo[] {
  try {
    const raw = execSync(
      `git log ${base}..HEAD --format="%H\x1f%s\x1f%an\x1f%ad" --date=short`,
      { cwd: root, encoding: 'utf-8' }
    ).trim();

    if (!raw) return [];

    return raw.split('\n').map((line) => {
      const [hash, subject, author, date] = line.split('\x1f');
      const parsed = parseCommit(subject ?? '');
      return {
        hash: (hash ?? '').slice(0, 8),
        subject: subject ?? '',
        author: author ?? '',
        date: date ?? '',
        ...parsed,
      };
    });
  } catch {
    return [];
  }
}

// ── 拆分建议 ──────────────────────────────────────────────────

/** 根据文件扩展名 / 路径推断建议的 commit type */
function inferType(file: string): string {
  const lower = file.toLowerCase();
  if (lower.includes('test') || lower.includes('spec') || lower.endsWith('.test.ts') || lower.endsWith('.spec.ts')) return 'test';
  if (lower.endsWith('.md') || lower.includes('docs/')) return 'docs';
  if (lower.includes('.github/') || lower.includes('ci/') || lower.includes('.gitlab-ci')) return 'ci';
  if (lower.endsWith('.json') && (lower.includes('package') || lower.includes('config'))) return 'chore';
  if (lower.includes('config/') || lower.endsWith('.yaml') || lower.endsWith('.yml') || lower.endsWith('.env')) return 'chore';
  return 'feat';
}

function buildSplitSuggestion(
  files: string[]
): CheckGitSyncResult['split_suggestion'] {
  if (files.length === 0) return undefined;

  const groups = new Map<string, string[]>();
  for (const f of files) {
    const t = inferType(f);
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t)!.push(f);
  }

  if (groups.size <= 1) return undefined; // 单类型无需拆分

  return [...groups.entries()].map(([type, groupFiles]) => ({
    suggested_type: type,
    files: groupFiles,
    suggested_message: `${type}: ${describeFiles(groupFiles)}`,
  }));
}

function describeFiles(files: string[]): string {
  if (files.length === 1) {
    return `更新 ${path.basename(files[0])}`;
  }
  const dirs = [...new Set(files.map((f) => f.split('/')[0]))];
  return `更新 ${dirs.slice(0, 2).join('、')} 等 ${files.length} 个文件`;
}

// ── 提示词加载 ────────────────────────────────────────────────

function loadWritePrompt(templatePath: string, projectRoot: string): string | undefined {
  try {
    let resolved: string;
    if (path.isAbsolute(templatePath)) {
      resolved = templatePath;
    } else if (templatePath.startsWith('.')) {
      resolved = path.resolve(projectRoot, templatePath);
    } else {
      resolved = path.resolve(PACKAGE_ROOT, templatePath);
    }
    if (!fs.existsSync(resolved)) return undefined;
    return fs.readFileSync(resolved, 'utf-8');
  } catch {
    return undefined;
  }
}

// ── 主函数 ────────────────────────────────────────────────────

export async function checkGitSync(
  args: CheckGitSyncArgs,
  projects: DocGuardConfig[]
): Promise<CheckGitSyncResult | ToolError> {
  const { project, base = 'HEAD~1', files: filterFiles } = args;

  const config = projects.find((p) => p.project === project);
  if (!config) {
    return { error: true, code: 'FILE_NOT_FOUND', message: `项目 "${project}" 未找到` };
  }

  const root = config._root;

  // 检查是否为 git 仓库
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: root, encoding: 'utf-8' });
  } catch {
    return { error: true, code: 'NOT_GIT_REPO', message: `"${root}" 不是 Git 仓库` };
  }

  const branch = getCurrentBranch(root);
  const headCommit = getHeadCommit(root);
  const gitContext = { branch, head_commit: headCommit, base };

  // 分支规范检查
  const branchCheck = parseBranch(branch);

  // 获取变更文件
  let changedFiles = getChangedFiles(root, base);
  if (filterFiles && filterFiles.length > 0) {
    const filterSet = new Set(filterFiles);
    changedFiles = changedFiles.filter((f) => filterSet.has(f));
  }

  // 获取提交列表
  const commits = getCommitLog(root, base);
  const nonCompliantCount = commits.filter((c) => !c.compliant).length;
  const overallCompliant = branchCheck.compliant && nonCompliantCount === 0;

  // 拆分建议（有多类型文件时给出）
  const splitSuggestion = buildSplitSuggestion(changedFiles);

  // 加载写作提示词
  const templatePath =
    (config.docs.git as { auto_write_template?: string } | undefined)?.auto_write_template ??
    'mcp-doc-guardian/docs/agents/git-prompt.md';
  const write_prompt = loadWritePrompt(templatePath, root);

  // 生成 detail 摘要
  const detailParts: string[] = [];
  if (!branchCheck.compliant) {
    detailParts.push(`分支命名不规范：${branchCheck.violation}`);
  }
  if (nonCompliantCount > 0) {
    const violations = commits
      .filter((c) => !c.compliant)
      .map((c) => `  · ${c.hash} ${c.subject}（${c.violation}）`);
    detailParts.push(`${nonCompliantCount} 条提交不符合规范：\n${violations.join('\n')}`);
  }
  if (splitSuggestion) {
    detailParts.push(`检测到 ${splitSuggestion.length} 种变更类型，建议拆分提交`);
  }
  if (overallCompliant) {
    detailParts.push('当前分支和提交记录均符合 Git 规范');
  }

  return {
    project,
    git_context: gitContext,
    branch_check: branchCheck,
    commits,
    non_compliant_count: nonCompliantCount,
    compliant: overallCompliant,
    changed_files: changedFiles,
    ...(splitSuggestion ? { split_suggestion: splitSuggestion } : {}),
    ...(write_prompt ? { write_prompt } : {}),
    detail: detailParts.join('\n'),
  };
}
