import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, lstat, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import ExcelJS from 'exceljs';
import { validateEndpoint } from '../src/browser.mjs';
import { exportWorkbook, preflightOutput } from '../src/export.mjs';
import { resolveTarget, run, ROOT } from '../src/maintenance.mjs';
test('local CDP boundary and explicit target semantics', () => {
  assert.equal(validateEndpoint('http://127.0.0.1:9223'), 'http://127.0.0.1:9223');
  for (const x of ['https://example.com', 'http://user:password@localhost:9223', 'bad']) assert.throws(() => validateEndpoint(x));
  assert.throws(() => resolveTarget({agent:'any-agent'}), {code:'TARGET_REQUIRED'});
  assert.throws(() => resolveTarget({agent:'../bad',target:'/tmp/a'}), {code:'INVALID_AGENT'});
  assert.equal(resolveTarget({agent:'example-agent',target:'/tmp/agent-skill'}).agent, 'example-agent');
});
test('Excel preserves ranges, text IDs, formula-like titles, true zero and null; existing file is protected', async () => {
 const dir=await mkdtemp(path.join(os.tmpdir(),'cmmcli-xlsx-'));
 try {
 const target=path.join(dir,'result.xlsx');
 const record={_position:1,_page:1,promotion_id:'3799039643870167523',title:'=HYPERLINK("https://example.com")',shop_name:'测试',duration_volume_text:'2500~5000',duration_amount_text:'2.5w~5w',tb_max_commission_rate:'12.00',jx_commission_rate:null,sku_union_price:'-',duration_video_count:0,duration_author_count:-2147483648,rawNull:null,rawZero:0};
 const result={rows:[record],keyword:'测试',day:1,sort:'duration_volume',order:'desc',pageSize:50,requestedPages:1,pagesFetched:1,totalMatched:1,accessibleTotal:1,fetched:1,completeWithinAccessible:true,completeWithinMatched:true,sourceUrl:'https://www.chanmama.com/promotionRank/',api:'POST /v6/product/search',adapter:'test-fixture',capturedAt:'2026-11-14T00:00:00Z',warnings:[],pageEvidence:[]};
 await exportWorkbook(result,target);const before=await readFile(target);const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(target);const sheet=wb.getWorksheet('商品列表');
 assert.equal(sheet.getCell('B2').value,record.title);assert.equal(sheet.getCell('B2').type,ExcelJS.ValueType.String);
 assert.equal(sheet.getCell('D2').value,record.promotion_id);assert.equal(sheet.getCell('H2').value,'2500~5000');assert.equal(sheet.getCell('F2').value,.12);assert.equal(sheet.getCell('G2').value,null);
 const raw=wb.getWorksheet('原始字段');const keys=raw.getRow(1).values;assert.equal(raw.getCell(2,keys.indexOf('rawZero')).value,0);assert.equal(raw.getCell(2,keys.indexOf('rawNull')).value,null);
 await assert.rejects(preflightOutput(target),{code:'OUTPUT_EXISTS'});await assert.rejects(exportWorkbook(result,target),{code:'OUTPUT_EXISTS'});assert.deepEqual(await readFile(target),before);if(process.platform!=='win32')assert.equal((await lstat(target)).mode&0o777,0o600);
 } finally {await rm(dir,{recursive:true,force:true})}
});
test('strict CLI refuses duplicate options before browser or writes', async()=>{
 await assert.rejects(run(process.execPath,[path.join(ROOT,'bin/cmmcli.mjs'),'search','test','--pages','1','--pages','2','--json']),{code:'SUBPROCESS_FAILED'});
 const source=JSON.parse(await run(process.execPath,[path.join(ROOT,'bin/cmmcli.mjs'),'skill','source','--json']));assert.equal(source.package,'@petercjl/cmmcli');assert.equal(source.items[0].name,'cmmcli');
 const help=JSON.parse(await run(process.execPath,[path.join(ROOT,'bin/cmmcli.mjs'),'--help','--json']));assert.equal(help.discoveryContract.schemaVersion,1);
});
