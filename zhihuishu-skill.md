# 智慧树答题 Skill

智慧树（zhihuishu.com）课程知识点掌握度提升自动化操作指南。
采用 **Supervisor Pattern**：Claude Code 负责首轮探索入库，`auto-brush.js` 脚本负责重复刷题，CC 全程被动监控。

## 开始前

首次使用前确保项目根目录存在以下文件。若不存在，CC 自动创建。

**`题库.md`** — 答题题库：

```markdown
# 智慧树答题题库

> 格式：`### 关键词` + `- 类型: single/multi` + `- 正确选项: ...`
> 单选示例：`### 抗原具有` → `- 类型: single` → `- 正确选项: 免疫原性和免疫反应性`
> 多选示例：`### 空间结构特点` → `- 类型: multi` → `- 正确选项: A顺序表位, B构象表位`

---
```

**`progress.md`** — 进度追踪：

```markdown
# 答题进度

| 知识点 | pointId | 掌握度 | 完成日期 |
|--------|---------|--------|----------|
```

---

> ⛔ **自动化原则**：本流程全自动运行。CC 不得询问"要继续吗"，每个知识点完成后立即进入下一个。

---

## 一、站点结构

| 页面 | URL 模式 |
|------|----------|
| 学生首页 | `https://onlineweb.zhihuishu.com/onlinestuh5` |
| 课程主页 | `https://ai-smart-course-student-pro.zhihuishu.com/singleCourse/knowledgeStudy/{courseId}/{classId}` |
| 知识点学习页 | `https://ai-smart-course-student-pro.zhihuishu.com/learnPage/{courseId}/{pointId}/{classId}?catalogActiveTab=personal` |
| 掌握度历史页 | `https://ai-smart-course-student-pro.zhihuishu.com/masteryHistory/{courseId}/{classId}/{pointId}?catalogActiveTab=personal&isFreeExam=0` |
| 答题页 | `https://studentexamcomh5.zhihuishu.com/studentReviewTestOrExam/{examId}/1/1/{courseId}/...?paperId={paperId}` |
| 答题结果页 | `https://ai-smart-course-student-pro.zhihuishu.com/point/{courseId}/{paperId}/{examId}/{pointId}/{classId}` |

---

## 二、初始化与登录

答题流程通过 **Playwright CLI** 驱动浏览器完成。

> **前置安装**：`npm install -g @playwright/cli@latest && playwright-cli install --skills`

### 首次使用

1. 启动 headed 浏览器 session：
   ```bash
   playwright-cli -s=zhihuishu open https://www.zhihuishu.com --headed --persistent
   ```
2. 点击登录 → **用户手动完成登录**（CC 不介入凭证输入）
3. 确认已进入学生首页（URL 含 `onlineweb.zhihuishu.com/onlinestuh5`）
4. 保存登录态：
   ```bash
   playwright-cli -s=zhihuishu state-save storage-state.json
   ```

### 后续 session

```bash
playwright-cli -s=zhihuishu open https://www.zhihuishu.com --headed --persistent
playwright-cli -s=zhihuishu state-load storage-state.json
playwright-cli -s=zhihuishu goto https://onlineweb.zhihuishu.com/onlinestuh5
```

登录态失效时提示用户重新手动登录并更新 `storage-state.json`。此文件含敏感 cookie，已在 `.gitignore` 排除。

每次答题前确认 session 存活：`playwright-cli list`。

---

## 三、课程定位

从学生首页定位到目标课程的知识点列表：

1. 提取课程列表：
   ```bash
   playwright-cli -s=zhihuishu --raw eval "
     JSON.stringify([...document.querySelectorAll('.course-item')].map(el => ({
       name: el.querySelector('.course-name')?.textContent?.trim(),
       href: el.querySelector('a')?.href
     })))
   "
   ```
   若 `.course-item` 选择器不匹配，用 `playwright-cli -s=zhihuishu snapshot` 查看实际 DOM 结构。

2. 课程名文本匹配（`includes`）→ 匹配到一个就点击进入
3. 从当前 URL 提取 `courseId` 和 `classId`
4. 抓取知识点列表。新版课程页使用分页标签 + `[id^="knowledgeId-"]` 元素：
   ```bash
   playwright-cli -s=zhihuishu --raw eval "
     JSON.stringify([...document.querySelectorAll('[id^=knowledgeId-]')].map(el => ({
       name: el.textContent.replace(/\d{1,3}\s*%/g,'').trim().slice(0,50),
       pointId: el.id.replace('knowledgeId-',''),
       mastery: (el.textContent.match(/(\d{1,3})%/) || [])[1] || '0'
     })))
   "
   ```
   若知识点在未展开的标签页内，先点击标签再抓取。
5. 根据用户指令筛选目标知识点，初始化 `progress.md`

