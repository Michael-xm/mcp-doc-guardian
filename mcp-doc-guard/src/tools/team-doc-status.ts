import * as fs from 'fs';
import * as path from 'path';
import type { DocGuardConfig, TeamDocStatusResult, ProjectDocStatus } from '../types';
import { crossRefCheck } from './cross-ref-check';

export async function teamDocStatus(
  projects: DocGuardConfig[]
): Promise<TeamDocStatusResult> {
  const crossRef = await crossRefCheck(projects);
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const projectStatuses: ProjectDocStatus[] = [];
  let totalChanges30d = 0;
  let totalChangelogCoverage = 0;
  let totalDraftAge = 0;
  let totalDraftCount = 0;
  let pendingTotal = 0;
  let pendingWithDraft = 0;

  for (const config of projects) {
    const root = config._root;
    const pendingDir = path.join(root, config.docs.changelog.pending_path);

    let pendingCount = 0;
    let hasDraft = false;

    if (fs.existsSync(pendingDir)) {
      const files = fs.readdirSync(pendingDir).filter((f) => f.endsWith('.md'));
      pendingCount = files.length;
      pendingTotal += pendingCount;

      for (const file of files) {
        const filePath = path.join(pendingDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        if (/\[Draft\]/i.test(content)) {
          hasDraft = true;
          pendingWithDraft++;
          const stat = fs.statSync(filePath);
          const ageDays = Math.floor((now - stat.mtimeMs) / (1000 * 60 * 60 * 24));
          totalDraftAge += ageDays;
          totalDraftCount++;
        }
      }
    }

    // API coverage stub（简单：看 api.md 是否存在且有内容）
    let apiCoverage: number | undefined;
    const apiDocConfig = config.docs.api;
    if (apiDocConfig) {
      const apiDocPath = path.join(root, apiDocConfig.path);
      if (fs.existsSync(apiDocPath)) {
        const size = fs.statSync(apiDocPath).size;
        apiCoverage = size > 200 ? 0.8 : 0.2; // 简单估算
      } else {
        apiCoverage = 0;
      }
      totalChangelogCoverage += apiCoverage;
    }

    // 近 30d 变更估算（pending 文件 mtime 在 30d 内）
    if (fs.existsSync(pendingDir)) {
      const recent = fs.readdirSync(pendingDir)
        .filter((f) => f.endsWith('.md'))
        .filter((f) => {
          const stat = fs.statSync(path.join(pendingDir, f));
          return now - stat.mtimeMs < thirtyDaysMs;
        });
      totalChanges30d += recent.length;
    }

    const allowDocWrite = config.skill?.allow_doc_write;
    // O4 引导提示：allow_doc_write 未启用时给出配置建议
    const allowDocWriteHint = !allowDocWrite
      ? `⚠️  ${config.project}：文档骨架自动写入未启用（allow_doc_write: false）\n    启用方式：在 .doc-guard.yaml 的 skill 节点设置 allow_doc_write: stub_only`
      : undefined;

    projectStatuses.push({
      project: config.project,
      description: config.description,
      pending_count: pendingCount,
      has_draft: hasDraft,
      api_coverage: apiCoverage,
      allow_doc_write: allowDocWrite,
      allow_doc_write_hint: allowDocWriteHint,
    });
  }

  const projectsWithApi = projects.filter((p) => p.docs.api).length;

  return {
    projects: projectStatuses,
    team_summary: {
      total_changes_last_30d: totalChanges30d,
      changelog_coverage: projectsWithApi > 0 ? totalChangelogCoverage / projectsWithApi : 1.0,
      draft_pending_rate: pendingTotal > 0 ? pendingWithDraft / pendingTotal : 0,
      avg_draft_age_days: totalDraftCount > 0 ? totalDraftAge / totalDraftCount : 0,
      cross_ref_warnings: crossRef.broken_refs,
    },
  };
}
