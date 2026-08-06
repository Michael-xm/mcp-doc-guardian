import * as fs from 'fs';
import * as path from 'path';
import type { DocGuardConfig } from '../types';
import { DOCGUARD_ROOT } from '../config-loader';

// ── 类型定义 ────────────────────────────────────────────────

export interface FillDocTask {
  project: string;
  doc_type: string;
  /** 文档绝对路径（含项目根） */
  doc_path: string;
  /** 文档相对路径（配置中原始值） */
  doc_rel_path: string;
  /** 需要读取的源码 glob，直接传给 agent 去读 */
  source_globs: string[];
  /** 源码扫描提示（告诉 agent 关注什么） */
  scan_hint: string;
  /** 从 auto_write_template 加载的写作规范全文，agent 补全时必须遵照 */
  write_prompt?: string;
  /** 跳过原因（仅当 status === 'skipped'） */
  skip_reason?: string;
  status: 'needs_fill' | 'skipped';
}

export interface FillAllDocsArgs {
  /** 只处理指定项目，不填则处理所有项目 */
  project?: string;
  /** 只处理指定文档类型，不填则处理所有类型 */
  doc_types?: string[];
  /** 是否强制包含非 Draft 文档（default: false，只处理 Draft 和缺失文档） */
  include_complete?: boolean;
}

export type FillAllDocsOutput =
  | {
      ok: true;
      result: {
        total_tasks: number;
        skipped: number;
        tasks: FillDocTask[];
        /**
         * agent 执行指南：直接按照 tasks[] 逐条补全，每条任务已包含：
         * - source_globs: 要读哪些源码文件
         * - write_prompt: 写作规范全文（来自配置的 auto_write_template）
         * - doc_path: 写入哪个文件
         */
        agent_guide: string;
      };
    }
  | { ok: false; reason: string; message: string };

// ── 工具函数 ─────────────────────────────────────────────────

