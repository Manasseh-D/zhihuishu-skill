# CHANGELOG

## v15 (2026-06-22) — Supervisor Pattern + Hook 系统

- **Hook 事件总线**：`hook-events.jsonl` 实时事件流，`script-status.json` 状态文件
- **Claude Code 被动监控**：脚本全自动运行，CC 仅在 error 事件时介入
- **自动恢复**：ALL_UNMATCHED 时等待 `resume.signal`，Claude 补充题库后脚本自动继续
- **auto-brush.js 六大修复**：DOM 适配、掌握度读数、题干提取、题数计数、防护阈值、导航可靠性
- **progress.md 自动更新**：脚本每轮结束后自动写回掌握度
- **项目全面清理**：skill.md 791→232 行、README 重写、CHANGELOG 精简

## v14 (2026-06-22) — CLI 迁移 + 核心瓶颈突破

- Playwright MCP → CLI 全面迁移（`@playwright/cli`）
- 提交弹窗方案验证（keyboard Enter × 2 + dispatchEvent，连续 3 轮 100% 成功）
- `run-code` 一键答题+提交模板
- Session/Dashboard 管理、人工介入模式
- 两阶段策略：Claude 首轮 + auto-brush.js 脚本
- Token 消耗估算更新

## v1 (2026-05-18) — 初始版本
