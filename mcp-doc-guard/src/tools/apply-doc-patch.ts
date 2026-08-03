import * as fs from 'fs';
import * as path from 'path';
import type {
  DocGuardConfig,
  ApplyDocPatchArgs,
  ApplyDocPatchOutput,
  PatchApplyResult,
} from '../types';

export async function applyDocPatch(
  args: ApplyDocPatchArgs,
  projects: DocGuardConfig[]
): Promise<ApplyDocPatchOutput> {
  const config = projects.find((p) => p.project === args.project);
  if (!config) {
    return { error: true, code: 'FILE_NOT_FOUND', message: `项目 "${args.project}" 未找到` };
  }

  const allowDocWrite = config.skill?.allow_doc_write;
  if (!allowDocWrite) {
    return {
      ok: false,
      reason: 'NOT_ENABLED',
      message: `项目 "${args.project}" 未启用 allow_doc_write，无法自动写入文档`,
    };
  }

  const applied: PatchApplyResult[] = [];
  const root = config._root;

  for (const patch of args.patches) {
    const docConfig = config.docs[patch.doc_type];
    if (!docConfig) {
      // 跳过不存在的文档类型
      continue;
    }

    const docPath = path.join(root, docConfig.path);
    const dir = path.dirname(docPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let currentContent = '';
    if (fs.existsSync(docPath)) {
      currentContent = fs.readFileSync(docPath, 'utf-8');
    } else {
      // 初始化文件
      currentContent = `# ${config.project} — ${patch.doc_type}\n\n`;
    }

    // 检查是否已存在相同 section（幂等）
    if (currentContent.includes(patch.section_title)) {
      applied.push({
        doc_type: patch.doc_type,
        file_path: docConfig.path,
        lines_added: 0,
        dry_run: args.dry_run ?? false,
      });
      continue;
    }

    // stub 内容
    let stubContent: string;
    if (allowDocWrite === 'stub_only') {
      stubContent = `\n\n## ${patch.section_title}\n\n> **[Draft]** 以下为自动生成存根，请补充实际内容。\n\n${patch.stub_content}\n`;
    } else {
      // full
      stubContent = `\n\n## ${patch.section_title}\n\n${patch.stub_content}\n`;
    }

    const linesAdded = stubContent.split('\n').length;

    if (!args.dry_run) {
      fs.writeFileSync(docPath, currentContent + stubContent, 'utf-8');
    }

    applied.push({
      doc_type: patch.doc_type,
      file_path: docConfig.path,
      lines_added: linesAdded,
      dry_run: args.dry_run ?? false,
    });
  }

  return { ok: true, applied };
}
