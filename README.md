<p align="center">
  <h1 align="center">mcp-doc-guardian</h1>
  <p align="center">
    <b>An Agent-based documentation management system for your codebase.</b><br/>
    Let your AI Agent detect code changes and keep docs in sync — automatically, via MCP.
  </p>
  <p align="center">
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License"/></a>
    <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version"/>
    <img src="https://img.shields.io/badge/protocol-MCP-green.svg" alt="MCP"/>
    <img src="https://img.shields.io/badge/tools-19-orange.svg" alt="Tools"/>
  </p>
</p>

---

## What is this

**mcp-doc-guardian is a documentation management system driven entirely by AI Agents.**

It is not a script or a lint tool. Via the MCP protocol, it injects documentation management capabilities directly into your AI Agent (CodeBuddy / Cursor / Claude Code / Cline, etc.), giving the Agent the ability to:

- Detect code changes and decide whether docs need updating
- Automatically find drift between code and documentation (APIs, database, pages, etc.)
- Generate doc content that follows your team's format and conventions
- Track the full lifecycle of every change, from proposal to release

**Core idea:** You write code. The Agent watches the docs. Docs never go stale.

---

## See it in action

```
You:  I just added a new API endpoint. Check if the docs are up to date.

AI:   [calls check_api_sync]
      ⚠ Drift detected: POST /api/v1/orders is in the code but missing from api.md
      → Stub added to docs/project/api.md
      → Pending changelog created: docs/changelogs/pending/2026-08-03-orders.md
      ✓ Change ticket #CHG-001 created and ready for review.
```

---

## Quick Start

See **[QUICK_START.md](./QUICK_START.md)** — 5 steps, about 5 minutes.

---

## What it does

### Core capabilities

| Capability | Description |
|-----------|-------------|
| **Doc injection into AI tools (Steering)** | When docs are generated or updated, automatically writes them into the project-level rules files of your installed AI tools (Kiro / Cursor / CodeBuddy / Claude Code / Trae / Cline / Windsurf), so AI starts every conversation already aware of your project context — no manual prompting needed |
| **API doc sync detection** | Scans Controllers / HTTP calls, diffs against `api.md`, pinpoints every undocumented endpoint |
| **Database doc sync detection** | Scans Entity / Mapper / SQL migration files, diffs against `database.md`, flags new fields or tables |
| **Draft marker scanning** | Scans all docs for `[Draft]` / `[TODO]` markers, outputs a consolidated action list |
| **Changelog automation** | Creates a pending changelog entry on every detected change; merges them all on release |
| **Cold-start scaffolding** | On a new project, one command scans the whole codebase and generates all missing doc skeletons (idempotent — never overwrites existing content) |
| **Doc health scoring** | Measures doc coverage against your configured baselines; reports per-project and team-wide scores |
| **Change lifecycle tracking** | Proposal → claim → complete → archive, fully traceable, with multi-Agent claim locking |
| **Cross-project reference check** | Validates doc cross-references across projects; surfaces broken links before they cause confusion |
| **Custom doc types** | Attach sync detection to any file change — page routes, env vars, deploy configs, anything |
| **Multi-Agent role isolation** | In `team` mode, assign different tool permissions to different Agents (e.g. implementer can write, reviewer is read-only) |

### Typical scenarios

| You did this | Agent does this automatically |
|-------------|------------------------------|
| Added a REST endpoint | Detects new Controller, adds stub to `api.md`, creates pending changelog |
| Added a database table | Detects new Entity, adds table description stub to `database.md` |
| Changed `.env` config | Triggers custom doc node, reminds to update `docs/env.md` |
| Inherited an undocumented project | `doc_cold_start` scans everything, generates full doc directory skeleton |
| About to release | `project_change_release` merges pending changelogs, produces version record |
| Want team doc health overview | `team_doc_status` outputs health scores and open items for every project |

---

## All 19 tools

> These tools are called by the Agent as needed. You usually just describe what you want in plain language.

<details>
<summary>L0 — Atomic tools (expand)</summary>

| Tool | When it's used | What it does |
|------|---------------|-------------|
| `list_projects` | See registered projects | Lists all registered projects and their stacks |
| `check_api_sync` | Check API doc freshness | Git-diff-based compare of Controllers / HTTP calls vs `api.md`; outputs drift list |
| `check_db_sync` | Check DB doc freshness | Compares Entity / Mapper vs `database.md`; flags new fields or tables |
| `check_custom_doc_sync` | Check custom doc freshness | Detects file changes matching `trigger_patterns` and checks the linked doc |
| `scan_draft` | Triage doc backlog | Finds all `[Draft]` / `[TODO]` markers across all docs |
| `changelog_status` | See pending changelogs | Lists all pending entries with status and creation time |
| `claim_pending` | Claim a doc task | Locks a pending doc for processing (24h timeout auto-release, prevents duplicate work) |
| `audit_log` | Write audit record | Appends a tool-call record to the audit log for compliance |
| `doc_cold_start` | Init / inherit a project | Scans code, generates all missing doc skeletons (idempotent) |
| `project_change_propose` | Open a change ticket | Creates a change record with description, scope, and linked docs |
| `project_change_list` | Review change progress | Lists all change tickets and their states |
| `project_change_status` | Query a single ticket | Gets details and completion status of one change ticket |
| `project_change_archive` | Archive a finished change | Moves a completed ticket to the history archive |