function loadWritePrompt(
  docType: string,
  autoWriteTemplate: string | undefined,
  projectRoot: string
): string | undefined {
  const DEFAULT_PROMPTS: Record<string, string> = {
    api: 'docs/agents/api-prompt.md',
    database: 'docs/agents/database-prompt.md',
    overview: 'docs/agents/overview-prompt.md',
    pages: 'docs/agents/pages-prompt.md',
    env: 'docs/agents/env-prompt.md',
  };

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

function buildSourceGlobs(
  config: DocGuardConfig,
  docType: string,
  docConfig: NonNullable<DocGuardConfig['docs'][string]>
): string[] {
  if (docType === 'api') {
    const pattern =
      config.controller?.pattern ??
      config.api_call?.pattern ??
      config.custom_detector?.source_files.pattern ??
      'src/**/*';
    return [pattern];
  }

  if (docType === 'database') {
    const globs: string[] = [];
    const ep = (config.docs.database as { entity_pattern?: string } | undefined)?.entity_pattern;
    const mp = (config.docs.database as { migration_pattern?: string } | undefined)?.migration_pattern;
    if (ep) globs.push(ep);
    if (mp) globs.push(mp);
    return globs.length > 0 ? globs : ['**/*Entity.java', '**/*Mapper.java'];
  }

  // changelog 跳过（不需要补全）
  if (docType === 'changelog') return [];

  // 自定义文档类型：使用 triggers 字段
  return docConfig.triggers ?? [];
}

function buildScanHint(config: DocGuardConfig, docType: string): string {
  switch (docType) {
    case 'api':
      if (config.type === 'java-spring' || config.type === 'java-gradle') {
        return `扫描 Controller 类，提取 @GetMapping/@PostMapping 等注解，汇总所有接口路径、请求方式、入参、出参`;
      }
      if (config.type === 'vue-ts' || config.type === 'react-ts' || config.type === 'uniapp') {
        return `扫描 API 调用层文件，提取 http/axios/request 调用，汇总接口 URL、方法、参数`;
      }
      return `扫描接口定义文件，汇总所有 API 接口信息`;

    case 'database':
      return `扫描 Entity/Model/Mapper 文件，提取所有数据表名、字段名、类型、注释，汇总表结构说明`;

    case 'overview':
      return `扫描项目目录结构和主要模块文件，提炼项目架构、核心模块、技术栈、启动方式`;

    case 'pages':
      return `扫描 pages/ 目录下的页面文件，提炼每个页面的路径、名称、功能描述、入口参数`;

    case 'env':
      return `扫描 .env、.env.example、config/ 等配置文件，提炼所有环境变量名称、说明、默认值、是否必填`;

    default:
      return `按 source_globs 读取对应源码文件，根据文件内容补全文档`;
  }
}

// ── 主函数 ───────────────────────────────────────────────────

export function fillAllDocs(
  args: FillAllDocsArgs,
  projects: DocGuardConfig[]
): FillAllDocsOutput {
  if (projects.length === 0) {
    return {
      ok: false,
      reason: 'NO_PROJECTS_FOUND',
      message: '未发现任何 .doc-guard.yaml 配置，请先运行 doc-guard-init.sh',
    };
  }

  const targetProjects = args.project
    ? projects.filter((p) => p.project === args.project)
    : projects;

  if (args.project && targetProjects.length === 0) {
    return {
      ok: false,
      reason: 'PROJECT_NOT_FOUND',
      message: `项目 "${args.project}" 未找到`,
    };
  }

  const tasks: FillDocTask[] = [];

  for (const config of targetProjects) {
    const root = config._root;

    for (const [docType, docConfig] of Object.entries(config.docs)) {
      if (!docConfig) continue;

      // 过滤指定文档类型
      if (args.doc_types && args.doc_types.length > 0 && !args.doc_types.includes(docType)) {
        continue;
      }

      // changelog 类型跳过（不是内容文档）
      if (docType === 'changelog') {
        tasks.push({
          project: config.project,
          doc_type: docType,
          doc_path: path.join(root, docConfig.path),
          doc_rel_path: docConfig.path,
          source_globs: [],
          scan_hint: '',
          status: 'skipped',
          skip_reason: 'changelog 类型由变更流程管理，不通过 fill_all_docs 补全',
        });
        continue;
      }

      const docAbsPath = path.join(root, docConfig.path);
      const exists = fs.existsSync(docAbsPath);

      // 判断是否需要补全
      let needsFill = false;
      if (!exists) {
        needsFill = true;
      } else {
        const content = fs.readFileSync(docAbsPath, 'utf-8');
        if (content.includes('[Draft]')) {
          needsFill = true;
        } else if (args.include_complete) {
          needsFill = true;
        }
      }

      if (!needsFill) {
        tasks.push({
          project: config.project,
          doc_type: docType,
          doc_path: docAbsPath,
          doc_rel_path: docConfig.path,
          source_globs: [],
          scan_hint: '',
          status: 'skipped',
          skip_reason: '文档已存在且无 [Draft] 标记',
        });
        continue;
      }

      const sourceGlobs = buildSourceGlobs(config, docType, docConfig);
      const scanHint = buildScanHint(config, docType);
      const write_prompt = loadWritePrompt(
        docType,
        (docConfig as { auto_write_template?: string }).auto_write_template,
        root
      );

      tasks.push({
        project: config.project,
        doc_type: docType,
        doc_path: docAbsPath,
        doc_rel_path: docConfig.path,
        source_globs: sourceGlobs,
        scan_hint: scanHint,
        ...(write_prompt ? { write_prompt } : {}),
        status: 'needs_fill',
      });
    }
  }

  const needsFillTasks = tasks.filter((t) => t.status === 'needs_fill');
  const skippedTasks = tasks.filter((t) => t.status === 'skipped');

  const agentGuide =
    needsFillTasks.length === 0
      ? '所有文档均已完成，无需补全。'
      : `请依次处理以下 ${needsFillTasks.length} 个文档补全任务：\n` +
        needsFillTasks
          .map(
            (t, i) =>
              `\n[任务 ${i + 1}] ${t.project} / ${t.doc_type}\n` +
              `  写入文件：${t.doc_path}\n` +
              `  读取源码：${t.source_globs.join('、') || '（见 write_prompt 说明）'}\n` +
              `  扫描重点：${t.scan_hint}\n` +
              `  写作规范：${t.write_prompt ? '已包含在 tasks[' + i + '].write_prompt 字段中，必须严格遵照其章节结构和格式要求撰写' : '使用通用文档规范'}`
          )
          .join('\n');

  return {
    ok: true,
    result: {
      total_tasks: needsFillTasks.length,
      skipped: skippedTasks.length,
      tasks,
      agent_guide: agentGuide,
    },
  };
}
