# 智慧树平台 · Claude Code 自动化 Skill

让 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 自动化完成[智慧树](https://www.zhihuishu.com)课程的知识点掌握度提升。

## 功能

- **自动答题**：Claude Code 首轮 AI 判断 + `auto-brush.js` 脚本重复刷题，零 token 消耗
- **题库共享**：答题过程中自动积累 `题库.md`，可跨用户复用
- **断点续跑**：`progress.md` 实时记录进度，中断后自动恢复
- **Supervisor 模式**：Claude Code 被动监控，仅在题库不足时介入，最大化节省 token

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/Manasseh-D/zhihuishu-skill.git .
npm install && npx playwright install chromium

# 2. 安装 Playwright CLI
npm install -g @playwright/cli@latest
playwright-cli install --skills

# 3. 启动 Claude Code
claude --dangerously-skip-permissions

# 4. 告诉 CC：「帮我完成病理学的前三章知识点掌握度提升」
#    在弹出的浏览器中手动登录后，告诉 CC「继续」
```

## 前置依赖

| 工具 | 安装命令 |
|------|---------|
| Node.js | https://nodejs.org |
| Playwright CLI | `npm install -g @playwright/cli@latest` |
| Playwright (Chromium) | `npm install playwright && npx playwright install chromium` |

## 项目文件

| 文件 | 说明 |
|------|------|
| `zhihuishu-skill.md` | 完整操作指南（Claude Code 读取） |
| `auto-brush.js` | 独立刷题脚本（零 token） |
| `题库.md` | 答题题库（可跨用户共享） |
| `progress.md` | 进度追踪（自动更新） |
| `storage-state.json` | 登录态（gitignore，含 cookie） |

