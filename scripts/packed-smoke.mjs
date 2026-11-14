import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, lstat, rm, access } from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { run, ROOT, pkg } from '../src/maintenance.mjs';
const dir=await mkdtemp(path.join(os.tmpdir(),'cmmcli-packed-'));
try {
 const packed=JSON.parse(await run(process.platform==='win32'?'npm.cmd':'npm',['pack',ROOT,'--pack-destination',dir,'--json']));
 const tarball=path.join(dir,packed[0].filename);
 assert.ok(packed[0].files.every(f=>!/^dev\/|^outputs\/|\.release-backups\//.test(f.path)));
 const prefix=path.join(dir,'bootstrap');
 await run(process.platform==='win32'?'npm.cmd':'npm',['install','--prefix',prefix,'--ignore-scripts','--no-audit','--no-fund',tarball]);
 const entry=path.join(prefix,'node_modules/@petercjl/cmmcli/bin/cmmcli.mjs');
 const invoke=args=>run(process.execPath,[entry,...args]);
 await assert.rejects(invoke(['skill','install','--agent','unnamed-agent','--json']),e=>e.code==='SUBPROCESS_FAILED');
 const first=path.join(dir,'first-agent/cmmcli'),second=path.join(dir,'second-agent/cmmcli');
 for(const [target,agent] of [[first,'generic'],[second,'unnamed-agent']]) {
  const installed=JSON.parse(await invoke(['skill','install','--target',target,'--agent',agent,'--json']));assert.equal(installed.current,true);assert.equal(installed.version,pkg.version);
  const again=JSON.parse(await invoke(['skill','update','--target',target,'--agent',agent,'--json']));assert.equal(again.changed,false);
 }
 assert.equal((await lstat(path.join(first,'SKILL.md'))).isSymbolicLink(),false);
 assert.notEqual((await lstat(path.join(first,'SKILL.md'))).ino,(await lstat(path.join(second,'SKILL.md'))).ino);
 const source=JSON.parse(await invoke(['skill','source','--json']));assert.equal(source.version,pkg.version);assert.equal(source.items[0].ok,true);
 await rm(prefix,{recursive:true,force:true});await rm(first,{recursive:true,force:true});
 const runtime=path.join(second,'.runtime');
 const actual=JSON.parse(await run(process.execPath,[path.join(runtime,'bin/cmmcli.mjs'),'version','--json']));assert.equal(actual.version,pkg.version);
 await run(process.execPath,[path.join(runtime,'scripts/check-package.mjs')]);
 const status=JSON.parse(await run(process.execPath,[path.join(runtime,'bin/cmmcli.mjs'),'skill','status','--target',second,'--agent','unnamed-agent','--json']));assert.equal(status.current,true);
 const {exportWorkbook}=await import(pathToFileURL(path.join(runtime,'src/export.mjs')).href);
 const file=path.join(dir,'isolated.xlsx');
 const result={keyword:'test',day:1,sort:'duration_volume',order:'desc',pageSize:50,requestedPages:1,pagesFetched:1,totalMatched:1,accessibleTotal:1,fetched:1,completeWithinAccessible:true,completeWithinMatched:true,sourceUrl:'https://www.chanmama.com/promotionRank/',api:'POST /v6/product/search',adapter:'isolated-fixture',capturedAt:new Date().toISOString(),rows:[{title:'Fixture',promotion_id:'test-id',_page:1,_position:1,duration_volume_text:'250~500'}],pageEvidence:[],warnings:[]};
 const artifact=await exportWorkbook(result,file);assert.equal(artifact.rows,1);await access(file);
 console.log(JSON.stringify({ok:true,evidence:'packed-scripts-disabled-physical-isolation',version:actual.version,bootstrapRemoved:true,otherHostRemoved:true,independentExcel:true}));
}finally{await rm(dir,{recursive:true,force:true});}
