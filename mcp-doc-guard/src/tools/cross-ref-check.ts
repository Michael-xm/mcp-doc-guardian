import * as fs from 'fs';
import * as path from 'path';
import type { DocGuardConfig } from '../types';

export interface CrossRefWarning {
  source_project: string;
  target_project: string;
  doc_type: string;
  reference: string;
  target_exists: boolean;
}

export interface CrossRefCheckResult {
  total_refs: number;
  broken_refs: number;
  warnings: CrossRefWarning[];
}

// 匹配跨项目文档引用：@project/doc-type 格式
const CROSS_REF_REGEX = /@([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/g;

export async function crossRefCheck(
  projects: DocGuardConfig[]
): Promise<CrossRefCheckResult> {
  const projectIndex = new Map(projects.map((p) => [p.project, p]));
  const warnings: CrossRefWarning[] = [];
  let totalRefs = 0;

  for (const config of projects) {
    const root = config._root;

    for (const [docType, docConfig] of Object.entries(config.docs)) {
      if (!docConfig) continue;
      const docPath = path.join(root, docConfig.path);
      if (!fs.existsSync(docPath)) continue;

      const content = fs.readFileSync(docPath, 'utf-8');
      let match: RegExpExecArray | null;

      CROSS_REF_REGEX.lastIndex = 0;
      while ((match = CROSS_REF_REGEX.exec(content)) !== null) {
        const [reference, targetProject, targetDocType] = match;
        const targetConfig = projectIndex.get(targetProject);

        // targetProject 不是已知内部项目（如 npm scope 包名），直接跳过
        if (!targetConfig) {
          continue;
        }

        // 只统计指向已知内部项目的引用
        totalRefs++;

        const targetDocConfig = targetConfig.docs[targetDocType];
        const targetDocPath = targetDocConfig
          ? path.join(targetConfig._root, targetDocConfig.path)
          : null;
        const targetExists = targetDocPath ? fs.existsSync(targetDocPath) : false;

        if (!targetExists) {
          warnings.push({
            source_project: config.project,
            target_project: targetProject,
            doc_type: docType,
            reference,
            target_exists: false,
          });
        }
      }
    }
  }

  return {
    total_refs: totalRefs,
    broken_refs: warnings.length,
    warnings,
  };
}
