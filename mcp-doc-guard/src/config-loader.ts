import Ajv from 'ajv';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { glob } from 'glob';
import type { DocGuardConfig } from './types';
import schema from '../doc-guard.schema.json';

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

/** v5.1：DOCGUARD_ROOT 支持独立 repo 场景，默认 cwd() */
export const DOCGUARD_ROOT = process.env.DOCGUARD_ROOT ?? process.cwd();

export function loadAndValidateConfig(filePath: string): DocGuardConfig | null {
  try {
    const raw = yaml.load(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    if (!validate(raw)) {
      const errors = validate.errors!.map((e) => `  ${e.instancePath} ${e.message}`).join('\n');
      console.warn(`[WARN] 配置校验失败，跳过 (${filePath}):\n${errors}`);
      return null;
    }
    const config = raw as unknown as DocGuardConfig;
    if (!config.schema_version) {
      console.warn(`[WARN] ${filePath} 缺少 schema_version，视为 "0.x" 旧配置`);
    }
    // 注入 _root：配置文件所在目录
    config._root = path.dirname(filePath);
    return config;
  } catch (e) {
    console.warn(`[WARN] 读取配置失败，跳过 (${filePath}):`, e);
    return null;
  }
}

export function loadAllProjects(): DocGuardConfig[] {
  const root = DOCGUARD_ROOT;
  const configFiles = glob.sync('**/.doc-guard.yaml', {
    cwd: root,
    ignore: ['**/node_modules/**'],
    absolute: true,
  });
  return configFiles
    .map((f) => loadAndValidateConfig(f))
    .filter((c): c is DocGuardConfig => c !== null);
}

/**
 * --validate-only 模式：扫描所有配置并校验，存在错误返回 false
 */
export function runValidateOnly(): boolean {
  const root = DOCGUARD_ROOT;
  const configFiles = glob.sync('**/.doc-guard.yaml', {
    cwd: root,
    ignore: ['**/node_modules/**'],
    absolute: true,
  });

  if (configFiles.length === 0) {
    console.log('[validate-only] 未发现任何 .doc-guard.yaml 文件');
    return true;
  }

  let hasError = false;
  for (const filePath of configFiles) {
    const result = loadAndValidateConfig(filePath);
    if (result === null) {
      hasError = true;
      console.error(`[ERROR] ${filePath} 校验失败`);
    } else {
      console.log(`[OK]    ${filePath} (project: ${result.project})`);
    }
  }
  return !hasError;
}