</details>

<details>
<summary>L1 — Aggregated analysis tools (expand)</summary>

| Tool | When it's used | What it does |
|------|---------------|-------------|
| `cross_ref_check` | Pre-release / multi-project | Validates cross-project doc references; finds dead links |
| `team_doc_status` | Team standup / project mgmt | Aggregates health scores, pending counts, draft counts across all projects |
| `project_doc_health` | Single-project quality check | Doc coverage score + SOP compliance result |
| `apply_doc_patch` | When Agent writes docs | Writes stub content to a doc node (requires `allow_doc_write`) |
| `project_change_release` | At release time | Merges pending changelogs into main CHANGELOG, generates version record |
| `fill_all_docs` | Bulk-fill doc content | Scans all projects for `[Draft]`-marked or missing docs, returns source file paths and write prompts for each; Agent fills them in batch |
| `sync_steering` | Manual steering refresh | Writes specified docs into AI tool rules files; supports `cli` / `doc_types` multi-select filtering and `dry_run` preview mode |

</details>

---

## Command quick reference

> Send these in your AI chat — the Agent picks the right tool automatically.

### Daily development

| Scenario | Send to AI |
|----------|-----------|
| I changed an endpoint, check API docs | `Check if my-server API docs are in sync` |
| I changed the DB schema, check DB docs | `Check if my-server database docs are in sync` |
| Check doc status across all projects | `Show team doc status` |
| See all unfinished draft markers | `Scan docs for draft markers` |
| See pending changelog items | `Show pending changelog status for my-server` |

### Release flow

| Scenario | Send to AI |
|----------|-----------|
| Merge changelogs and cut a release | `Release my-server version v1.2.0` |
| Validate cross-project links before release | `Run cross-project reference check` |
| Get doc health score for a project | `Check doc health for my-server` |

### Project management

| Scenario | Send to AI |
|----------|-----------|
| Inherit a new project, scaffold docs | `Run doc_cold_start` |
| Open a change proposal | `Propose a change for my-server: Add order endpoint` |
| List all change tickets | `List all change tickets for my-server` |
| Archive a finished change | `Archive change CHG-001 for my-server` |
| Refresh all AI tool custom instructions | `sync steering` |
| Claim a pending doc task | `Claim a pending doc task for my-server` |

---

## CLI update mechanisms and compatibility notes

When docs are generated or updated, doc-guardian calls `syncAllClis` to write into each AI tool's rules files. Mechanisms differ by tool:

### Write strategy comparison

| AI tool | Rules file path | Strategy | Re-sync needed after doc update? |
|--------|----------------|----------|----------------------------------|
| **Kiro** | `.kiro/steering/<doc>.md` | Inline copy (with frontmatter) | **Yes** — send `sync steering` manually |
| **Cursor** | `.cursor/rules/<doc>.mdc` | Inline copy (with frontmatter) | **Yes** — send `sync steering` manually |
| **CodeBuddy** | `.codebuddy/rules/<doc>.md` | Symlink → source doc | **No** — updates automatically |
| **Claude Code** | `CLAUDE.md` (project root) | Appends `@reference` block | **No** — Claude reads the latest source on every run |
| **Trae** | `.trae/rules/project_rules.md` | Appends reference line | **Partial** — Trae 1.x has limited `@path` support; large files may be truncated; switch to `strategy: inline` if not working |
| **Cline** | `.clinerules` | Inline copy (default) | **Yes** — send `sync steering` after doc updates; switch to `strategy: append` if your version supports `@path` |
| **Windsurf** | `.windsurfrules` | Inline copy (default) | **Yes** — send `sync steering` after doc updates; switch to `strategy: append` if your version supports `@path` |

### Kiro / Cursor — inline copy mode

- Source doc content + YAML frontmatter are merged into a wrapper file; the AI tool reads the wrapper.
- The wrapper is refreshed automatically on every `apply_doc_patch` or `doc_cold_start`.
- After manually editing a source doc, send `sync steering` to refresh the wrapper.
- The file header contains `<!-- generated at <time>, source-hash: <hash> -->` — don't delete it.
- If the file already exists without that comment (user-created), doc-guardian skips it by default (pass `force: true` to override).
- **Compatibility**: Kiro steering requires Kiro 0.2+; older versions don't read `.kiro/steering/`.

### CodeBuddy — symlink mode

- Creates a symlink in `.codebuddy/rules/` pointing to the source doc; CodeBuddy follows it transparently.
- On Windows without symlink permission (EPERM), falls back to inline copy automatically.
- **Compatibility**: requires a CodeBuddy version that supports `.codebuddy/rules/`.

### Claude Code — `@reference` mode

