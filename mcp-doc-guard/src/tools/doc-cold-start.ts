import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import type { DocGuardConfig, DocColdStartArgs, DocColdStartOutput, ColdStartTask } from '../types';

export async function docColdStart(
  args: DocColdStartArgs,
  projects: DocGuardConfig[]
): Promise<DocColdStartOutput> {
  if (projects.length === 0) {
    return {
      ok: false,
      reason: 'NO_PROJECTS_FOUND',
      message: '未发现任何 .doc-guard.yaml 配置，请先运行 setup-project.sh',
    };
  }

  const tasks: ColdStartTask[] = [];

  for (const config of projects) {
    const root = config._root;

    for (const [docType, docConfig] of Object.entries(config.docs)) {
      if (!docConfig) continue;

      const docPath = path.join(root, docConfig.path);
      const exists = fs.existsSync(docPath);

      if (exists && !args.force) {
        tasks.push({
          project: config.project,
          doc_type: docType,
          doc_path: docConfig.path,
          status: 'skipped',
          source_globs: docConfig.triggers ?? [],
        });
        continue;
      }

      // 需要创建或强制覆写
      const sourceGlobs: string[] = [];

      if (docType === 'api') {
        const pattern =
          config.controller?.pattern ??
          config.api_call?.pattern ??
          config.custom_detector?.source_files.pattern ??
          'src/**/*';
        sourceGlobs.push(pattern);
      } else if (docType === 'database') {
        if (config.docs.database?.entity_pattern) {
          sourceGlobs.push(config.docs.database.entity_pattern);
        }
        if (config.docs.database?.migration_pattern) {
          sourceGlobs.push(config.docs.database.migration_pattern);
        }
      } else {
        sourceGlobs.push(...(docConfig.triggers ?? []));
      }

      // 权限检查：allow_doc_write 为 false/undefined 时不直接写文件，返回任务清单供 Agent1 执行
      const allowWrite = config.skill?.allow_doc_write;
      if (!allowWrite) {
        tasks.push({
          project: config.project,
          doc_type: docType,
          doc_path: docConfig.path,
          status: 'pending',
          source_globs: sourceGlobs,
        });
        continue;
      }

      // 确保目录存在
      const docDir = path.dirname(docPath);
      if (!fs.existsSync(docDir)) {
        fs.mkdirSync(docDir, { recursive: true });
      }

      // 生成初始 stub
      const stub = generateDocStub(config.project, docType, docConfig.path, sourceGlobs);
      fs.writeFileSync(docPath, stub, 'utf-8');

      tasks.push({
        project: config.project,
        doc_type: docType,
        doc_path: docConfig.path,
        status: exists && args.force ? 'force_overwrite' : 'pending',
        source_globs: sourceGlobs,
      });
    }
  }

  const pending = tasks.filter((t) => t.status === 'pending' || t.status === 'force_overwrite').length;
  const skipped = tasks.filter((t) => t.status === 'skipped').length;

  return {
    ok: true,
    result: {
      total: tasks.length,
      pending,
      skipped,
      tasks,
    },
  };
}

function generateDocStub(
  project: string,
  docType: string,
  docPath: string,
  sourceGlobs: string[]
): string {
  const now = new Date().toISOString().split('T')[0];
  return `# ${project} — ${docType}

> **[Draft]** 此文件由 doc-cold-start 工具自动生成于 ${now}，请补充实际内容。

## 概述

待补充。

## 来源文件

${sourceGlobs.map((g) => `- \`${g}\``).join('\n') || '- 待配置'}

---

*最后更新：${now}*
`;
}
