import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';
import type {
  DocGuardConfig,
  CheckDbSyncArgs,
  CheckDbSyncOutput,
  DbSyncItem,
} from '../types';
import { DOCGUARD_ROOT } from '../config-loader';

function loadWritePrompt(templatePath: string, projectRoot: string): string | undefined {
  try {
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

function getChangedFiles(root: string, base: string): string[] {
  try {
    return execSync(`git diff ${base} --name-only`, { cwd: root, encoding: 'utf-8' })
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function extractEntityName(filePath: string): string {
  return path.basename(filePath).replace(/\.(java|go|py|ts)$/, '');
}

function isEntityCoveredInDoc(entityName: string, docContent: string): boolean {
  // 简单关键词匹配：文档中出现了实体名（忽略大小写）
  const lower = entityName.toLowerCase().replace(/entity$|mapper$/, '');
  return docContent.toLowerCase().includes(lower);
}

export async function checkDbSync(
  args: CheckDbSyncArgs,
  projects: DocGuardConfig[]
): Promise<CheckDbSyncOutput> {
  const { project, base = 'HEAD' } = args;

  const config = projects.find((p) => p.project === project);
  if (!config) {
    return { error: true, code: 'FILE_NOT_FOUND', message: `项目 "${project}" 未找到` };
  }

  if (!config.docs.database) {
    return {
      error: true,
      code: 'FILE_NOT_FOUND',
      message: `项目 "${project}" 未配置 docs.database`,
    };
  }

  const root = config._root;
  const changedFiles = getChangedFiles(root, base);

  // 构建实体/Mapper 匹配 pattern
  const entityPattern = config.docs.database.entity_pattern ?? '**/*Entity.java';
  const migrationPattern = config.docs.database.migration_pattern;

  const patterns = [
    entityPattern,
    entityPattern.replace(/Entity/, 'Mapper'),
    entityPattern.replace(/Entity\.java/, 'Mapper.xml'),
  ];
  if (migrationPattern) patterns.push(migrationPattern);

  const changedEntities = changedFiles.filter((f) =>
    patterns.some((pat) => minimatch(f, pat))
  );

  if (changedEntities.length === 0) {
    return {
      ok: true,
      result: {
        project,
        changed_entities: 0,
        covered: 0,
        uncovered: [],
        coverage_ratio: 1.0,
      },
    };
  }

  // 读取 database.md
  const dbDocPath = path.join(root, config.docs.database.path);
  let dbDocContent = '';
  if (fs.existsSync(dbDocPath)) {
    dbDocContent = fs.readFileSync(dbDocPath, 'utf-8');
  }

  const uncovered: DbSyncItem[] = [];
  let covered = 0;

  for (const entityFile of changedEntities) {
    const entityName = extractEntityName(entityFile);
    const inDoc = isEntityCoveredInDoc(entityName, dbDocContent);
    if (inDoc) {
      covered++;
    } else {
      uncovered.push({
        entity_file: entityFile,
        in_database_md: false,
        suggestion: `建议在 ${config.docs.database.path} 中添加 "${entityName}" 相关表结构说明`,
      });
    }
  }

  return {
    ok: true,
    result: {
      project,
      changed_entities: changedEntities.length,
      covered,
      uncovered,
      coverage_ratio:
        changedEntities.length > 0 ? covered / changedEntities.length : 1.0,
      ...((() => {
        const templatePath =
          config.docs.database?.auto_write_template ??
          'mcp-doc-guardian/docs/agents/database-prompt.md';
        const write_prompt = loadWritePrompt(templatePath, root);
        return write_prompt ? { write_prompt } : {};
      })()),
    },
  };
}
