# 智慧树答题 Skill

智慧树（zhihuishu.com）课程知识点掌握度提升自动化操作指南。

## 开始前

首次使用前，确保项目根目录存在以下文件。若不存在，CC 自动创建。

**`题库.md`** — 答题题库，最小模板：

```markdown
# 智慧树答题题库

> 每次答题前优先在此搜索答案；答错的题目自动追加到此文件。
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

> ⛔ **自动化原则**：本流程全自动运行，CC 不得在任何阶段询问"要继续吗"或等待用户确认。每个知识点完成后立即进入下一个，每轮结束后立即开始下一轮。**永远不停。**

---

## 一、站点结构

| 页面 | URL 模式 |
|------|----------|
| 官网首页 | `https://www.zhihuishu.com/` |
| 登录页 | `https://passport.zhihuishu.com/login?service=...` |
| 学生首页 | `https://onlineweb.zhihuishu.com/onlinestuh5` |
| 新形态课程主页 | `https://ai-smart-course-student-pro.zhihuishu.com/singleCourse/knowledgeStudy/{courseId}/{classId}` |
| 知识点学习页 | `https://ai-smart-course-student-pro.zhihuishu.com/learnPage/{courseId}/{pointId}/{classId}?catalogActiveTab=personal` |
| 掌握度历史页 | `https://ai-smart-course-student-pro.zhihuishu.com/masteryHistory/{courseId}/{classId}/{pointId}?catalogActiveTab=personal&isFreeExam=0` |
| 答题页 | `https://studentexamcomh5.zhihuishu.com/studentReviewTestOrExam/{examId}/1/1/{courseId}/...?paperId={paperId}` |
| 答题结果页 | `https://ai-smart-course-student-pro.zhihuishu.com/point/{courseId}/{paperId}/{examId}/{pointId}/{classId}` |

---

## 二、初始化与登录

答题流程通过 **Playwright CLI**（`@playwright/cli`）驱动浏览器完成。

> **前置安装**：`npm install -g @playwright/cli@latest && playwright-cli install --skills`
>
> Playwright CLI 通过 Shell 命令驱动浏览器，将页面快照写入本地磁盘文件按需读取，避免每次交互自动返回完整页面结构导致 token 膨胀。

### 首次使用

1. **启动有界面的浏览器 session**（`--headed` 必须，`--persistent` 持久化 cookie）：
   ```bash
   playwright-cli -s=zhihuishu open https://www.zhihuishu.com --headed --persistent
   ```
2. 点击「登录」跳转到登录页（`https://passport.zhihuishu.com/login?service=...`）：
   ```bash
   playwright-cli -s=zhihuishu click "getByRole('link', { name: '登录' })"
   ```
3. **用户手动完成登录**（输入手机号、密码、验证码等），CC 不介入凭证输入
4. 登录成功后 CC 确认已进入学生首页（URL 含 `onlineweb.zhihuishu.com/onlinestuh5`）：
   ```bash
   playwright-cli -s=zhihuishu --raw eval "window.location.href"
   ```
5. 保存登录态到项目根目录 `storage-state.json`：
   ```bash
   playwright-cli -s=zhihuishu state-save storage-state.json
   ```

### 后续 session

- 答题前先恢复登录态，跳过重复登录：
  ```bash
  playwright-cli -s=zhihuishu open https://www.zhihuishu.com --headed --persistent
  playwright-cli -s=zhihuishu state-load storage-state.json
  playwright-cli -s=zhihuishu goto https://onlineweb.zhihuishu.com/onlinestuh5
  ```
- 若检测到登录态失效（页面跳转到登录页），提示用户重新手动登录并更新 `storage-state.json`

> `storage-state.json` 含 cookies 和 localStorage，**不要提交到 Git**（已在 `.gitignore` 中排除）。

### Session 存活检查

每次开始答题前确认 session 存在：
```bash
playwright-cli list
```
若 session `zhihuishu` 不在列表中，重新 `open`。

---

## 三、课程定位

从学生首页（`onlinestuh5`）定位到目标课程的知识点列表：

