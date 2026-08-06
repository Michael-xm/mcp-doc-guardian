import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import type { DocGuardConfig, DocColdStartArgs, DocColdStartOutput, ColdStartTask, SteeringWriteResult } from '../types';
import { DOCGUARD_ROOT } from '../config-loader';
import { syncSteering } from './sync-steering';

/**
 * 将指定文档类型的 `steering.inject: true` 回写到 .doc-guard.yaml。
 * 采用基于正则的精准修改策略，保留原文件格式和注释。
 */
function writeSteeringInjectToYaml(configFilePath: string, docType: string): void {
  let content = fs.readFileSync(configFilePath, 'utf-8');
  const lines = content.split('\n');

  // 找到 docs: 块下 <docType>: 的起始行
  const docsLineIdx = lines.findIndex((l) => /^docs\s*:/.test(l));
  if (docsLineIdx === -1) return;

  // 找到 docs 下 <docType>: 的行（缩进 2 个空格）
  let docTypeLineIdx = -1;
  for (let i = docsLineIdx + 1; i < lines.length; i++) {
    if (/^  \S/.test(lines[i]) && lines[i].trim().startsWith(`${docType}:`)) {
      docTypeLineIdx = i;
      break;
    }
    // 遇到与 docs 同级的顶层 key 则停止
    if (/^\S/.test(lines[i]) && !lines[i].startsWith('#')) break;
  }
  if (docTypeLineIdx === -1) return;

  // 找到该 docType 块的结束行（下一个同级或更高级别 key 之前）
  let blockEndIdx = lines.length;
  for (let i = docTypeLineIdx + 1; i < lines.length; i++) {
    if (/^  \S/.test(lines[i]) && !lines[i].startsWith('#')) {
      blockEndIdx = i;
      break;
    }
    if (/^\S/.test(lines[i]) && !lines[i].startsWith('#')) {
      blockEndIdx = i;
      break;
    }
  }

  // 在 docType 块内查找已有的 steering: 节点（缩进 4 空格）
  let steeringLineIdx = -1;
  for (let i = docTypeLineIdx + 1; i < blockEndIdx; i++) {
    if (/^    steering\s*:/.test(lines[i])) {
      steeringLineIdx = i;
      break;
    }
  }

  if (steeringLineIdx !== -1) {
    // steering: 节点已存在，查找其下的 inject: 行（缩进 6 空格）
    let injectLineIdx = -1;
    for (let i = steeringLineIdx + 1; i < blockEndIdx; i++) {
      if (/^      inject\s*:/.test(lines[i])) {
        injectLineIdx = i;
        break;
      }
      // 遇到同级或更高层 key 停止
      if (/^    \S/.test(lines[i]) && !lines[i].startsWith('#')) break;
    }
    if (injectLineIdx !== -1) {
      // 已有 inject 行，直接替换为 true
      lines[injectLineIdx] = lines[injectLineIdx].replace(/inject\s*:.*/, 'inject: true');
    } else {
      // steering 节点下没有 inject，插入到 steering 行的下一行
      lines.splice(steeringLineIdx + 1, 0, '      inject: true');
    }
  } else {
    // 没有 steering 节点，插到 docType 块末尾（blockEndIdx 前一行之后）
    lines.splice(blockEndIdx, 0, '    steering:', '      inject: true');
  }

  fs.writeFileSync(configFilePath, lines.join('\n'), 'utf-8');
}

/** 默认提示词模板路径（相对于 DOCGUARD_ROOT） */
const DEFAULT_PROMPTS: Record<string, string> = {
  api: 'docs/agents/api-prompt.md',
  database: 'docs/agents/database-prompt.md',
  overview: 'docs/agents/overview-prompt.md',
};

function loadWritePrompt(docType: string, autoWriteTemplate: string | undefined, projectRoot: string): string | undefined {
  try {
    const templatePath = autoWriteTemplate ?? DEFAULT_PROMPTS[docType];
    if (!templatePath) return undefined;

    let resolved: string;
    if (path.isAbsolute(templatePath)) {
      resolved = templatePath;
    } else if (templatePath.startsWith('.')) {
      resolved = path.resolve(projectRoot, templatePath);
    } else {
      resolved = path.resolve(DOCGUARD_ROOT, templatePath);
    }
    if (!fs.existsSync(resolved)) return undefined;
    return fs.readFileSync(resolved, 'utf-8');
  } catch {
    return undefined;
  }
}

