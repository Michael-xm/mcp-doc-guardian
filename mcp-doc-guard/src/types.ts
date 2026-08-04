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
    };
    api?: {
      path: string;
      triggers?: string[];
      path_extract_regex?: string;
      contract_path?: string;
      auto_write?: 'stub_only' | 'full' | false;
      auto_write_template?: string;
      note?: string;
    };
    database?: {
      path: string;
      triggers?: string[];
      entity_pattern?: string;
      migration_pattern?: string;
      auto_write_template?: string;
    };
    overview?: {
      path: string;
      triggers?: string[];
      auto_write_template?: string;
    };
    [key: string]: {
      path: string;
      triggers?: string[];
      path_extract_regex?: string;
      description?: string;
      auto_write?: 'stub_only' | 'full' | false;
      auto_write_template?: string;
      [key: string]: unknown;
    } | undefined;
  };

  trigger_patterns?: Record<string, string>;

  coverage_baseline?: Record<string, number | 'disabled'>;

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
}
export interface ColdStartTask {
  project: string;
  doc_type: string;
  doc_path: string;
  status: 'pending' | 'skipped' | 'force_overwrite';
  source_globs: string[];
}
export interface DocColdStartResult {
  total: number;
  pending: number;
  skipped: number;
  tasks: ColdStartTask[];
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