1. 用 `--raw eval` 读取课程列表 DOM，提取各课程名称和入口链接：
   ```bash
   playwright-cli -s=zhihuishu --raw eval "
     JSON.stringify([...document.querySelectorAll('.course-item')].map(el => ({
       name: el.querySelector('.course-name')?.textContent?.trim(),
       href: el.querySelector('a')?.href
     })))
   "
   ```
2. 将课程名称与用户指令中的课程名文本匹配（`includes`）
3. **匹配到一个** → 点击进入；**匹配到多个** → 列出候选项让用户选择；**无匹配** → 提示用户确认课程名
4. 进入课程主页后，CC 从当前 URL 自动提取 `courseId` 和 `classId`：
   ```bash
   playwright-cli -s=zhihuishu --raw eval "window.location.href"
   ```
5. 抓取左侧导航面板，枚举所有「知识模块」→ 知识点层级结构：
   ```bash
   playwright-cli -s=zhihuishu --raw eval "
     JSON.stringify([...document.querySelectorAll('.knowledge-item')].map(el => ({
       name: el.querySelector('.item-name')?.textContent?.trim(),
       mastery: el.querySelector('.mastery-percent')?.textContent?.trim(),
       pointId: el.id?.replace('knowledgeId-', '')
     })))
   "
   ```
6. 提取每个知识点的 `pointId` 和当前掌握度百分比
7. 根据用户指令中的章节范围（如"前三章""第2-5章"），筛出目标知识点列表
8. 将目标知识点列表初始化到 `progress.md`

> courseId、classId、pointId 均由 CC 在导航过程中自动提取，用户只需用自然语言描述课程名和范围。

---

## 四、掌握度提升流程

### 4.1 基本规律

- 第一次答题全对 → 掌握度 **97%**（部分知识点为 98%）
- 第二次答题全对 → 掌握度仍为 **97%**（部分为 98%）
- 连续三次答题全对 → 掌握度达到 **100%**（若中途有错题，重新连续答对3次）
- 若未全对，可在结果页点击「查看作答记录与解析」查看正确答案，修正后重新答题

### 4.2 操作步骤

```
1. 进入课程主页 → 左侧选择「知识模块」章节
2. 点击目标「知识点」进入学习页
3. 点击「去提升」按钮 → 跳转到掌握度历史页
4. 点击「去提升 →」链接 → 跳转到答题页
5. 逐题作答（优先在 题库.md 中搜索答案，命中则直接使用）
6. 点击「提交作业」
7. 检查结果页掌握度：
   - ≥ 97% → 继续下一轮（直至100%）
   - < 97% → 未全对！进入「查看作答记录与解析」
              → 逐题查看：每道题都记录到 题库.md
                 - 做对的题：确认答案正确，照常记录
                 - 做错的题：记录系统反馈的【正确答案】，而非自己选的错误答案
              → 重复步骤3-6（**不停止，自动继续**）
```

> **核心原则**：
> - 答题前先查 `题库.md`，有答案直接用
> - 掌握度 < 97% 时，每道题（无论对错）都入库
> - 题库逐步覆盖全部考题，后续正确率越来越高

### 4.3 关键提示

- **题目顺序每次随机**：同一知识点的题目内容不变但顺序变化，必须按题目文本匹配答案，不能依赖固定题号
- **每题类型注意**：单选/多选需正确区分

### 4.4 题库策略（⭐ 核心机制）

**题库文件**：`题库.md`，位于项目根目录。每条记录自包含，格式为 `### 关键词` + `- 类型` + `- 正确选项`。

**搜索方式：Grep 按需检索，不全文加载**

```
对于每道题：
  1. 从题目文本中取最独特的 4~7 字片段 → Grep "关键词" 题库.md -A 3
  2. 命中 → 返回该条目的类型和正确选项，直接使用
  3. 无结果 → 换一个片段重试；仍无则为新题，AI 自行判断
```

> **为什么用 Grep 而非 Read**：题库按条目独立存储，`Grep -A 3` 精准返回匹配条目（~50 tokens），避免每次加载全文（~4,000 tokens），节省 95% 题库 I/O。

