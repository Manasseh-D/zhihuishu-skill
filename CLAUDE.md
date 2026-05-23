# ⛔ 最高优先级：本项目为全自动流程。禁止在任何阶段询问用户"要继续吗""是否继续"或等待用户确认。完成一个知识点后立即自动进入下一个。完成一轮后立即自动开始下一轮。永远不停。

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

智慧树（zhihuishu.com）课程知识点掌握度提升自动化项目。通过 **AI + Playwright 浏览器自动化** 协作模式，在智慧树平台逐题作答，积累题库，最终将每个知识点的掌握度提升至 100%。

详细操作指南见 `zhihuishu-skill.md`。

## 核心文件

| 文件 | 用途 |
|------|------|
| `zhihuishu-skill.md` | 完整操作指南：站点结构、登录初始化、课程定位、工作流程、浏览器自动化策略、FAQ（Q1~Q25）、代码模板、上下文管理规则 |
| `题库.md` | 答题题库，按知识点分组。**不要全文 Read**，用 `Grep "关键词" 题库.md -A 3` 按需检索（~50 tokens/次 vs ~4,000 tokens/全文） |
| `CHANGELOG.md` | 版本更新记录 |
| `progress.md` | 进度追踪，记录各知识点的完成状态 |
| `storage-state.json` | 登录态持久化文件（**不要提交到 Git**） |

## 工作流程（完整链路）

**前置阶段：**
1. **初始化与登录**：Playwright MCP 打开智慧树 → 用户手动登录 → `browser_storage_state` 保存登录态
2. **课程定位**：从学生首页匹配课程名 → 进入课程主页 → 自动提取 courseId/classId → 枚举知识点列表

**答题阶段：**
1. **按需检索题库**：每题用 `Grep "关键词片段" 题库.md -A 3` 检索，命中直接用。不要全文 Read
2. **逐题作答**：优先 `browser_evaluate` 提取题目 JSON，避免全页 snapshot
3. **提交与检查**：提交作业 → 处理 Vue 确认对话框（确定→交卷）→ 检查 undefined 重定向
4. **结果判断与入库**：掌握度 ≥ 97% 为全对；< 97% 则逐题以系统正确答案追加到 `题库.md`

## 关键约束

- **题库按需检索**：用 Grep 而非 Read，每道题单独检索，95% token 节省
- **逐步操作**：多选题必须逐项点击并验证 `.is-checked`，禁止脚本批处理
- **选择题器**：优先 `browser_evaluate`（JS 遍历+scrollIntoView），其次 Playwright locator
- **关键词匹配**：使用 4~7 字短片段，避免完整长句因空格/格式差异失败
- **paperId 一次性**：每次提交后必须从 learnPage 重新获取新 paperId
- **reviewQ=2**：第二次答题时 URL 可能含此参数，需去掉否则不计分
- **掌握度规则**：连续 3 次全对达 100%，中途任何一次非全对则计数重置

连续处理 3 个知识点后，建议开启新 CC 会话。新 session 读取 `progress.md` 了解进度。

## 浏览器自动化要点

- 网站基于 Vue + Element UI，选择器以 `.el-checkbox`、`.el-checkbox__label`、`li` 为主
- 确认对话框非原生 alert，需遍历 `span.comfirm` / `button` 点击"确定"→"交卷"
- 结果页 undefined 重定向：提交后 URL 若含 `undefined`，需手动构造 `/point/{courseId}/{paperId}/{examId}/{pointId}/{classId}`
- 部分 li 元素在视口外（x 坐标为负），需 `scrollIntoView({ block: 'center' })` 后再点击

## 开始使用

课程 ID 和班级 ID 在实际操作中由用户以自然语言提供，无需写入配置文件。
