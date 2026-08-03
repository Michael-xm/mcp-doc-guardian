import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { glob } from 'glob';
import type { DocGuardConfig, ProjectDocHealthArgs, ProjectDocHealthResult, ToolError } from '../types';

interface CommitInfo {
  subject: string;
  hasChangelog: boolean;
}

/**
 * 获取近 N 天的 commit 列表，以及每个 commit 是否变更了 changelog/pending 文件。
 * sop_compliance 语义：代码 commit 是否走了 SOP（有无附带 pending changelog 变更）。
 */
function getRecentCommitsWithChangelogFlag(root: string, days: number): CommitInfo[] {
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    // 获取 commit hash + subject
    const logOutput = execSync(
      `git log --since="${since}" --format="%H\t%s"`,
      { cwd: root, encoding: 'utf-8' }
    ).split('\n').filter(Boolean);

    return logOutput.map((line) => {
      const [hash, ...rest] = line.split('\t');
      const subject = rest.join('\t');
      let hasChangelog = false;
      try {
        // 检查该 commit 的变更文件中是否包含 docs/changelogs/pending/ 路径
        const files = execSync(`git show --name-only --format="" ${hash}`, {
          cwd: root,
          encoding: 'utf-8',
        });
        hasChangelog = /docs\/changelogs\/pending\//i.test(files) ||
                       /docs\/changes\//i.test(files);
      } catch { /* 跳过单个 commit 查询失败 */ }
      return { subject, hasChangelog };
    });
  } catch {
    return [];
  }
}

