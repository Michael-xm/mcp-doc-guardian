import * as fs from 'fs';
import * as path from 'path';
import type {
  DocGuardConfig,
  ProposeChangeArgs,
  ProposeChangeResult,
  ChangeListArgs,
  ChangeListResult,
  ChangeStatusArgs,
  ChangeStatusResult,
  ChangeArchiveArgs,
  ChangeArchiveResult,
} from '../types';
import { parseFrontMatter } from './claim-pending';

// ─────────────────────────────────────────────
// project_change_propose
// ─────────────────────────────────────────────

export async function projectChangeProposeImpl(
  args: ProposeChangeArgs,
  projects: DocGuardConfig[]
): Promise<ProposeChangeResult> {
  const config = projects.find((p) => p.project === args.project);
  if (!config) {
    return { error: true, code: 'FILE_NOT_FOUND', message: `项目 "${args.project}" 未找到` };
  }

  // v5.8 §5.4.3：活跃变更存放在 docs/changes/active/{id}/
  const activeRoot = path.join(config._root, 'docs', 'changes', 'active');
  const changeDir = path.join(activeRoot, args.id);
  if (fs.existsSync(changeDir)) {
    return {
      error: false,
      change_dir: path.relative(config._root, changeDir),
      created_files: [],
      next_steps: `变更 "${args.id}" 已存在，请直接编辑相关文件`,
    };
  }

  fs.mkdirSync(changeDir, { recursive: true });

  const createdFiles: string[] = [];
  const now = new Date().toISOString().split('T')[0];
  const affects = args.affects_projects?.join(', ') ?? '';

  // tasks.md
  const tasksMd = `# ${args.title} — 任务清单

> change_id: ${args.id}  
> change_type: ${args.change_type}  
> affects_projects: ${affects}  
> created: ${now}

## 任务列表

- [ ] 实现主逻辑
- [ ] 更新单元测试
- [ ] 更新 api.md [Draft]
- [ ] 更新 database.md [Draft]
- [ ] 更新 changelog pending

## 说明

待补充。
`;
  fs.writeFileSync(path.join(changeDir, 'tasks.md'), tasksMd, 'utf-8');
  createdFiles.push(`docs/changes/${args.id}/tasks.md`);

  // pending changelog stub
  const pendingDir = path.join(config._root, config.docs.changelog.pending_path);
  fs.mkdirSync(pendingDir, { recursive: true });
  const pendingFile = `${args.id}.md`;
  const pendingPath = path.join(pendingDir, pendingFile);

  if (!fs.existsSync(pendingPath)) {
    const pendingContent = `---
project: ${args.project}
change_id: ${args.id}
change_type: ${args.change_type}
affects_projects: ${affects}
branch: ""
author: ""
created: ${now}
status: draft
reviewing_since: null
reviewing_by: null
---

## ${args.title}

### Added
- 

### Changed
- 

### Fixed
- 
`;
    fs.writeFileSync(pendingPath, pendingContent, 'utf-8');
    createdFiles.push(`${config.docs.changelog.pending_path}/${pendingFile}`);
  }

  return {
    error: false,
    change_dir: path.relative(config._root, changeDir),
    created_files: createdFiles,
    next_steps: `请编辑 docs/changes/${args.id}/tasks.md 并完成任务清单，最后调用 project_change_archive 归档`,
  };
}

// ─────────────────────────────────────────────
// project_change_list
// ─────────────────────────────────────────────

