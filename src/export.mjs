import ExcelJS from 'exceljs';
import { constants } from 'node:fs';
import { lstat, mkdir, open, link, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fail } from './errors.mjs';
export async function preflightOutput(target) {
  const resolved = path.resolve(target);
  if (path.extname(resolved).toLowerCase() !== '.xlsx') fail('INVALID_OUTPUT', '输出文件须为 .xlsx');
  try { const s = await lstat(resolved); fail('OUTPUT_EXISTS', '目标文件已存在，请使用新文件名', { path: resolved, size: s.size, mode: s.mode & 0o777 }); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  return resolved;
}
export const columns = [
  ['序号', '_position', 8], ['商品名称', 'title', 65], ['店铺', 'shop_name', 24],
  ['商品ID（蝉妈妈）', 'promotion_id', 38], ['商品价格（页面值）', 'sku_union_price', 20],
  ['公开佣金比例', 'cos', 17], ['蝉选佣金比例', 'jx', 17],
  ['销量区间', 'duration_volume_text', 18], ['销售额区间（元）', 'duration_amount_text', 20],
  ['直播销量区间', 'duration_live_volume_text', 18], ['视频销量区间', 'duration_aweme_volume_text', 18], ['商品卡销量区间', 'duration_other_volume_text', 20],
  ['关联视频数', 'duration_video_count', 15], ['带货达人数', 'duration_author_count', 15],
  ['商品链接', 'product_short_url', 45], ['蝉妈妈详情', 'detail', 45], ['来源页码', '_page', 12]
];
export function displayRow(r) {
  const rate = x => x === null || x === undefined || x === '' || Number(x) < 0 ? null : Number.isFinite(Number(x)) ? Number(x) / 100 : String(x);
  const validCount = x => x === null || x === undefined || x === '' || Number(x) < 0 ? null : x;
  return { ...r, cos: rate(r.tb_max_commission_rate), jx: rate(r.jx_commission_rate), duration_video_count: validCount(r.duration_video_count), duration_author_count: validCount(r.duration_author_count), product_short_url: r.product_short_url || r.dy_url || '', detail: `https://www.chanmama.com/promotionDetail/${encodeURIComponent(r.promotion_id)}` };
}
const cellValue = x => x === undefined || x === null ? null : typeof x === 'object' ? JSON.stringify(x) : x;
function styleSheet(sheet, widths) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.columns.forEach((c, i) => { c.width = widths?.[i] || 22; });
  sheet.getRow(1).height = 30;
  sheet.getRow(1).eachCell(c => { c.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF24486C' } }; c.alignment = { vertical: 'middle', wrapText: true }; });
  if (sheet.rowCount > 1) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: sheet.columnCount } };
  for (let i = 2; i <= sheet.rowCount; i++) { const r = sheet.getRow(i); r.height = 34; r.eachCell(c => { c.font = { name: 'Arial', size: 11 }; c.alignment = { vertical: 'middle', wrapText: true }; if (i % 2 === 0) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F5FA' } }; }); }
}
export async function exportWorkbook(result, target) {
  target = await preflightOutput(target);
  const wb = new ExcelJS.Workbook(); wb.creator = 'cmmcli'; wb.created = new Date();
  const list = wb.addWorksheet('商品列表');
  list.addRow(columns.map(c => c[0]));
  for (const record of result.rows) {
    const r = displayRow(record); const row = list.addRow(columns.map(([, k]) => cellValue(r[k])));
    row.getCell(6).numFmt = '0.00%'; row.getCell(7).numFmt = '0.00%';
    for (const n of [15, 16]) { const val = row.getCell(n).value; if (typeof val === 'string' && /^https:\/\//.test(val)) row.getCell(n).value = { text: val, hyperlink: val }; }
  }
  styleSheet(list, columns.map(c => c[2]));
  const query = wb.addWorksheet('查询条件'); query.addRow(['项目', '实际值']);
  const metadata = { 搜索词: result.keyword, 统计周期: result.day === 1 ? '昨日' : `近${result.day}天`, 排序字段: result.sort, 排序方向: result.order, 类目筛选: '全部（-1）', 每页条数: result.pageSize, 请求页数: result.requestedPages, 实际页数: result.pagesFetched, 接口匹配总数: result.totalMatched, 页面可访问条数: result.accessibleTotal, 实际导出条数: result.fetched, 已覆盖全部可访问结果: result.completeWithinAccessible, 已覆盖全部匹配结果: result.completeWithinMatched, 获取时间UTC: result.capturedAt, 页面来源: result.sourceUrl, 接口来源: result.api, 获取方式: result.adapter, 数据口径: result.warnings.join('\n'), 字段说明: '列表使用页面区间文字；原始字段表保留页面解析后的数值、空值、隐藏占位及嵌套数据。数值0可能是权限占位，以页面显示字段为准。cmm_ind字段口径待核，保留在原始字段表。价格“-”、**、负数哨兵不转换为真实零。', 原始数据说明: '原始字段为页面API客户端解析后的记录，非加密传输原文。', 完整性边界: '仅商品搜索主列表；顶部推荐卡片不计入。分页为顺序读取，非服务端冻结快照。' };
  Object.entries(metadata).forEach(([k, v]) => query.addRow([k, v]));
  result.pageEvidence.forEach(e => query.addRow([`第${e.page}页请求`, JSON.stringify(e)]));
  styleSheet(query, [30, 115]); query.eachRow((r, i) => { if (i > 1) r.height = i > 18 ? 65 : 32; });
  const raw = wb.addWorksheet('原始字段');
  const keys = [...new Set(result.rows.flatMap(Object.keys))];
  raw.addRow(keys.length ? keys : ['无记录']);
  result.rows.forEach(r => raw.addRow(keys.map(k => cellValue(r[k])))); styleSheet(raw);
  await mkdir(path.dirname(target), { recursive: true });
  const temp = path.join(path.dirname(target), `.cmmcli-${randomUUID()}.xlsx`);
  let handle;
  try {
    handle = await open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    await handle.writeFile(await wb.xlsx.writeBuffer()); await handle.close(); handle = null;
    try { await link(temp, target); } catch (e) { if (e.code === 'EEXIST') fail('OUTPUT_EXISTS', '导出期间目标文件已被创建，保留原文件', { path: target }); throw e; }
  } finally { await handle?.close(); await unlink(temp).catch(() => {}); }
  const saved = new ExcelJS.Workbook(); await saved.xlsx.readFile(target);
  if (saved.getWorksheet('商品列表').rowCount !== result.rows.length + 1) fail('OUTPUT_VERIFICATION_FAILED', 'Excel 行数校验失败');
  const stat = await lstat(target); return { path: target, bytes: stat.size, mode: (stat.mode & 0o777).toString(8), sheets: saved.worksheets.map(s => s.name), rows: result.rows.length };
}
