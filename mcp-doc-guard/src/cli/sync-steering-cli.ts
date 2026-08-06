#!/usr/bin/env node
// ============================================================
// sync-steering-cli.ts — 独立命令行入口，供用户手动调用 sync_steering
// ============================================================

import { loadAllProjects } from '../config-loader';
import { syncSteering } from '../tools/sync-steering';

async function main() {
  const args = process.argv.slice(2);
  
  // 解析参数
  let cli: string[] | undefined;
  let docTypes: string[] | undefined;
  let dryRun = false;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--cli' && i + 1 < args.length) {
      cli = args[++i].split(',');
    } else if (arg === '--doc-types' && i + 1 < args.length) {
      docTypes = args[++i].split(',');
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--force') {
      force = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
用法: sync-steering-cli [options]

选项:
  --cli <cli1,cli2,...>      指定目标 AI 工具（逗号分隔），不填则自动检测
                             支持: kiro, cursor, codebuddy, claude, trae, cline, windsurf
  --doc-types <type1,...>    指定要注入的文档类型（逗号分隔），不填则使用配置或所有 docs
  --dry-run                  预览模式，不实际写入文件
  --force                    强制覆盖：绕过 enabled:false 限制，覆盖已有文件和 hash 未变化的文件
  --help, -h                 显示此帮助信息

示例:
  sync-steering-cli --cli kiro,cursor --dry-run
  sync-steering-cli --doc-types overview,api --force
  sync-steering-cli
      `);
      process.exit(0);
    }
  }

  try {
    const projects = loadAllProjects();
    
    if (projects.length === 0) {
      console.error('❌ 未找到任何项目配置（.doc-guard.yaml）');
      process.exit(1);
    }

    console.log(`🔍 已加载 ${projects.length} 个项目配置`);
    if (dryRun) {
      console.log('🔍 预览模式（dry-run）');
    }
    if (force) {
      console.log('⚠️  强制模式（force）');
    }

    const result = await syncSteering(
      {
        cli,
        doc_types: docTypes,
        dry_run: dryRun,
        force,
      },
      projects
    );

    if (!result.ok) {
      console.error('❌ 执行失败');
      process.exit(1);
    }

    console.log('\n✅ 执行完成\n');
    console.log('结果统计:');
    const byAction = result.results.reduce((acc, r) => {
      acc[r.action] = (acc[r.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(byAction).forEach(([action, count]) => {
      console.log(`  ${action}: ${count}`);
    });

    console.log('\n详细结果:');
    result.results.forEach((r) => {
      const symbol = r.action === 'written' || r.action === 'symlinked' ? '✓' : 
                     r.action === 'skipped' ? '⊘' : '?';
      console.log(`  ${symbol} [${r.project}] ${r.cli}/${r.doc_type} → ${r.file_path}`);
      if (r.reason) {
        console.log(`      理由: ${r.reason}`);
      }
    });
  } catch (err) {
    console.error('❌ 错误:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
