import * as fs from 'fs';
import * as path from 'path';
import type { DocGuardConfig, ChangeReleaseArgs, ChangeReleaseOutput, ToolError } from '../types';

type ProjectChangeReleaseResult = ChangeReleaseOutput | ToolError;

export async function projectChangeRelease(
  args: ChangeReleaseArgs,
  projects: DocGuardConfig[]
): Promise<ProjectChangeReleaseResult> {
  const config = projects.find((p) => p.project === args.project);
  if (!config) {
    return { error: true, code: 'FILE_NOT_FOUND', message: `项目 "${args.project}" 未找到` };
  }

  const root = config._root;
  const pendingDir = path.join(root, config.docs.changelog.pending_path);
  const changelogPath = path.join(root, config.docs.changelog.path);
  const now = new Date().toISOString().split('T')[0];

  if (!fs.existsSync(pendingDir)) {
    return {
      error: false,
      merged_entries: 0,
      version_anchor: args.version,
      archived_pending_files: [],
      changelog_path: config.docs.changelog.path,
    };
  }

  const pendingFiles = fs.readdirSync(pendingDir).filter((f) => f.endsWith('.md'));
  if (pendingFiles.length === 0) {
    return {
      error: false,
      merged_entries: 0,
      version_anchor: args.version,
      archived_pending_files: [],
      changelog_path: config.docs.changelog.path,
    };
  }

  // 合并所有 pending 内容（按 change_type 分组）
  const sections: Record<string, string[]> = { Added: [], Changed: [], Fixed: [], Removed: [] };

  for (const file of pendingFiles) {
    const content = fs.readFileSync(path.join(pendingDir, file), 'utf-8');
    // 去除 front matter
    const body = content.replace(/^---[\s\S]*?---\r?\n/, '').trim();

    // 提取各 section 内容
    const addedMatch = body.match(/### Added\r?\n([\s\S]*?)(?=###|$)/);
    const changedMatch = body.match(/### Changed\r?\n([\s\S]*?)(?=###|$)/);
    const fixedMatch = body.match(/### Fixed\r?\n([\s\S]*?)(?=###|$)/);
    const removedMatch = body.match(/### Removed\r?\n([\s\S]*?)(?=###|$)/);

    if (addedMatch) sections.Added.push(addedMatch[1].trim());
    if (changedMatch) sections.Changed.push(changedMatch[1].trim());
    if (fixedMatch) sections.Fixed.push(fixedMatch[1].trim());
    if (removedMatch) sections.Removed.push(removedMatch[1].trim());
  }

  // 构建版本 entry
  let versionEntry = `\n\n## [${args.version}] — ${now}\n`;
  for (const [section, items] of Object.entries(sections)) {
    const filtered = items.filter((i) => i && i !== '-' && i !== '- ');
    if (filtered.length > 0) {
      versionEntry += `\n### ${section}\n${filtered.join('\n')}\n`;
    }
  }

  // 写入 changelog
  const changelogDir = path.dirname(changelogPath);
  if (!fs.existsSync(changelogDir)) {
    fs.mkdirSync(changelogDir, { recursive: true });
  }

  let existing = '';
  if (fs.existsSync(changelogPath)) {
    existing = fs.readFileSync(changelogPath, 'utf-8');
  } else {
    existing = `# Changelog\n\nAll notable changes to "${config.project}" will be documented here.\n`;
  }

  fs.writeFileSync(changelogPath, existing + versionEntry, 'utf-8');

  // 归档 pending 文件到 released/{version}/（符合方案规范）
  const archivedDir = path.join(pendingDir, '..', 'released', args.version);
  fs.mkdirSync(archivedDir, { recursive: true });
  const archivedFiles: string[] = [];

  for (const file of pendingFiles) {
    fs.renameSync(path.join(pendingDir, file), path.join(archivedDir, file));
    archivedFiles.push(file);
  }

  return {
    error: false,
    merged_entries: pendingFiles.length,
    version_anchor: args.version,
    archived_pending_files: archivedFiles,
    changelog_path: config.docs.changelog.path,
  };
}
