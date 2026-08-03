<p align="center">
  <h1 align="center">mcp-doc-guardian</h1>
  <p align="center">
    <b>The AI-native documentation sentinel for your codebase.</b><br/>
    Keep docs in sync with code — automatically, via MCP.
  </p>
  <p align="center">
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License"/></a>
    <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version"/>
    <img src="https://img.shields.io/badge/protocol-MCP-green.svg" alt="MCP"/>
    <img src="https://img.shields.io/badge/tools-18-orange.svg" alt="Tools"/>
  </p>
</p>

---

> **What problem does this solve?**
> You change code → docs fall behind → AI agents work with stale context → bugs and confusion.
> mcp-doc-guardian watches your codebase via MCP and tells your AI exactly what's out of sync.

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

**Step 1 — Build**

```bash
cd mcp-doc-guardian/mcp-doc-guard
npm install && npm run build
```

**Step 2 — Connect to your IDE**

Add to your MCP config (CodeBuddy / Cursor / Claude Desktop):

```json
{
  "mcpServers": {
    "doc-guardian": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-doc-guardian/mcp-doc-guard/dist/index.js"],
      "env": {
        "DOCGUARD_ROOT": "/absolute/path/to/your/workspace"
      }
    }
  }
}
```

**Step 3 — Init your project**

```bash
# Generate config for your project (pick your stack)
./scripts/setup-project.sh my-server java-spring ../my-server

# Or one-click init everything
./scripts/setup-all.sh
```

**Step 4 — Start using it**

Tell your AI agent:

```
Please run doc_cold_start to initialize documentation for this project.
```

That's it. The guardian is watching.

---

## What it does

| Scenario | What happens |
|----------|-------------|
| You add a new API endpoint | `check_api_sync` detects the drift, adds a stub to `api.md` |
| You change a database entity | `check_db_sync` checks `database.md` coverage |
| You forget to update changelog | `changelog_status` flags the pending item |
| A doc has `[Draft]` markers | `scan_draft` surfaces them for review |
| You want a team health report | `team_doc_status` gives you a dashboard |
| Starting a new project | `doc_cold_start` generates all missing stubs |

---

## Supported stacks

`java-spring` · `java-gradle` · `vue-ts` · `uniapp` · `go` · `python` · `react-ts` · `custom`

---

## All 18 tools

<details>
<summary>L0 — Atomic tools (expand)</summary>

| Tool | What it does |
|------|-------------|
| `list_projects` | Show all registered projects |
| `check_api_sync` | Detect controller ↔ api.md drift (git diff) |
| `scan_draft` | Find `[Draft]` markers in docs |
| `changelog_status` | Check pending changelog items |
| `claim_pending` | Claim a pending doc for review (24h auto-release) |
| `audit_log` | Write an audit log entry |
| `check_db_sync` | Detect Entity ↔ database.md drift |
| `check_custom_doc_sync` | Detect custom doc trigger-file sync |
| `doc_cold_start` | Generate missing doc stubs (idempotent) |
| `project_change_propose` | Open a change ticket |
| `project_change_list` | List change tickets |
| `project_change_status` | Query change ticket progress |
| `project_change_archive` | Archive a completed change |

</details>

<details>
<summary>L1 — Aggregated analysis tools (expand)</summary>

| Tool | What it does |
|------|-------------|
| `cross_ref_check` | Validate cross-project doc references |
| `team_doc_status` | Team-wide doc health dashboard |
| `project_doc_health` | Single-project health score + SOP compliance |
| `apply_doc_patch` | Write doc stub sections (requires `allow_doc_write`) |
| `project_change_release` | Publish release: merge pending changelogs |

</details>

---

## Configuration

Minimal `.doc-guard.yaml` to get started:

```yaml
schema_version: "1.0"
project: my-server
type: java-spring          # or: vue-ts, go, python, react-ts, uniapp
mode: standalone

docs:
  changelog:
    path: docs/changelogs/CHANGELOG.md
    pending_path: docs/changelogs/pending

  api:
    path: docs/project/api.md
    triggers: ["controller"]
    auto_write: stub_only  # false | stub_only | full

skill:
  allow_doc_write: stub_only
```

→ Full config reference: [doc-guard.schema.json](./mcp-doc-guard/doc-guard.schema.json)

---

## Why mcp-doc-guardian?

| | Manual docs | Git hooks | mcp-doc-guardian |
|--|-------------|-----------|-----------------|
| Works with AI agents | — | — | ✓ |
| Detects API drift | — | partial | ✓ |
| Multi-project support | — | — | ✓ |
| Change lifecycle tracking | — | — | ✓ |
| SOP compliance check | — | — | ✓ |
| Zero-config cold start | — | — | ✓ |

---

## Project layout

```
mcp-doc-guardian/
├── mcp-doc-guard/        ← MCP server (build this)
│   └── src/tools/        ← 18 tool implementations
├── scripts/
│   ├── setup-all.sh      ← one-click init
│   ├── setup-project.sh  ← per-project config generator
│   └── doc-guard-init.sh ← interactive init wizard
└── docs/agents/          ← AI agent prompt templates
```

---

## Validation

```bash
# Check all .doc-guard.yaml configs are valid
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
