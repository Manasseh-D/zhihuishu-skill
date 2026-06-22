# CHANGELOG

## v15 (2026-06-22) — Supervisor Pattern + Hook 系统 + 项目全面清理

基于 5 个知识点（肿瘤病因及发病机制、动脉粥样硬化、肺炎、胃炎、肾小球疾病）的实战验证，重构整个自动化流程架构。

### 架构：Supervisor Pattern

将 Claude Code 从「全程主动操作者」变为「被动监控 + 按需介入」的 Supervisor。
脚本 `auto-brush.js` 全自动运行，通过文件事件总线与 CC 通信。

**IPC 文件协议**：

| 文件 | 功能 |
|------|------|
| `hook-events.jsonl` | 实时事件流（每行一个 JSON），CC 用 Monitor 工具被动监听 |
| `script-status.json` | 脚本当前状态（running / waiting_intervention / completed） |
| `resume.signal` | 空文件标志位，CC 补充题库后 `touch` 通知脚本恢复 |
| `unmatched.log` | 未匹配题目详情，CC 介入时读取 |

**8 个 Hook 注入点**：
`script_start` → `round_start` → `question_matched` / `question_unmatched` → `round_complete` → `round_learnpage` → `error` (ALL_UNMATCHED) → `point_complete` / `script_end`

**ALL_UNMATCHED 恢复流程**：
脚本检测到全部未匹配 → 发送 `error` 事件 → `updateStatus(waiting_intervention)` → `waitForResume()` 轮询 `resume.signal`（最长 120s）→ CC 检测到 error → 读 `unmatched.log` → 补充题库 → `touch resume.signal` → 脚本自动重试当前轮。

**progress.md 自动维护**：
`round_learnpage` 事件触发 `updateProgressFile()` 自动写回掌握度百分比；`point_complete` 时追加完成日期。

### auto-brush.js 六项修复

| # | 函数 | 修复内容 |
|---|------|---------|
| 1 | `findKnowledgePoint()` | 适配新版 rc-tabs 分页 DOM，新增点击章节标签展开搜索 + `[id^="knowledgeId-"]` 提取 |
| 2 | `checkMastery()` | 结果页优先读"最好成绩"；新增 `checkMasteryOnLearnPage()` 回 learnPage 复核 |
| 3 | `readCurrentQuestion()` | 方案 A 从选项列表前兄弟元素提取纯题干文本；全部方案过滤 UI 关键词（"答题卡""已作答"等） |
| 4 | `getTotalQuestions()` | `[role="tree"] > [role="treeitem"]` 过滤纯数字编号，避免重复计数 |
| 5 | ALL_UNMATCHED 防护 | 阈值从 ≥1 题改为 ≥2 题（单题知识点豁免）；新增 `waitForResume` 恢复机制 |
| 6 | `goToExamPage` 步骤2 | JS `textContent` 遍历替代 `getByText('去提升 →')`（箭头字符间歇性匹配失败） |

额外改进：
- `launchBrowser()` / `goToLearnPage()` 使用 `networkidle` 替代 `domcontentloaded`，解决重定向竞态
- `processOnePoint()` 掌握度判断改为 learnPage 最终裁决，取代结果页不准确的读数
- 恢复标志位 `resumed: true` 触发 `r--` 重试同一轮

### zhihuishu-skill.md 重写

- **791 行 → 232 行**（精简 70%）
- 新增 Supervisor Pattern 架构描述（第四章 4.2）
- 新增 Hook 事件参考表 + CC 介入协议（4.3/4.4）
- 新增新 session 自动恢复流程（4.5）
- Q&A 从 20 条独立小节合并为单表（第七章）
- 删除冗余的 CLI 命令展开（5.2/5.3 Dashboard 长篇描述）
- 删除与 auto-brush.js 重复的代码块
- 保留核心操作流程：登录 → 课程定位 → 答题 → 提交

### 项目文件清理

| 文件 | 操作 |
|------|------|
| `README.md` | 重写为 40 行入门指南 |
| `CHANGELOG.md` | 14 版本 → 3 版本（v1 / v14 / v15） |
| `.gitignore` | 新增 `hook-events.jsonl` `script-status.json` `resume.signal` `unmatched.log` `node_modules/` |

### 验证结果

- `node --check auto-brush.js` 语法通过
- `--point-id 1818580932337209344 --dry-run`：1/1 HIGH 匹配，hook-events.jsonl 正确生成 4 条事件
- `--point-id 1810211882527756288 --dry-run`：6/6 HIGH 匹配，0 未匹配
- status 文件退出时自动清理 ✅

## v14 (2026-06-22) — CLI 迁移 + 核心瓶颈突破

- Playwright MCP → CLI 全面迁移（`@playwright/cli`）
- 提交弹窗方案验证（keyboard Enter × 2 + dispatchEvent，连续 3 轮 100% 成功）
- `run-code` 一键答题+提交模板
- Session/Dashboard 管理、人工介入模式
- 两阶段策略：Claude 首轮 + auto-brush.js 脚本
- Token 消耗估算更新

## v1 (2026-05-18) — 初始版本