**入库流程**：
```
掌握度 < 97% → 查看作答记录与解析 → 逐题（无论对错）以系统正确答案为准
→ 按格式追加到 题库.md
```

**⚠️ 错题记录铁律**：必须记录**系统反馈的正确答案**（绿色/勾号标示），而非自己选的错误答案。

**注意事项**：
- 关键词用 4~7 字短片段（参见 Q10），既保证 DOM 匹配也保证 Grep 匹配
- 每次答错都是完善题库的机会

### 4.5 通用导航技巧

- **返回上一级**：learnPage 左上角有两个 back 图标，第一个返回课程主页
- **切换知识点**：直接点击左侧导航面板中的知识点名称
- **搜索知识点**：课程主页有搜索框可搜索知识点
- **确认当前知识点**：learnPage 中间区域显示知识点名称和掌握度百分比
- **快速定位知识点**：课程主页右侧面板中，每个知识点的 DOM ID 为 `knowledgeId-{pointId}`，可通过 `document.getElementById('knowledgeId-{pointId}')` 直接定位点击

---

## 五、浏览器自动化策略

### 5.1 推荐工具优先级

| 优先级 | 工具 | 命令格式 | 适用场景 |
|--------|------|----------|----------|
| ⭐⭐⭐ | `playwright-cli --raw eval` | `-s=zhihuishu --raw eval "..."` | DOM 文本提取，只返回 JS 结果，零附加快照 |
| ⭐⭐⭐ | `playwright-cli click` | `-s=zhihuishu click "locator"` | 按钮、链接、选项点击（单选适用，多选见 5.6） |
| ⭐⭐⭐ | `Grep` | `Grep "关键词" 题库.md -A 3` | 题库按需检索（不变） |
| ⭐⭐ | `playwright-cli run-code` | `-s=zhihuishu run-code "..."` | 多选 mouse.click、提交对话框处理（5.6/5.7） |
| ⭐⭐ | `playwright-cli snapshot` + `Read` | `-s=zhihuishu snapshot` → `Read .playwright-cli/xxx.yml` | 需要页面全貌时按需读取 |
| ⭐ | `playwright-cli screenshot` | `-s=zhihuishu screenshot` | 需要视觉确认时 |

> **核心原则**：
> - **`--raw eval` 直接读取 DOM**：`--raw` 剥离快照和状态信息，只返回执行结果，每次节省 200-500 tokens
> - **快照按需读**：CLI 将快照写入 `.playwright-cli/` 目录的 YAML 文件，只在需要了解页面布局时才 Read，不需要时完全不消耗 token
> - **大多数单击操作无需快照**：直接用文本定位器（`getByText`、`getByRole`）点击，不需要先读快照

### 5.2 Session 与 Dashboard 管理（⭐ 新增）

#### Session 基础

所有 CLI 命令统一使用 session 名 `-s=zhihuishu`，复用同一个浏览器进程（保持登录态）：

```bash
# 启动（首次或 session 不存在时）
playwright-cli -s=zhihuishu open https://www.zhihuishu.com --headed --persistent

# 后续所有操作都带 -s=zhihuishu
playwright-cli -s=zhihuishu click "getByText('去提升')"
playwright-cli -s=zhihuishu --raw eval "document.title"
playwright-cli -s=zhihuishu state-save storage-state.json

# 答题前确认 session 存活
playwright-cli list

# 结束 session
playwright-cli -s=zhihuishu close
```

> `--headed` 只在 `open` 时需要（决定浏览器是否显示窗口）；后续命令自动复用相同模式。

#### Dashboard — 实时监控和人工接管

CLI 提供可视化仪表盘，可以实时看到所有正在运行的浏览器 session：

```bash
# 另开一个终端，启动 Dashboard
playwright-cli show
```

Dashboard 功能：
- **Session 网格**：显示所有活跃 session，每个都有实时画面缩略预览、session 名称、当前 URL、页面标题
- **Session 详情**：点击进入某个 session，看到完整实时画面 + 标签栏 + 导航控件（前进/后退/刷新/地址栏）
- **人工接管**：**在 Dashboard 窗口中直接点击画面即可接管鼠标和键盘**，实时操作浏览器；按 `Escape` 释放控制权交还给 AI
- **多 session 监控**：Dashboard 网格可同时预览多个 session 的画面

