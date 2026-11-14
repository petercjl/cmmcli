# 搜索与数据口径

## 命令合同

`search <keyword> [--pages 1..100 | --all] [--day 1|7|30] [--sort duration_volume|duration_amount] [--order desc|asc] [--output file.xlsx] [--cdp http://127.0.0.1:9223] [--json]`

默认第一页50条、昨日、销量降序、全部类目。新建标签页避免继承用户此前筛选。CLI 逐页执行页面的商品搜索请求，核对实际关键词、页码、每页数量、周期、排序和类目；读取页面 API 客户端解析的记录。响应仍需为成功码，错误、重复页、意外空页或参数错位均停止导出。

## 来源与映射

页面：商品 → 商品库 `/promotionRank/`。主列表接口：`POST https://api-service.chanmama.com/v6/product/search`。服务传输响应可能为 `data.is_encrypt=true`；CLI 复用已登录页面的请求与解析流程，不保存认证内容。

| Excel | 页面解析字段 | 口径 |
| --- | --- | --- |
| 商品名称 / 店铺 | title / shop_name | 原文 |
| 蝉妈妈商品ID | promotion_id | 字符串 |
| 商品价格 | sku_union_price | 页面值；隐藏值保留 |
| 公开佣金 | tb_max_commission_rate | 百分比，Excel数值除以100 |
| 蝉选佣金 | jx_commission_rate | 百分比 |
| 销量 / 销售额区间 | duration_volume_text / duration_amount_text | 原区间文本，金额单位元 |
| 直播 / 视频 / 商品卡销量 | duration_live_volume_text / duration_aweme_volume_text / duration_other_volume_text | 原区间文本 |
| 关联视频 / 带货达人 | duration_video_count / duration_author_count | 条数；缺失不填0 |
| 商品链接 | product_short_url / dy_url | 来源链接 |

`duration_*_text_cmm_ind` 为额外指标字段，语义未核实，保留在原始字段表。原始数字0可能为隐藏占位，不能覆盖页面区间。负数哨兵、null、空字符串、真实0分别保留在原始字段表。嵌套字段使用JSON文本。

返回 `rows` 与 `pageEvidence`；实际Excel路径、字节数、工作表与行数在 `artifact`。Excel含商品列表、查询条件、原始字段。默认唯一文件名；显式路径已存在则拒绝覆盖。Excel写入完成并核对行数才返回成功。搜索仅读取平台数据；平台可能记录搜索行为。成功后浏览器标签保留。

页面当前最多访问5000条，匹配总数可能更多。顺序分页并非冻结快照；相同页重复会报错。匹配总数作为各页查询信息记录。当前能力不含顶部推荐、达人搜索或平台导出按钮操作。

## 依赖

Node.js 22+、包内 Commander/Playwright Core/ExcelJS、可访问本机 Chrome CDP 和拥有查询权限的蝉妈妈账号。`doctor` 检查依赖与 CDP 可达性，账号权限由实际搜索验证。凭证与浏览器配置由用户环境所有，不进入包或Skill。任何具备上述能力的 Agent 均可执行；具体操作系统验证见包的兼容性记录。
