import { execSync } from 'child_process';
import * as path from 'path';
import { minimatch } from 'minimatch';
import type {
  CheckApiSyncArgs,
  ApiSyncResult,
  ToolError,
} from '../types';
import type { DocGuardConfig } from '../types';

function getCurrentBranch(root: string): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: root, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function getHeadCommit(root: string): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf-8' }).trim().slice(0, 8);
  } catch {
    return 'unknown';
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

function getDiffForFile(root: string, base: string, file: string): string {
  try {
    return execSync(`git diff ${base} -- "${file}"`, { cwd: root, encoding: 'utf-8' });
  } catch {
    return '';
  }
}

/** custom_detector 分支：manual 模式只警告，regex 模式做基础 diff */
function handleCustomDetector(
  config: DocGuardConfig,
  changedFiles: string[],
  base: string,
  root: string
): ApiSyncResult {
  const det = config.custom_detector!;
  const relevant = changedFiles.filter((f) => minimatch(f, det.source_files.pattern));

  const gitContext = {
    branch: getCurrentBranch(root),
    head_commit: getHeadCommit(root),
    base,
  };

  if (det.doc_sync_check === 'manual') {
    return {
      warning: relevant.length > 0,
      changed_annotations: relevant,
      api_doc_updated: false,
      git_context: gitContext,
      detail:
        relevant.length > 0
          ? `custom_detector(manual)：检测到 ${relevant.length} 个变更文件，请人工核对 API 文档`
          : '无相关文件变更',
    };
  }

  // regex 模式
  const routeRegex = det.source_files.route_regex
    ? new RegExp(det.source_files.route_regex)
    : null;
  const changedAnnotations: string[] = [];

  if (routeRegex) {
    for (const file of relevant) {
      const diff = getDiffForFile(root, base, file);
      const addedLines = diff.split('\n').filter((l) => l.startsWith('+'));
      for (const line of addedLines) {
        if (routeRegex.test(line)) {
          changedAnnotations.push(`${file}: ${line.trim()}`);
        }
      }
    }
  }

  const apiDocPath = config.docs.api?.path;
  const apiDocUpdated = apiDocPath ? changedFiles.includes(apiDocPath) : false;

  return {
    warning: changedAnnotations.length > 0 && !apiDocUpdated,
    changed_annotations: changedAnnotations,
    api_doc_updated: apiDocUpdated,
    git_context: gitContext,
    detail:
      changedAnnotations.length > 0
        ? apiDocUpdated
          ? `custom_detector(regex)：检测到 ${changedAnnotations.length} 处变更，API 文档已更新`
          : `custom_detector(regex)：检测到 ${changedAnnotations.length} 处变更，API 文档未更新`
        : '未检测到接口相关变更',
  };
}

export async function checkApiSync(
  args: CheckApiSyncArgs,
  projects: DocGuardConfig[]
): Promise<ApiSyncResult | ToolError> {
  const { project, base = 'HEAD' } = args;

  const config = projects.find((p) => p.project === project);
  if (!config) {
    return { error: true, code: 'FILE_NOT_FOUND', message: `项目 "${project}" 未找到` };
  }

  const root = config._root;
  const gitContext = {
    branch: getCurrentBranch(root),
    head_commit: getHeadCommit(root),
    base,
  };

  let changedFiles: string[];
  try {
    changedFiles = getChangedFiles(root, base);
  } catch {
    return { error: true, code: 'GIT_FAILURE', message: `git diff 执行失败，base: ${base}` };
  }

  let relevantFiles: string[];
  let annotationPattern: RegExp;

  switch (config.type) {
    case 'java-spring': {
      const pattern = config.controller?.pattern ?? '**/*Controller.java';
      relevantFiles = changedFiles.filter((f) => minimatch(f, pattern));
      annotationPattern = new RegExp(
        config.controller?.annotation_regex ??
          '@(GetMapping|PostMapping|PutMapping|DeleteMapping|RequestMapping|PatchMapping)'
      );
      break;
    }
    case 'java-gradle': {
      const pattern = config.controller?.pattern ?? '**/*Controller.java';
      relevantFiles = changedFiles.filter((f) => minimatch(f, pattern));
      annotationPattern = new RegExp(
        config.controller?.annotation_regex ??
          '@(GetMapping|PostMapping|PutMapping|DeleteMapping|RequestMapping|PatchMapping)'
      );
      break;
    }
    case 'vue-ts': {
      const pattern = config.api_call?.pattern ?? 'src/api/**/*.ts';
      relevantFiles = changedFiles.filter((f) => minimatch(f, pattern));
      annotationPattern = new RegExp(
        config.api_call?.call_regex ?? '(http|request|api)\\.(get|post|put|delete|patch)\\('
      );
      break;
    }
    case 'uniapp': {
      const pattern = config.api_call?.pattern ?? '**/*.{vue,js,ts}';
      relevantFiles = changedFiles.filter((f) => minimatch(f, pattern));
      annotationPattern = new RegExp(
        config.api_call?.call_regex ?? 'uni\\.request|http\\.(get|post|put|delete)'
      );
      break;
    }
    case 'go': {
      const pattern = config.api_call?.pattern ?? '**/*.go';
      relevantFiles = changedFiles.filter((f) => minimatch(f, pattern));
      annotationPattern = new RegExp(
        config.api_call?.call_regex ?? '\\.(GET|POST|PUT|DELETE|PATCH)\\('
      );
      break;
    }
    case 'python': {
      const pattern = config.api_call?.pattern ?? '**/*.py';
      relevantFiles = changedFiles.filter((f) => minimatch(f, pattern));
      annotationPattern = new RegExp(
        config.api_call?.call_regex ?? '@(app|router)\\.(get|post|put|delete|patch)'
      );
      break;
    }
    case 'react-ts': {
      const pattern = config.api_call?.pattern ?? 'src/**/*.{ts,tsx}';
      relevantFiles = changedFiles.filter((f) => minimatch(f, pattern));
      annotationPattern = /fetch\(|axios\.(get|post|put|delete|patch)/;
      break;
    }
    default: {
      if (config.custom_detector) {
        return handleCustomDetector(config, changedFiles, base, root);
      }
      // v5.8 O1：未知类型输出 WARN 而非静默跳过
      return {
        warning: true,
        changed_annotations: [],
        api_doc_updated: false,
        git_context: gitContext,
        detail: `未知技术栈类型 "${config.type}"，请配置 custom_detector 或使用内置类型（java-spring/java-gradle/vue-ts/uniapp/go/python/react-ts）`,
      };
    }
  }

  if (relevantFiles.length === 0) {
    return {
      warning: false,
      changed_annotations: [],
      api_doc_updated: false,
      git_context: gitContext,
      detail: '未检测到接口相关文件变更',
    };
  }

  // 提取变更注解/调用
  const changedAnnotations: string[] = [];
  for (const file of relevantFiles) {
    const diff = getDiffForFile(root, base, file);
    const addedLines = diff.split('\n').filter((l) => l.startsWith('+'));
    for (const line of addedLines) {
      if (annotationPattern.test(line)) {
        changedAnnotations.push(`${path.relative(root, path.join(root, file))}: ${line.trim()}`);
      }
    }
  }

  if (changedAnnotations.length === 0) {
    return {
      warning: false,
      changed_annotations: [],
      api_doc_updated: false,
      git_context: gitContext,
      detail: '接口文件有变更但无注解/调用变更',
    };
  }

  const apiDocPath = config.docs.api?.path;
  const apiDocUpdated = apiDocPath ? changedFiles.includes(apiDocPath) : false;

  return {
    warning: !apiDocUpdated,
    changed_annotations: changedAnnotations,
    api_doc_updated: apiDocUpdated,
    git_context: gitContext,
    detail: apiDocUpdated
      ? `检测到 ${changedAnnotations.length} 处接口变更，api.md 已更新`
      : `检测到 ${changedAnnotations.length} 处接口变更，api.md 未更新，请及时同步`,
  };
}
