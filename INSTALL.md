# 安装

发送给当前使用的 Agent：

> 安装 @petercjl/cmmcli，并完成当前 Agent 的配套 Skill 安装与验证。

Agent执行合同：先检查现有CLI与目标。解析当前宿主支持的Skill发现目录，使用 `skill source --json` 确认规范源，通过 `skill install --target <绝对Skill目录> --agent <当前Agent标识> --json` 安装完整资源及独立运行时。通用适配接受任意合法Agent标识；路径必须显式提供，包不猜宿主目录。不修改其他Agent。

新目标实体复制Skill、运行时与依赖，所有权和sha256记录于回执；未托管或已编辑目标会拒绝。已有托管目标更新前保留完整备份，校验失败保留恢复路径。使用 `skill status` 检查 installed/managed/current 和哈希，再执行所选Skill的 `.runtime/bin/cmmcli.mjs version --json` 与 `doctor --json`。宿主自行加载/刷新Skill发现；CLI回执中的hostDiscovery始终由宿主确认。版本、资源和发现确认前安装为未完成。

npm可禁用脚本；仍执行相同发现与同步步骤。安装后优先使用Skill自带运行时，引导npm包移除不会影响已实体安装的运行时。恢复时保留已有目录，查询status并使用新路径，或人工核对备份后修复。