> **强烈建议**：答题过程中始终开着 `playwright-cli show`，随时观察进度，遇到问题即时介入。

### 5.3 人工介入模式（⭐ 新增）

CLI 的 Dashboard 在人工介入方面非常流畅。无需在浏览器和终端之间切换告诉 CC "继续"。

#### 场景一：验证码 / 人机验证

1. AI 自动答题过程中弹出滑块/图形验证码
2. 你在 Dashboard 中看到验证码页面
3. **直接在 Dashboard 窗口中拖滑块/点击验证**（你已接管鼠标键盘）
4. 验证通过后按 `Escape` → AI 从当前页面继续自动答题
5. **不需要**在终端告诉 CC "验证码通过了，继续"

#### 场景二：页面加载异常 / 网络超时

1. Dashboard 中看到页面白屏或卡在加载
2. 点击 Dashboard 的刷新按钮或按 F5
3. 如果刷新无效，直接在 Dashboard 地址栏手动导航到正确页面
4. 按 `Escape` → AI 检测当前 URL 并从新状态继续

#### 场景三：AI 卡在错误页面

1. AI 误点了某个链接导致页面偏离预期流程
2. 你在 Dashboard 中接管，点击浏览器"后退"按钮回到正确页面
3. 按 `Escape` 释放 → AI 重新评估页面状态并继续
4. 或者用标注模式给 AI 精确反馈：
   ```bash
   playwright-cli show --annotate
   ```
   在页面上画框标注问题区域，写备注（如"点这里才对"），AI 收到标注截图和备注后修正操作。

### 5.4 可靠的选择器

CLI 支持三种元素定位方式：

```bash
# ✅ 方式一：文本定位器（推荐，最可靠）
playwright-cli -s=zhihuishu click "getByRole('button', { name: '去提升' })"
playwright-cli -s=zhihuishu click "getByText('下一题')"
playwright-cli -s=zhihuishu click "getByText('提交作业')"

# ✅ 方式二：快照 ref（需要先 snapshot 获取 ref）
playwright-cli -s=zhihuishu snapshot                # 快照写入 .playwright-cli/
# Read .playwright-cli/page-xxx.yml 获取 ref
playwright-cli -s=zhihuishu click e15

# ✅ 方式三：CSS 选择器
playwright-cli -s=zhihuishu click "#main > button.submit"

# ✅ 方式四：JS evaluate 遍历含滚动（应对 Vue SPA 动态 DOM）
playwright-cli -s=zhihuishu --raw eval "
  (() => {
    const keyword = '免疫防御';
    for (const li of document.querySelectorAll('li')) {
      if (li.textContent.includes(keyword)) {
        li.scrollIntoView({ block: 'center' });
        li.click();
        return 'clicked: ' + li.textContent.trim().slice(0, 50);
      }
    }
    return 'not found';
  })()
"
```

> **选择器优先级**：文本定位器 > JS evaluate > 快照 ref > CSS 选择器
>
> 快照 ref 在 Vue SPA 动态重渲染后会失效。已放弃依赖 ref 做主要定位，转向文本匹配 + `--raw eval`。
>
> ⚠️ **Windows URL 转义**：`getByRole('button', { name: '...' })` 中的大括号在 PowerShell 中需要转义——用单引号包裹整个 locator 字符串，或使用 `--%` 停止解析。

### 5.5 答题流程模板

整个答题过程分为四个阶段，AI 代理通过 CLI 命令在浏览器外协调：

#### 阶段一：按需检索题库

逐题用 Grep 按关键词检索 `题库.md`（方法见 4.4），无需在上下文维护完整题库。

#### 阶段二：逐题作答

对于每道题：

