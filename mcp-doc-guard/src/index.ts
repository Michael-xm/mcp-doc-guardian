#!/usr/bin/env node
// ============================================================
// index.ts — mcp-doc-guardian v1.0.0
// ============================================================
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { loadAllProjects, runValidateOnly } from './config-loader';
import { withTimeout } from './types';

// L0 Tools
import { listProjects } from './tools/list-projects';
import { checkApiSync } from './tools/check-api-sync';
import { scanDraft } from './tools/scan-draft';
import { changelogStatus } from './tools/changelog-status';
import { claimPending, releaseTimedOutClaims } from './tools/claim-pending';
import { auditLog } from './tools/audit-log';
import { checkDbSync } from './tools/check-db-sync';
import { checkCustomDocSync } from './tools/check-custom-doc-sync';
import { docColdStart } from './tools/doc-cold-start';
import {
  projectChangeProposeImpl,
  projectChangeListImpl,
  projectChangeStatusImpl,
  projectChangeArchiveImpl,
} from './tools/project-change';

// L1 Tools
import { crossRefCheck } from './tools/cross-ref-check';
import { teamDocStatus } from './tools/team-doc-status';
import { projectDocHealth } from './tools/project-doc-health';
import { applyDocPatch } from './tools/apply-doc-patch';
import { projectChangeRelease } from './tools/project-change-release';
import { syncSteering } from './tools/sync-steering';
import { fillAllDocs } from './tools/fill-all-docs';
import { checkGitSync } from './tools/check-git-sync';

// ── validate-only 模式 ───────────────────────────────────────
if (process.argv.includes('--validate-only')) {
  const ok = runValidateOnly();
  process.exit(ok ? 0 : 1);
}

// ── 加载所有项目配置 ──────────────────────────────────────────
let projects = loadAllProjects();

const server = new Server(
  { name: 'mcp-doc-guard', version: '5.8.0' },
  { capabilities: { tools: {} } }
);

// ── RBAC 校验 ────────────────────────────────────────────────
function checkRbac(projectName: string, toolName: string): { allowed: boolean; reason?: string } {
  const config = projects.find((p) => p.project === projectName);
  if (!config?.team?.roles || !config.team.my_role) return { allowed: true };

  const myRole = config.team.my_role;
  const role = config.team.roles.find((r) => r.id === myRole);
  if (!role) return { allowed: false, reason: `角色 "${myRole}" 未在 team.roles 中定义` };

  if (role.denied_tools?.includes(toolName)) {
    return { allowed: false, reason: `角色 "${myRole}" 被明确禁止调用 "${toolName}"` };
  }

  if (role.allowed_tools.includes('*') || role.allowed_tools.includes(toolName)) {
    return { allowed: true };
  }

  return { allowed: false, reason: `角色 "${myRole}" 无权调用 "${toolName}"` };
}

