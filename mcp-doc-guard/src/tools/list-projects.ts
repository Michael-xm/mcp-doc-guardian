import type { DocGuardConfig } from '../types';

export interface ListProjectsArgs {
  scope?: 'all' | 'current';
}

export interface ListProjectsResult {
  projects: Array<{
    project: string;
    type: string;
    mode: string;
    description?: string;
    team_name?: string;
    docs: string[];
    pending_path: string;
    allow_doc_write?: string | boolean;
  }>;
  total: number;
}

export function listProjects(
  args: ListProjectsArgs,
  configs: DocGuardConfig[]
): ListProjectsResult {
  const list = configs.map((c) => ({
    project: c.project,
    type: c.type,
    mode: c.mode,
    description: c.description,
    team_name: c.team_name,
    docs: Object.keys(c.docs),
    pending_path: c.docs.changelog.pending_path,
    allow_doc_write: c.skill?.allow_doc_write,
  }));

  return { projects: list, total: list.length };
}