```bash
# 1. 读取题目文本（--raw 确保只返回文本，不附带页面快照）
playwright-cli -s=zhihuishu --raw eval "
  [...document.querySelectorAll('.question-item')].map(q => ({
    text: q.querySelector('.question-text')?.textContent?.trim(),
    type: q.querySelector('.question-type')?.textContent?.trim(),
    options: [...q.querySelectorAll('.option-item')].map(o => o.textContent?.trim())
  }))
"

# 2. Grep 查题库（在 CC 侧执行，不经过浏览器）
# Grep "关键词" 题库.md -A 3

# 3. 命中 → 直接用答案点击选项；未命中 → AI 自行判断后点击
# 单选：
playwright-cli -s=zhihuishu click "getByText('免疫防御')"
# 或多选用 run-code 执行（见 5.6）
```

#### 阶段三：提交与检查

```bash
# 点击提交
playwright-cli -s=zhihuishu click "getByText('提交作业')"

# 处理确认对话框链（Vue confirm 非原生 alert）
playwright-cli -s=zhihuishu dialog-accept    # "确定"
playwright-cli -s=zhihuishu dialog-accept    # "交卷"

# 等待页面跳转到结果页后检查 URL
playwright-cli -s=zhihuishu --raw eval "window.location.href"
```

#### 阶段四：结果判断与逐题入库

```
提交后检查结果页：
  - 掌握度 ≥ 97% → 本轮全对，无需额外记录
  - 掌握度 < 97% → 未全对！
    1. 点击「查看作答记录与解析」
    2. 逐题查看（每道题都要过，不论做对做错）：
       - 做对的题：确认答案正确，按规范记录到 题库.md
       - 做错的题：以系统标示的【正确选项】（绿色/勾号）为准，记录到 题库.md
    3. 每道题按 4.4 节格式：题目关键词 + 类型 + 正确选项
    4. 追加到 题库.md
    5. 记录完毕后，立即从 learnPage 获取新 paperId 继续（**不停止，不询问**）
```

掌握度读取：
```bash
playwright-cli -s=zhihuishu --raw eval "
  document.querySelector('.mastery-score, .mastery-percent')?.textContent?.trim()
"
```

---

### 5.6 多选题处理

**首选方案：`run-code` + `page.mouse.click(boundingBox)` 真实鼠标坐标点击**

Element UI checkbox 监听真实鼠标事件（pointerdown → mousedown → mouseup → click），只有 Playwright 的 `page.mouse.click()` 能完整模拟这一事件链，触发 Vue 的 v-model 双向绑定更新。

```bash
playwright-cli -s=zhihuishu run-code "async (page) => {
  const targets = ['免疫防御', '免疫自稳', '免疫监视'];
  for (const target of targets) {
    const labels = page.locator('.el-checkbox__label');
    const count = await labels.count();
    let found = false;
    for (let i = 0; i < count && !found; i++) {
      const t = await labels.nth(i).textContent();
      if (t.trim().includes(target)) {
        const parent = labels.nth(i).locator('..');
        // 防御1：检查是否已选中，避免 toggle 掉已选项
        const isChecked = await parent.evaluate(el => el.classList.contains('is-checked'));
        if (isChecked) { found = true; break; }

        const box = await parent.boundingBox();
        // 防御2：boundingBox 为 null 时先 scrollIntoView 再重试
        if (!box) {
          await parent.evaluate(el => el.scrollIntoView({ block: 'center' }));
          await page.waitForTimeout(500);
          const retryBox = await parent.boundingBox();
          if (!retryBox) {
            console.error('[multi-select] boundingBox null for: ' + target);
            break;
          }
          await page.mouse.click(retryBox.x + retryBox.width / 2, retryBox.y + retryBox.height / 2);
        } else {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        }
        await page.waitForTimeout(400);
        found = true;
      }
    }
  }
  return 'multi-select done';
}"
```

> **关键**：
> - `locator('..')` 从 `.el-checkbox__label` 找到父级 `<label class="el-checkbox">`，对整个 label 区域做鼠标坐标点击
> - **防御1**：点击前检查 `.is-checked`，避免重复点击 toggle 掉已选项（页面重载后常见）
> - **防御2**：`boundingBox()` 为 null 时 scrollIntoView 重试一次，仍失败则打印错误后跳过，不静默失败
> - 每次点击间隔 400ms

**备用方案：JS `click()`（仅 DOM 视觉，提交可能不生效）**

