import { readFile, readdir, lstat, mkdir, cp, rename, rm, writeFile, access } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { fail } from './errors.mjs';
import { activateDirectory } from './activation.mjs';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
export const SOURCE = path.join(ROOT, 'skill', 'cmmcli');
export const RECEIPT = '.cmmcli-receipt.json';
export const hash = b => createHash('sha256').update(b).digest('hex');
export async function exists(p) { try { return await lstat(p); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
export async function hashes(root, prefix = '') {
  const result = {};
  for (const e of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const rel = path.join(prefix, e.name); if ((!prefix && e.name === RECEIPT) || rel === path.join('agents', 'openai.yaml')) continue;
    if (e.isDirectory()) Object.assign(result, await hashes(root, rel));
    else if (e.isSymbolicLink()) { const { readlink } = await import('node:fs/promises'); result[rel] = `link:${await readlink(path.join(root, rel))}`; }
    else result[rel] = hash(await readFile(path.join(root, rel)));
  }
  return result;
}
export function resolveTarget(options) {
  const { target, agent = 'generic' } = options;
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(agent)) fail('INVALID_AGENT', 'Agent 名称须为小写字母、数字和连字符');
  if (!target || !path.isAbsolute(target)) fail('TARGET_REQUIRED', '请由当前 Agent 提供绝对路径 --target <Skill目录>');
  const dest = path.resolve(target);
  if (dest === path.parse(dest).root || dest === os.homedir() || dest === ROOT || (ROOT.startsWith(dest + path.sep) && !(path.basename(ROOT) === '.runtime' && dest === path.dirname(ROOT))) || dest.startsWith(ROOT + path.sep)) fail('UNSAFE_TARGET', '目标目录不能覆盖包目录、主目录或其父目录');
  return { target: dest, agent };
}
export async function skillSource() { const manifest = JSON.parse(await readFile(path.join(ROOT, 'capabilities.json'), 'utf8')); return { ...manifest, ok: true, name: 'cmmcli', package: pkg.name, version: pkg.version, path: SOURCE, runtimeEntry: path.join(ROOT, 'bin/cmmcli.mjs'), complete: true, items: [{ ok: true, name: 'cmmcli', package: pkg.name, version: pkg.version, path: SOURCE }] }; }
async function runtimeDigest() { const items = {}; for (const rel of ['bin', 'src']) items[rel] = await hashes(path.join(ROOT, rel)); for (const rel of ['package.json', 'capabilities.json']) items[rel] = hash(await readFile(path.join(ROOT, rel))); return hash(JSON.stringify(items)); }
export async function skillStatus(options) {
  const { target, agent } = resolveTarget(options); const s = await exists(target);
  const base = { ok: true, name: 'cmmcli', package: pkg.name, version: pkg.version, target, agent, installed: !!s, managed: false, current: false, edited: [], verification: { verified: false, algorithm: 'sha256' }, recovery: { state: 'none' }, hostDiscovery: { authority: 'host', status: 'pending' } };
  if (!s) return base;
  if (!s.isDirectory() || s.isSymbolicLink()) return { ...base, recovery: { state: 'unmanaged', action: 'Choose a new directory; existing data is preserved.' } };
  let receipt; try { receipt = JSON.parse(await readFile(path.join(target, RECEIPT), 'utf8')); } catch { return { ...base, recovery: { state: 'unmanaged' } }; }
  if (receipt.package !== pkg.name || receipt.name !== 'cmmcli' || !receipt.hashes || !receipt.sourceDigest) return base;
  const actual = await hashes(target);
  const edited = [...new Set([...Object.keys(receipt.hashes), ...Object.keys(actual)])].filter(k => receipt.hashes[k] !== actual[k]);
  const sourceDigest = hash(JSON.stringify(await hashes(SOURCE)));
  const verified = edited.length === 0;
  return { ...base, managed: true, installedVersion: receipt.version, edited, current: verified && receipt.version === pkg.version && receipt.sourceDigest === sourceDigest && receipt.runtimeDigest === await runtimeDigest(), verification: { verified, algorithm: 'sha256', files: Object.keys(actual).length }, recovery: { state: verified ? 'none' : 'local-edits', action: verified ? null : 'Preserve edits; reconcile manually or choose a new destination.' }, backup: receipt.backup || null, runtimeEntry: path.join(target, '.runtime/bin/cmmcli.mjs') };
}
export async function installSkill(options) {
  const { target, agent } = resolveTarget(options);
  const before = await skillStatus(options);
  if (before.installed && (!before.managed || (await Promise.all(before.edited.map(k => exists(path.join(target, k))))).some(Boolean))) fail('SKILL_OWNERSHIP_CONFLICT', '现有 Skill 未托管或已有本地修改，已保留', { target, edited: before.edited });
  if (before.current) return { ...before, changed: false };
  await mkdir(path.dirname(target), { recursive: true });
  const lock = `${target}.cmmcli-lock`;
  try { await mkdir(lock); } catch { fail('TARGET_LOCKED', '目标正在安装或更新；请检查并发操作', { target, lock }); }
  const stage = `${target}.stage-${randomUUID()}`; let backup = null, swapped = false;
  try {
    await cp(SOURCE, stage, { recursive: true, errorOnExist: true, force: false, filter: src => src !== path.join(SOURCE, 'agents/openai.yaml') });
    const ui = path.join(target, 'agents/openai.yaml');
    await cp((await exists(ui)) ? ui : path.join(SOURCE, 'agents/openai.yaml'), path.join(stage, 'agents/openai.yaml'), { errorOnExist: true, force: false });
    const runtime = path.join(stage, '.runtime'); await mkdir(runtime);
    for (const rel of [...new Set(['package.json', ...pkg.files])]) {
      await mkdir(path.dirname(path.join(runtime,rel)),{recursive:true});
      await cp(path.join(ROOT, rel), path.join(runtime, rel), { recursive: true, dereference: false, force: false, errorOnExist: true });
    }
    if (await exists(path.join(ROOT, 'node_modules'))) {
      await cp(path.join(ROOT, 'node_modules'), path.join(runtime, 'node_modules'), { recursive: true, dereference: true, force: false, errorOnExist: true });
    } else {
      const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const args = ['install', '--prefix', runtime, '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'];
      try { await run(npm, [...args, '--offline']); }
      catch (e) { if (/ENOTCACHED/.test(e.details?.diagnostic || '')) await run(npm, args); else throw e; }
      const physical = path.join(stage, '.physical-dependencies');
      await cp(path.join(runtime, 'node_modules'), physical, { recursive: true, dereference: true, errorOnExist: true, force: false });
      await rm(path.join(runtime, 'node_modules'), { recursive: true });
      await rename(physical, path.join(runtime, 'node_modules'));
    }
    await access(path.join(runtime, 'bin/cmmcli.mjs'));
    const latest = await skillStatus(options);
    if (JSON.stringify(latest.edited) !== JSON.stringify(before.edited) || latest.installed !== before.installed || latest.installed && !latest.managed)
      fail('TARGET_CHANGED', '安装期间目标发生变化，已停止');
    if (before.installed) backup = `${target}.backup-${randomUUID()}`;
    const receipt = { schemaVersion: 1, package: pkg.name, name: 'cmmcli', version: pkg.version, agent, sourceDigest: hash(JSON.stringify(await hashes(SOURCE))), runtimeDigest: await runtimeDigest(), hashes: await hashes(stage), backup, installedAt: new Date().toISOString(), physicalCopy: true };
    await writeFile(path.join(stage, RECEIPT), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    const activation = await activateDirectory(stage,target,backup); swapped = true;
    if (activation.mode === 'in-place') await rm(stage,{recursive:true,force:true});
    const result = await skillStatus(options);
    if (!result.current) fail('SKILL_VERIFY_FAILED', '安装后的校验失败', { target, backup });
    return { ...result, changed: true, backup, components: ['cli', 'skill'], isolation: 'physical-copy-with-runtime-and-dependencies', activation: activation.mode };
  } finally { if (!swapped) await rm(stage, { recursive: true, force: true }); await rm(lock, { recursive: true, force: true }); }
}
export async function registryVersion() {
  let response; try { response = await fetch('https://registry.npmjs.org/@petercjl%2fcmmcli/latest', { signal: AbortSignal.timeout(2000) }); }
  catch { return { available: false, state: 'offline', current: pkg.version }; }
  if (response.status === 404) return { available: false, state: 'not-published', current: pkg.version };
  if (!response.ok) return { available: false, state: 'registry-error', current: pkg.version };
  const data = await response.json();
  if (!/^\d+\.\d+\.\d+$/.test(data.version)) return { available: false, state: 'invalid-registry-result', current: pkg.version };
  const parts = s => s.split('.').map(Number); const a = parts(data.version), b = parts(pkg.version);
  const newer = a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];
  return { available: newer, state: 'checked', current: pkg.version, latest: data.version, channel: 'latest' };
}
export async function autoCheck({ cacheDirectory, lookup = registryVersion, clock = Date.now } = {}) {
  if (process.env.CMMCLI_UPDATE_CHECK === '0') return { state: 'disabled', available: false };
  const dir = cacheDirectory || path.join(os.homedir(), '.cache', 'cmmcli'); const file = path.join(dir, 'update-check.json');
  let cached; try { cached = JSON.parse(await readFile(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') return { state: 'cache-unreadable', available: false }; }
  if (cached?.at && clock() - cached.at < 86400000 && cached.version === pkg.version) return { ...cached.result, cached: true };
  await mkdir(dir, { recursive: true }); const lock = path.join(dir, 'check.lock');
  try { await mkdir(lock); } catch { return { state: 'check-in-progress', available: false }; }
  try {
    const result = await lookup(); const temp = `${file}.${randomUUID()}`;
    await writeFile(temp, JSON.stringify({ at: clock(), version: pkg.version, result }), { flag: 'wx', mode: 0o600 });
    if (await exists(file)) { const backup = `${file}.backup-${randomUUID()}`; await rename(file, backup); }
    await rename(temp, file); return result;
  } finally { await rm(lock, { recursive: true, force: true }); }
}
export async function run(command, args) {
 let executable=command, actualArgs=args;
 if(process.platform==='win32' && /^npm(?:\.cmd)?$/i.test(path.basename(command))) {
  const candidates=[process.env.npm_execpath,path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),process.env.APPDATA&&path.join(process.env.APPDATA,'npm/node_modules/npm/bin/npm-cli.js')].filter(Boolean);
  let npmEntry;for(const candidate of candidates)if(/npm-cli\.js$/i.test(candidate)&&await exists(candidate)){npmEntry=candidate;break;}
  if(!npmEntry)fail('NPM_RUNTIME_MISSING','Cannot resolve the managed npm CLI; install npm with Node.js.');
  executable=process.execPath;actualArgs=[npmEntry,...args];
 }
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,actualArgs,{stdio:['ignore','pipe','pipe'],env:{...process.env,CMMCLI_UPDATE_CHECK:'0',npm_config_dry_run:'false'}});let out='',err='';
  child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('error',reject);
  child.on('close',code=>{if(code===0)return resolve(out);let childCode;try{childCode=JSON.parse(out)?.error?.code}catch{}reject(Object.assign(new Error('Child command failed'),{code:'SUBPROCESS_FAILED',details:{exitCode:code,childCode,diagnostic:err.slice(-500)}}));});
 });
}
export async function updateInstall(options) {
  const selected = resolveTarget(options); const before = await skillStatus(options);
  if (before.installed && (!before.managed || (await Promise.all(before.edited.map(k => exists(path.join(selected.target, k))))).some(Boolean))) fail('SKILL_OWNERSHIP_CONFLICT', '更新前检查发现未托管目录或修改');
  if (!options.yes) fail('CONFIRMATION_REQUIRED', '显式更新需要 --yes；自动检测仅通知');
  const registry = await registryVersion(); if (!registry.latest) fail('REGISTRY_UNAVAILABLE', '尚无可验证的 npm 最新版本', registry);
  const version = options.version || registry.latest;
  if (!/^\d+\.\d+\.\d+$/.test(version)) fail('INVALID_VERSION', '请提供稳定精确版本');
  if (version === pkg.version) return installSkill(options);
  const { mkdtemp } = await import('node:fs/promises'); const stage = await mkdtemp(path.join(os.tmpdir(), 'cmmcli-update-'));
  try {
    await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--prefix', stage, '--ignore-scripts', '--no-audit', '--no-fund', `${pkg.name}@${version}`]);
    const entry = path.join(stage, 'node_modules', '@petercjl', 'cmmcli', 'bin/cmmcli.mjs');
    const actual = JSON.parse(await run(process.execPath, [entry, 'version', '--json']));
    if (actual.version !== version) fail('VERSION_MISMATCH', '下载版本与请求不同');
    const result = JSON.parse(await run(process.execPath, [entry, 'skill', 'update', '--target', selected.target, '--agent', selected.agent, '--json']));
    return { ...result, activatedRuntime: path.join(selected.target, '.runtime/bin/cmmcli.mjs'), bootstrapPackageChanged: false, note: 'Selected Skill runtime updated; bootstrap npm installation remains independently managed.' };
  } finally { await rm(stage, { recursive: true, force: true }); }
}