// ── 工具定义列表 ─────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── L0 ──
    {
      name: 'list_projects',
      description: '列出所有已注册的项目及其文档配置概览',
      inputSchema: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['all', 'current'], description: '查询范围' },
        },
      },
    },
    {
      name: 'check_api_sync',
      description: '检测指定项目接口代码与 api.md 的同步状态（基于 git diff）',
      inputSchema: {
        type: 'object',
        required: ['project'],
        properties: {
          project: { type: 'string' },
          base: { type: 'string', description: 'git diff base，默认 HEAD' },
        },
      },
    },
    {
      name: 'scan_draft',
      description: '扫描文档中 [Draft] 标记，统计未完成文档项',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: '不填则扫描所有项目' },
        },
      },
    },
    {
      name: 'changelog_status',
      description: '查询 pending changelog 状态（数量、分支、审核状态）',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: '不填则查询所有项目' },
        },
      },
    },
    {
      name: 'claim_pending',
      description: '认领一个 pending changelog 文件进行 Review，支持超时自动释放（24h）',
      inputSchema: {
        type: 'object',
        required: ['project', 'filename', 'reviewer_id'],
        properties: {
          project: { type: 'string' },
          filename: { type: 'string', description: 'pending 文件名（如 feat-xxx.md）' },
          reviewer_id: { type: 'string', description: '审核者角色 ID' },
        },
      },
    },
    {
      name: 'audit_log',
      description: '写入一条工具调用审计日志（写入 docs/.audit-log.jsonl）',
      inputSchema: {
        type: 'object',
        required: ['project', 'action'],
        properties: {
          project: { type: 'string' },
          action: { type: 'string' },
          caller_id: { type: 'string' },
          params_summary: { type: 'string' },
          result: { type: 'string', enum: ['success', 'failure', 'skipped'] },
        },
      },
    },
    {
      name: 'check_db_sync',
      description: '检测 Entity/Mapper 变更与 database.md 的覆盖率',
      inputSchema: {
        type: 'object',
        required: ['project'],
        properties: {
          project: { type: 'string' },
          base: { type: 'string', description: 'git diff base，默认 HEAD' },
        },
      },
    },
    {
      name: 'check_custom_doc_sync',
      description: '检测自定义文档类型的触发文件变更是否与文档同步',
      inputSchema: {
        type: 'object',
        required: ['project', 'doc_type'],
        properties: {
          project: { type: 'string' },
          doc_type: { type: 'string', description: '文档类型名称（对应 docs 中的 key）' },
          base: { type: 'string', description: 'git diff base，默认 HEAD' },
        },
      },
    },
    {
      name: 'doc_cold_start',
      description: '为所有已配置但缺失的文档文件生成初始 stub（幂等，默认跳过已有文件）。\n\n返回结果说明：\n- result.tasks[]: 每条任务代表一个需要补全的文档，包含以下字段：\n  - doc_path: 文档路径\n  - source_globs: 需要读取的源码 glob 模式\n  - write_prompt: 【重要】该文档的写作规范提示词，由 .doc-guard.yaml 中 auto_write_template 配置指定。补全该文档时，必须严格遵照此提示词中的角色定位、章节结构和格式要求来撰写内容，不得忽略。\n- result.next_action.quick_command: 一键补全所有文档的快捷指令，可直接作为下一条消息发送执行。',
      inputSchema: {
        type: 'object',
        properties: {
          force: { type: 'boolean', description: '强制覆写已有文件，默认 false' },
          steering_inject_types: {
            type: 'array',
            items: { type: 'string' },
            description: '用户选择要注入到 AI 工具自定义指令的文档类型列表（如 ["overview","database"]）。指定后自动将对应文档的 steering.inject: true 写入 .doc-guard.yaml',
          },
        },
      },
    },
    {
      name: 'project_change_propose',
      description: '发起一个变更单（创建 docs/changes/{id}/ 目录及 tasks.md 和 pending 条目）',
      inputSchema: {
        type: 'object',
        required: ['project', 'id', 'title', 'change_type'],
        properties: {
          project: { type: 'string' },
          id: { type: 'string', description: '变更唯一 ID，如 feat-user-profile' },
          title: { type: 'string' },
          change_type: { type: 'string', enum: ['feature', 'bugfix', 'refactor'] },
          affects_projects: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    {
      name: 'project_change_list',
      description: '列出项目的所有变更单',
      inputSchema: {
        type: 'object',
        required: ['project'],
        properties: {
          project: { type: 'string' },
          status: { type: 'string', enum: ['active', 'archived', 'all'] },
        },
      },
    },
    {
      name: 'project_change_status',
      description: '查询变更单任务完成进度',
      inputSchema: {
        type: 'object',
        required: ['project', 'id'],
        properties: {
          project: { type: 'string' },
          id: { type: 'string' },
        },
      },
    },
    {
      name: 'project_change_archive',
      description: '归档变更单（标记 .archived + 将 pending changelog 合并到主 changelog）',
      inputSchema: {
        type: 'object',
        required: ['project', 'id'],
        properties: {
          project: { type: 'string' },
          id: { type: 'string' },
        },
      },
    },
    // ── L1 ──
    {
      name: 'cross_ref_check',
      description: '检测所有项目文档间的跨项目引用是否有效',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'team_doc_status',
      description: '输出团队所有项目的文档健康状况聚合视图',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'project_doc_health',
      description: '输出单项目文档健康评分（API 覆盖率、草稿数、SOP 合规率、健康分）',
      inputSchema: {
        type: 'object',
        required: ['project'],
        properties: {
          project: { type: 'string' },
          days: { type: 'number', description: '统计周期（天），默认 30' },
        },
      },
    },
    {
      name: 'apply_doc_patch',
      description: '向文档文件追加存根节（需 allow_doc_write 开启）',
      inputSchema: {
        type: 'object',
        required: ['project', 'mode', 'patches'],
        properties: {
          project: { type: 'string' },
          mode: { type: 'string', enum: ['append_stubs'] },
          patches: {
            type: 'array',
            items: {
              type: 'object',
              required: ['doc_type', 'section_title', 'stub_content'],
              properties: {
                doc_type: { type: 'string' },
                section_title: { type: 'string' },
                stub_content: { type: 'string' },
              },
            },
          },
          dry_run: { type: 'boolean' },
        },
      },
    },
    {
      name: 'project_change_release',
      description: '发布版本：将所有 pending changelog 合并到正式 changelog 并归档',
      inputSchema: {
        type: 'object',
        required: ['project', 'version'],
        properties: {
          project: { type: 'string' },
          version: { type: 'string', description: '版本号，如 1.2.0' },
        },
      },
    },
    // ── 文档补全 ──
    {
      name: 'fill_all_docs',
      description: '一键扫描所有项目的所有文档，对含 [Draft] 标记或缺失的文档，返回每个文档对应的源码读取路径、扫描重点和写作规范（来自 auto_write_template 配置）。\n\n【执行说明】调用后，按 result.tasks[] 逐条处理 status === "needs_fill" 的任务：\n1. 读取 task.source_globs 指定的源码文件\n2. 严格遵照 task.write_prompt 中的章节结构和格式要求撰写内容（不得忽略）\n3. 将完整内容写入 task.doc_path\n\n支持按项目、文档类型过滤，changelog 类型自动跳过。',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: '只处理指定项目，不填则处理所有项目' },
          doc_types: {
            type: 'array',
            items: { type: 'string' },
            description: '只处理指定文档类型（如 ["api","database"]），不填则处理所有类型',
          },
          include_complete: {
            type: 'boolean',
            description: '是否强制包含已完成（无 [Draft]）的文档，默认 false',
          },
        },
      },
    },
    // ── Git ──
    {
      name: 'check_git_sync',
      description: '检测项目 Git 提交规范和分支命名规范，分析 base..HEAD 范围内的提交，返回不合规提交列表、分支规范检查结果及拆分建议',
      inputSchema: {
        type: 'object',
        required: ['project'],
        properties: {
          project: { type: 'string' },
          base: { type: 'string', description: 'git diff base，默认 HEAD~1' },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: '只分析指定文件（相对于项目根目录），不填则分析所有变更文件',
          },
        },
      },
    },
    // ── Steering ──
    {
      name: 'sync_steering',
      description: '将指定文档内容写入指定 AI 工具的规则文件；支持 cli / doc_types 多选过滤，以及 dry_run 预览模式',
      inputSchema: {
        type: 'object',
        properties: {
          cli: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
            description: '目标 AI 工具（kiro/cursor/codebuddy/claude/trae/cline/windsurf），不填则自动检测',
          },
          doc_types: {
            type: 'array',
            items: { type: 'string' },
            description: '要注入的文档类型，不填则用各项目 steering.doc_types 配置（或所有 docs 类型）',
          },
          dry_run: {
            type: 'boolean',
            description: '预览模式，只报告会写哪些文件，不实际写入',
          },
          force: {
            type: 'boolean',
            description: '强制覆盖：绕过 enabled:false 限制，覆盖已有的非生成文件和 hash 未变化的文件',
          },
        },
      },
    },
  ],
}));

