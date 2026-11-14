import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, cp, lstat, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installSkill, skillStatus, run, ROOT, pkg } from '../src/maintenance.mjs';
test('install/update: generic host, same-version no-op, missing repair, local-edits protection and UI metadata preservation', async () => {
 const dir=await mkdtemp(path.join(os.tmpdir(),'cmmcli-lifecycle-'));const target=path.join(dir,'example-agent','cmmcli');const o={target,agent:'arbitrary-agent'};
 try {
  await assert.rejects(installSkill({agent:'any-agent'}),{code:'TARGET_REQUIRED'});
  await assert.rejects(run(process.execPath,[path.join(ROOT,'bin/cmmcli.mjs'),'doctor','--cdp','http://127.0.0.1:1','--json']),{code:'SUBPROCESS_FAILED'});
  const first=await installSkill(o);assert.equal(first.current,true);assert.equal(first.changed,true);
  assert.equal((await lstat(target)).isSymbolicLink(),false);
  const again=await installSkill(o);assert.equal(again.changed,false);
  const runtimeVersion=JSON.parse(await run(process.execPath,[first.runtimeEntry,'version','--json']));assert.equal(runtimeVersion.version,pkg.version);
  const selfStatus=JSON.parse(await run(process.execPath,[first.runtimeEntry,'skill','status','--target',target,'--agent','arbitrary-agent','--json']));assert.equal(selfStatus.current,true);
  const ui=path.join(target,'agents/openai.yaml');await cp(ui,path.join(dir,'ui-before'));const custom='interface:\n  display_name: "Custom"\n  short_description: "Custom UI"\n';await writeFile(ui,custom);
  const missing=path.join(target,'references/search-contract.md');await cp(missing,path.join(dir,'missing-before'));await rm(missing);
  assert.equal((await skillStatus(o)).current,false);const repair=await installSkill(o);assert.equal(repair.current,true);assert.ok(repair.backup);await access(repair.backup);assert.equal(await readFile(ui,'utf8'),custom);
  const file=path.join(target,'SKILL.md');await cp(file,path.join(dir,'skill-before'));await writeFile(file,(await readFile(file,'utf8'))+'\nLocal edit\n');
  await assert.rejects(installSkill(o),{code:'SKILL_OWNERSHIP_CONFLICT'});assert.match(await readFile(file,'utf8'),/Local edit/);
  const unmanaged=path.join(dir,'unmanaged');await cp(path.join(dir,'skill-before'),unmanaged);await assert.rejects(installSkill({target:unmanaged,agent:'any-agent'}),{code:'SKILL_OWNERSHIP_CONFLICT'});
 } finally {await rm(dir,{recursive:true,force:true})}
});
