import { execSync } from 'child_process';
import { minimatch } from 'minimatch';
import type {
  DocGuardConfig,
  CheckCustomDocSyncArgs,
  CheckCustomDocSyncOutput,
} from '../types';

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

export async function checkCustomDocSync(
  args: CheckCustomDocSyncArgs,
  projects: DocGuardConfig[]
): Promise<CheckCustomDocSyncOutput> {
  const { project, doc_type, base = 'HEAD' } = args;

  const config = projects.find((p) => p.project === project);
  if (!config) {
    return { error: true, code: 'FILE_NOT_FOUND', message: `项目 "${project}" 未找到` };
  }

  if (!config.trigger_patterns) {
    return {
      ok: false,
      reason: 'NO_TRIGGER_PATTERNS',
      message: `项目 "${project}" 未配置 trigger_patterns，无法执行自定义文档同步检测`,
    };
  }

  const docConfig = config.docs[doc_type];
  if (!docConfig) {
    return { error: true, code: 'FILE_NOT_FOUND', message: `文档类型 "${doc_type}" 未在 docs 中配置` };
  }

  const triggers = docConfig.triggers ?? [];
  const root = config._root;
  const changedFiles = getChangedFiles(root, base);

  // 收集命中 trigger 的文件
  const matchedFiles: string[] = [];
  for (const trigger of triggers) {
    const glob = config.trigger_patterns[trigger];
    if (!glob) continue;
    const matched = changedFiles.filter((f) => minimatch(f, glob));
    matchedFiles.push(...matched);
  }

  const triggerMatched = matchedFiles.length > 0;
  const docPath = docConfig.path;
  const docUpdated = changedFiles.includes(docPath);

  return {
    ok: true,
    result: {
      doc_type,
      trigger_matched: triggerMatched,
      changed_files: [...new Set(matchedFiles)],
      doc_updated: docUpdated,
      warning: triggerMatched && !docUpdated,
    },
  };
}