- Appends `@<doc_path>` inside a marker block in `CLAUDE.md`; Claude actively reads the referenced file.
- If `CLAUDE.md` doesn't exist, doc-guardian creates it.
- Idempotent — repeated runs don't duplicate the reference.
- The `@` syntax is Claude Code CLI-specific; it doesn't work in the Claude web interface.
- **Compatibility**: requires the `claude` CLI to be detectable in PATH, or `CLAUDE.md` to already exist.

### Trae / Cline / Windsurf — inline / append mode

- **Cline / Windsurf** default to `inline` strategy: full doc content is written directly into the rules file. Manual `sync steering` required after doc updates.
- **Trae** uses append strategy by default: appends `# doc-guardian:<docType>: @<path>` reference lines; idempotent.
- **Compatibility details**:
  - **Trae 1.x**: limited `@path` reference support; large files risk truncation. Switch to `custom_cli` + `strategy: inline` if needed.
  - **Cline (all current versions)**: does **not** follow `@path` references — only reads the rules file body. doc-guardian defaults to `inline` strategy for Cline; manual `sync steering` required after doc updates.
  - **Windsurf (all current versions)**: same as Cline — `@path` references not supported; defaults to `inline`.
- **Cline detection**: checks for `~/.vscode/extensions/saoudrizwan.claude-dev*` (VSCode extension).
- **Trae detection**: checks for `~/.trae` directory or `trae` command in PATH.

### `inclusion` and `globs` scope

These fields apply **only to Kiro / Cursor** (inline wrapper tools), controlling when the wrapper is loaded (always / on matching files). They are ignored for append-mode tools (Trae / Cline / Windsurf / Claude Code).

### Custom tools

Add any unsupported tool via `custom_cli` in `.doc-guard.yaml` (see [config reference](./docs/doc-guard-yaml-guide.md)):

| Strategy | Use case |
|----------|---------|
| `append` | Single rules file that supports `@reference` syntax |
| `symlink` | Directory-based rules; tool follows symlinks |
| `inline` | No reference support; full content injection (manual sync required) |

---

## Configuration

Each business project gets a `.doc-guard.yaml` in its root directory, telling the Agent about the project's structure and doc paths.

### Minimal config (copy and use)

```yaml
schema_version: "1.0"
project: my-server
type: java-spring        # see supported stacks below
mode: standalone

docs:
  changelog:
    path: docs/changelogs/CHANGELOG.md
    pending_path: docs/changelogs/pending

  api:
    path: docs/project/api.md
    triggers: ["src/main/java/**/*Controller.java"]
    auto_write: stub_only    # false | stub_only | full

skill:
  allow_doc_write: stub_only
```

### Supported stacks

| Value | Use for |
|-------|---------|
| `java-spring` | Spring Boot / Spring MVC |
| `java-gradle` | Java projects built with Gradle |
| `vue-ts` | Vue 2/3 + TypeScript |
| `react-ts` | React + TypeScript |
| `uniapp` | uni-app mini-program / H5 |
| `go` | Go projects |
| `python` | Flask / FastAPI / Django, etc. |

### Custom stacks

Not on the list? Use `custom_detector` to tell the Agent how to scan your code:

```yaml
type: custom-nest               # any name you like
custom_detector:
  source_files:
    pattern: "src/**/*.controller.ts"
    route_regex: '@(Get|Post|Put|Delete|Patch)\([\'"](.*?)[\'"]\)'
  doc_sync_check: regex         # regex: auto diff;  manual: prompt for human review
```

> Full config reference: [docs/doc-guard-yaml-guide.md](./docs/doc-guard-yaml-guide.md)

---

## Why mcp-doc-guardian?

| | Manual docs | Git hooks | mcp-doc-guardian |
|--|-------------|-----------|-----------------|
| Deep AI Agent integration | — | — | ✓ |
| Detects API / DB drift | — | partial | ✓ |
| Multi-project support | — | — | ✓ |
| Change lifecycle tracking | — | — | ✓ |
| SOP compliance check | — | — | ✓ |
| Zero-config cold start | — | — | ✓ |
| Custom doc types | — | — | ✓ |
| Multi-Agent collaboration | — | — | ✓ |

---

## Project layout

```
mcp-doc-guardian/
├── mcp-doc-guard/        ← MCP server (build this)
│   └── src/tools/        ← 18 tool implementations
├── scripts/
│   ├── setup-all.sh      ← one-click build + IDE config (run this first)
│   ├── doc-guard-init.sh ← interactive wizard to generate .doc-guard.yaml
│   └── setup-project.sh  ← single-project config generator (bulk use)
└── docs/
    ├── doc-guard-yaml-guide.md  ← full config reference
    └── agents/                  ← AI Agent prompt templates
```

---

## Validation

```bash
# Verify all .doc-guard.yaml configs are valid
DOCGUARD_ROOT=/path/to/workspace node dist/index.js --validate-only
```

---

## Contributing

```bash
git clone https://github.com/Michael-xm/mcp-doc-guardian
cd mcp-doc-guardian
npm install
npm run build
npm test
```

PRs welcome. Please open an issue first for large changes.

---

## License

MIT · Built for AI-native teams

[中文文档 →](./README.zh.md)
