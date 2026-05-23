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

答题流程通过 **Playwright MCP** 驱动浏览器完成。

### 首次使用

1. 通过 `browser_navigate` 打开智慧树官网 `https://www.zhihuishu.com/`
2. 点击「登录」跳转到登录页（`https://passport.zhihuishu.com/login?service=...`）
3. **用户手动完成登录**（输入手机号、密码、验证码等），CC 不介入凭证输入
4. 登录成功后 CC 确认已进入学生首页（URL 含 `onlineweb.zhihuishu.com/onlinestuh5`）
5. 调用 `browser_storage_state` 保存登录态到项目根目录 `storage-state.json`

### 后续 session

- 答题前先 `browser_set_storage_state` 恢复 `storage-state.json`，跳过重复登录
- 若检测到登录态失效（页面跳转到登录页），提示用户重新手动登录并更新 `storage-state.json`

> `storage-state.json` 含 cookies 和 localStorage，**不要提交到 Git**（已在 `.gitignore` 中排除）。

---

## 三、课程定位

从学生首页（`onlinestuh5`）定位到目标课程的知识点列表：

1. 用 `browser_evaluate` 读取课程列表 DOM，提取各课程名称和入口链接
2. 将课程名称与用户指令中的课程名文本匹配（`includes`）
3. **匹配到一个** → 点击进入；**匹配到多个** → 列出候选项让用户选择；**无匹配** → 提示用户确认课程名
4. 进入课程主页后，CC 从当前 URL 自动提取 `courseId` 和 `classId`
5. 抓取左侧导航面板，枚举所有「知识模块」→ 知识点层级结构
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

---

### 4.5 通用导航技巧

- **返回上一级**：learnPage 左上角有两个 back 图标，第一个返回课程主页
- **切换知识点**：直接点击左侧导航面板中的知识点名称
- **搜索知识点**：课程主页有搜索框可搜索知识点
- **确认当前知识点**：learnPage 中间区域显示知识点名称和掌握度百分比
- **快速定位知识点**：课程主页右侧面板中，每个知识点的 DOM ID 为 `knowledgeId-{pointId}`，可通过 `document.getElementById('knowledgeId-{pointId}')` 直接定位点击

---

## 五、浏览器自动化策略

### 5.1 推荐工具优先级

| 优先级 | 工具 | 适用场景 |
|--------|------|----------|
| ⭐⭐⭐ | `Grep` | 题库按需检索，替代全文 Read |
| ⭐⭐⭐ | `browser_evaluate` | 单步 JS 点击/读取/提取，每步可验证 |
| ⭐⭐ | `browser_click` + 快照ref | 仅适合紧接快照后的即时点击 |
| ⭐ | `browser_run_code_unsafe` | 仅纯导航+读取，不含点击提交 |

> **逐步 > 脚本**：多选题必须逐项点击并验证 `.is-checked`，禁止脚本批处理。`browser_run_code_unsafe` 在 Vue 页面成功率远低于逐步操作。

### 5.2 可靠的选择器

```js
// ✅ 可靠 - 基于文本角色
page.getByRole('button', { name: '去提升' })
page.getByText('去提升 →')
page.getByText('下一题')
page.getByText('提交作业')

// ✅ 可靠 - JS evaluate 遍历含滚动
page.evaluate((keyword) => {
  for (const li of document.querySelectorAll('li')) {
    if (li.textContent.includes(keyword)) {
      li.scrollIntoView({ block: 'center' });
      li.click();
      return;
    }
  }
}, keyword);

// ✅ 多选 — page.mouse.click(boundingBox)，唯一能触发 Vue model 更新的方法
// 需配合 browser_run_code_unsafe（见 5.4 完整示例）
// 注意：JS click() 仅改变 DOM 视觉，提交后系统可能判定未选中

// ❌ 不可靠 - snapshot ref（跨页面加载后失效）
page.click('ref=e512')
```

### 5.3 答题流程模板

整个答题过程分为四个阶段，AI 代理在浏览器外协调：

#### 阶段一：按需检索题库

逐题用 Grep 按关键词检索 `题库.md`（方法见 4.4），无需在上下文维护完整题库。

#### 阶段二：逐题作答

对于每道题：
- 读取题目文本（优先 `browser_evaluate` 提取，避免全页 snapshot）
- Grep 查题库，命中直接用；未命中则 AI 自行判断
- 继续下一题

#### 阶段三：提交与检查

点击「提交作业」并处理 Vue 确认对话框（代码模板见 5.5），等待页面跳转到结果页。

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

### 5.4 多选题处理

**首选方案：`page.mouse.click(boundingBox)` 真实鼠标坐标点击**

Element UI checkbox 监听真实鼠标事件（pointerdown → mousedown → mouseup → click），只有 Playwright 的 `page.mouse.click()` 能完整模拟这一事件链，触发 Vue 的 v-model 双向绑定更新。

```js
// ✅ 已验证：真实鼠标坐标点击，提交后系统判定有效
async (page) => {
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
          // 重试获取 boundingBox
          const retryBox = await parent.boundingBox();
          if (!retryBox) {
            console.error(`[multi-select] boundingBox null for: ${target}`);
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
}
```