```bash
playwright-cli -s=zhihuishu --raw eval "
  (() => {
    const multiAnswers = ['A 免疫防御', 'C 免疫自稳', 'D 免疫监视'];
    for (const ans of multiAnswers) {
      for (const el of document.querySelectorAll('.el-checkbox__label')) {
        if (el.textContent.trim() === ans) { el.click(); break; }
      }
    }
    return 'fallback done';
  })()
"
```

> ⚠️ 以下方法仅改变 is-checked class，Vue 内部 model 未更新，提交后系统可能判定未选中。仅在主方案不可用时尝试。

> DOM class 验证（`.is-checked`）不足以确认提交是否生效。**必须以实际提交结果（掌握度 ≥ 97%）为最终验证。**

### 5.7 提交对话框处理

提交作业后出现的是**智慧树自定义 Vue 弹窗**（非 Element Plus 标准 `el-message-box`，`waitForSelector('.el-message-box__wrapper')` 会超时）。**CLI `dialog-accept` 无效**。

**已验证可靠的方案（实测连续3轮100%成功率）**：`run-code` 一键完成答题+提交+弹窗处理。

```bash
playwright-cli -s=zhihuishu run-code "async (page) => {
  // ===== 阶段一：逐题作答 =====
  const ANSWERS = {
    '题目关键词1': '正确选项文本',
    '题目关键词2': '正确选项文本',
  };
  const totalQs = 6; // 从答题卡 treeItem 数获取

  for (let qi = 0; qi < totalQs; qi++) {
    await page.waitForTimeout(500);
    const qText = await page.evaluate(() => {
      const q = document.querySelector('.questionName, .questionContent');
      return q?.textContent?.trim()?.slice(0, 150) || '';
    });

    for (const [key, ans] of Object.entries(ANSWERS)) {
      if (qText.includes(key)) {
        await page.getByText(ans).click();
        await page.waitForTimeout(300);
        break;
      }
    }

    if (qi < totalQs - 1) {
      await page.getByText('下一题').click();
      await page.waitForTimeout(400);
    }
  }

  // ===== 阶段二：提交 =====
  await page.getByText('提交作业').click();
  await page.waitForTimeout(2000);

  // ===== 阶段三：弹窗链 =====
  // 键盘 Enter 确认第一层（确定）
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  // 键盘 Enter 确认第二层（交卷）
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  // JS dispatchEvent 兜底所有确认按钮
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button, .el-button, .comfirm, .ZHIHUISHU_QZMD')) {
      const t = b.textContent?.trim() || '';
      if (t === '确定' || t === '交卷' || t === '交卷(s)') {
        b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    }
  });
  await page.waitForTimeout(3000);

  return page.url(); // 验证跳转到 /point/ 结果页
}"
```

> **已验证要点**：
> - 键盘 `Enter` 触发 Vue 弹窗默认聚焦按钮（3轮连续有效）
> - `dispatchEvent(new MouseEvent('click', ...))` 确保所有确认按钮被触发
> - 提交后跳转 URL 参数完整（`/point/{courseId}/{paperId}/{examId}/{pointId}/{classId}`），不再出现 undefined
> - 返回 learnPage 后需 `reload` 才能看到更新后的掌握度
>
> 课程 ID 和班级 ID 在实际操作中由用户以自然语言提供，无需写入此文件。

---

## 六、常见问题与解决方案

### Q1: 提交后不跳转结果页
直接导航到结果页 URL：`/point/{courseId}/{paperId}/{examId}/{pointId}/{classId}`
```bash
playwright-cli -s=zhihuishu goto "https://ai-smart-course-student-pro.zhihuishu.com/point/{courseId}/{paperId}/{examId}/{pointId}/{classId}"
```

### Q2: paperId 相关
每个 paperId 只能提交一次，提交后必须从 learnPage → 去提升 重新获取。若 paperId 复用无法获得新试卷，从课程主页重新进入或等待后重试。检查 masteryHistory 历史记录数确认。