export async function projectChangeListImpl(
  args: ChangeListArgs,
  projects: DocGuardConfig[]
): Promise<ChangeListResult> {
  const config = projects.find((p) => p.project === args.project);
  if (!config) {
    return { error: true, code: 'FILE_NOT_FOUND', message: `项目 "${args.project}" 未找到` };
  }

  // v5.8 §5.4.3：active/ 和 archive/ 两个子目录
  const changesRoot = path.join(config._root, 'docs', 'changes');
  const status = args.status ?? 'active';

  // 决定扫描哪个目录
  const targetDir = status === 'archived'
    ? path.join(changesRoot, 'archive')
    : path.join(changesRoot, 'active');

  if (!fs.existsSync(targetDir)) {
    return { error: false, changes: [] };
  }

  const dirs = fs.readdirSync(targetDir);
  const results: Array<{ id: string; title: string; completion_rate: number; status: string }> = [];

  for (const id of dirs) {
    const dirPath = path.join(targetDir, id);
    if (!fs.statSync(dirPath).isDirectory()) continue;

    const tasksPath = path.join(dirPath, 'tasks.md');
    let title = id;
    let completionRate = 0;

    if (fs.existsSync(tasksPath)) {
      const content = fs.readFileSync(tasksPath, 'utf-8');
      const titleMatch = content.match(/^#\s+(.+)/m);
      if (titleMatch) title = titleMatch[1].replace(/\s*—\s*任务清单$/, '');

      const checked = (content.match(/- \[x\]/gi) ?? []).length;
      const total = (content.match(/- \[[ x]\]/gi) ?? []).length;
      completionRate = total > 0 ? checked / total : 0;
    }

    results.push({
      id,
      title,
      completion_rate: completionRate,
      status,
    });
  }

  return { error: false, changes: results };
}

// ─────────────────────────────────────────────
// project_change_status
// ─────────────────────────────────────────────

export async function projectChangeStatusImpl(
  args: ChangeStatusArgs,
  projects: DocGuardConfig[]
): Promise<ChangeStatusResult> {
  const config = projects.find((p) => p.project === args.project);
  if (!config) {
    return { error: true, code: 'FILE_NOT_FOUND', message: `项目 "${args.project}" 未找到` };
  }

  // 先在 active/ 查找，再在 archive/ 查找
  const changesRoot = path.join(config._root, 'docs', 'changes');
  let changeDir = path.join(changesRoot, 'active', args.id);
  if (!fs.existsSync(changeDir)) {
    changeDir = path.join(changesRoot, 'archive', args.id);
  }
  if (!fs.existsSync(changeDir)) {
    return { error: true, code: 'FILE_NOT_FOUND', message: `变更 "${args.id}" 未找到` };
  }

  const tasksPath = path.join(changeDir, 'tasks.md');
  if (!fs.existsSync(tasksPath)) {
    return { error: true, code: 'FILE_NOT_FOUND', message: `tasks.md 未找到` };
  }

  const content = fs.readFileSync(tasksPath, 'utf-8');
  const allTasks = content.match(/- \[[ x]\]\s+(.+)/gi) ?? [];
  const completedTasks = content.match(/- \[x\]\s+(.+)/gi) ?? [];
  const pendingTasks = allTasks
    .filter((t) => !t.match(/- \[x\]/i))
    .map((t) => t.replace(/^- \[ \]\s*/, '').trim());

  const hasDraftMarks = /\[Draft\]/i.test(content);
  const total = allTasks.length;
  const completed = completedTasks.length;
  const completionRate = total > 0 ? completed / total : 0;

  return {
    error: false,
    change_id: args.id,
    tasks_total: total,
    tasks_completed: completed,
    completion_rate: completionRate,
    pending_tasks: pendingTasks,
    has_draft_marks: hasDraftMarks,
    ready_for_archive: completionRate >= 1.0 && !hasDraftMarks,
  };
}

// ─────────────────────────────────────────────
// project_change_archive
// ─────────────────────────────────────────────

export async function projectChangeArchiveImpl(
  args: ChangeArchiveArgs,
  projects: DocGuardConfig[]
): Promise<ChangeArchiveResult> {
  const config = projects.find((p) => p.project === args.project);
  if (!config) {
    return { error: true, code: 'FILE_NOT_FOUND', message: `项目 "${args.project}" 未找到` };
  }

  // v5.8 §5.4.3：active/{id}/ → archive/{id}/（移动目录）
  const changesRoot2 = path.join(config._root, 'docs', 'changes');
  const activeDir = path.join(changesRoot2, 'active', args.id);
  const archiveDir = path.join(changesRoot2, 'archive', args.id);

  // 幂等检查：已在 archive/ 则直接返回
  if (fs.existsSync(archiveDir)) {
    return {
      error: false,
      archived_to: path.relative(config._root, archiveDir),
      changelog_appended: false,
      idempotent: true,
    };
  }

  if (!fs.existsSync(activeDir)) {
    return { error: true, code: 'FILE_NOT_FOUND', message: `变更 "${args.id}" 在 active/ 中未找到` };
  }

  // 移动目录：active/{id} → archive/{id}
  fs.mkdirSync(path.join(changesRoot2, 'archive'), { recursive: true });
  fs.renameSync(activeDir, archiveDir);

  // 将 pending changelog 追加到正式 changelog，并写入 <!-- change-id: {id} --> 幂等标记
  const pendingFilePath = path.join(
    config._root,
    config.docs.changelog.pending_path,
    `${args.id}.md`
  );
  const changelogPath = path.join(config._root, config.docs.changelog.path);
  let changelogAppended = false;

  if (fs.existsSync(pendingFilePath)) {
    // 确保 changelog 文件存在
    if (!fs.existsSync(changelogPath)) {
      fs.mkdirSync(path.dirname(changelogPath), { recursive: true });
      fs.writeFileSync(changelogPath, `# Changelog\n\nAll notable changes to "${config.project}" will be documented here.\n`, 'utf-8');
    }

    const existing = fs.readFileSync(changelogPath, 'utf-8');

    // 幂等：若已含 change-id 标记则跳过追加
    if (!existing.includes(`<!-- change-id: ${args.id} -->`)) {
      const pendingContent = fs.readFileSync(pendingFilePath, 'utf-8');
      const body = pendingContent.replace(/^---[\s\S]*?---\r?\n/, '').trim();
      const now = new Date().toISOString().split('T')[0];
      const entry = `\n\n<!-- change-id: ${args.id} -->\n<!-- archived: ${now} -->\n\n${body}\n`;
      fs.appendFileSync(changelogPath, entry, 'utf-8');
      changelogAppended = true;
    }
  }

  return {
    error: false,
    archived_to: path.relative(config._root, archiveDir),
    changelog_appended: changelogAppended,
    idempotent: false,
  };
}
