import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { syncSteering } from '../sync-steering';
import type { DocGuardConfig } from '../../types';

// ──────────────────────────────────────────────────────────
// 辅助函数
// ──────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'doc-guard-test-'));
}

function makeConfig(root: string, overrides: Partial<DocGuardConfig> = {}): DocGuardConfig {
  const docPath = path.join(root, 'docs', 'overview.md');
  fs.mkdirSync(path.dirname(docPath), { recursive: true });
  fs.writeFileSync(docPath, '# Overview\n\nThis is the overview.', 'utf-8');

  return {
    project: 'test-project',
    type: 'java-spring',
    mode: 'standalone',
    docs: {
      overview: { path: 'docs/overview.md', steering: { inject: true } },
    },
    skill: { allow_doc_write: 'full' },
    _root: root,
    ...overrides,
  } as DocGuardConfig;
}

// ──────────────────────────────────────────────────────────
// 1. dry_run 模式 —— 不写任何文件
// ──────────────────────────────────────────────────────────
describe('dry_run mode', () => {
  it('TC-01: dry_run=true 时不创建任何文件', async () => {
    const root = makeTmpDir();
    const config = makeConfig(root);

    const result = await syncSteering({ cli: ['kiro'], dry_run: true }, [config]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dry_run).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].action).toBe('dry_run');
    expect(fs.existsSync(path.join(root, '.kiro', 'steering', 'overview.md'))).toBe(false);
  });

  it('TC-02: dry_run 返回 dry_run=true 标志', async () => {
    const root = makeTmpDir();
    const config = makeConfig(root);
    const result = await syncSteering({ cli: ['cursor'], dry_run: true }, [config]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dry_run).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────
// 2. kiro writer
// ──────────────────────────────────────────────────────────
describe('kiro writer', () => {
  it('TC-03: 写入 .kiro/steering/overview.md，含 generated header 和 frontmatter', async () => {
    const root = makeTmpDir();
    const config = makeConfig(root);
    const result = await syncSteering({ cli: ['kiro'] }, [config]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results[0].action).toBe('written');

    const dest = path.join(root, '.kiro', 'steering', 'overview.md');
    expect(fs.existsSync(dest)).toBe(true);
    const content = fs.readFileSync(dest, 'utf-8');
    expect(content).toContain('<!-- generated at ');
    expect(content).toContain('inclusion: always');
    expect(content).toContain('# Overview');
  });

  it('TC-04: 幂等 —— 已有 generated 文件时覆盖更新', async () => {
    const root = makeTmpDir();
    const config = makeConfig(root);
    await syncSteering({ cli: ['kiro'] }, [config]);

    // 修改源文档
    const docPath = path.join(root, 'docs', 'overview.md');
    fs.writeFileSync(docPath, '# Overview Updated', 'utf-8');
    const result = await syncSteering({ cli: ['kiro'] }, [config]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results[0].action).toBe('written');

    const dest = path.join(root, '.kiro', 'steering', 'overview.md');
    expect(fs.readFileSync(dest, 'utf-8')).toContain('Overview Updated');
  });

  it('TC-05: 已有非 generated 文件时跳过', async () => {
    const root = makeTmpDir();
    const kiroDir = path.join(root, '.kiro', 'steering');
    fs.mkdirSync(kiroDir, { recursive: true });
    fs.writeFileSync(path.join(kiroDir, 'overview.md'), '# Manual content', 'utf-8');

    const config = makeConfig(root);
    const result = await syncSteering({ cli: ['kiro'] }, [config]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results[0].action).toBe('skipped');
  });
});

// ──────────────────────────────────────────────────────────
// 3. cursor writer
// ──────────────────────────────────────────────────────────
describe('cursor writer', () => {
  it('TC-06: 写入 .cursor/rules/overview.mdc，含 alwaysApply frontmatter', async () => {
    const root = makeTmpDir();
    const config = makeConfig(root);
    const result = await syncSteering({ cli: ['cursor'] }, [config]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const dest = path.join(root, '.cursor', 'rules', 'overview.mdc');
    expect(fs.existsSync(dest)).toBe(true);
    const content = fs.readFileSync(dest, 'utf-8');
    expect(content).toContain('alwaysApply: true');
    expect(content).toContain('<!-- generated at ');
  });
});

// ──────────────────────────────────────────────────────────
// 4. codebuddy writer (symlink, Linux/macOS only)
// ──────────────────────────────────────────────────────────
describe('codebuddy writer', () => {
  const isWin = process.platform === 'win32';

  it('TC-07: 创建软链接（非 Windows）或内联副本（Windows）', async () => {
    const root = makeTmpDir();
    const config = makeConfig(root);
    const result = await syncSteering({ cli: ['codebuddy'] }, [config]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const dest = path.join(root, '.codebuddy', 'rules', 'overview.md');
    expect(fs.existsSync(dest)).toBe(true);

    if (isWin) {
      expect(result.results[0].action).toBe('written');
    } else {
      expect(result.results[0].action).toBe('symlinked');
      expect(fs.lstatSync(dest).isSymbolicLink()).toBe(true);
    }
  });

  it('TC-08: 普通文件（非软链接）时跳过', async () => {
    if (isWin) return; // Windows 不做 symlink 测试
    const root = makeTmpDir();
    const dir = path.join(root, '.codebuddy', 'rules');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'overview.md'), 'manual', 'utf-8');

    const config = makeConfig(root);
    const result = await syncSteering({ cli: ['codebuddy'] }, [config]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results[0].action).toBe('skipped');
  });
});

// ──────────────────────────────────────────────────────────
// 5. claude writer
// ──────────────────────────────────────────────────────────
describe('claude writer', () => {
  it('TC-09: 写入 CLAUDE.md，含 marker 块', async () => {
    const root = makeTmpDir();
    const config = makeConfig(root);
    await syncSteering({ cli: ['claude'] }, [config]);

    const claudeMd = path.join(root, 'CLAUDE.md');
    expect(fs.existsSync(claudeMd)).toBe(true);
    const content = fs.readFileSync(claudeMd, 'utf-8');
    expect(content).toContain('<!-- doc-guardian:overview -->');
    expect(content).toContain('<!-- /doc-guardian:overview -->');
    expect(content).toContain('@docs/overview.md');
  });

  it('TC-10: 幂等 —— 重复执行不重复追加', async () => {
    const root = makeTmpDir();
    const config = makeConfig(root);
    await syncSteering({ cli: ['claude'] }, [config]);
    await syncSteering({ cli: ['claude'] }, [config]);

    const claudeMd = path.join(root, 'CLAUDE.md');
    const content = fs.readFileSync(claudeMd, 'utf-8');
    const count = (content.match(/<!-- doc-guardian:overview -->/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('TC-11: CLAUDE.md 不存在时自动创建', async () => {
    const root = makeTmpDir();
    const config = makeConfig(root);
    const claudeMd = path.join(root, 'CLAUDE.md');
    expect(fs.existsSync(claudeMd)).toBe(false);

    await syncSteering({ cli: ['claude'] }, [config]);
    expect(fs.existsSync(claudeMd)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────
// 6. trae / cline / windsurf writer
// ──────────────────────────────────────────────────────────
describe('append-style writers', () => {
  it('TC-12: trae 写入 .trae/rules/project_rules.md', async () => {
    const root = makeTmpDir();
    const config = makeConfig(root);
    await syncSteering({ cli: ['trae'] }, [config]);

    const dest = path.join(root, '.trae', 'rules', 'project_rules.md');
    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.readFileSync(dest, 'utf-8')).toContain('# doc-guardian:overview:');
  });

  it('TC-13: cline 写入 .clinerules', async () => {
    const root = makeTmpDir();
    const config = makeConfig(root);
    await syncSteering({ cli: ['cline'] }, [config]);

    const dest = path.join(root, '.clinerules');
    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.readFileSync(dest, 'utf-8')).toContain('# doc-guardian:overview:');
  });

  it('TC-14: windsurf 写入 .windsurfrules', async () => {
    const root = makeTmpDir();
    const config = makeConfig(root);
    await syncSteering({ cli: ['windsurf'] }, [config]);

    const dest = path.join(root, '.windsurfrules');
    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.readFileSync(dest, 'utf-8')).toContain('# doc-guardian:overview:');
  });

  it('TC-15: 幂等 —— 引用行不重复追加', async () => {
    const root = makeTmpDir();
    const config = makeConfig(root);
    await syncSteering({ cli: ['cline'] }, [config]);
    await syncSteering({ cli: ['cline'] }, [config]);

    const dest = path.join(root, '.clinerules');
    const content = fs.readFileSync(dest, 'utf-8');
    const count = (content.match(/# doc-guardian:overview:/g) ?? []).length;
    expect(count).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────
// 7. steering.enabled 开关
// ──────────────────────────────────────────────────────────
describe('steering.enabled flag', () => {
  it('TC-16: enabled=false 时跳过整个项目', async () => {
    const root = makeTmpDir();
    const config = makeConfig(root, { steering: { enabled: false } });
    const result = await syncSteering({ cli: ['kiro', 'cursor'] }, [config]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results).toHaveLength(0);
  });

  it('TC-17: enabled=true 正常执行', async () => {
    const root = makeTmpDir();
    const config = makeConfig(root, { steering: { enabled: true } });
    const result = await syncSteering({ cli: ['kiro'] }, [config]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results).toHaveLength(1);
    expect(result.results[0].action).toBe('written');
  });
});

// ──────────────────────────────────────────────────────────
// 8. custom_cli 支持
// ──────────────────────────────────────────────────────────
describe('custom_cli', () => {
  it('TC-18: custom_cli append 策略正常写入', async () => {
    const root = makeTmpDir();
    const config = makeConfig(root, {
      steering: {
        enabled: true,
        custom_cli: [
          { id: 'my-tool', rules_file: '.my-tool/rules.md', strategy: 'append' },
        ],
      },
    });

    const result = await syncSteering({ cli: [] }, [config]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const customResult = result.results.find((r) => r.cli === 'my-tool');
    expect(customResult).toBeDefined();
    expect(customResult?.action).toBe('written');

    const dest = path.join(root, '.my-tool', 'rules.md');
    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.readFileSync(dest, 'utf-8')).toContain('# doc-guardian:overview:');
  });

  it('TC-19: custom_cli inline 策略写入含 generated header', async () => {
    const root = makeTmpDir();
    const config = makeConfig(root, {
      steering: {
        enabled: true,
        custom_cli: [
          { id: 'my-inline-tool', rules_file: '.my-inline/rules.md', strategy: 'inline' },
        ],
      },
    });

    const result = await syncSteering({ cli: [] }, [config]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const dest = path.join(root, '.my-inline', 'rules.md');
    expect(fs.existsSync(dest)).toBe(true);
    const content = fs.readFileSync(dest, 'utf-8');
    expect(content).toContain('<!-- generated at ');
    expect(content).toContain('# Overview');
  });
});