> **关键**：
> - `locator('..')` 从 `.el-checkbox__label` 找到父级 `<label class="el-checkbox">`，对整个 label 区域做鼠标坐标点击
> - **防御1**：点击前检查 `.is-checked`，避免重复点击 toggle 掉已选项（页面重载后常见）
> - **防御2**：`boundingBox()` 为 null 时 scrollIntoView 重试一次，仍失败则打印错误后跳过，不静默失败
> - 每次点击间隔 400ms

**备用方案：JS `click()`（仅 DOM 视觉，提交可能不生效）**

```js
// ⚠️ 以下方法仅改变 is-checked class，Vue 内部 model 未更新，提交后系统可能判定未选中
// 仅在主方案不可用时尝试
const multiAnswers = ['A 免疫防御', 'C 免疫自稳', 'D 免疫监视'];
for (const ans of multiAnswers) {
  await page.evaluate((a) => {
    for (const el of document.querySelectorAll('.el-checkbox__label')) {
      if (el.textContent.trim() === a) { el.click(); break; }
    }
  }, ans);
  await page.waitForTimeout(200);
}
```

> DOM class 验证（`.is-checked`）不足以确认提交是否生效。**必须以实际提交结果（掌握度 ≥ 97%）为最终验证。**

### 5.5 提交对话框处理

提交作业后会出现 Vue 确认对话框（非原生 alert），需遍历点击：

```js
// 确认对话框链：确定 → 交卷
await page.getByText('提交作业').click();
await page.waitForTimeout(1500);
for (let d = 0; d < 5; d++) {
  const clicked = await page.evaluate(() => {
    for (const el of document.querySelectorAll('span.comfirm, button'))
      if (el.textContent.trim() === '确定' || el.textContent.trim() === '交卷') {
        el.scrollIntoView({ block: 'center' }); el.click(); return true;
      }
    return false;
  });
  if (!clicked) break;
  await page.waitForTimeout(500);
}
```

> 课程 ID 和班级 ID 在实际操作中由用户以自然语言提供，无需写入此文件。

---

## 六、常见问题与解决方案

### Q1: 提交后不跳转结果页
直接导航到结果页 URL：`/point/{courseId}/{paperId}/{examId}/{pointId}/{classId}`

### Q2: paperId 相关
每个 paperId 只能提交一次，提交后必须从 learnPage → 去提升 重新获取。若 paperId 复用无法获得新试卷，从课程主页重新进入或等待后重试。检查 masteryHistory 历史记录数确认。

### Q3: label:has-text 选择器超时 / 导航项被遮罩
用 `page.evaluate` + `textContent.includes()` 遍历点击，可绕过遮罩。

### Q4: 题数与随机抽题
三个随机维度：题目顺序随机变化 + 每次从 7~10 题中抽 3~6 题 + 题数因知识点而异（可通过答题卡 treeitem 数判断）。对策：按题目内容关键词匹配，不可依赖题号；完整题库需 3~5 轮覆盖。通过结果页「测试题推荐」发现未收录题。

### Q5: 数字选项不匹配
选项文本 `C.4` ≠ 纯 `"4"`，用 `includes('4')` 而非 `=== '4'`。

### Q6: M-CSF 误匹配 GM-CSF（子串冲突）
用精确匹配：`el.textContent.trim() === 'D M-CSF'` 或 `includes('M-CSF') && !includes('GM-CSF')`。

### Q7: 元素不在视口内
`li.scrollIntoView({ block: 'center' })` 后再点击。

### Q8: 多选题"已有题目未完成"
提交前检查 `.custom-tree-answer-normal.answer` 数量等于总题数，有 `no-answer` 需补答。

### Q9: 多选题全选（排除法陷阱）
不能预设"总有一两个错"。案例：B细胞生发中心事件、BCR多样性机制 → 全选 A-E。

### Q10: 关键词匹配——空格/格式问题
DOM 中长文本可能因空格差异导致 `includes()` 失败。用 4~7 字短片段匹配，取最独特部分。

### Q11: 验证选项选中状态
单选：`li.innerHTML.includes('checkedIcon')`；多选：DOM class `.is-checked` 不等于提交生效，需以实际提交结果为准（见 5.4 主方案）。

### Q12: 多选题未作答无法跳转
多选必须至少选一个后"下一题"才生效。连续多次看到同一题目 = 需要先作答。

### Q13: 单选题短关键词匹配
用 4~7 字短片段匹配 li，远比长完整文本可靠。先 evaluate 读实际 li 文本确认可用片段，再用片段点击。

### Q14: 题目顺序随机与自适应作答
同一试卷内题号顺序也可随机变化。每题先 `evaluate` 读取 body 判断类型和关键词，再匹配答案。

### Q15: 遗漏多选题检查
提交后"已答对 X/总题数 Y"，Y 少于预期说明有题被跳过。提交前用答题卡 treeItem 数校验。

## 七、上下文管理

连续处理 3 个知识点后，建议开启新 CC 会话。新 session 启动时读取 `progress.md` 了解进度，跳过已完成知识点。

> 题库通过 `Grep "关键词" 题库.md -A 3` 按需检索，无需全文加载。
