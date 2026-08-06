// ============================================================
// types.ts — 全局类型定义 + withTimeout 工具
// ============================================================

export interface ToolError {
  error: true;
  code: 'GIT_FAILURE' | 'FILE_NOT_FOUND' | 'PARSE_ERROR' | 'NOT_GIT_REPO' | 'TIMEOUT';
  message: string;
}

/** 所有工具统一 30s 超时 */
const TOOL_TIMEOUT_MS = 30_000;

export function withTimeout<T>(promise: Promise<T>, ms = TOOL_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject({ error: true, code: 'TIMEOUT', message: `工具执行超时 (${ms}ms)` } as ToolError),
        ms
      )
    ),
  ]);
}

// ---- .doc-guard.yaml 配置类型 ----

export interface DocGuardConfig {
  schema_version?: string;
  project: string;
  type: string;
  mode: 'standalone' | 'team';
  team_name?: string;
  description?: string;

  team?: {
    my_role?: string;
    roles?: Array<{
      id: string;
      allowed_tools: string[];
      denied_tools?: string[];
    }>;
  };

  skill?: {
    extra_triggers?: string[];
    allow_doc_write?: 'stub_only' | 'full' | false;
  };

  controller?: {
    pattern: string;
    annotation_regex: string;
  };

  api_call?: {
    pattern: string;
    call_regex: string;
  };

  custom_detector?: {
    source_files: { pattern: string; route_regex?: string };
    doc_sync_check: 'manual' | 'regex';
  };

  docs: {
    changelog: {
      path: string;
      pending_path: string;
      format?: 'keepachangelog' | 'timestamp';
      auto_version?: boolean;
      triggers?: string[];
      steering?: SteeringDocConfig;
    };
    api?: {
      path: string;
      triggers?: string[];
      path_extract_regex?: string;
      contract_path?: string;
      auto_write?: 'stub_only' | 'full' | false;
      auto_write_template?: string;
      note?: string;
      steering?: SteeringDocConfig;
    };
    database?: {
      path: string;
      triggers?: string[];
      entity_pattern?: string;
      migration_pattern?: string;
      auto_write_template?: string;
      steering?: SteeringDocConfig;
    };
    overview?: {
      path: string;
      triggers?: string[];
      auto_write_template?: string;
      steering?: SteeringDocConfig;
    };
    [key: string]: {
      path: string;
      triggers?: string[];
      path_extract_regex?: string;
      description?: string;
      auto_write?: 'stub_only' | 'full' | false;
      auto_write_template?: string;
      steering?: SteeringDocConfig;
      [key: string]: unknown;
    } | undefined;
  };

  trigger_patterns?: Record<string, string>;

  coverage_baseline?: Record<string, number | 'disabled'>;

  steering?: {
    enabled?: boolean;
    /** 默认注入的文档类型，不填则对所有 docs 类型执行 */
    doc_types?: string[];
    /**
     * 目标工具：'auto' 或内置 CLI id 数组。
     * 不填（undefined）等同于 'auto'（自动检测）。
     */
    cli?: 'auto' | string[];
    /** 扩展不在内置列表中的自定义 CLI */
    custom_cli?: Array<{
      id: string;
      rules_file: string;
      strategy: 'append' | 'symlink' | 'inline';
      /** 可选：CLI 安装检测条件，全部满足才写入；不填则始终写入 */
      detect?: {
        /** 检测 $PATH 中是否存在该可执行文件 */
        bin?: string;
        /** 检测目录是否存在（支持 ~ 前缀） */
        dir?: string;
        /** 检测环境变量是否已设置（非空） */
        env?: string;
      };
    }>;
  };

  /** MCP Server 加载时注入：项目根目录绝对路径 */
  _root: string;
}

// ---- 工具参数 / 结果类型 ----

export interface CheckApiSyncArgs {
  project: string;
  base?: string;
}

export interface ApiSyncResult {
  error?: false;
  warning: boolean;
  changed_annotations: string[];
  api_doc_updated: boolean;
  git_context: {
    branch: string;
    head_commit: string;
    base: string;
  };
  detail: string;
  /** 从 docs.api.auto_write_template 加载的写作提示词，AI 应遵照其格式要求更新文档 */
  write_prompt?: string;
}

export interface ChangelogStatusResult {
  error?: false;
  has_pending: boolean;
  pending_files: string[];
  pending_branches: string[];
  pending_count: number;
  by_status?: {
    draft: string[];
    ready_for_review: string[];
    reviewing: string[];
  };
}

