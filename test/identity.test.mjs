import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {ROOT,pkg,run} from '../src/maintenance.mjs';
test('prepack rejects package/Skill version and integrity drift from a managed runtime',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cmmcli-identity-'));
 try{
  for(const rel of [...new Set(['package.json',...pkg.files])]){await fs.mkdir(path.dirname(path.join(dir,rel)),{recursive:true});await fs.cp(path.join(ROOT,rel),path.join(dir,rel),{recursive:true});}
  const entry=path.join(dir,'scripts/check-package.mjs');await run(process.execPath,[entry]);
  const caps=path.join(dir,'capabilities.json'),before=await fs.readFile(caps);await fs.copyFile(caps,path.join(dir,'caps-before'));const data=JSON.parse(before);data.version='9999.0.0';await fs.writeFile(caps,JSON.stringify(data));await assert.rejects(run(process.execPath,[entry]),{code:'SUBPROCESS_FAILED'});await fs.copyFile(path.join(dir,'caps-before'),caps);
  const skill=path.join(dir,'skill/cmmcli/SKILL.md');await fs.copyFile(skill,path.join(dir,'skill-before'));await fs.writeFile(skill,(await fs.readFile(skill,'utf8')).replace(`版本：${pkg.version}`,'版本：9999.0.0'));await assert.rejects(run(process.execPath,[entry]),{code:'SUBPROCESS_FAILED'});await fs.copyFile(path.join(dir,'skill-before'),skill);
  const readme=path.join(dir,'README.md');await fs.copyFile(readme,path.join(dir,'readme-before'));await fs.writeFile(readme,(await fs.readFile(readme,'utf8'))+'\nDrift\n');await assert.rejects(run(process.execPath,[entry]),{code:'SUBPROCESS_FAILED'});
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
