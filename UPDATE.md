# 更新

发送给当前使用的 Agent：

> 更新 @petercjl/cmmcli，并验证当前 Agent 的 CLI 和配套 Skill。

Agent执行合同：先解析当前Agent的显式Skill目标，检查 `skill status --target <目录> --agent <标识> --json` 和 `update check --json`，保留目标本地修改。`update install --target <目录> --agent <标识> --yes --json` 下载并验证指定稳定版本，将所选Skill与其独立运行时一起更新；相同版本也会校验或修复。完整旧目标在备份目录保存，激活前失败不替换目标。引导npm安装独立管理，本命令不会改动它；后续执行使用返回的 activatedRuntime 或Skill本地入口。

离线或尚未发布时保留现有安装。未知结果先查询真实版本、status和备份，避免重复更新。核对新的运行时版本和Skill哈希，再由宿主加载/刷新发现。不要同步无关Agent。脚本禁用安装与普通安装遵循相同手动同步合同。自动检查仅通知；自动安装未启用。
