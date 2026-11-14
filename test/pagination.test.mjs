import test from 'node:test';
import assert from 'node:assert/strict';
import { searchProducts } from '../src/browser.mjs';
function fixture(totals, repeated = false) {
 let index = 0;
 const page = {
  goto: async () => {}, waitForFunction: async () => {}, close: async () => {}, url: () => 'https://www.chanmama.com/promotionRank/?keyword=test',
  waitForResponse: async predicate => {
   const params = { keyword: 'test', page: index + 1, size: 50, day_type: 1, sort: 'duration_volume', order_by: 'desc', multi_category_id: '-1' };
   const response = { url: () => 'https://api-service.chanmama.com/v6/product/search', request: () => ({ method: () => 'POST', postDataJSON: () => params }), ok: () => true, status: () => 200, json: async () => ({ errCode: 0, data: { is_encrypt: true } }) };
   assert.equal(predicate(response),true); return response;
  },
  evaluate: async (_, args) => {
   assert.equal(args.n,index+1); const n = index++;
   return { noAuth:false, total:totals[n], accessibleTotal:5000, rows:Array.from({length:50},(_,i)=>({ promotion_id:`${repeated ? 0 : n}-${i}`, title:`Product ${n}-${i}`, duration_volume_text:'250~500' })) };
  }
 };
 return { connectBrowser: async () => ({ contexts: () => [{ newPage: async () => page }], close: async () => {} }) };
}
test('two successful API pages return 100 rows when matching totals differ', async()=>{
 const r=await searchProducts({keyword:'test',pages:2,cdp:'http://127.0.0.1:9223'},fixture([95538,95549]));
 assert.equal(r.rows.length,100);assert.equal(new Set(r.rows.map(x=>x.promotion_id)).size,100);assert.equal(r.pagesFetched,2);
 assert.deepEqual(r.pageEvidence.map(x=>x.parameters.page),[1,2]);assert.deepEqual(r.pageEvidence.map(x=>x.totalMatched),[95538,95549]);
 assert.equal(r.completeWithinMatched,false);
});
test('repeated result pages still fail even when both API responses succeed', async()=>{
 await assert.rejects(searchProducts({keyword:'test',pages:2,cdp:'http://127.0.0.1:9223'},fixture([95538,95549],true)),{code:'REPEATED_PAGE'});
});