### Q3: label:has-text 选择器超时 / 导航项被遮罩
用 `--raw eval` + `textContent.includes()` 遍历点击，可不依赖可见性检测直接定位元素：
```bash
playwright-cli -s=zhihuishu --raw eval "
  (() => {
    const keyword = '第一章';
    for (const el of document.querySelectorAll('.nav-item, li')) {
      if (el.textContent.includes(keyword)) {
        el.scrollIntoView({ block: 'center' });
        el.click();
        return 'clicked';
      }
    }
    return 'not found';
  })()
"
```

### Q4: 题数与随机抽题
三个随机维度：题目顺序随机变化 + 每次从 7~10 题中抽 3~6 题 + 题数因知识点而异（可通过答题卡 treeitem 数判断）。对策：按题目内容关键词匹配，不可依赖题号；完整题库需 3~5 轮覆盖。通过结果页「测试题推荐」发现未收录题。

### Q5: 数字选项不匹配
选项文本 `C.4` ≠ 纯 `"4"`，用 `includes('4')` 而非 `=== '4'`。

### Q6: M-CSF 误匹配 GM-CSF（子串冲突）
用精确匹配：`el.textContent.trim() === 'D M-CSF'` 或 `includes('M-CSF') && !includes('GM-CSF')`。

### Q7: 元素不在视口内
`li.scrollIntoView({ block: 'center' })` 后再点击（通过 `--raw eval` 执行）。

### Q8: 多选题"已有题目未完成"
提交前用 `--raw eval` 检查 `.custom-tree-answer-normal.answer` 数量等于总题数，有 `no-answer` 需补答。

### Q9: 多选题全选（排除法陷阱）
不能预设"总有一两个错"。案例：B细胞生发中心事件、BCR多样性机制 → 全选 A-E。

### Q10: 关键词匹配——空格/格式问题
DOM 中长文本可能因空格差异导致 `includes()` 失败。用 4~7 字短片段匹配，取最独特部分。

### Q11: 验证选项选中状态
单选：`li.innerHTML.includes('checkedIcon')`；多选：DOM class `.is-checked` 不等于提交生效，需以实际提交结果为准（见 5.6 主方案）。

### Q12: 多选题未作答无法跳转
多选必须至少选一个后"下一题"才生效。连续多次看到同一题目 = 需要先作答。

### Q13: 单选题短关键词匹配
用 4~7 字短片段匹配 li，远比长完整文本可靠。先 `--raw eval` 读实际 li 文本确认可用片段，再用片段点击。

### Q14: 题目顺序随机与自适应作答
同一试卷内题号顺序也可随机变化。每题先 `--raw eval` 读取 body 判断类型和关键词，再匹配答案。

### Q15: 遗漏多选题检查
提交后"已答对 X/总题数 Y"，Y 少于预期说明有题被跳过。提交前用答题卡 treeItem 数校验。

### Q16: CLI 实测 — `getByText('去提升 →')` 匹配失败
`去提升 →` 包含特殊箭头字符 `→`（U+2192），`getByText` 可能匹配不到。改用 JS `eval` 精确查找 `.improve-btn` 元素：
```bash
playwright-cli -s=zhihuishu --raw eval "
(() => {
  for (const el of document.querySelectorAll('div, span')) {
    if (el.textContent?.trim() === '去提升 →' && el.childElementCount <= 1) {
      el.click(); return 'clicked';
    }
  }
  return 'not found';
})()
"
```

### Q17: CLI 实测 — `--raw eval` viewport float 报错（无害）
headed 模式下 `--raw eval` 可能报 `viewportWidth/viewportHeight: expected integer, got float`。这是 Playwright 1.61 的 screencast 已知 bug，**不影响命令执行结果**，返回值仍然正确。可忽略该报错。

### Q18: CLI 实测 — 提交结果页 URL（已解决）
旧版方案中提交成功跳转到 `/point/undefined/.../undefined`，URL 参数丢失。**新版 5.7 节 run-code 方案已验证解决**：`keyboard.press('Enter')` + `dispatchEvent` 组合使所有参数正确传递（`/point/{courseId}/{paperId}/{examId}/{pointId}/{classId}`）。

