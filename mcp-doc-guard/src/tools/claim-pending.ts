import * as fs from 'fs';
import * as path from 'path';
import type { DocGuardConfig, ClaimPendingArgs, ClaimPendingResult, PendingFileMeta } from '../types';

export const CLAIM_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24h

export function parseFrontMatter(content: string): PendingFileMeta {
  const meta: PendingFileMeta = {};
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return meta;
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();
    if (key === 'status') meta.status = val as PendingFileMeta['status'];
    else if (key === 'reviewing_since') meta.reviewing_since = val === 'null' ? null : val;
    else if (key === 'reviewing_by') meta.reviewing_by = val === 'null' ? null : val;
    else if (key === 'branch') meta.branch = val;
    else if (key === 'author') meta.author = val;
    else if (key === 'project') meta.project = val;
    else if (key === 'change_type') meta.change_type = val;
  }
  return meta;
}

function setFrontMatterField(content: string, key: string, value: string): string {
  const regex = new RegExp(`^${key}:.*$`, 'm');
  if (regex.test(content)) {
    return content.replace(regex, `${key}: ${value}`);
  }
  // 字段不存在时插入到 front matter 末尾（--- 前）
  return content.replace(/^(---\r?\n[\s\S]*?)\r?\n---/, `$1\n${key}: ${value}\n---`);
}

/**
 * 懒释放：每次工具调用前扫描超时认领（由 index.ts dispatcher 调用）
 */
export async function releaseTimedOutClaims(projects: DocGuardConfig[]): Promise<void> {
  for (const config of projects) {
    const pendingDir = path.join(config._root, config.docs.changelog.pending_path);
    if (!fs.existsSync(pendingDir)) continue;

    const files = fs.readdirSync(pendingDir).filter((f) => f.endsWith('.md'));
    for (const file of files) {
      const filePath = path.join(pendingDir, file);
      try {
        let raw = fs.readFileSync(filePath, 'utf-8');
        const meta = parseFrontMatter(raw);
        if (meta.status !== 'reviewing' || !meta.reviewing_since) continue;

        const reviewingSince = new Date(meta.reviewing_since).getTime();
        if (Date.now() - reviewingSince > CLAIM_TIMEOUT_MS) {
          raw = setFrontMatterField(raw, 'status', 'draft');
          raw = setFrontMatterField(raw, 'reviewing_since', 'null');
          raw = setFrontMatterField(raw, 'reviewing_by', 'null');
          fs.writeFileSync(filePath, raw, 'utf-8');
          console.warn(
            `[claim_pending] 超时释放：${config.project}/${file}（locked since ${meta.reviewing_since}）`
          );
        }
      } catch {
        // 跳过不可读文件
      }
    }
  }
}

export async function claimPending(
  args: ClaimPendingArgs,
  projects: DocGuardConfig[]
): Promise<ClaimPendingResult> {
  const config = projects.find((p) => p.project === args.project);
  if (!config) {
    return { error: true, code: 'FILE_NOT_FOUND', message: `项目 "${args.project}" 未找到` };
  }

  const filePath = path.join(config._root, config.docs.changelog.pending_path, args.filename);
  if (!fs.existsSync(filePath)) {
    return { error: true, code: 'FILE_NOT_FOUND', message: `pending 文件 "${args.filename}" 未找到` };
  }

  let raw = fs.readFileSync(filePath, 'utf-8');
  const meta = parseFrontMatter(raw);

  if (meta.status === 'reviewing' && meta.reviewing_since) {
    const reviewingSince = new Date(meta.reviewing_since).getTime();
    if (Date.now() - reviewingSince <= CLAIM_TIMEOUT_MS) {
      return {
        error: false,
        claimed: false,
        message: `文件已被 ${meta.reviewing_by ?? '未知'} 认领，尚未超时`,
        reviewing_since: meta.reviewing_since,
      };
    }
  }

  // 可认领
  const now = new Date().toISOString();
  raw = setFrontMatterField(raw, 'status', 'reviewing');
  raw = setFrontMatterField(raw, 'reviewing_since', now);
  raw = setFrontMatterField(raw, 'reviewing_by', args.reviewer_id);
  fs.writeFileSync(filePath, raw, 'utf-8');

  return {
    error: false,
    claimed: true,
    message: `认领成功：${args.filename}，reviewer: ${args.reviewer_id}`,
  };
}