export async function docColdStart(
  args: DocColdStartArgs,
  projects: DocGuardConfig[]
): Promise<DocColdStartOutput> {
  if (projects.length === 0) {
    return {
      ok: false,
      reason: 'NO_PROJECTS_FOUND',
      message: '未发现任何 .doc-guard.yaml 配置，请先运行 doc-guard-init.sh',
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

      // 加载写作提示词（无论是否有写权限，都要一并返回给 Agent）
      const write_prompt = loadWritePrompt(docType, (docConfig as { auto_write_template?: string }).auto_write_template, root);

      // 权限检查：
      //   false / undefined → 不写文件，返回任务清单供 Agent 执行
      //   "stub_only"       → 直接生成 stub 文件（Agent 后续填充正式内容）
      //   "full"            → 直接生成 stub 文件
      const allowWrite = config.skill?.allow_doc_write;
      const canWrite = allowWrite === 'full' || allowWrite === 'stub_only';
      if (!canWrite) {
        tasks.push({
          project: config.project,
          doc_type: docType,
          doc_path: docConfig.path,
          status: 'pending',
          source_globs: sourceGlobs,
          ...(write_prompt ? { write_prompt } : {}),
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
        status: exists && args.force ? 'force_overwrite' : 'created',
        source_globs: sourceGlobs,
        ...(write_prompt ? { write_prompt } : {}),
      });
    }
  }

  const created = tasks.filter((t) => t.status === 'created' || t.status === 'force_overwrite').length;
  const pending = tasks.filter((t) => t.status === 'pending').length;
  const skipped = tasks.filter((t) => t.status === 'skipped').length;

  // 将用户选择的文档类型的 steering.inject: true 回写到 .doc-guard.yaml
  if (args.steering_inject_types && args.steering_inject_types.length > 0) {
    for (const config of projects) {
      const configFilePath = path.join(config._root, '.doc-guard.yaml');
      if (!fs.existsSync(configFilePath)) continue;
      for (const docType of args.steering_inject_types) {
        if (!config.docs[docType]) continue;
        try {
          writeSteeringInjectToYaml(configFilePath, docType);
        } catch {
          // 回写失败不影响主流程
        }
      }
    }
  }

  // 自动触发 steering 注入：对 steering.enabled !== false 的项目执行
  // 只在非 dry_run 且有实际写入（canWrite）时触发
  const steeringResults: Array<SteeringWriteResult & { project: string }> = [];
  for (const config of projects) {
    if (config.steering?.enabled === false) continue;
    const allowWrite = config.skill?.allow_doc_write;
    if (!allowWrite) continue;
    try {
      const result = await syncSteering({ dry_run: false }, [config]);
      if ('ok' in result && result.ok) {
        steeringResults.push(...(result as { ok: true; results: Array<SteeringWriteResult & { project: string }>; dry_run: boolean }).results);
      }
    } catch {
      // steering 失败不影响主流程，静默跳过
    }
  }

  // 构建 next_action：只在有文件被创建时给出快捷补全指令
  let next_action: { summary: string; quick_command: string } | undefined;
  const createdTasks = tasks.filter((t) => t.status === 'created' || t.status === 'force_overwrite');
  if (createdTasks.length > 0) {
    // 收集本次涉及的项目列表（去重）
    const involvedProjects = [...new Set(createdTasks.map((t) => t.project))];
    const projectHint = involvedProjects.length === 1
      ? involvedProjects[0]
      : `${involvedProjects.join('、')} 共 ${involvedProjects.length} 个项目`;
    next_action = {
      summary: `已生成 ${createdTasks.length} 个 stub 文件（${projectHint}），发送下方指令一键补全所有文档内容`,
      quick_command: `请执行 fill_all_docs`,
    };
  } else if (pending > 0) {
    next_action = {
      summary: `${pending} 个文档待补全（allow_doc_write 未配置，stub 未自动生成），发送下方指令一键补全所有文档内容`,
      quick_command: `请执行 fill_all_docs`,
    };
  }

  return {
    ok: true,
    result: {
      total: tasks.length,
      pending,
      skipped,
      created,
      tasks,
      ...(steeringResults.length > 0 ? { steering_synced: steeringResults.length } : {}),
      ...(next_action ? { next_action } : {}),
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
