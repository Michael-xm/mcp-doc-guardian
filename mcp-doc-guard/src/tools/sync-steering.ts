import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import lockfile from 'proper-lockfile';
import type { DocGuardConfig, SteeringDocConfig, SyncSteeringArgs, SyncSteeringOutput, SteeringWriteResult } from '../types';

// ──────────────────────────────────────────────────────────
// 检测本机已安装的 AI 工具
// ──────────────────────────────────────────────────────────

// P2-1: Windows 用 where 替代 which
function commandExists(cmd: string): boolean {
  const isWin = process.platform === 'win32';
  try {
    execSync(isWin ? `where ${cmd}` : `which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function dirExists(p: string): boolean {
  try {
    return fs.existsSync(path.resolve(os.homedir(), p.replace(/^~\//, '')));
  } catch {
    return false;
  }
}

function vsixExtensionExists(prefix: string): boolean {
  const extDir = path.join(os.homedir(), '.vscode', 'extensions');
  if (!fs.existsSync(extDir)) return false;
  try {
    return fs.readdirSync(extDir).some((d) => d.startsWith(prefix));
  } catch {
    return false;
  }
}

const CLI_DETECTORS: Record<string, () => boolean> = {
  kiro: () => dirExists('~/.kiro') || commandExists('kiro'),
  cursor: () => dirExists('~/.cursor') || commandExists('cursor'),
  codebuddy: () => dirExists('~/.codebuddy'),
  claude: () => dirExists('~/.claude') || commandExists('claude'),
  droid: () => dirExists('~/.claude') || commandExists('claude'), // P2-droid: droid 是 claude 别名，检测逻辑相同
  trae: () => dirExists('~/.trae') || commandExists('trae'),
  cline: () => vsixExtensionExists('saoudrizwan.claude-dev'),
  windsurf: () => dirExists('~/.codeium/windsurf'),
};

function detectInstalledClis(): string[] {
  return Object.keys(CLI_DETECTORS).filter((cli) => {
    try { return CLI_DETECTORS[cli](); } catch { return false; }
  });
}

// ──────────────────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────────────────

function md5short(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
}

function ensureDir(p: string): void {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function isGeneratedFile(content: string): boolean {
  return content.includes('<!-- generated at ');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// NEW-P1-6: 原子写入——先写 tmp 文件再 rename，防止写入中断损坏目标文件
function safeWrite(destFile: string, content: string): void {
  const tmpFile = `${destFile}.tmp_${process.pid}_${Date.now()}`;
  try {
    fs.writeFileSync(tmpFile, content, 'utf-8');
    fs.renameSync(tmpFile, destFile);
  } catch (err) {
    // 清理 tmp 文件
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    throw err;
  }
}

// NEW-P1-7: 提取当前已写入文件中的 source-hash
function extractStoredHash(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const m = content.match(/source-hash:\s*([0-9a-f]{8})/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────
// 各工具写入实现
// ──────────────────────────────────────────────────────────

function writeKiro(
  projectRoot: string,
  docType: string,
  docPath: string,
  docContent: string,
  docSteering: SteeringDocConfig,
  dryRun: boolean,
  force: boolean
): SteeringWriteResult {
  const destFile = path.join(projectRoot, '.kiro', 'steering', `${docType}.md`);
  const relDocPath = path.relative(projectRoot, docPath);
  const newHash = md5short(docContent);

  if (!dryRun && fs.existsSync(destFile)) {
    const existing = fs.readFileSync(destFile, 'utf-8');
    if (!isGeneratedFile(existing)) {
      if (!force) {
        return { cli: 'kiro', doc_type: docType, file_path: destFile, action: 'skipped', reason: '目标文件已存在且非自动生成，跳过（设 force=true 可覆盖）' };
      }
    } else {
      // NEW-P1-7: hash 无变化时跳过
      const storedHash = extractStoredHash(destFile);
      if (!force && storedHash === newHash) {
        return { cli: 'kiro', doc_type: docType, file_path: destFile, action: 'skipped', reason: 'hash 未变化，跳过' };
      }
    }
  }

  // NEW-P0-4: per-doc inclusion/globs
  const inclusion = docSteering.inclusion ?? 'always';
  let frontmatter: string;
  if (inclusion === 'fileMatch' && docSteering.globs?.length) {
    frontmatter = `---\ninclusion: fileMatch\nfileMatchPattern: "${docSteering.globs.join(',')}"\n---\n`;
  } else {
    frontmatter = `---\ninclusion: always\n---\n`;
  }

  const header = `<!-- generated at ${new Date().toISOString()}, source-hash: ${newHash}, source: ${relDocPath} -->`;
  const output = `${header}\n${frontmatter}\n${docContent}`;

  if (dryRun) {
    return { cli: 'kiro', doc_type: docType, file_path: destFile, action: 'dry_run' };
  }
  ensureDir(destFile);
  safeWrite(destFile, output);
  return { cli: 'kiro', doc_type: docType, file_path: destFile, action: 'written' };
}

function writeCursor(
  projectRoot: string,
  docType: string,
  docPath: string,
  docContent: string,
  docSteering: SteeringDocConfig,
  dryRun: boolean,
  force: boolean
): SteeringWriteResult {
  const destFile = path.join(projectRoot, '.cursor', 'rules', `${docType}.mdc`);
  const relDocPath = path.relative(projectRoot, docPath);
  const newHash = md5short(docContent);

  if (!dryRun && fs.existsSync(destFile)) {
    const existing = fs.readFileSync(destFile, 'utf-8');
    if (!isGeneratedFile(existing)) {
      if (!force) {
        return { cli: 'cursor', doc_type: docType, file_path: destFile, action: 'skipped', reason: '目标文件已存在且非自动生成，跳过' };
      }
    } else {
      const storedHash = extractStoredHash(destFile);
      if (!force && storedHash === newHash) {
        return { cli: 'cursor', doc_type: docType, file_path: destFile, action: 'skipped', reason: 'hash 未变化，跳过' };
      }
    }
  }

  // NEW-P0-4: per-doc globs / alwaysApply
  const inclusion = docSteering.inclusion ?? 'always';
  let alwaysApply: boolean;
  let globsLine: string;
  if (inclusion === 'fileMatch' && docSteering.globs?.length) {
    alwaysApply = false;
    globsLine = docSteering.globs.join(',');
  } else {
    alwaysApply = true;
    globsLine = '';
  }

  const header = `<!-- generated at ${new Date().toISOString()}, source-hash: ${newHash}, source: ${relDocPath} -->`;
  const frontmatter = `---\ndescription: ${docType} documentation\nglobs: ${globsLine}\nalwaysApply: ${alwaysApply}\n---\n`;
  const output = `${header}\n${frontmatter}\n${docContent}`;

  if (dryRun) {
    return { cli: 'cursor', doc_type: docType, file_path: destFile, action: 'dry_run' };
  }
  ensureDir(destFile);
  safeWrite(destFile, output);
  return { cli: 'cursor', doc_type: docType, file_path: destFile, action: 'written' };
}

function writeCodebuddy(
  projectRoot: string,
  docType: string,
  docPath: string,
  docContent: string,
  dryRun: boolean,
  force: boolean
): SteeringWriteResult {
  const destFile = path.join(projectRoot, '.codebuddy', 'rules', `${docType}.md`);
  const relTarget = path.relative(path.dirname(destFile), docPath);

  if (dryRun) {
    return { cli: 'codebuddy', doc_type: docType, file_path: destFile, action: 'dry_run' };
  }

  ensureDir(destFile);

  // Windows 降级为内联副本
  if (process.platform === 'win32') {
    const header = `<!-- generated at ${new Date().toISOString()}, source-hash: ${md5short(docContent)} -->`;
    safeWrite(destFile, `${header}\n\n${docContent}`);
    return { cli: 'codebuddy', doc_type: docType, file_path: destFile, action: 'written' };
  }

  // 如果已存在且是软链接，先删除
  if (fs.existsSync(destFile)) {
    try {
      const stat = fs.lstatSync(destFile);
      if (stat.isSymbolicLink()) {
        fs.unlinkSync(destFile);
      } else {
        if (!force) {
          return { cli: 'codebuddy', doc_type: docType, file_path: destFile, action: 'skipped', reason: '目标文件已存在且非软链接，跳过' };
        }
        fs.unlinkSync(destFile);
      }
    } catch {
      // ignore
    }
  }

  fs.symlinkSync(relTarget, destFile);
  return { cli: 'codebuddy', doc_type: docType, file_path: destFile, action: 'symlinked' };
}

function writeClaude(
  projectRoot: string,
  docType: string,
  docPath: string,
  dryRun: boolean
): SteeringWriteResult {
  const claudeMd = path.join(projectRoot, 'CLAUDE.md');
  const relDocPath = path.relative(projectRoot, docPath);
  const openMarker = `<!-- doc-guardian:${docType} -->`;
  const closeMarker = `<!-- /doc-guardian:${docType} -->`;
  const block = `${openMarker}\n@${relDocPath}\n${closeMarker}`;

  if (dryRun) {
    return { cli: 'claude', doc_type: docType, file_path: claudeMd, action: 'dry_run' };
  }

  let content = '';
  if (fs.existsSync(claudeMd)) {
    content = fs.readFileSync(claudeMd, 'utf-8');
  }

  if (content.includes(openMarker)) {
    const regex = new RegExp(`${escapeRegex(openMarker)}[\\s\\S]*?${escapeRegex(closeMarker)}`, 'g');
    content = content.replace(regex, block);
  } else {
    content = content.trimEnd() + (content.length > 0 ? '\n\n' : '') + block + '\n';
  }

  safeWrite(claudeMd, content);
  return { cli: 'claude', doc_type: docType, file_path: claudeMd, action: 'written' };
}

function appendRuleLine(
  filePath: string,
  cli: string,
  docType: string,
  relDocPath: string,
  dryRun: boolean
): SteeringWriteResult {
  const marker = `# doc-guardian:${docType}: @${relDocPath}`;

  if (dryRun) {
    return { cli, doc_type: docType, file_path: filePath, action: 'dry_run' };
  }

  ensureDir(filePath);
  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8');
  }

  if (content.includes(marker)) {
    return { cli, doc_type: docType, file_path: filePath, action: 'skipped', reason: '引用行已存在（幂等跳过）' };
  }

  content = content.trimEnd() + (content.length > 0 ? '\n' : '') + marker + '\n';
  safeWrite(filePath, content);
  return { cli, doc_type: docType, file_path: filePath, action: 'written' };
}

function writeTrae(projectRoot: string, docType: string, docPath: string, dryRun: boolean): SteeringWriteResult {
  const destFile = path.join(projectRoot, '.trae', 'rules', 'project_rules.md');
  const relDocPath = path.relative(projectRoot, docPath);
  return appendRuleLine(destFile, 'trae', docType, relDocPath, dryRun);
}

function writeCline(projectRoot: string, docType: string, docPath: string, dryRun: boolean): SteeringWriteResult {
  const destFile = path.join(projectRoot, '.clinerules');
  const relDocPath = path.relative(projectRoot, docPath);
  return appendRuleLine(destFile, 'cline', docType, relDocPath, dryRun);
}

function writeWindsurf(projectRoot: string, docType: string, docPath: string, dryRun: boolean): SteeringWriteResult {
  const destFile = path.join(projectRoot, '.windsurfrules');
  const relDocPath = path.relative(projectRoot, docPath);
  return appendRuleLine(destFile, 'windsurf', docType, relDocPath, dryRun);
}

// P0-2: custom_cli 写入实现
function writeCustomCli(
  projectRoot: string,
  docType: string,
  docPath: string,
  docContent: string,
  customCli: {
    id: string;
    rules_file: string;
    strategy: 'append' | 'symlink' | 'inline';
    detect?: { bin?: string; dir?: string; env?: string };
  },
  dryRun: boolean
): SteeringWriteResult {
  // NEW-P1-10: detect 字段检测 —— 所有条件都要满足才写入
  if (customCli.detect) {
    const { bin, dir, env } = customCli.detect;
    const installed =
      (!bin || commandExists(bin)) &&
      (!dir || dirExists(dir)) &&
      (!env || !!process.env[env]);
    if (!installed) {
      return {
        cli: customCli.id,
        doc_type: docType,
        file_path: path.join(projectRoot, customCli.rules_file),
        action: 'skipped',
        reason: `CLI "${customCli.id}" 未检测到（detect 条件不满足），跳过`,
      };
    }
  }

  const destFile = path.join(projectRoot, customCli.rules_file);
  const relDocPath = path.relative(projectRoot, docPath);

  if (dryRun) {
    return { cli: customCli.id, doc_type: docType, file_path: destFile, action: 'dry_run' };
  }

  ensureDir(destFile);

  switch (customCli.strategy) {
    case 'append': {
      return appendRuleLine(destFile, customCli.id, docType, relDocPath, dryRun);
    }
    case 'symlink': {
      if (process.platform === 'win32') {
        // Windows 降级为 inline
        const header = `<!-- generated at ${new Date().toISOString()}, source-hash: ${md5short(docContent)} -->`;
        safeWrite(destFile, `${header}\n\n${docContent}`);
        return { cli: customCli.id, doc_type: docType, file_path: destFile, action: 'written' };
      }
      if (fs.existsSync(destFile)) {
        try {
          const stat = fs.lstatSync(destFile);
          if (stat.isSymbolicLink()) {
            fs.unlinkSync(destFile);
          } else {
            return { cli: customCli.id, doc_type: docType, file_path: destFile, action: 'skipped', reason: '目标文件已存在且非软链接，跳过' };
          }
        } catch { /* ignore */ }
      }
      const relTarget = path.relative(path.dirname(destFile), docPath);
      fs.symlinkSync(relTarget, destFile);
      return { cli: customCli.id, doc_type: docType, file_path: destFile, action: 'symlinked' };
    }
    case 'inline': {
      if (fs.existsSync(destFile)) {
        const existing = fs.readFileSync(destFile, 'utf-8');
        if (!isGeneratedFile(existing)) {
          return { cli: customCli.id, doc_type: docType, file_path: destFile, action: 'skipped', reason: '目标文件已存在且非自动生成，跳过' };
        }
      }
      const header = `<!-- generated at ${new Date().toISOString()}, source-hash: ${md5short(docContent)}, source: ${relDocPath} -->`;
      safeWrite(destFile, `${header}\n\n${docContent}`);
      return { cli: customCli.id, doc_type: docType, file_path: destFile, action: 'written' };
    }
  }
}

// ──────────────────────────────────────────────────────────
// 主函数
// ──────────────────────────────────────────────────────────

export async function syncSteering(
  args: SyncSteeringArgs,
  projects: DocGuardConfig[]
): Promise<SyncSteeringOutput> {
  const dryRun = args.dry_run ?? false;
  // NEW-P1-5: force=true 时绕过 enabled:false 检查（手动调用场景）
  const force = args.force ?? false;

  const allResults: Array<SteeringWriteResult & { project: string }> = [];
  let noCLIWarning: string | undefined;

  for (const config of projects) {
    const projectRoot = config._root;
    const steeringConfig = config.steering;

    // P0-3: 检查 enabled === false，跳过本项目；force=true 时绕过
    if (!force && steeringConfig?.enabled === false) {
      continue;
    }

    // P1-4: proper-lockfile 加锁，防止多 Agent 并发写入竞争
    // 锁文件放在项目根目录，不实际写文件（realpath:false）
    const lockFilePath = path.join(projectRoot, '.doc-guard.lock');
    let releaseLock: (() => Promise<void>) | null = null;

    if (!dryRun) {
      try {
        // 确保锁文件存在（proper-lockfile 要求目标文件存在）
        if (!fs.existsSync(lockFilePath)) {
          fs.writeFileSync(lockFilePath, '', 'utf-8');
        }
        releaseLock = await lockfile.lock(lockFilePath, { realpath: false, retries: { retries: 5, minTimeout: 100 } });
      } catch (lockErr) {
        // 加锁失败时降级为无锁执行（不阻断功能）
        releaseLock = null;
      }
    }

    try {
      // P1-1: 确定目标内置 CLI 列表
      // 优先级：args.cli > config.steering.cli > 自动检测
      let targetClis: string[];
      if (args.cli) {
        targetClis = Array.isArray(args.cli) ? args.cli : [args.cli];
      } else {
        const configCli = steeringConfig?.cli;
        if (configCli && configCli !== 'auto' && Array.isArray(configCli) && configCli.length > 0) {
          // 使用配置指定的 CLI 列表，再与本机安装的取交集
          const installed = new Set(detectInstalledClis());
          targetClis = configCli.filter((c) => installed.has(c));
        } else {
          targetClis = detectInstalledClis();
        }
      }

      // NEW-P2-2: 未检测到任何 CLI 时给出 warning
      if (targetClis.length === 0 && !steeringConfig?.custom_cli?.length) {
        noCLIWarning = '未检测到任何已安装的 AI 工具，且未配置 custom_cli。请手动指定 cli 参数，或在 .doc-guard.yaml 中配置 steering.cli。';
      }

      // 确定文档类型列表
      const docTypes = args.doc_types ?? steeringConfig?.doc_types ?? Object.keys(config.docs);

      for (const docType of docTypes) {
        const docConfig = config.docs[docType];
        if (!docConfig) continue;

        // NEW-P0-3: inject 开关检查（默认 false，未显式设 true 则跳过）
        if (!docConfig.steering?.inject) continue;

        const docPath = path.join(projectRoot, docConfig.path);
        if (!fs.existsSync(docPath)) continue;

        const docContent = fs.readFileSync(docPath, 'utf-8');
        // NEW-P0-4: per-doc steering 配置（inclusion / globs）
        const docSteering: SteeringDocConfig = docConfig.steering ?? {};

        // 处理内置 CLI
        for (const cli of targetClis) {
          let result: SteeringWriteResult;

          switch (cli) {
            case 'kiro':
              result = writeKiro(projectRoot, docType, docPath, docContent, docSteering, dryRun, force);
              break;
            case 'cursor':
              result = writeCursor(projectRoot, docType, docPath, docContent, docSteering, dryRun, force);
              break;
            case 'codebuddy':
              result = writeCodebuddy(projectRoot, docType, docPath, docContent, dryRun, force);
              break;
            case 'claude':
            case 'droid':
              result = writeClaude(projectRoot, docType, docPath, dryRun);
              if (cli === 'droid') result = { ...result, cli: 'droid' };
              break;
            case 'trae':
              result = writeTrae(projectRoot, docType, docPath, dryRun);
              break;
            case 'cline':
              result = writeCline(projectRoot, docType, docPath, dryRun);
              break;
            case 'windsurf':
              result = writeWindsurf(projectRoot, docType, docPath, dryRun);
              break;
            default:
              result = {
                cli,
                doc_type: docType,
                file_path: '',
                action: 'skipped',
                reason: `未知 CLI: ${cli}`,
              };
          }

          allResults.push({ ...result, project: config.project });
        }

        // P0-2: 处理 custom_cli（始终生效，不受 cli 字段控制）
        if (steeringConfig?.custom_cli?.length) {
          // 7.2.4: custom_cli.id 不允许与内置 CLI 名称重名
          const BUILTIN_IDS = new Set(['kiro', 'cursor', 'codebuddy', 'claude', 'droid', 'trae', 'cline', 'windsurf']);
          for (const c of steeringConfig.custom_cli) {
            if (BUILTIN_IDS.has(c.id)) {
              throw new Error(`custom_cli.id "${c.id}" 与内置 CLI 名称冲突，请使用唯一标识符`);
            }
          }
          for (const customCli of steeringConfig.custom_cli) {
            const result = writeCustomCli(projectRoot, docType, docPath, docContent, customCli, dryRun);
            allResults.push({ ...result, project: config.project });
          }
        }
      }
    } finally {
      if (releaseLock) {
        try { await releaseLock(); } catch { /* ignore */ }
      }
    }
  }

  return {
    ok: true,
    results: allResults,
    dry_run: dryRun,
    ...(noCLIWarning ? { warning: noCLIWarning } : {}),
  };
}