// ── 工具分发 ─────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  // 懒释放超时 claim
  await releaseTimedOutClaims(projects);

  // 刷新配置（简单方式：每次调用重新加载，生产可用 watch 优化）
  projects = loadAllProjects();

  const projectName = (args as Record<string, string>).project;

  // RBAC
  if (projectName) {
    const rbac = checkRbac(projectName, name);
    if (!rbac.allowed) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: true, code: 'RBAC_DENIED', message: rbac.reason }) }],
      };
    }
  }

  try {
    let result: unknown;

    switch (name) {
      // L0
      case 'list_projects':
        result = await withTimeout(Promise.resolve(listProjects(args as { scope?: 'all' | 'current' }, projects)));
        break;
      case 'check_api_sync':
        result = await withTimeout(checkApiSync(args as { project: string; base?: string }, projects));
        break;
      case 'scan_draft':
        result = await withTimeout(scanDraft(args as { project?: string }, projects));
        break;
      case 'changelog_status':
        result = await withTimeout(changelogStatus(args as { project?: string }, projects));
        break;
      case 'claim_pending':
        result = await withTimeout(claimPending(args as { project: string; filename: string; reviewer_id: string }, projects));
        break;
      case 'audit_log':
        result = await withTimeout(auditLog(args as { project: string; action: string; caller_id?: string; params_summary?: string; result?: 'success' | 'failure' | 'skipped' }, projects));
        break;
      case 'check_db_sync':
        result = await withTimeout(checkDbSync(args as { project: string; base?: string }, projects));
        break;
      case 'check_custom_doc_sync':
        result = await withTimeout(checkCustomDocSync(args as { project: string; doc_type: string; base?: string }, projects));
        break;
      case 'doc_cold_start':
        result = await withTimeout(docColdStart(args as { force?: boolean; steering_inject_types?: string[] }, projects));
        break;
      case 'project_change_propose':
        result = await withTimeout(projectChangeProposeImpl(args as { project: string; id: string; title: string; change_type: 'feature' | 'bugfix' | 'refactor'; affects_projects?: string[] }, projects));
        break;
      case 'project_change_list':
        result = await withTimeout(projectChangeListImpl(args as { project: string; status?: 'active' | 'archived' | 'all' }, projects));
        break;
      case 'project_change_status':
        result = await withTimeout(projectChangeStatusImpl(args as { project: string; id: string }, projects));
        break;
      case 'project_change_archive':
        result = await withTimeout(projectChangeArchiveImpl(args as { project: string; id: string }, projects));
        break;

      // L1
      case 'cross_ref_check':
        result = await withTimeout(crossRefCheck(projects));
        break;
      case 'team_doc_status':
        result = await withTimeout(teamDocStatus(projects));
        break;
      case 'project_doc_health':
        result = await withTimeout(projectDocHealth(args as { project: string; days?: number }, projects));
        break;
      case 'apply_doc_patch':
        result = await withTimeout(applyDocPatch(args as { project: string; mode: 'append_stubs'; patches: Array<{ doc_type: string; section_title: string; stub_content: string }>; dry_run?: boolean }, projects));
        break;
      case 'project_change_release':
        result = await withTimeout(projectChangeRelease(args as { project: string; version: string }, projects));
        break;

      // Git
      case 'check_git_sync':
        result = await withTimeout(checkGitSync(args as { project: string; base?: string; files?: string[] }, projects));
        break;

      // 文档补全
      case 'fill_all_docs':
        result = await withTimeout(Promise.resolve(fillAllDocs(args as { project?: string; doc_types?: string[]; include_complete?: boolean }, projects)));
        break;

      // Steering
      case 'sync_steering':
        result = await withTimeout(syncSteering(args as { cli?: string | string[]; doc_types?: string[]; dry_run?: boolean; force?: boolean }, projects));
        break;

      default:
        result = { error: true, code: 'UNKNOWN_TOOL', message: `未知工具: ${name}` };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: true, code: 'INTERNAL_ERROR', message: msg }),
        },
      ],
    };
  }
});

// ── 启动 ─────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mcp-doc-guard] Server v5.8 started, projects:', projects.length);
}

main().catch((e) => {
  console.error('[mcp-doc-guard] Fatal:', e);
  process.exit(1);
});