export interface TeamDocStatusResult {
  error?: false;
  projects: ProjectDocStatus[];
  team_summary: {
    total_changes_last_30d: number;
    changelog_coverage: number;
    draft_pending_rate: number;
    avg_draft_age_days: number;
    cross_ref_warnings: number;
  };
}

export interface ProjectDocStatus {
  project: string;
  description?: string;
  pending_count: number;
  has_draft: boolean;
  api_coverage?: number;
  allow_doc_write?: string | boolean;
  allow_doc_write_hint?: string;
  warning?: string;
}

export interface ProjectDocHealthArgs {
  project: string;
  days?: number;
}

export interface ProjectDocHealthResult {
  project: string;
  period_days: number;
  api_coverage: {
    ratio: number;
    code_count: number;
    doc_count: number;
    uncovered: string[];
  };
  database_coverage?: {
    ratio: number;
    code_count: number;
    doc_count: number;
  };
  draft_items: {
    count: number;
    oldest_age_days: number;
    items: Array<{ file: string; line: string; age_days: number }>;
  };
  pending_changelogs: {
    count: number;
    branches: string[];
  };
  sop_compliance: {
    total_merges: number;
    compliant_merges: number;
    rate: number;
    non_compliant: string[];
  };
  health_score: number;
  allow_doc_write_hint?: string;
}

export interface ClaimPendingArgs {
  project: string;
  filename: string;
  reviewer_id: string;
}

export type ClaimPendingResult =
  | { error: false; claimed: true; message: string }
  | { error: false; claimed: false; message: string; reviewing_since: string }
  | ToolError;

export interface ProposeChangeArgs {
  project: string;
  id: string;
  title: string;
  change_type: 'feature' | 'bugfix' | 'refactor';
  affects_projects?: string[];
}
export type ProposeChangeResult =
  | { error: false; change_dir: string; created_files: string[]; next_steps: string }
  | ToolError;

export interface ChangeListArgs {
  project: string;
  status?: 'active' | 'archived' | 'all';
}
export type ChangeListResult =
  | { error: false; changes: Array<{ id: string; title: string; completion_rate: number; status: string }> }
  | ToolError;

export interface ChangeStatusArgs {
  project: string;
  id: string;
}
export type ChangeStatusResult =
  | {
      error: false;
      change_id: string;
      tasks_total: number;
      tasks_completed: number;
      completion_rate: number;
      pending_tasks: string[];
      has_draft_marks: boolean;
      ready_for_archive: boolean;
    }
  | ToolError;

export interface ChangeArchiveArgs {
  project: string;
  id: string;
}
export type ChangeArchiveResult =
  | { error: false; archived_to: string; changelog_appended: boolean; idempotent: boolean }
  | ToolError;

export interface ChangeReleaseArgs {
  project: string;
  version: string;
}
export type ChangeReleaseResult =
  | {
      error: false;
      merged_entries: number;
      version_anchor: string;
      archived_pending_files: string[];
      changelog_path: string;
    }
  | ToolError;

export interface AuditLogArgs {
  project: string;
  action: string;
  caller_id?: string;
  params_summary?: string;
  result?: 'success' | 'failure' | 'skipped';
}
export type AuditLogResult = { ok: true; written_to: string } | ToolError;

export interface CheckDbSyncArgs {
  project: string;
  base?: string;
}
export interface DbSyncItem {
  entity_file: string;
  in_database_md: boolean;
  suggestion?: string;
}
export interface CheckDbSyncResult {
  project: string;
  changed_entities: number;
  covered: number;
  uncovered: DbSyncItem[];
  coverage_ratio: number;
  /** Draft 文档未补全时为 true */
  warning?: boolean;
  /** 补充说明 */
  detail?: string;
  /** 从 docs.database.auto_write_template 加载的写作提示词，AI 应遵照其格式要求更新文档 */
  write_prompt?: string;
}
export type CheckDbSyncOutput = { ok: true; result: CheckDbSyncResult } | ToolError;

export interface CheckCustomDocSyncArgs {
  project: string;
  doc_type: string;
  base?: string;
}
export interface CheckCustomDocSyncResult {
  doc_type: string;
  trigger_matched: boolean;
  changed_files: string[];
  doc_updated: boolean;
  warning: boolean;
}
export type CheckCustomDocSyncOutput =
  | { ok: true; result: CheckCustomDocSyncResult }
  | { ok: false; reason: 'NO_TRIGGER_PATTERNS'; message: string }
  | ToolError;

