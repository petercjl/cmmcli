# cmmcli

使用已登录蝉妈妈的本机 Chrome 电商浏览器，按关键词获取商品搜索主列表并导出 Excel。默认 CDP 为本机9223端口，默认第一页50条、昨日、销量降序。

将以下提示词发给当前使用的 Agent：

> 用 cmmcli 搜索“抱枕”，导出 Excel。

指定范围：

> 用 cmmcli 搜索“抱枕”，导出近7天的前3页商品。

运行前需打开已登录蝉妈妈并拥有查询权限的 Chrome 调试实例。Excel含商品列表、查询条件和原始字段；区间与隐藏值保留口径。匹配总数、可访问上限和实际导出数量分别报告。

发送安装提示词：

> 安装 @petercjl/cmmcli，并完成当前 Agent 的配套 Skill 安装与验证。

安装与更新分别见 [INSTALL.md](INSTALL.md)、[UPDATE.md](UPDATE.md)。安装入口面向当前Agent，其自行解析Skill目录；npm安装本身仅完成引导CLI。完整安装要求显式选择Skill目标、实体复制Skill及独立运行时、校验版本和哈希，并由宿主确认发现。脚本禁用的npm安装使用相同流程。

Node.js 22+。真实运行验证目标：macOS + Chrome + 当前Agent；其他Agent/Windows/Linux按通用CLI合同设计，目标运行验证状态独立记录。平台变化可能要求更新适配。安装不会授予平台权限。

开发者入口：`cmmcli --help`、`cmmcli capabilities --json`、`cmmcli doctor --json`。业务、安装、状态与更新命令的结构化合同在 capabilities.json。普通搜索以24小时缓存和2秒超时检测latest更新，离线继续；`CMMCLI_UPDATE_CHECK=0`禁用。自动安装关闭，显式更新仅影响所选Skill及其独立运行时，引导npm安装另行管理。服务凭据留在浏览器。
