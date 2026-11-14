import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import { autoCheck, installSkill, updateInstall, pkg } from '../src/maintenance.mjs';
test('automatic update detection checks once, uses cache, expires and respects opt-out',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cmmcli-cache-'));let calls=0;let now=1000;
 try{const options={cacheDirectory:dir,clock:()=>now,lookup:async()=>{calls++;return {available:false,state:'offline',current:pkg.version}}};await autoCheck(options);assert.equal(calls,1);assert.equal((await autoCheck(options)).cached,true);assert.equal(calls,1);now+=86400001;await autoCheck(options);assert.equal(calls,2);
 const before=process.env.CMMCLI_UPDATE_CHECK;process.env.CMMCLI_UPDATE_CHECK='0';try{assert.equal((await autoCheck(options)).state,'disabled');assert.equal(calls,2)}finally{if(before===undefined)delete process.env.CMMCLI_UPDATE_CHECK;else process.env.CMMCLI_UPDATE_CHECK=before}
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('same-version update uses the selected target and local-edits remain protected',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cmmcli-update-'));const target=path.join(dir,'skill'),options={target,agent:'arbitrary-agent',yes:true,version:pkg.version};const fetchBefore=globalThis.fetch;
 try{await installSkill(options);globalThis.fetch=async()=>Response.json({version:pkg.version});assert.equal((await updateInstall(options)).changed,false);const file=path.join(target,'SKILL.md');await fs.copyFile(file,path.join(dir,'skill-before'));await fs.writeFile(file,(await fs.readFile(file,'utf8'))+'\nLocal edit\n');await assert.rejects(updateInstall(options),{code:'SKILL_OWNERSHIP_CONFLICT'});
 }finally{globalThis.fetch=fetchBefore;await fs.rm(dir,{recursive:true,force:true})}
});