export async function projectDocHealth(
  args: ProjectDocHealthArgs,
  projects: DocGuardConfig[]
): Promise<ProjectDocHealthResult | ToolError> {
  const { project, days = 30 } = args;
  const config = projects.find((p) => p.project === project);

  if (!config) {
    return { error: true, code: 'FILE_NOT_FOUND', message: `项目 "${project}" 未找到，请先确认 .doc-guard.yaml 已配置。` };
  }

  const root = config._root;
  const now = Date.now();

  // ── API Coverage ──────────────────────────────────────────
  let apiCodeCount = 0;
  let apiDocCount = 0;
  const uncovered: string[] = [];

  const apiDocConfig = config.docs.api;
  if (apiDocConfig) {
    const apiDocPath = path.join(root, apiDocConfig.path);
    let docContent = '';
    if (fs.existsSync(apiDocPath)) {
      docContent = fs.readFileSync(apiDocPath, 'utf-8');
    }

    const pathRegex = apiDocConfig.path_extract_regex
      ? new RegExp(apiDocConfig.path_extract_regex, 'g')
      : null;

    const controllerPattern = config.controller?.pattern ?? config.api_call?.pattern;
    if (controllerPattern) {
      const sourceFiles = glob.sync(controllerPattern, { cwd: root, absolute: true });
      for (const file of sourceFiles) {
        try {
          const src = fs.readFileSync(file, 'utf-8');
          const annotationRe = new RegExp(
            config.controller?.annotation_regex ??
              config.api_call?.call_regex ??
              '@(GetMapping|PostMapping)',
            'g'
          );
          const matches = src.match(annotationRe) ?? [];
          apiCodeCount += matches.length;

          if (pathRegex && docContent) {
            // 简单估算：每个文件只要文档中有对应文件名即视为覆盖
            const covered = docContent.includes(path.basename(file).replace(/\.(java|ts|go|py)$/, ''));
            if (!covered && matches.length > 0) {
              uncovered.push(path.relative(root, file));
            } else if (covered) {
              apiDocCount += matches.length;
            }
          } else if (docContent.length > 200) {
            apiDocCount += matches.length; // 文档有内容，乐观估算
          }
        } catch {
          // 跳过
        }
      }
    }
  }

  const apiRatio = apiCodeCount > 0 ? Math.min(apiDocCount / apiCodeCount, 1.0) : 1.0;

  // ── Database Coverage ─────────────────────────────────────
  let dbCoverage: ProjectDocHealthResult['database_coverage'];
  const dbDocConfig = config.docs.database;
  if (dbDocConfig) {
    const entityPattern = dbDocConfig.entity_pattern ?? '**/*Entity.java';
    const entityFiles = glob.sync(entityPattern, { cwd: root, absolute: false });
    const dbDocPath = path.join(root, dbDocConfig.path);
    let dbContent = '';
    if (fs.existsSync(dbDocPath)) {
      dbContent = fs.readFileSync(dbDocPath, 'utf-8');
    }

    let dbCodeCount = entityFiles.length;
    let dbDocCount = 0;
    for (const f of entityFiles) {
      const name = path.basename(f).replace(/Entity\.java$/, '').toLowerCase();
      if (dbContent.toLowerCase().includes(name)) dbDocCount++;
    }

    dbCoverage = {
      ratio: dbCodeCount > 0 ? dbDocCount / dbCodeCount : 1.0,
      code_count: dbCodeCount,
      doc_count: dbDocCount,
    };
  }

  // ── Draft Items ───────────────────────────────────────────
  const DRAFT_RE = /\[Draft\]/i;
  const draftItems: ProjectDocHealthResult['draft_items']['items'] = [];

  const mdFiles = glob.sync('docs/**/*.md', {
    cwd: root,
    ignore: ['docs/changelogs/pending/**', 'docs/changes/**'],
    absolute: true,
  });

  for (const filePath of mdFiles) {
    try {
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
      const stat = fs.statSync(filePath);
      const ageDays = Math.floor((now - stat.mtimeMs) / (1000 * 60 * 60 * 24));
      lines.forEach((line, idx) => {
        if (DRAFT_RE.test(line)) {
          draftItems.push({
            file: path.relative(root, filePath),
            line: line.trim(),
            age_days: ageDays,
          });
        }
      });
    } catch { /* skip */ }
  }

  const oldestAge = draftItems.length > 0 ? Math.max(...draftItems.map((d) => d.age_days)) : 0;

  // ── Pending Changelogs ────────────────────────────────────
  const pendingDir = path.join(root, config.docs.changelog.pending_path);
  let pendingCount = 0;
  const pendingBranches: string[] = [];

  if (fs.existsSync(pendingDir)) {
    const files = fs.readdirSync(pendingDir).filter((f) => f.endsWith('.md'));
    pendingCount = files.length;
    for (const file of files) {
      const content = fs.readFileSync(path.join(pendingDir, file), 'utf-8');
      const match = content.match(/^branch:\s*(.+)/m);
      if (match && match[1].trim()) pendingBranches.push(match[1].trim());
    }
  }

  // ── SOP Compliance ────────────────────────────────────────
  // 语义：检测近 N 天每次 commit 是否伴随了 changelog/pending 文件变更（而非 commit message 格式）
  const commitInfos = getRecentCommitsWithChangelogFlag(root, days);
  const totalMerges = commitInfos.length;
  const compliantMerges = commitInfos.filter((c) => c.hasChangelog).length;
  const nonCompliant = commitInfos
    .filter((c) => !c.hasChangelog)
    .map((c) => c.subject)
    .slice(0, 10);

  // ── Health Score ──────────────────────────────────────────
  let score = 100;
  score -= (1 - apiRatio) * 20;
  if (dbCoverage) score -= (1 - dbCoverage.ratio) * 15;
  score -= Math.min(draftItems.length * 2, 20);
  score -= Math.min(pendingCount * 3, 15);
  score -= totalMerges > 0 ? (1 - compliantMerges / totalMerges) * 15 : 0;
  score = Math.max(0, Math.round(score));

  return {
    project,
    period_days: days,
    api_coverage: {
      ratio: apiRatio,
      code_count: apiCodeCount,
      doc_count: apiDocCount,
      uncovered,
    },
    database_coverage: dbCoverage,
    draft_items: {
      count: draftItems.length,
      oldest_age_days: oldestAge,
      items: draftItems.slice(0, 20),
    },
    pending_changelogs: { count: pendingCount, branches: pendingBranches },
    sop_compliance: {
      total_merges: totalMerges,
      compliant_merges: compliantMerges,
      rate: totalMerges > 0 ? compliantMerges / totalMerges : 1.0,
      non_compliant: nonCompliant.slice(0, 10),
    },
    health_score: score,
    allow_doc_write_hint: config.skill?.allow_doc_write
      ? `当前 allow_doc_write=${JSON.stringify(config.skill.allow_doc_write)}，可调用 apply_doc_patch 写入文档存根`
      : undefined,
  };
}