### Q19: CLI 实测 — Session 关闭后需恢复登录态
`playwright-cli -s=zhihuishu close` 关闭 session 后，重新 `open` 时 storage state 丢失。每次新 session 启动后必须先恢复登录态：
```bash
playwright-cli -s=zhihuishu open https://www.zhihuishu.com --headed --persistent
playwright-cli -s=zhihuishu state-load storage-state.json
playwright-cli -s=zhihuishu goto https://onlineweb.zhihuishu.com/onlinestuh5
```
> **建议**：答题过程中避免关闭 session，保持 `--persistent` 持续运行。

### Q20: CLI 实测 — Vue 确认对话框无法用 `dialog-accept`
Element UI 的 `el-message-box` 弹窗不是原生 HTML `<dialog>`，`dialog-accept` 对它无效。必须用 `run-code` + 键盘 `Enter` 响应（见 5.7 节已验证方案）。

---

## 七、上下文管理

### Token 消耗估算（CLI 方案）

| 阶段 | 每知识点每轮估算 |
|------|-----------------|
| 导航 + 点击（~10 次 CLI 命令，无快照） | ~1,500 tokens |
| 读题 + 检索 + 作答 | ~1,800 tokens |
| 提交 + 检查结果 | ~600 tokens |
| **单轮合计** | **~3,900 tokens** |
| 1 个知识点 × 3 轮 | **~12K tokens** |
| 30 个知识点（全课程） | **~350K tokens** |

> 30 个知识点全课程 DeepSeek-V4 费用约 **¥5-6**（CLI 方案每知识点约 12K tokens）。

### Session 管理建议

- **连续处理 8-12 个知识点后**，建议开启新 CC 会话
- 新 session 启动时读取 `progress.md` 了解进度，跳过已完成知识点
- 无需每次手动重置浏览器 session（`--persistent` 保持登录态）
- 遇到上下文窗口紧张时，可以 `playwright-cli -s=zhihuishu close` 然后重新 `open` 清理浏览器端内存

> 题库通过 `Grep "关键词" 题库.md -A 3` 按需检索，无需全文加载。

---

## 八、CLI 命令速查表

### 导航

| 操作 | 命令 |
|------|------|
| 启动浏览器 | `playwright-cli -s=zhihuishu open <url> --headed --persistent` |
| 跳转 URL | `playwright-cli -s=zhihuishu goto <url>` |
| 后退 | `playwright-cli -s=zhihuishu go-back` |
| 刷新 | `playwright-cli -s=zhihuishu reload` |

### 交互

| 操作 | 命令 |
|------|------|
| 点击 | `playwright-cli -s=zhihuishu click "getByText('...')"` |
| 输入文字 | `playwright-cli -s=zhihuishu type "text"` |
| 填表单 | `playwright-cli -s=zhihuishu fill "getByRole('textbox', { name: '...' })" "value"` |
| 按键 | `playwright-cli -s=zhihuishu press Enter` |
| 确认对话框 | `playwright-cli -s=zhihuishu dialog-accept` |
| 取消对话框 | `playwright-cli -s=zhihuishu dialog-dismiss` |

### 读取

| 操作 | 命令 |
|------|------|
| 执行 JS 并返回结果 | `playwright-cli -s=zhihuishu --raw eval "..."` |
| 快照写磁盘 | `playwright-cli -s=zhihuishu snapshot` |
| 截图 | `playwright-cli -s=zhihuishu screenshot` |
| 运行复杂脚本 | `playwright-cli -s=zhihuishu run-code "async (page) => { ... }"` |

### Storage

| 操作 | 命令 |
|------|------|
| 保存登录态 | `playwright-cli -s=zhihuishu state-save storage-state.json` |
| 恢复登录态 | `playwright-cli -s=zhihuishu state-load storage-state.json` |

### Session 管理

| 操作 | 命令 |
|------|------|
| 列出所有 session | `playwright-cli list` |
| 关闭当前 session | `playwright-cli -s=zhihuishu close` |
| 关闭所有 session | `playwright-cli close-all` |
| 打开 Dashboard | `playwright-cli show` |
| Dashboard 标注模式 | `playwright-cli show --annotate` |
