# CHANGELOG

## v14 (2026-06-22) — 核心瓶颈突破

基于**癌前病变和原位癌知识点连续3轮100%成功率**的实战验证：

- **5.7 节重写**：完整 `run-code` 一键答题+提交模板，`keyboard.press('Enter')` × 2 + `dispatchEvent` 弹窗处理（连续 3 轮全部成功，URL 参数完整）
- **关键纠正**：智慧树弹窗是**自定义 Vue 组件**非 Element Plus `el-message-box`，`waitForSelector('.el-message-box__wrapper')` 超时
- Q18 更新：URL undefined 问题已解决
- **完整流程模板**：`run-code` 包含逐题作答（关键词匹配 + `getByText` 点击）+ 键盘 Enter 弹窗链 + JS dispatchEvent 兜底
- 发现 Vue 3 `__vue_app__` 可用于 Plan B（已探索但键盘方案更稳定）
- 返回到 learnPage 后需 `reload` 才能看到最新掌握度（缓存问题）

## v13 (2026-06-17) — CLI 实战修正

基于 Pathology 课程实操验证，修正多个 CLI 文档与实际行为不一致的地方：

- **5.7 提交对话框处理重写**：`dialog-accept` 对 Vue Element UI 弹窗无效，改为已验证的 `run-code` + 键盘 `Enter` + JS `dispatchEvent` 组合方案
- 新增 Q16-Q20（替换旧 Q16-Q18）：`getByText('去提升 →')` 匹配失败、`--raw eval` viewport float 无害 bug、结果页 URL undefined 参数 bug、session 关闭后 state-load 必需、Vue 弹窗 dialog-accept 无效
- **移除所有 MCP 残留引用**：工具优先级表、CLI vs MCP 对比文本、"替代 browser_evaluate" 等旧命名全部清理
- **登录流程明确**：新增 session 重启后 `state-load` 步骤说明
- 实测验证：CLI `click getByText` 单选可靠（6/6 题生效），`run-code` + `page.mouse.click` 多选可靠，`snapshot` + ref 快速定位有效
- 发现 Playwright 1.61 的 screencast viewport float 问题（`--raw eval` 时报错但功能正常）

## v12 (2026-06-17) — CLI 迁移

- **全面迁移 Playwright MCP → CLI**（`@playwright/cli`）：所有 `browser_*` 命令替换为 `playwright-cli` 等价命令
- 新增 Session 与 Dashboard 管理（5.2）：`playwright-cli show` 实时监控 + 点击接管/按 Escape 释放
- 新增人工介入模式（5.3）：验证码、页面异常、AI 卡住等场景在 Dashboard 中直接操作，无需终端交互
- 工具优先级表重写（5.1）：`--raw eval` + `click` 为最高优先，快照改为按需磁盘读取
- 多选处理迁移至 `run-code`（5.6），语法完全兼容原 `browser_run_code_unsafe` 脚本
- 新增 CLI 命令速查表（第八章）
- 新增 Q16-Q18：CLI 常见问题（忘记 `--headed`、Dashboard 连接、PowerShell 引号）
- Token 估算更新：每知识点约 12K（vs MCP 约 33K，节省 64%）
- 上下文管理建议从每 3 个知识点重置提升至 8-12 个
- README 同步更新：CLI 安装命令、费用估算、缓存文件路径

## v11 (2026-05-23)

- Q&A 精简：25→15 条，删除 8 条重复（Q1/Q9/Q11/Q16/Q17/Q20/Q22/Q24），合并 5 条（Q3+Q17→Q2, Q5+Q12+Q13→Q4）
- 4.3 关键提示删除 paperId 复用问题（Q2 已覆盖），只保留题目随机和类型注意
- 删除 5.3 完整浏览器导航脚本（~30 行，标注"切勿运行"，从未使用且未整合多选新方案）
- 总计：~477→~400 行

## v10 (2026-05-23)

- 上下文管理规则从第七章提升至「开始前」紧接自动化原则（最高优先级）
- 解决"lost in the middle"效应：长文档靠后的规则易被忽略
- 第七章精简为引用指针

## v9 (2026-05-23)

- 多选题方案修正：主方案改为 `page.mouse.click(boundingBox)` 真实鼠标坐标点击（唯一能触发 Vue model 更新）
- 5.2/5.4/Q18/Q20/Q22 全部更新：JS click 降级为备用方案，标注"仅 DOM 视觉，提交可能不生效"
- 验证方式修正：`.is-checked` class 不等于提交生效，以实际提交结果为最终验证
- 基于 issue001 实测结论（6 种失败方法 + 最终验证通过）

## v8 (2026-05-23)

- 全自动防停止加固：CLAUDE.md 顶部置顶"永不暂停"指令，skill 开始前加自动化声明
- 关键边界点（操作步骤末尾、阶段四末尾）加内联"不停止"微指令
- Compact 策略收紧：从"≥2 轮"改为"每轮入库后立即 compact"，上下文始终保持最小
- 解决长会话中规则沉底导致 CC 回归询问确认的问题

## v7 (2026-05-23)

- 新增「初始化与登录」章节（Playwright MCP 驱动，手动登录 + storage-state 持久化）
- 新增「课程定位」章节（从学生首页文本匹配课程 → 自动提取 ID → 枚举知识点）
- 章号重排：一(站点) → 二(登录) → 三(定位) → 四(流程) → 五(自动化) → 六(FAQ) → 七(上下文)
- 通用导航技巧合并入 4.5
- 所有内部交叉引用同步更新

## v6 (2026-05-23)

- 引入 Grep 按需检索题库替代全量 Read
- 新增上下文管理机制（任务边界 compact + 自动继续规则）
- 关键词长度调整为 4~7 字
- 精简冗余内容

## v5 (2026-05-22)

- 新增 Q23~Q27：单选短关键词匹配、多选 locator 精确匹配、题目随机顺序自适应作答、undefined 重定向完整处理、遗漏多选题排查

## v4 (2026-05-22)

- `browser_evaluate` 提升为最高优先，`browser_run_code_unsafe` 降为仅导航读取
- 多选题强制逐步点击 + 逐项验证

## v3 (2026-05-21)

- 重构工作流程，引入题库优先策略
- QA 数据迁移至 `题库.md`

## v2 (2026-05-18)

- 新增 Q15~Q22
- 修订 Q5、Q14、Q6
- 更新脚本模板
- 添加已验证 QA Map

## v1 (2026-05-18)

- 初始版本，含 Q1~Q14
