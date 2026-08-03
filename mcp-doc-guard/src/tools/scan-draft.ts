import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import type { DocGuardConfig, ToolError } from '../types';

export interface ScanDraftArgs {
  project?: string;
}

export interface DraftItem {
  file: string;
  line: string;
  line_number: number;
  age_days: number;
}

export interface ScanDraftResult {
  project: string;
  draft_count: number;
  items: DraftItem[];
  warning: boolean;
}

export type ScanDraftOutput = ScanDraftResult[] | ToolError;

const DRAFT_REGEX = /\[Draft\]/i;

function getFileMtimeDays(filePath: string): number {
  try {
    const stat = fs.statSync(filePath);
    return Math.floor((Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
}

function scanProjectForDrafts(config: DocGuardConfig): ScanDraftResult {
  const root = config._root;
  const items: DraftItem[] = [];

  // 扫描 docs/ 下所有 .md 文件（排除 changelogs/pending/）
  const mdFiles = glob.sync('docs/**/*.md', {
    cwd: root,
    ignore: ['docs/changelogs/pending/**', 'docs/changes/**'],
    absolute: true,
  });

  for (const filePath of mdFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (DRAFT_REGEX.test(line)) {
          items.push({
            file: path.relative(root, filePath),
            line: line.trim(),
            line_number: idx + 1,
            age_days: getFileMtimeDays(filePath),
          });
        }
      });
    } catch {
      // 跳过不可读文件
    }
  }

  return {
    project: config.project,
    draft_count: items.length,
    items,
    warning: items.length > 0,
  };
}

export async function scanDraft(
  args: ScanDraftArgs,
  projects: DocGuardConfig[]
): Promise<ScanDraftOutput> {
  const targets = args.project
    ? projects.filter((p) => p.project === args.project)
    : projects;

  if (args.project && targets.length === 0) {
    return { error: true, code: 'FILE_NOT_FOUND', message: `项目 "${args.project}" 未找到` };
  }

  return targets.map(scanProjectForDrafts);
}
