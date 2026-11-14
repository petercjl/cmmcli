import { chromium } from 'playwright-core';
import { CmmError, fail } from './errors.mjs';
export const API_PATH = '/v6/product/search';
export const PAGE_URL = 'https://www.chanmama.com/promotionRank/';
export const PAGE_SIZE = 50;
export const ACCESS_LIMIT = 5000;
export function validateEndpoint(endpoint) {
  let u; try { u = new URL(endpoint); } catch { fail('INVALID_CDP', 'CDP 地址无效'); }
  if (!['http:', 'https:'].includes(u.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || u.username || u.password)
    fail('INVALID_CDP', '仅支持本机 Chrome CDP 地址');
  return u.origin;
}
export async function connect(endpoint) {
  try { return await chromium.connectOverCDP(validateEndpoint(endpoint), { timeout: 10000 }); }
  catch (e) { if (e instanceof CmmError) throw e; fail('BROWSER_UNAVAILABLE', '无法连接电商浏览器；请打开已登录蝉妈妈的 9223 Chrome', { cdp: endpoint }); }
}
export async function browserDoctor(endpoint) {
  const b = await connect(endpoint);
  try { return { browser: b.version(), cdp: endpoint, chanmamaTabs: b.contexts().flatMap(c => c.pages()).filter(p => /^https:\/\/www\.chanmama\.com\//.test(p.url())).map(p => ({ url: p.url() })), authentication: 'search-required-to-verify' }; }
  finally { await b.close(); }
}
export async function searchProducts({ keyword, pages = 1, all = false, day = 1, sort = 'duration_volume', order = 'desc', cdp, onPage = () => {} }, { connectBrowser = connect } = {}) {
  const b = await connectBrowser(cdp);
  let page, completed = false;
  try {
    page = await b.contexts()[0].newPage();
    await page.goto(`${PAGE_URL}?keyword=${encodeURIComponent(keyword)}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    try {
      await page.waitForFunction(() => {
        const roots = [...document.querySelectorAll('*')].map(e => e.__vue__).filter(Boolean);
        const seen = new Set(); const find = v => { if (seen.has(v)) return; seen.add(v); if (v.$options?.name === 'product-search') return v; for (const c of v.$children || []) { const found = find(c); if (found) return found; } };
        const vm = roots.map(find).find(Boolean);
        return !!vm && vm.isMixinsInit && !vm.isLoading;
      }, null, { timeout: 45000 });
    } catch {
      const text = await page.locator('body').innerText();
      fail(/登录|验证码|验证身份/.test(text) ? 'AUTH_REQUIRED' : 'PAGE_CONTRACT_CHANGED', '商品搜索页未就绪；请在电商浏览器检查登录、验证或页面变更');
    }
    const rows = [], pageEvidence = [], signatures = new Set();
    let totalMatched = null, accessibleTotal = null;
    const maxPages = all ? 100 : pages;
    for (let n = 1; n <= maxPages; n++) {
      const responsePromise = page.waitForResponse(r => {
        if (new URL(r.url()).pathname !== API_PATH || r.request().method() !== 'POST') return false;
        try { const p = r.request().postDataJSON(); return p.keyword === keyword && p.page === n && p.size === PAGE_SIZE && p.day_type === day; } catch { return false; }
      }, { timeout: 45000 });
      const execute = page.evaluate(async ({ keyword, n, day, sort, order }) => {
        const seen = new Set(); const find = v => { if (!v || seen.has(v)) return; seen.add(v); if (v.$options?.name === 'product-search') return v; for (const c of v.$children || []) { const x = find(c); if (x) return x; } };
        const vm = [...document.querySelectorAll('*')].map(e => find(e.__vue__)).find(Boolean);
        if (!vm || typeof vm.getData !== 'function' || typeof vm.getFormData !== 'function') throw new Error('PAGE_CONTRACT_CHANGED');
        vm.keyword = keyword; vm.page = n; vm.size = 50; vm.dayType = day;
        vm.searchData.sort = sort; vm.searchData.order_by = order; vm.dataList = [];
        await vm.getData(false);
        return JSON.parse(JSON.stringify({ rows: vm.dataList, total: vm.pageInfo?.totalCount, accessibleTotal: vm.pageInfoShow?.totalCount, noAuth: vm.isNoListAuth, parameters: vm.getFormData() }));
      }, { keyword, n, day, sort, order });
      let response, parsed;
      try { [response, parsed] = await Promise.all([responsePromise, execute]); }
      catch { fail('SEARCH_REQUEST_FAILED', '搜索请求未完成，未导出可能不完整的列表', { page: n, fetched: rows.length }); }
      const raw = await response.json().catch(() => null);
      if (!response.ok() || !raw || raw.errCode !== 0 || parsed.noAuth)
        fail(parsed.noAuth || raw?.errCode === 52000 ? 'PERMISSION_REQUIRED' : 'API_ERROR', '蝉妈妈搜索接口返回失败，请检查页面权限或验证提示', { page: n, httpStatus: response.status(), errCode: raw?.errCode ?? null });
      const params = response.request().postDataJSON();
      if (params.keyword !== keyword || params.page !== n || params.size !== PAGE_SIZE || params.day_type !== day || params.sort !== sort || params.order_by !== order || params.multi_category_id !== '-1')
        fail('PARAMETER_MISMATCH', '页面实际搜索参数与命令不一致');
      if (!Array.isArray(parsed.rows) || !Number.isInteger(parsed.total) || parsed.total < 0 || parsed.rows.some(r => !r.promotion_id || typeof r.title !== 'string'))
        fail('RESPONSE_CONTRACT_CHANGED', '列表字段或分页结构发生变化');
      if (parsed.total > 0 && parsed.rows.length === 0 && (n - 1) * PAGE_SIZE < Math.min(parsed.total, ACCESS_LIMIT))
        fail('INCOMPLETE_PAGE', '应有结果的页返回空列表', { page: n });
      const signature = parsed.rows.map(r => r.promotion_id).join('|');
      if (signature && signatures.has(signature)) fail('REPEATED_PAGE', '翻页返回相同商品页，已停止导出');
      signatures.add(signature);
      totalMatched = parsed.total; accessibleTotal = Math.min(totalMatched, parsed.accessibleTotal ?? ACCESS_LIMIT, ACCESS_LIMIT);
      rows.push(...parsed.rows.map((r, index) => ({ ...r, _page: n, _position: (n - 1) * PAGE_SIZE + index + 1 })));
      pageEvidence.push({ page: n, count: parsed.rows.length, parameters: params, totalMatched: parsed.total, accessibleTotal: parsed.accessibleTotal, httpStatus: response.status(), errCode: raw.errCode, encrypted: raw.data?.is_encrypt === true, capturedAt: new Date().toISOString() });
      onPage({ page: n, count: parsed.rows.length, fetched: rows.length, totalMatched, accessibleTotal });
      if (rows.length >= accessibleTotal || parsed.rows.length < PAGE_SIZE) break;
      if (n < maxPages) await new Promise(resolve => setTimeout(resolve, 650));
    }
    completed = true;
    return { keyword, day, sort, order, pageSize: PAGE_SIZE, requestedPages: all ? 'all-accessible' : pages, pagesFetched: pageEvidence.length, totalMatched, accessibleTotal, fetched: rows.length, completeWithinAccessible: rows.length >= accessibleTotal, completeWithinMatched: rows.length >= totalMatched, sourceUrl: page.url(), api: `POST https://api-service.chanmama.com${API_PATH}`, adapter: 'authenticated-page-request-and-parsed-result', capturedAt: new Date().toISOString(), rows, pageEvidence, warnings: ['蝉妈妈预估数据，仅供参考；区间按原值保留。', ...(totalMatched > accessibleTotal ? [`页面可访问上限 ${accessibleTotal} 条，接口匹配数 ${totalMatched} 条。`] : []), ...(rows.length < accessibleTotal ? [`本次导出 ${rows.length} 条，为所请求页数，未覆盖全部可访问结果。`] : [])] };
  } finally {
    if (!completed && page) await page.close().catch(() => {});
    await b.close();
  }
}
