import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {activateDirectory} from '../src/activation.mjs';
test('locked-update preserves complete backup and performs verified in-place activation',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cmmcli-locked-'));
 try{const target=path.join(dir,'target'),stage=path.join(dir,'stage'),backup=path.join(dir,'backup');await fs.mkdir(target);await fs.mkdir(stage);await fs.writeFile(path.join(target,'old.txt'),'old',{flag:'wx'});await fs.writeFile(path.join(stage,'new.txt'),'new',{flag:'wx'});
 const result=await activateDirectory(stage,target,backup,{renameDirectory:async()=>{throw Object.assign(new Error('locked'),{code:'EPERM'})}});
 assert.equal(result.mode,'in-place');assert.equal(await fs.readFile(path.join(backup,'old.txt'),'utf8'),'old');assert.equal(await fs.readFile(path.join(target,'new.txt'),'utf8'),'new');await assert.rejects(fs.access(path.join(target,'old.txt')));
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('partial-failure during activation restores original bytes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cmmcli-restore-'));
 try{const target=path.join(dir,'target'),stage=path.join(dir,'stage'),backup=path.join(dir,'backup');await fs.mkdir(target);await fs.mkdir(stage);await fs.writeFile(path.join(target,'value'),'old',{flag:'wx'});let count=0;
 await assert.rejects(activateDirectory(stage,target,backup,{renameDirectory:async(a,b)=>{if(++count===2)throw Object.assign(new Error('injected'),{code:'EIO'});return fs.rename(a,b)}}),{code:'EIO'});
 assert.equal(await fs.readFile(path.join(target,'value'),'utf8'),'old');
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
