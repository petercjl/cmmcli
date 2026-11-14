#!/usr/bin/env node
import { Command, Option, InvalidArgumentError } from 'commander';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pkg, ROOT, skillSource, skillStatus, installSkill, autoCheck, registryVersion, updateInstall } from '../src/maintenance.mjs';
import { browserDoctor, searchProducts } from '../src/browser.mjs';
import { exportWorkbook, preflightOutput } from '../src/export.mjs';
const json = x => process.stdout.write(JSON.stringify(x, null, 2) + '\n');
const positive = x => { if (!/^\d+$/.test(x) || Number(x) < 1 || Number(x) > 100) throw new InvalidArgumentError('页数应为 1–100 的整数'); return Number(x); };
const program = new Command().name('cmmcli').description('蝉妈妈商品搜索与 Excel 导出（复用本机 Chrome 登录会话）').version(pkg.version).showHelpAfterError();
program.exitOverride();
program.command('version').option('--json', '结构化输出').action(o => o.json ? json({ ok: true, package: pkg.name, version: pkg.version }) : process.stdout.write(pkg.version + '\n'));
program.command('capabilities').option('--json', '结构化输出').action(async () => json(JSON.parse(await readFile(path.join(ROOT, 'capabilities.json'), 'utf8'))));
program.command('doctor').option('--json', '结构化输出').option('--cdp <url>', '本机 CDP', process.env.CMMCLI_CDP || 'http://127.0.0.1:9223').action(async o => {
  const browser = await browserDoctor(o.cdp); json({ ok: true, package: pkg.name, version: pkg.version, node: process.version, dependencies: { playwright: true, exceljs: true }, ...browser });
});
program.command('search <keyword>').description('搜索商品主列表，返回列表并导出 Excel；默认昨日、销量降序、第1页50条')
 .option('--pages <count>', '读取页数，最多100', positive, 1)
 .option('--all', '读取页面允许访问的全部结果（最多5000条）')
 .addOption(new Option('--day <period>', '统计周期').choices(['1', '7', '30']).default('1'))
 .addOption(new Option('--sort <field>', '排序字段').choices(['duration_volume', 'duration_amount']).default('duration_volume'))
 .addOption(new Option('--order <direction>', '排序方向').choices(['desc', 'asc']).default('desc'))
 .option('--output <path>', 'Excel文件路径；已有文件会拒绝覆盖')
 .option('--cdp <url>', '本机 CDP', process.env.CMMCLI_CDP || 'http://127.0.0.1:9223')
 .option('--json', '结构化输出（含完整列表）')
 .action(async (keyword, o, cmd) => {
   keyword = keyword.trim(); if (!keyword || keyword.length > 200) throw Object.assign(new Error('搜索词应为1–200字符'), { code: 'INVALID_KEYWORD' });
   if (o.all && cmd.getOptionValueSource('pages') === 'cli') throw Object.assign(new Error('--all 与 --pages 分别表达不同范围，请选择一个'), { code: 'CONFLICTING_OPTIONS' });
   const safeKeyword = keyword.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0,60);
   const target = await preflightOutput(o.output || path.join('outputs', `${safeKeyword}-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`));
   const update = await autoCheck().catch(() => ({ state: 'check-failed', available: false }));
   if (update.available) process.stderr.write(`cmmcli ${update.latest} 可用；当前继续使用 ${pkg.version}。\n`);
   const result = await searchProducts({ keyword, pages: o.pages, all: !!o.all, day: Number(o.day), sort: o.sort, order: o.order, cdp: o.cdp, onPage: p => process.stderr.write(`第${p.page}页：${p.count}条，累计${p.fetched}条\n`) });
   const artifact = await exportWorkbook(result, target);
   if (o.json) json({ ok: true, package: pkg.name, version: pkg.version, artifact, ...result, update });
   else { process.stdout.write(`搜索：${keyword} | 周期：${o.day === '1' ? '昨日' : '近' + o.day + '天'} | ${result.fetched}条\n`); result.rows.forEach(r => process.stdout.write(`${r._position}. ${r.title}\t${r.duration_volume_text ?? ''}\t${r.shop_name ?? ''}\n`)); process.stdout.write(`Excel：${artifact.path}\n匹配 ${result.totalMatched} 条，可访问 ${result.accessibleTotal} 条，本次 ${result.fetched} 条。\n`); }
 });
const skill = program.command('skill').description('规范 Skill 来源与显式目标安装/更新');
skill.command('source').option('--json', '结构化输出').addOption(new Option('--name <skill>', 'Skill名称').choices(['cmmcli'])).action(async () => json(await skillSource()));
for (const command of ['status', 'install', 'update']) skill.command(command).requiredOption('--target <directory>', '当前Agent解析的Skill绝对目录').option('--agent <name>', '当前Agent标识；任意合法名称', 'generic').option('--json', '结构化输出').action(async o => json(await (command === 'status' ? skillStatus(o) : installSkill(o))));
const update = program.command('update').description('检测新版或更新显式选择的 Skill 及其独立运行时');
update.command('check').option('--json', '结构化输出').action(async () => json({ ok: true, ...await registryVersion() }));
update.command('status').option('--json', '结构化输出').action(() => json({ ok: true, detection: process.env.CMMCLI_UPDATE_CHECK === '0' ? 'disabled' : 'enabled', trigger: 'search', ttlHours: 24, timeoutMs: 2000, automaticInstall: false, disable: 'CMMCLI_UPDATE_CHECK=0', channel: 'latest' }));
update.command('install').requiredOption('--target <directory>', '当前Agent解析的Skill绝对目录').option('--agent <name>', 'Agent名称', 'generic').option('--version <version>', '精确稳定版本，默认latest').option('--yes', '授权更新所选Skill及其运行时').option('--json', '结构化输出').action(async o => json(await updateInstall(o)));
try {
 const seen = new Set(); for (const arg of process.argv.slice(2)) if (arg.startsWith('--')) { const key = arg.split('=')[0]; if (seen.has(key)) throw Object.assign(new Error(`重复参数：${key}`), { code: 'DUPLICATE_OPTION' }); seen.add(key); }
 if (process.argv.includes('--help') && process.argv.includes('--json')) { const manifest = JSON.parse(await readFile(path.join(ROOT, 'capabilities.json'), 'utf8')); const name = process.argv.slice(2).filter(x => !x.startsWith('--')).join(' '); json(name ? { ok: true, command: name, ...(manifest.commandContracts[name] || { options: {}, commands: Object.keys(manifest.commandContracts) }) } : manifest); } else await program.parseAsync();
} catch (e) {
 if (['commander.helpDisplayed', 'commander.version'].includes(e.code)) process.exitCode = 0;
 else { json({ ok: false, error: { code: e.code || 'INTERNAL_ERROR', message: e.code?.startsWith('commander.') ? '命令参数无效，请查看 --help' : e.message, details: e.details || {} } }); process.exitCode = 1; }
}
