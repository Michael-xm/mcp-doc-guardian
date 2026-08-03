import * as fs from 'fs';
import * as path from 'path';
import type { DocGuardConfig, ChangelogStatusResult, ToolError, PendingFileMeta } from '../types';

function parseFrontMatter(content: string): PendingFileMeta {
  const meta: PendingFileMeta = {};
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return meta;

  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();
    if (key === 'branch') meta.branch = val;
    else if (key === 'author') meta.author = val;
    else if (key === 'created') meta.created = val;
    else if (key === 'status') meta.status = val as PendingFileMeta['status'];
    else if (key === 'reviewing_since') meta.reviewing_since = val === 'null' ? null : val;
    else if (key === 'reviewing_by') meta.reviewing_by = val === 'null' ? null : val;
    else if (key === 'project') meta.project = val;
    else if (key === 'change_type') meta.change_type = val;
  }
  return meta;
}

export interface ChangelogStatusArgs {
  project?: string;
}

export type ChangelogStatusOutput =
  | Array<{ project: string } & ChangelogStatusResult>
  | ToolError;

export async function changelogStatus(
  args: ChangelogStatusArgs,
  projects: DocGuardConfig[]
): Promise<ChangelogStatusOutput> {
  const targets = args.project
    ? projects.filter((p) => p.project === args.project)
    : projects;

  if (args.project && targets.length === 0) {
    return { error: true, code: 'FILE_NOT_FOUND', message: `项目 "${args.project}" 未找到` };
  }

  return targets.map((config) => {
    const pendingDir = path.join(config._root, config.docs.changelog.pending_path);
    if (!fs.existsSync(pendingDir)) {
      return {
        project: config.project,
        has_pending: false,
        pending_files: [],
        pending_branches: [],
        pending_count: 0,
        by_status: { draft: [], ready_for_review: [], reviewing: [] },
      };
    }

    const files = fs.readdirSync(pendingDir).filter((f) => f.endsWith('.md'));
    const byStatus = { draft: [] as string[], ready_for_review: [] as string[], reviewing: [] as string[] };
    const branches: string[] = [];

    for (const file of files) {
      const filePath = path.join(pendingDir, file);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const meta = parseFrontMatter(raw);
      if (meta.branch) branches.push(meta.branch);
      const status = meta.status ?? 'draft';
      if (status === 'draft') byStatus.draft.push(file);
      else if (status === 'ready_for_review') byStatus.ready_for_review.push(file);
      else if (status === 'reviewing') byStatus.reviewing.push(file);
    }

    return {
      project: config.project,
      has_pending: files.length > 0,
      pending_files: files,
      pending_branches: branches,
      pending_count: files.length,
      by_status: byStatus,
    };
  });
}
