# 智慧树AI刷课助手

让 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 通过 Playwright MCP 操作[智慧树](https://www.zhihuishu.com)平台，自动完成课程知识点掌握度提升，逐题作答并积累题库。

## 目录

- [使用需求](#使用需求)
- [使用指南](#使用指南)
- [安装](#安装)
- [注意事项](#注意事项)
- [写在最后](#写在最后)

## 使用需求

### ⚠️ 必须安装 Claude Code 和 Playwright MCP

本工具依赖 **Claude Code** 和 **Playwright MCP**。如果尚未下载安装，可参考笔者发布在微信公众号 **南医春华秋实** 中的推文：

> **《医学生AI副手：Claude Code搭建分享》**

### Token 按量计费

Claude Code 按 token 消耗计费，参考费用：

- 实测在**无可用题库**下使用 **DeepSeekV4-Flash**（`/effort xhigh`）跑完 30 个知识点至 100% 掌握度，花费约 **15 RMB**
- 若已有完整题库，消耗会更低

## 使用指南

推荐使用方式：

1. **新建一个文件夹**，将 `zhihuishu-skill.md` 与 `题库.md` 放入其中
2. 以 **bypass permissions** 模式打开 Claude Code：在终端中输入

   ```bash
   claude --dangerously-skip-permissions
   ```

3. 告诉 CC 需要完成的智慧树课程名称和章节
4. 在弹出的浏览器窗口中**手动登录**并完成验证
5. 返回对话框，告诉 CC：**"继续"**
6. 等待运行结果即可

## 安装

### 方式一：一行命令

打开你的 Claude Code，告诉它：

```
帮我安装这个 skill：https://github.com/Manasseh-D/zhihuishu-skill
```

Claude Code 会自动克隆仓库并完成配置。

### 方式二：Git 克隆（推荐）

**Windows（PowerShell）：**

```powershell
git clone https://github.com/Manasseh-D/zhihuishu-skill.git
cd zhihuishu-skill
claude --dangerously-skip-permissions
```

**macOS / Linux：**

```bash
git clone https://github.com/Manasseh-D/zhihuishu-skill.git
cd zhihuishu-skill
claude --dangerously-skip-permissions
```

### 方式三：手动下载

1. 点击仓库页面 **Code → Download ZIP**，解压到本地文件夹
2. 在该文件夹中打开终端，运行 `claude --dangerously-skip-permissions`

## 注意事项

1. **模型选择**：推荐使用上下文窗口约 200K 的模型（需触发 auto compacting）。
❌ 超长上下文在后期会不受控制、表现变差、花费剧增。
推荐模型：**DeepSeekV4-Flash**，便宜量大（默认 200K 上下文）

2. **重要文件**：运行过程会产生两个重要文件：
   - `题库.md`：CC 在运行过程中会将测试题目全量记录，跑完一个课程后获得的题库可**相互分享**，提高他人运行效率并节省花费
   - `progress.md`：记录任务完成进展

3. **运行稳定性**：任务完成时间随任务量增大而增长。MCP、网络、CC 偶有 bug 或页面加载异常，建议偶尔检查一下，必要时手动刷新浏览器

4. **中断处理**：CC 偶尔会停下来汇报情况，告诉它"继续完成任务"即可。若部分章节未刷到 100%，让 CC 返工即可

5. **缓存文件**：运行中产生的 `.playwright-mcp` 文件夹是 MCP 运行时的缓存文件，可定期删除以节省 token

## 写在最后

1. 本仓库中的 `题库.md` 是**病理学 2026 年春夏学期**的全量题库，有相似课程的同学可直接下载使用
2. 智慧树中非 AI 课程的其他章末测试也可以类似方式实现自动完成，有需求者可自行开发
3. 若有愿意分享已收集题库者，可关注微信公众号 **Manasseh-D**，私信后台
4. 笔者非专业项目开发者，skill 尚有诸多不足之处，只希望能帮助大家节省更多精力，专注医学学习
5. 推荐另一个网课助手：[OCS 网课助手](https://docs.ocsjs.com)，支持超星学习通、智慧树等多平台的自动化刷课

祝大家绩点高高！