export interface DocColdStartArgs {
  force?: boolean;
  /**
   * 用户选择要注入到 AI 工具自定义指令的文档类型列表。
   * 指定后，doc_cold_start 会自动将对应文档的 `steering.inject` 回写为 true 到 .doc-guard.yaml。
   * 例如：["overview", "database"]
   */
  steering_inject_types?: string[];
}
export interface ColdStartTask {
  project: string;
  doc_type: string;
  doc_path: string;
  status: 'pending' | 'skipped' | 'force_overwrite' | 'created';
  source_globs: string[];
  /** 从 auto_write_template 加载的写作提示词，AI 应遵照其格式要求补全文档 */
  write_prompt?: string;
}
export interface DocColdStartResult {
  total: number;
  pending: number;
  skipped: number;
  created: number;
  tasks: ColdStartTask[];
  /** 下一步操作建议，包含可直接执行的快捷指令 */
  next_action?: {
    summary: string;
    quick_command: string;
  };
}
export type DocColdStartOutput =
  | { ok: true; result: DocColdStartResult }
  | { ok: false; reason: 'NO_PROJECTS_FOUND'; message: string }
  | ToolError;

export type PatchMode = 'append_stubs';
export interface DocPatch {
  doc_type: 'api' | 'database' | 'overview' | 'architecture' | string;
  section_title: string;
  stub_content: string;
}
export interface ApplyDocPatchArgs {
  project: string;
  mode: PatchMode;
  patches: DocPatch[];
  dry_run?: boolean;
}
export interface PatchApplyResult {
  doc_type: string;
  file_path: string;
  lines_added: number;
  dry_run: boolean;
}
export type ApplyDocPatchOutput =
  | { ok: true; applied: PatchApplyResult[] }
  | { ok: false; reason: 'NOT_ENABLED'; message: string }
  | ToolError;

export interface ChangeReleaseOutput {
  error: false;
  merged_entries: number;
  version_anchor: string;
  archived_pending_files: string[];
  changelog_path: string;
}

export interface CommitBasedComplianceResult {
  path: 'commit_based';
  total_commits: number;
  compliant_commits: number;
  rate: number;
  non_compliant_subjects: string[];
}

export interface PendingFileMeta {
  branch?: string;
  author?: string;
  created?: string;
  status?: 'draft' | 'ready_for_review' | 'reviewing';
  reviewing_since?: string | null;
  reviewing_by?: string | null;
  project?: string;
  change_type?: string;
  affects_projects?: string[];
}

// ---- sync_steering 工具类型 ----

export interface SteeringDocConfig {
  inject?: boolean;
  inclusion?: 'always' | 'fileMatch';
  globs?: string[];
}

export interface SyncSteeringArgs {
  cli?: string | string[];
  doc_types?: string[];
  dry_run?: boolean;
  force?: boolean;
}

export interface SteeringWriteResult {
  cli: string;
  doc_type: string;
  file_path: string;
  action: 'written' | 'skipped' | 'dry_run' | 'symlinked';
  reason?: string;
}

export type SyncSteeringOutput = {
  ok: true;
  results: Array<SteeringWriteResult & { project: string }>;
  dry_run: boolean;
  /** NEW-P2-2: 未检测到任何 CLI 时提示用户手动指定 */
  warning?: string;
};

// ---- check_git_sync 工具类型 ----

export interface CheckGitSyncArgs {
  project: string;
  base?: string;
  /** 只分析指定文件（相对于项目根目录），不填则分析 base 以来所有变更文件 */
  files?: string[];
}

export interface GitCommitInfo {
  hash: string;
  subject: string;
  author: string;
  date: string;
  /** 提交是否符合 type: message 规范 */
  compliant: boolean;
  /** 识别到的 commit type，不合规时为 null */
  type: string | null;
  /** 不合规原因 */
  violation?: string;
}

export interface GitBranchInfo {
  name: string;
  /** 分支是否符合分支命名规范 */
  compliant: boolean;
  /** 识别到的分支类型（feat/fix/release/hotfix 等），不合规时为 null */
  branch_type: string | null;
  /** 不合规原因 */
  violation?: string;
}

export interface CheckGitSyncResult {
  project: string;
  git_context: {
    branch: string;
    head_commit: string;
    base: string;
  };
  /** 当前分支规范检查 */
  branch_check: GitBranchInfo;
  /** 本次扫描范围内的提交列表 */
  commits: GitCommitInfo[];
  /** 不合规提交数 */
  non_compliant_count: number;
  /** 整体是否合规 */
  compliant: boolean;
  /** 本次变更文件列表 */
  changed_files: string[];
  /** 变更文件按 commit type 分类的建议拆分方案 */
  split_suggestion?: Array<{
    suggested_type: string;
    files: string[];
    suggested_message: string;
  }>;
  /** 写作提示词（来自 docs.git.auto_write_template 配置） */
  write_prompt?: string;
  detail: string;
}
