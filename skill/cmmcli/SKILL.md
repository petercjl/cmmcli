---
name: cmmcli
description: 使用 cmmcli 从已登录蝉妈妈的本机电商浏览器搜索商品，读取分页列表并导出 Excel。适用于蝉妈妈商品关键词搜索、商品列表获取与表格导出。
---

# 蝉妈妈商品搜索

版本：0.1.1。输入关键词与可选页数、统计周期、排序及输出路径；通过 CLI 获取商品主列表，交付 Excel 和实际覆盖范围。适用于具有命令执行、本地文件读写及本机已登录 Chrome CDP 的任意 Agent。CLI 负责请求参数、会话复用、分页、数据映射、文件保护和结果验证；业务分析由调用方决定。

## 执行入口

已安装 Skill 带有独立运行时：优先使用本 Skill 目录下 `.runtime/bin/cmmcli.mjs`，通过 Node.js 22+ 执行。源码/规范源尚无 `.runtime` 时，由 `cmmcli skill source --json` 确认当前包入口。逻辑能力与通用适配见 [能力合同](capabilities.json) 和 [generic适配](adapters/generic.json)。首次调用读取 `capabilities --json`；诊断使用 `doctor --json`。完整使用合同按需查看 [搜索与数据口径](references/search-contract.md)。

## 主线

1. 确定关键词。未指定时默认第一页50条、昨日、销量降序；指定页数或周期时原样传入。输出使用用户路径或 CLI 生成的唯一文件名。
2. 调用当前入口：`search "关键词" --pages 1 --output <新文件.xlsx> --json`。`--day` 支持 `1`、`7`、`30`；`--all` 获取页面允许访问的全部结果，最多5000条。页数和全量选项分别使用。
3. 检查 `ok`、`artifact.path`、`artifact.rows`、实际请求参数及完整性字段。CLI 已验证 Excel 保存后行数。交付文件并报告实际导出数、接口匹配数和可访问上限；仅覆盖请求页时如实说明。

默认连接 `http://127.0.0.1:9223`，使用用户已登录的电商浏览器。CLI 在同一浏览器会话中打开搜索标签页，保留成功结果页。不会启动新浏览器或迁移 Cookie。

## 分支与返回点

- `BROWSER_UNAVAILABLE`：请用户打开电商浏览器；浏览器就绪后返回主线第2步。
- `AUTH_REQUIRED`、`PERMISSION_REQUIRED`：用户在对应 Chrome 窗口完成登录或验证后返回第2步。保留会员权限边界。
- `OUTPUT_EXISTS`：保留原文件，使用新名称返回第2步；替换请求须先备份现有文件。
- `PAGE_CONTRACT_CHANGED`、`RESPONSE_CONTRACT_CHANGED`、`PARAMETER_MISMATCH`、`INCOMPLETE_PAGE`、`API_ERROR`：报告错误；普通任务结束。开发维护时才能更新页面适配，验证后重新执行搜索。
- 分页失败时本次导出不提交；可降低页数重新发起独立查询。原有文件始终保留。

## 验收与边界

列表以页面显示的销量、销售额区间为主；价格隐藏、空值和哨兵值保留其含义。`原始字段` 是页面 API 客户端解析后的记录；页面预估值不当作真实成交。顶部推荐卡片与主列表分开，仅导出主列表。

`completeWithinAccessible` 与 `completeWithinMatched` 分别表示页面可访问范围和接口匹配范围；命令成功不自动代表全量获取。每页实际请求参数、匹配总数与时间保存在 Excel 查询条件和 JSON 的 `pageEvidence`，用于复核。读取这些记录不会修改查询历史。

CLI 与 Skill 更新只影响当前 Agent 明确选择的目标。普通搜索仅检测新版，安装更新需要独立授权。安装和维护使用包根目录 INSTALL.md、UPDATE.md 及 `skill source/status/install/update`；源目录与运行时保持同包版本。发现错误先保留文件与错误码，在获准的维护任务中修正对应适配或规则，再验证代表性成功与失败情况。