> courseId、classId、pointId 均由 CC 自动提取，用户只需用自然语言描述课程名和范围。

---

## 四、掌握度提升流程

### 4.1 基本规律

- 首次答题全对 → 掌握度 **97%**
- 连续三次答题全对 → 掌握度达到 **100%**（中途有错题则重新计数）
- 未全对时在结果页查看解析，修正后重新答题

### 4.2 操作步骤 — Supervisor Pattern

```
┌─ Phase 1: Claude 首轮探索入库 ──────────────────────┐
│ 1. 进入课程主页 → 点击知识点 → 进入学习页              │
│ 2. 点击「去提升」→ masteryHistory →「去提升 →」→ 答题页 │
│ 3. 逐题作答（Grep 题库 优先）                         │
│ 4. 提交 → 检查掌握度                                  │
│ 5. ≥97% → 入库所有题目 → 启动 Phase 2                 │
│ 6. <97% → 查看解析 → 逐题（不论对错）以系统正确答案入库  │
│          → 重复步骤 2-6 直至 ≥97%                     │
└──────────────────────────────────────────────────────┘
                         │
                         ▼
┌─ Phase 2: auto-brush.js 自动刷题 ───────────────────┐
│ node auto-brush.js --point-id <pointId> --rounds 2    │
│                                                      │
│ CC 进入 passive monitoring 模式:                       │
│   • 脚本写 hook-events.jsonl 实时事件                  │
│   • CC 用 Monitor 工具被动监看                         │
│   • 仅 error 事件时介入补充题库                        │
│   • 介入完成后 touch resume.signal → 脚本自行恢复       │
└──────────────────────────────────────────────────────┘
```

### 4.3 Hook 事件参考

脚本运行时通过文件事件总线与 Claude Code 通信：

| 事件 | 含义 | CC 动作 |
|------|------|---------|
| `script_start` | 脚本开始处理知识点 | 记录 |
| `round_start` | 新一轮答题开始 | 静默 |
| `question_matched` | 题库匹配成功 | 静默 |
| `question_unmatched` | 题库无匹配 | 累积（事后查看 `unmatched.log`） |
| `round_complete` | 单轮答题完成 | 静默 |
| `round_learnpage` | learnPage 掌握度复核 | 自动更新 `progress.md` |
| `error` (ALL_UNMATCHED) | 全部未匹配，等待介入 | **介入**：补充题库 → `touch resume.signal` |
| `point_complete` | 知识点达到 100% | 记录，进入下一个知识点 |
| `script_end` | 脚本退出（未达 100%） | 评估是否需要继续 |

### 4.4 CC 介入协议

当检测到 `error` 事件（`reason: ALL_UNMATCHED`）时：

```
1. Read unmatched.log → 获取未匹配题目列表
2. 用 playwright-cli 导航到该知识点答题页，逐题作答
3. 在结果页查看解析 → 以系统正确答案为准，追加到 题库.md
4. touch resume.signal → 脚本检测到后重新尝试当前轮
5. 若脚本再次全部未匹配 → 再介入一次 → 三次后标记需人工复查
```

### 4.5 新 session 自动恢复

新 CC 会话启动时：

```
1. 读 progress.md → 找出掌握度 < 100% 的知识点
2. 读 script-status.json → 若有残留 "waiting_intervention" 状态
   → 说明上文会话中断在介入等待中
   → 执行 4.4 介入协议
3. 针对剩余未完成知识点:
   → 题库覆盖完整的: 直接 node auto-brush.js --all
   → 题库空的: 先 Phase 1 再脚本
```

---

## 五、题库策略

**题库文件**：`题库.md`，每条自包含。

**搜索**：Grep 按需检索，不全文加载：
```
对每道题:
  1. 提取 ≥5 字独特片段 → Grep "关键词" 题库.md -A 3
  2. 命中 → 直接使用
  3. 无结果 → 换片段重试；仍无则为新题，AI 自行判断
```

**入库**（错题记录铁律）：
```
掌握度 < 97% → 查看解析 → 逐题以系统正确答案为准记录
→ 格式: ### 关键词 + - 类型: single/multi + - 正确选项: ...
→ 关键词必须从实际读到的题目文本逐字复制 ≥5 字
```

**匹配置信度**（脚本端）：≥5 字 HIGH、4 字 MEDIUM、≤3 字 LOW。

---

## 六、浏览器自动化策略

### 6.1 工具优先级

| 工具 | 命令 | 场景 |
|------|------|------|
| `--raw eval` | `-s=zhihuishu --raw eval "..."` | DOM 文本提取，零附加快照 |
| `click` | `-s=zhihuishu click "getByText('...')"` | 按钮/选项点击 |
| `Grep` | `Grep "关键词" 题库.md -A 3` | 题库检索 |
| `run-code` | `-s=zhihuishu run-code "..."` | 多选题 mouse.click、提交弹窗 |
| `snapshot` + `Read` | `-s=zhihuishu snapshot` | 需要页面全貌时按需读取 |

