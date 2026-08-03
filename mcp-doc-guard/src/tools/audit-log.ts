import * as fs from 'fs';
import * as path from 'path';
import type { DocGuardConfig, AuditLogArgs, AuditLogResult } from '../types';

interface AuditLogEntry {
  timestamp: string;
  project: string;
  action: string;
  caller_id: string | null;
  params_summary: string | null;
  result: 'success' | 'failure' | 'skipped';
}

export async function auditLog(
  args: AuditLogArgs,
  projects: DocGuardConfig[]
): Promise<AuditLogResult> {
  const config = projects.find((p) => p.project === args.project);
  if (!config) {
    return { error: true, code: 'FILE_NOT_FOUND', message: `项目 "${args.project}" 未找到` };
  }

  const entry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    project: args.project,
    action: args.action,
    caller_id: args.caller_id ?? config.team?.my_role ?? null,
    params_summary: args.params_summary ?? null,
    result: args.result ?? 'success',
  };

  const logPath = path.join(config._root, 'docs', '.audit-log.jsonl');
  const logDir = path.dirname(logPath);

  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf-8');
    return { ok: true, written_to: path.relative(config._root, logPath) };
  } catch (e) {
    return {
      error: true,
      code: 'FILE_NOT_FOUND',
      message: `写入审计日志失败：${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