### 6.2 关键选择器

```bash
# 文本定位器（推荐）
playwright-cli -s=zhihuishu click "getByText('去提升')"

# CSS 选择器（stable ID）
playwright-cli -s=zhihuishu click "#rc-tabs-0-tab-knowledgeItem-xxx"

# JS evaluate 遍历（Vue SPA 动态 DOM）
playwright-cli -s=zhihuishu --raw eval "
  (() => {
    for (const el of document.querySelectorAll('div, span')) {
      if (el.textContent?.trim() === '去提升 →') { el.click(); return 'clicked'; }
    }
    return 'not found';
  })()
"
```

### 6.3 多选题处理

`run-code` + `page.mouse.click(boundingBox)` — 唯一能触发 Vue v-model 更新的方式：

```bash
playwright-cli -s=zhihuishu run-code "async (page) => {
  const targets = ['免疫防御', '免疫自稳', '免疫监视'];
  for (const target of targets) {
    const labels = page.locator('.el-checkbox__label');
    const count = await labels.count();
    for (let i = 0; i < count; i++) {
      const t = await labels.nth(i).textContent();
      if (t.trim().includes(target)) {
        const parent = labels.nth(i).locator('..');
        const isChecked = await parent.evaluate(el => el.classList.contains('is-checked'));
        if (isChecked) break;
        const box = await parent.boundingBox();
        if (box) await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
        await page.waitForTimeout(400);
        break;
      }
    }
  }
  return 'done';
}"
```

### 6.4 提交对话框

智慧树自定义 Vue 弹窗，`dialog-accept` 无效。使用 `run-code` 一键提交：

```bash
playwright-cli -s=zhihuishu run-code "async (page) => {
  await page.getByText('提交作业').click();
  await page.waitForTimeout(2000);
  await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
  await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button, .el-button')) {
      if (/确定|交卷/.test(b.textContent||''))
        b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });
  await page.waitForTimeout(3000);
  return page.url();
}"
```

---

## 七、常见问题

| # | 问题 | 对策 |
|----|------|------|
| Q1 | 题目顺序每次随机 | 按内容关键词匹配，不依赖题号 |
| Q2 | paperId 只能提交一次 | 每轮从 learnPage 重新进入获取新 paperId |
| Q3 | 文本定位器匹配失败（→ 箭头字符） | 用 JS `textContent` 遍历替代 `getByText` |
| Q4 | 多选误触已选项 is-checked 反选 | 点击前检查 class，跳过已选中 |
| Q5 | 题库覆盖不足提交废卷 | 脚本 ≥2 题全未匹配时跳过提交 |
| Q6 | 提交后 URL 参数 undefined | 用 keyboard Enter + dispatchEvent 双保险 |
| Q7 | learnPage 掌握度缓存未更新 | URL 导航 + reload 解决 |
| Q8 | 元素不在视口内 | `scrollIntoView({ block: 'center' })` 后操作 |

---

## 八、CLI 命令速查

| 操作 | 命令 |
|------|------|
| 启动浏览器 | `playwright-cli -s=zhihuishu open <url> --headed --persistent` |
| 跳转 URL | `playwright-cli -s=zhihuishu goto <url>` |
| 点击 | `playwright-cli -s=zhihuishu click "getByText('...')"` |
| JS 执行 | `playwright-cli -s=zhihuishu --raw eval "..."` |
| 快照 | `playwright-cli -s=zhihuishu snapshot` |
| 复杂脚本 | `playwright-cli -s=zhihuishu run-code "async (page) => { ... }"` |
| 保存登录态 | `playwright-cli -s=zhihuishu state-save storage-state.json` |
| 恢复登录态 | `playwright-cli -s=zhihuishu state-load storage-state.json` |
| 列出 session | `playwright-cli list` |
| 打开监控 | `playwright-cli show` |

---

## 九、auto-brush.js 速查

```bash
# 推荐模式
node auto-brush.js --point-id 157455              # 按 pointId（最可靠）
node auto-brush.js --point-id 157455 --rounds 2   # 指定轮数
node auto-brush.js --all                          # 批量处理 progress.md 未完成项
node auto-brush.js --point-id 157455 --dry-run    # 仅匹配不提交
node auto-brush.js --point-id 157455 --headed     # 显示窗口

# Hook 相关文件（脚本自动生成）
hook-events.jsonl     # 实时事件流 → CC 用 Monitor 监看
script-status.json    # 脚本当前状态 → 恢复时读取
resume.signal         # Claude 介入标志 → touch 后脚本自动恢复
unmatched.log         # 未匹配题目详情 → CC 介入时读取
```

> 前置: `npm install playwright && npx playwright install chromium`
