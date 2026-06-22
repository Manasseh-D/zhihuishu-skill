#!/usr/bin/env node
/**
 * auto-brush.js — 智慧树知识点自动重复刷题脚本
 *
 * 用法:
 *   node auto-brush.js --point "癌前病变和原位癌"
 *   node auto-brush.js --point-id 157455                    (跳过 DOM 搜索)
 *   node auto-brush.js --point "凋亡" --rounds 2
 *   node auto-brush.js --point "凋亡" --headed
 *   node auto-brush.js --all                                (批量处理)
 *   node auto-brush.js --point "癌前病变和原位癌" --dry-run  (仅匹配不点击)
 *
 * 依赖: npm install playwright
 * 复用: storage-state.json（登录态）, 题库.md（答案库）
 *
 * 设计原则:
 *   - 每个关键步骤 2-4 个备选方案，不卡死
 *   - 关键词匹配底线 5 字（高置信度），低于 5 字逐级降级
 *   - 接受臃肿，可靠性优先
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ============================================================
// 配置区域 — 用户根据实际情况修改
// ============================================================
const CONFIG = {
  // 课程 ID 和班级 ID（从智慧树课程页 URL 中提取）
  // URL 格式: /singleCourse/knowledgeStudy/{courseId}/{classId}
  courseId: '2026577676684390400',
  classId:  '1818580932072968192',

  // 浏览器模式: false=显示窗口（调试用）, true=无头运行
  headless: false,

  // 文件路径（相对于脚本所在目录）
  storageState:  path.join(__dirname, 'storage-state.json'),
  questionBank:  path.join(__dirname, '题库.md'),
  progressFile:  path.join(__dirname, 'progress.md'),
  unmatchedLog:  path.join(__dirname, 'unmatched.log'),

  // 超时配置（毫秒）
  timeout: {
    navigation:   30000,  // 页面导航
    element:      10000,  // 元素等待
    dialog:        5000,  // 弹窗等待
    submitResult: 15000,  // 提交后等待结果页
    pageStable:    2000,  // 页面稳定后再操作
  },

  // 轮次间间隔（毫秒）
  roundDelay: 2000,
};

// ============================================================
// CLI 参数解析
// ============================================================
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    pointName: null,
    pointId: null,
    rounds: 3,           // 默认最多 3 轮
    headed: false,
    dryRun: false,
    processAll: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--point':
        opts.pointName = args[++i];
        break;
      case '--point-id':
        opts.pointId = args[++i];
        break;
      case '--rounds':
        opts.rounds = parseInt(args[++i], 10);
        if (isNaN(opts.rounds) || opts.rounds < 1) {
          console.error('错误: --rounds 需要正整数');
          process.exit(1);
        }
        break;
      case '--headed':
        opts.headed = true;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--all':
        opts.processAll = true;
        break;
      case '--help':
        console.log(`
用法: node auto-brush.js [选项]

选项:
  --point <名称>    知识点名称（在课程页左侧导航中显示的名称）
  --point-id <ID>   知识点 ID（跳过 DOM 查找，直接 URL 导航）
  --rounds <N>      最多答题轮数（默认 3）
  --headed          显示浏览器窗口
  --dry-run         仅匹配不点击，输出匹配报告
  --all             处理 progress.md 中所有未完成的知识点
  --help            显示此帮助
`);
        process.exit(0);
    }
  }

  if (!opts.pointName && !opts.pointId && !opts.processAll) {
    console.error('错误: 需要 --point <名称> 或 --point-id <ID> 或 --all');
    console.error('使用 --help 查看帮助');
    process.exit(1);
  }

  // 如果只给了 pointId 没给 pointName，用 pointId 作为名称
  if (!opts.pointName && opts.pointId) {
    opts.pointName = `ID:${opts.pointId}`;
  }

  return opts;
}

// ============================================================
// 题库解析器
// ============================================================
function parseQuestionBank(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log('[题库] 题库文件不存在，将创建空题库');
    return { entries: [], keywordMap: new Map() };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const entries = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // ### 关键词 → 新题目开始
    if (trimmed.startsWith('### ')) {
      if (current && current.keyword) {
        entries.push(current);
      }
      current = {
        keyword: trimmed.slice(4).trim(),
        type: 'single',
        answers: [],
        raw: trimmed,
      };
      continue;
    }

    if (!current) continue;

    // - 类型: single|multi
    const typeMatch = trimmed.match(/^-\s*类型\s*:\s*(single|multi)/i);
    if (typeMatch) {
      current.type = typeMatch[1].toLowerCase();
      continue;
    }

    // - 正确选项: ...
    const answerMatch = trimmed.match(/^-\s*正确选项\s*:\s*(.+)/);
    if (answerMatch) {
      // 分割答案: "A顺序表位, B构象表位" 或 "免疫原性和免疫反应性"
      const raw = answerMatch[1].trim();
      current.answers = splitAnswers(raw, current.type);
      current.rawAnswer = raw;
      continue;
    }
  }

  // 最后一条
  if (current && current.keyword) {
    entries.push(current);
  }

  // 构建关键词索引: Map<keyword, entry>
  // 同时构建 关键词→条目 的查找结构，按关键词长度降序排列
  const keywordMap = new Map();
  for (const e of entries) {
    if (e.keyword.length >= 2) {
      keywordMap.set(e.keyword, e);
    }
  }

  console.log(`[题库] 已加载 ${entries.length} 道题目 (${keywordMap.size} 个有效关键词)`);
  return { entries, keywordMap };
}

/**
 * 分割答案文本为独立选项
 * "A顺序表位, B构象表位" → ["顺序表位", "构象表位"]
 * "顺序表位、构象表位" → ["顺序表位", "构象表位"]
 * "免疫原性和免疫反应性" → ["免疫原性和免疫反应性"]  (单选，不分割"和")
 * "免疫防御" → ["免疫防御"]
 *
 * 注意: "和" 分割仅用于多选题已用逗号分割后单个片段仍含"和"的情况
 */
function splitAnswers(raw, questionType) {
  // 情况1: 逗号分隔的带编号选项 "A顺序表位, B构象表位"
  if (raw.includes(',')) {
    const parts = raw.split(',').map(s => {
      // 去掉前导的 A/B/C/D 编号和空格
      return s.trim().replace(/^[A-E][.、\s]+/, '').replace(/^[A-E]/, '').trim();
    }).filter(Boolean);

    // 二次分割: 逗号分割后的单个片段仍可能含"、"
    const result = [];
    for (const p of parts) {
      if (p.includes('、')) {
        result.push(...p.split('、').map(s => s.trim()).filter(Boolean));
      } else {
        result.push(p);
      }
    }
    return result;
  }

  // 情况2: 中文顿号分隔 "顺序表位、构象表位"
  if (raw.includes('、')) {
    return raw.split('、').map(s => s.trim()).filter(Boolean);
  }

  // 情况3: 多选题用"和"连接（仅当明确为 multi 类型时尝试分割）
  // 单选中的"和"（如"免疫原性和免疫反应性"）是一个选项的完整文本，不应分割
  if (questionType === 'multi' && raw.includes('和') && raw.length > 6) {
    const parts = raw.split('和');
    if (parts.length >= 2 && parts.every(p => p.trim().length >= 1)) {
      return parts.map(s => s.trim()).filter(Boolean);
    }
  }

  // 情况4: 单个答案
  return [raw.trim()];
}

// ============================================================
// 题目匹配器
// ============================================================
const MIN_KEYWORD_LEN_HIGH = 5;   // ≥5字: 高置信度
const MIN_KEYWORD_LEN_MED  = 4;   // 4字: 中置信度
const MIN_KEYWORD_LEN_LOW  = 3;   // 3字: 低置信度（仅兜底）

/**
 * 在题库中匹配题目文本
 * 返回: { entry, confidence: 'HIGH'|'MEDIUM'|'LOW', matchedKeyword: string } | null
 */
function matchQuestion(questionText, bank) {
  if (!questionText || bank.keywordMap.size === 0) return null;

  // 清理题目文本（去除多余空格、换行）
  const cleanText = questionText.replace(/\s+/g, ' ').trim();
  if (cleanText.length < 4) return null;

  // 收集所有匹配的关键词
  const matches = [];
  for (const [keyword, entry] of bank.keywordMap) {
    if (cleanText.includes(keyword)) {
      matches.push({ keyword, entry, len: keyword.length });
    }
  }

  if (matches.length === 0) return null;

  // 策略1: 优先 ≥5 字的高置信度匹配
  const highConf = matches.filter(m => m.len >= MIN_KEYWORD_LEN_HIGH);
  if (highConf.length > 0) {
    // 选最长关键词
    highConf.sort((a, b) => b.len - a.len);
    const best = highConf[0];
    // 检查是否有等长的歧义匹配
    const ties = highConf.filter(m => m.len === best.len && m.keyword !== best.keyword);
    return {
      entry: best.entry,
      confidence: ties.length > 0 ? 'MEDIUM' : 'HIGH',
      matchedKeyword: best.keyword,
      ambiguity: ties.map(t => t.keyword),
    };
  }

  // 策略2: 4 字中置信度
  const medConf = matches.filter(m => m.len === MIN_KEYWORD_LEN_MED);
  if (medConf.length > 0) {
    medConf.sort((a, b) => b.len - a.len);
    const best = medConf[0];
    return {
      entry: best.entry,
      confidence: 'MEDIUM',
      matchedKeyword: best.keyword,
      ambiguity: medConf.length > 1 ? medConf.slice(1).map(m => m.keyword) : [],
    };
  }

  // 策略3: 3 字低置信度兜底（记录严格警告）
  const lowConf = matches.filter(m => m.len === MIN_KEYWORD_LEN_LOW);
  if (lowConf.length > 0) {
    lowConf.sort((a, b) => b.len - a.len);
    const best = lowConf[0];
    return {
      entry: best.entry,
      confidence: 'LOW',
      matchedKeyword: best.keyword,
      ambiguity: lowConf.length > 1 ? lowConf.slice(1).map(m => m.keyword) : [],
    };
  }

  // 策略4: 2 字极限兜底（几乎不可靠，但保留）
  matches.sort((a, b) => b.len - a.len);
  return {
    entry: matches[0].entry,
    confidence: 'LOW',
    matchedKeyword: matches[0].keyword,
    ambiguity: matches.slice(1).map(m => m.keyword),
  };
}

// ============================================================
// 日志工具
// ============================================================
const unmatchedQuestions = [];

function log(level, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const prefix = { INFO: 'ℹ', WARN: '⚠', ERROR: '✗', SUCCESS: '✓', MATCH: '→' }[level] || '·';
  console.log(`[${ts}] ${prefix} ${msg}`);
}

function logUnmatched(questionText, round) {
  unmatchedQuestions.push({ round, text: questionText, time: new Date().toISOString() });
  log('WARN', `未匹配题目 (第${round}轮): ${questionText.slice(0, 100)}`);
}

// ============================================================
// 浏览器与页面初始化
// ============================================================
async function launchBrowser(opts) {
  const headed = opts.headed || CONFIG.headless === false;

  if (!fs.existsSync(CONFIG.storageState)) {
    log('ERROR', `登录态文件不存在: ${CONFIG.storageState}`);
    log('INFO', '请先用 Claude + Playwright CLI 登录并执行 state-save');
    process.exit(1);
  }

  log('INFO', `启动浏览器 (${headed ? '有界面' : '无头'}模式)...`);
  const browser = await chromium.launch({
    headless: !headed,
    slowMo: headed ? 100 : 0,  // headed 模式放慢操作便于观察
  });

  const context = await browser.newContext({
    storageState: CONFIG.storageState,
    viewport: { width: 1440, height: 900 },
  });

  // 检测登录态是否有效
  const page = await context.newPage();
  await page.goto('https://onlineweb.zhihuishu.com/onlinestuh5', {
    waitUntil: 'domcontentloaded',
    timeout: CONFIG.timeout.navigation,
  });
  await page.waitForTimeout(2000);

  const currentUrl = page.url();
  if (currentUrl.includes('passport.zhihuishu.com/login')) {
    log('ERROR', '登录态已过期！页面重定向到登录页');
    log('INFO', '请重新运行 Claude 登录，更新 storage-state.json');
    await browser.close();
    process.exit(1);
  }

  log('SUCCESS', `登录态有效 (当前 URL: ${new URL(currentUrl).pathname})`);
  return { browser, context, page };
}

// ============================================================
// 导航模块
// ============================================================

/**
 * 导航到课程主页
 */
async function goToCourseHome(page) {
  const url = `https://ai-smart-course-student-pro.zhihuishu.com/singleCourse/knowledgeStudy/${CONFIG.courseId}/${CONFIG.classId}`;
  log('INFO', `导航到课程主页...`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CONFIG.timeout.navigation });
  await page.waitForTimeout(CONFIG.timeout.pageStable);
}

/**
 * 在课程主页左侧导航中查找知识点
 * 返回: { pointId, pointName, mastery } | null
 *
 * 方案 A: 通过 DOM ID knowledgeId-{pointId}
 * 方案 B: 文本遍历所有知识点条目
 * 方案 C: 从页面 JS 变量中提取知识点列表
 */
async function findKnowledgePoint(page, targetName) {
  log('INFO', `查找知识点: "${targetName}"`);

  // 方案 A+B+C: 从页面抓取所有知识点信息
  const result = await page.evaluate((name) => {
    const points = [];

    // 尝试多种选择器组合
    const selectors = [
      '.knowledge-item', '.point-item', '.catalog-item',
      '[class*="knowledge"]', '[class*="point"]', '[class*="catalog"]',
      '.tree-node', '.el-tree-node',
      '.sidebar-item', '.nav-item',
      'li[class*="know"]', 'div[class*="know"]',
    ];

    const seen = new Set();
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        const text = el.textContent?.trim() || '';
        const id = el.id || '';
        const key = text.slice(0, 50);
        if (seen.has(key)) continue;
        seen.add(key);

        // 提取掌握度百分比
        const masteryMatch = text.match(/(\d{1,3})%/);
        const mastery = masteryMatch ? parseInt(masteryMatch[1], 10) : null;

        // 提取知识点名称（去百分比和无关文本）
        let displayName = text.replace(/\d{1,3}%/g, '').trim();

        points.push({
          name: displayName,
          fullText: text.slice(0, 200),
          id: id.replace('knowledgeId-', '') || null,
          mastery: mastery,
        });
      }
      if (points.length > 0) break; // 找到就停止尝试更多选择器
    }

    // 方案 C: 如果选择器都找不到，尝试从 Vue 数据中提取
    if (points.length === 0) {
      try {
        const app = document.querySelector('#app')?.__vue_app__;
        if (app) {
          // 递归查找可能的知识点数据
          function findPoints(obj, depth) {
            if (depth > 5) return;
            if (!obj || typeof obj !== 'object') return;
            if (Array.isArray(obj)) {
              for (const item of obj) {
                if (item?.name && item?.id) {
                  points.push({
                    name: String(item.name),
                    fullText: String(item.name),
                    id: String(item.id),
                    mastery: item.mastery || item.masteryPercent || null,
                  });
                }
                findPoints(item, depth + 1);
              }
            }
          }
          // 不执行，太危险且耗时，仅作概念保留
        }
      } catch (_) {}
    }

    // 匹配目标知识点
    for (const p of points) {
      if (p.name.includes(name) || name.includes(p.name) || p.fullText.includes(name)) {
        return { found: true, ...p };
      }
    }

    return { found: false, allPoints: points.slice(0, 30) };
  }, targetName);

  if (result.found && result.name) {
    log('SUCCESS', `找到知识点: "${result.name}" (掌握度: ${result.mastery ?? '未知'}%)`);
    return {
      pointId: result.id,
      pointName: result.name,
      mastery: result.mastery,
    };
  }

  // 未找到，列出候选项
  log('ERROR', `未找到匹配的知识点: "${targetName}"`);
  if (result.allPoints && result.allPoints.length > 0) {
    log('INFO', '页面上的知识点列表:');
    for (const p of result.allPoints.slice(0, 20)) {
      console.log(`    - "${p.name}" (id=${p.id}, 掌握度=${p.mastery}%)`);
    }
  } else {
    log('WARN', '未能从页面提取任何知识点列表（DOM 选择器可能需要更新）');
  }
  return null;
}

/**
 * 导航到知识点的 learnPage
 * 方案 A: 点击知识点元素
 * 方案 B: 直接 URL 导航
 */
async function goToLearnPage(page, pointInfo) {
  const { pointId, pointName } = pointInfo;

  // 方案 A: 直接 URL 导航（最可靠）
  if (pointId) {
    const url = `https://ai-smart-course-student-pro.zhihuishu.com/learnPage/${CONFIG.courseId}/${pointId}/${CONFIG.classId}?catalogActiveTab=personal`;
    log('INFO', `方案A: URL 导航到 learnPage (pointId=${pointId})`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CONFIG.timeout.navigation });
    await page.waitForTimeout(CONFIG.timeout.pageStable);
    return true;
  }

  // 方案 B: 在课程页点击知识点元素
  if (pointName) {
    log('INFO', `方案B: 尝试点击知识点 "${pointName}"`);
    try {
      // 尝试通过 DOM ID 点击
      const clicked = await page.evaluate((name) => {
        // 遍历所有可能的知识点元素
        for (const el of document.querySelectorAll('li, div, span, a')) {
          if (el.textContent?.trim().includes(name) && el.offsetParent !== null) {
            el.scrollIntoView({ block: 'center' });
            el.click();
            return true;
          }
        }
        return false;
      }, pointName);

      if (clicked) {
        await page.waitForTimeout(CONFIG.timeout.pageStable);
        log('INFO', '方案B: 点击成功');
        return true;
      }
    } catch (e) {
      log('WARN', `方案B 失败: ${e.message}`);
    }
  }

  log('ERROR', '无法导航到 learnPage（缺少 pointId 且点击失败）');
  return false;
}

/**
 * 从 learnPage 进入答题页
 * 步骤: learnPage → 点击「去提升」→ masteryHistory → 点击「去提升 →」→ 答题页
 *
 * 方案 A: 逐步点击导航
 * 方案 B: 直接通过 JS 触发跳转
 */
async function goToExamPage(page) {
  log('INFO', '进入答题页...');

  // 检查当前是否在 learnPage
  const currentUrl = page.url();
  if (!currentUrl.includes('learnPage')) {
    log('WARN', `当前不在 learnPage (${currentUrl})，尝试继续...`);
  }

  // === 步骤 1: 点击「去提升」→ 跳转 masteryHistory ===
  const step1Success = await retryUntil(async () => {
    // 方案 A1: 文本定位器
    try {
      const btn = page.getByText('去提升').first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        log('INFO', '步骤1 方案A1: getByText("去提升") 点击成功');
        return true;
      }
    } catch (_) {}

    // 方案 A2: JS evaluate 查找
    try {
      const clicked = await page.evaluate(() => {
        const texts = ['去提升', '去提升 →', '开始提升'];
        for (const el of document.querySelectorAll('button, a, div, span, .btn, [class*="improve"]')) {
          const t = el.textContent?.trim() || '';
          for (const target of texts) {
            if (t === target || (t.includes('去提升') && t.length <= 6)) {
              el.click();
              return t;
            }
          }
        }
        return null;
      });
      if (clicked) {
        log('INFO', `步骤1 方案A2: JS evaluate 点击 "${clicked}" 成功`);
        return true;
      }
    } catch (_) {}

    // 方案 A3: 直接导航到 masteryHistory URL（从 learnPage URL 提取参数）
    try {
      const url = page.url();
      const match = url.match(/learnPage\/(\d+)\/(\d+)\/(\d+)/);
      if (match) {
        const [, courseId, pointId, classId] = match;
        const mhUrl = `https://ai-smart-course-student-pro.zhihuishu.com/masteryHistory/${courseId}/${classId}/${pointId}?catalogActiveTab=personal&isFreeExam=0`;
        log('INFO', `步骤1 方案A3: 直接导航到 masteryHistory`);
        await page.goto(mhUrl, { waitUntil: 'domcontentloaded', timeout: CONFIG.timeout.navigation });
        return true;
      }
    } catch (_) {}

    return false;
  }, 3, '步骤1: 进入 masteryHistory');

  if (!step1Success) {
    log('ERROR', '步骤1 失败: 无法进入 masteryHistory');
    return false;
  }

  await page.waitForTimeout(CONFIG.timeout.pageStable);

  // === 步骤 2: 点击「去提升 →」→ 跳转答题页 ===
  const step2Success = await retryUntil(async () => {
    // 方案 B1: JS 精确定位 "去提升 →"（含箭头字符）
    try {
      const clicked = await page.evaluate(() => {
        for (const el of document.querySelectorAll('div, span, a, button')) {
          const t = el.textContent?.trim() || '';
          if (t === '去提升 →' || t === '去提升→') {
            el.click();
            return t;
          }
        }
        return null;
      });
      if (clicked) {
        log('INFO', `步骤2 方案B1: JS evaluate 点击 "${clicked}" 成功`);
        return true;
      }
    } catch (_) {}

    // 方案 B2: 文本包含匹配
    try {
      const links = page.locator('text=去提升');
      const count = await links.count();
      for (let i = 0; i < count; i++) {
        const text = await links.nth(i).textContent();
        if (text && text.includes('去提升') && text.includes('→')) {
          await links.nth(i).click();
          log('INFO', '步骤2 方案B2: locator text=去提升 点击成功');
          return true;
        }
      }
      // 如果只有不含箭头的，也点击第一个
      if (count > 0) {
        await links.first().click();
        log('INFO', '步骤2 方案B2降级: 点击第一个含"去提升"的元素');
        return true;
      }
    } catch (_) {}

    // 方案 B3: 按 class 名查找
    try {
      const btn = page.locator('.improve-btn, [class*="improve"], .go-improve').first();
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click();
        log('INFO', '步骤2 方案B3: .improve-btn 点击成功');
        return true;
      }
    } catch (_) {}

    return false;
  }, 3, '步骤2: 进入答题页');

  if (!step2Success) {
    log('ERROR', '步骤2 失败: 无法进入答题页');
    return false;
  }

  // 等待跳转到答题页
  await page.waitForTimeout(CONFIG.timeout.pageStable);

  // 验证是否在答题页
  const examUrl = page.url();
  if (examUrl.includes('studentReviewTestOrExam') || examUrl.includes('studentexam')) {
    log('SUCCESS', `已进入答题页: ${examUrl.slice(0, 100)}`);
    return true;
  }

  // 可能还在 masteryHistory，再等一次跳转
  log('INFO', '等待跳转到答题页...');
  try {
    await page.waitForURL('**/studentReviewTestOrExam/**', { timeout: 8000 });
    log('SUCCESS', `已进入答题页: ${page.url().slice(0, 100)}`);
    return true;
  } catch (_) {
    log('WARN', `当前页面: ${examUrl.slice(0, 100)}`);
    return false;
  }
}

// ============================================================
// 答题模块
// ============================================================

/**
 * 获取总题数
 * 方案 A: 答题卡 treeItem 数量
 * 方案 B: 页面上的题号列表
 * 方案 C: 默认 6
 */
async function getTotalQuestions(page) {
  const count = await page.evaluate(() => {
    // 方案 A: 答题卡项
    const treeItems = document.querySelectorAll('.custom-tree-answer-normal, .tree-item, [class*="answer-normal"]');
    if (treeItems.length > 0) return treeItems.length;

    // 方案 B: 题号指示器
    const indicators = document.querySelectorAll('.question-num, .q-num, [class*="question-num"]');
    if (indicators.length > 0) return indicators.length;

    // 方案 C: 题目区域计数
    const questions = document.querySelectorAll('.question-item, .questionName, [class*="question"]');
    const visible = [...questions].filter(q => q.offsetParent !== null);
    if (visible.length > 0) return Math.min(visible.length, 10);

    return 6; // 默认
  });

  log('INFO', `总题数: ${count}`);
  return count;
}

/**
 * 读取当前显示的题目文本
 * 方案 A: .questionName, .questionContent
 * 方案 B: .question-item 可见子元素
 * 方案 C: 页面主内容区域文本
 */
async function readCurrentQuestion(page) {
  const text = await page.evaluate(() => {
    // 方案 A
    const q = document.querySelector('.questionName, .questionContent, .q-title');
    if (q?.textContent?.trim()) return q.textContent.trim();

    // 方案 B: 可见的题目区域
    for (const el of document.querySelectorAll('[class*="question"]')) {
      if (el.offsetParent !== null) {
        const t = el.textContent?.trim();
        if (t && t.length > 10) return t.slice(0, 200);
      }
    }

    // 方案 C: 主体内容中查找题目模式（含问号、括号等）
    const body = document.querySelector('.exam-content, .test-content, main, .main');
    const text = (body || document.body).innerText || '';
    const lines = text.split('\n').filter(l => l.trim().length > 10);
    for (const line of lines) {
      if (/[?？]/.test(line) || /下列/.test(line) || /正确/.test(line) || /错误/.test(line)) {
        return line.trim().slice(0, 200);
      }
    }

    return text.slice(0, 200);
  });

  return text;
}

/**
 * 点击单个答案选项
 * 方案 A: getByText 精确匹配
 * 方案 B: getByText includes 模糊匹配
 * 方案 C: JS evaluate 遍历点击
 * 方案 D: mouse.click 坐标点击（Vue 兼容）
 */
async function clickSingleAnswer(page, answerText) {
  const strategies = [
    // A: 精确文本匹配
    async () => {
      try {
        await page.getByText(answerText, { exact: true }).first().click({ timeout: 3000 });
        return 'A:getByText exact';
      } catch (_) { return null; }
    },
    // B: 包含匹配
    async () => {
      try {
        const locator = page.getByText(answerText).first();
        if (await locator.isVisible({ timeout: 2000 }).catch(() => false)) {
          await locator.click();
          return 'B:getByText includes';
        }
        return null;
      } catch (_) { return null; }
    },
    // C: JS evaluate 遍历（去掉选项编号前缀匹配）
    async () => {
      try {
        const clicked = await page.evaluate((ans) => {
          // 去掉可能的编号前缀
          const cleanAns = ans.replace(/^[A-E][.、\s]+/, '').replace(/^[A-E]/, '').trim();
          for (const el of document.querySelectorAll('li, label, div, span, .option-item, [class*="option"]')) {
            const t = el.textContent?.trim() || '';
            const cleanT = t.replace(/^[A-E][.、\s]+/, '').replace(/^[A-E]/, '').trim();
            if (cleanT.includes(cleanAns) || t.includes(ans)) {
              el.scrollIntoView({ block: 'center' });
              el.click();
              return t.slice(0, 50);
            }
          }
          return null;
        }, answerText);
        if (clicked) return `C:JS click "${clicked}"`;
        return null;
      } catch (_) { return null; }
    },
    // D: mouse.click 坐标（Vue checkbox/label）
    async () => {
      try {
        const box = await page.evaluate((ans) => {
          const cleanAns = ans.replace(/^[A-E][.、\s]+/, '').replace(/^[A-E]/, '').trim();
          for (const el of document.querySelectorAll('li, label, .option-item, [class*="option"]')) {
            const t = el.textContent?.trim() || '';
            const cleanT = t.replace(/^[A-E][.、\s]+/, '').replace(/^[A-E]/, '').trim();
            if (cleanT.includes(cleanAns) || t.includes(ans)) {
              el.scrollIntoView({ block: 'center' });
              const rect = el.getBoundingClientRect();
              return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            }
          }
          return null;
        }, answerText);

        if (box) {
          await page.mouse.click(box.x, box.y);
          return 'D:mouse.click xy';
        }
        return null;
      } catch (_) { return null; }
    },
  ];

  for (const strategy of strategies) {
    const result = await strategy();
    if (result) {
      log('INFO', `  点击选项 "${answerText.slice(0, 30)}" → ${result}`);
      await page.waitForTimeout(300);
      return true;
    }
  }

  log('WARN', `  无法点击选项 "${answerText.slice(0, 30)}"（所有 4 种方案均失败）`);
  return false;
}

/**
 * 点击多个答案选项（多选题）
 * 使用 page.mouse.click(boundingBox) 确保触发 Vue v-model 更新
 */
async function clickMultipleAnswers(page, answers) {
  log('INFO', `  多选题: 需要选中 ${answers.length} 个选项`);

  for (const ans of answers) {
    let clicked = false;

    // 方案 1: mouse.click(boundingBox) — Vue 最兼容
    try {
      const box = await page.evaluate((target) => {
        const cleanTarget = target.replace(/^[A-E][.、\s]+/, '').replace(/^[A-E]/, '').trim();
        for (const el of document.querySelectorAll('.el-checkbox, .el-checkbox__label, label, .option-item, [class*="option"]')) {
          const t = el.textContent?.trim() || '';
          const cleanT = t.replace(/^[A-E][.、\s]+/, '').replace(/^[A-E]/, '').trim();
          if (cleanT.includes(cleanTarget) || t.includes(target)) {
            // 找父级 checkbox
            let checkbox = el;
            if (!el.classList.contains('el-checkbox')) {
              checkbox = el.closest('.el-checkbox') || el;
            }
            // 检查是否已选中
            if (checkbox.classList.contains('is-checked')) {
              return { already: true };
            }
            checkbox.scrollIntoView({ block: 'center' });
            const rect = checkbox.getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, already: false };
          }
        }
        return null;
      }, ans);

      if (box?.already) {
        log('INFO', `    "${ans.slice(0, 20)}" 已选中，跳过`);
        clicked = true;
      } else if (box) {
        await page.mouse.click(box.x, box.y);
        await page.waitForTimeout(400);
        clicked = true;
        log('INFO', `    mouse.click → "${ans.slice(0, 20)}"`);
      }
    } catch (_) {}

    // 方案 2: JS click 降级
    if (!clicked) {
      try {
        const result = await page.evaluate((target) => {
          const cleanTarget = target.replace(/^[A-E][.、\s]+/, '').replace(/^[A-E]/, '').trim();
          for (const el of document.querySelectorAll('.el-checkbox__label, label')) {
            const t = el.textContent?.trim() || '';
            if (t.includes(cleanTarget) || t.includes(target)) {
              const parent = el.closest('.el-checkbox');
              if (parent?.classList.contains('is-checked')) return 'already';
              el.click();
              return 'js-click';
            }
          }
          return null;
        }, ans);

        if (result) {
          clicked = true;
          await page.waitForTimeout(400);
          log('INFO', `    JS click → "${ans.slice(0, 20)}" (${result})`);
        }
      } catch (_) {}
    }

    // 方案 3: getByText 降级
    if (!clicked) {
      const success = await clickSingleAnswer(page, ans);
      if (success) clicked = true;
    }

    if (!clicked) {
      log('WARN', `    无法选中 "${ans.slice(0, 30)}"`);
    }
  }

  return true;
}

// ============================================================
// 提交与弹窗处理
// ============================================================

/**
 * 提交作业并处理弹窗链
 * 方案 A: keyboard Enter × 2 + JS dispatchEvent
 * 方案 B: 逐个查找按钮点击
 * 方案 C: 等待 + 检查 URL 跳转（可能对话框已自动消失）
 */
async function submitAndHandleDialogs(page) {
  log('INFO', '提交作业...');

  // 点击提交
  const submitClicked = await retryUntil(async () => {
    try {
      await page.getByText('提交作业').click({ timeout: 5000 });
      log('INFO', '已点击「提交作业」');
      return true;
    } catch (_) {
      // 尝试 JS 查找
      try {
        const clicked = await page.evaluate(() => {
          for (const el of document.querySelectorAll('button, a, div, span')) {
            if (el.textContent?.trim() === '提交作业') {
              el.click();
              return true;
            }
          }
          return false;
        });
        if (clicked) {
          log('INFO', 'JS 点击「提交作业」成功');
          return true;
        }
      } catch (_) {}
      return false;
    }
  }, 2, '点击提交作业');

  if (!submitClicked) {
    log('ERROR', '无法点击「提交作业」按钮');
    return false;
  }

  // 等待 Vue 弹窗出现
  await page.waitForTimeout(2000);

  // === 弹窗处理: 多重方案 ===
  log('INFO', '处理确认弹窗...');

  // 方案 A: keyboard Enter × 2 (已验证 3 轮连续成功)
  try {
    log('INFO', '方案A: keyboard.press Enter × 2');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);
  } catch (e) {
    log('WARN', `方案A 部分失败: ${e.message}`);
  }

  // 方案 B: JS dispatchEvent 兜底所有确认按钮
  try {
    await page.evaluate(() => {
      const confirmTexts = ['确定', '交卷', '交卷(s)', '确认', '是', '提交'];
      for (const b of document.querySelectorAll('button, .el-button, .comfirm, .ZHIHUISHU_QZMD, [class*="confirm"], [class*="submit"]')) {
        const t = (b.textContent || '').trim();
        for (const ct of confirmTexts) {
          if (t === ct || t.includes(ct)) {
            b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            b.click();  // 双保险
          }
        }
      }
    });
    log('INFO', '方案B: dispatchEvent 兜底完成');
  } catch (e) {
    log('WARN', `方案B 失败: ${e.message}`);
  }

  await page.waitForTimeout(1000);

  // 方案 C: 再次尝试 keyboard Enter（有时弹窗链有 3 层）
  try {
    // 检查是否还在答题页（弹窗未响应）
    const url = page.url();
    if (!url.includes('/point/')) {
      log('INFO', '方案C: 额外 keyboard Enter');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
    }
  } catch (_) {}

  // 方案 D: 检测页面可见的确认按钮并逐个点击
  try {
    const visibleBtn = await page.evaluate(() => {
      const results = [];
      for (const b of document.querySelectorAll('button, .el-button')) {
        if (b.offsetParent !== null) { // 可见
          results.push(b.textContent?.trim() || '');
        }
      }
      return results;
    });
    if (visibleBtn.length > 0) {
      log('INFO', `方案D: 可见按钮: [${visibleBtn.join(', ')}]`);
      // 点击确认类按钮
      for (const btnText of visibleBtn) {
        if (/确定|交卷|确认|是|提交/.test(btnText)) {
          try {
            await page.getByText(btnText).click({ timeout: 2000 });
            log('INFO', `方案D: 点击 "${btnText}"`);
            await page.waitForTimeout(500);
          } catch (_) {}
        }
      }
    }
  } catch (_) {}

  // 等待结果页跳转
  log('INFO', '等待结果页跳转...');
  try {
    await page.waitForURL('**/point/**', { timeout: CONFIG.timeout.submitResult });
    log('SUCCESS', `已跳转到结果页: ${page.url().slice(0, 100)}`);
    return true;
  } catch (_) {
    // 检查当前 URL 是否已经是结果页
    const currentUrl = page.url();
    if (currentUrl.includes('/point/')) {
      log('SUCCESS', `已在结果页: ${currentUrl.slice(0, 100)}`);
      return true;
    }
    log('WARN', `未跳转到结果页，当前: ${currentUrl.slice(0, 100)}`);
    return false;
  }
}

// ============================================================
// 掌握度检查
// ============================================================

/**
 * 读取当前掌握度百分比
 * 方案 A: 结果页 mastery 元素
 * 方案 B: 返回 learnPage 读取
 * 方案 C: JS 全局搜索百分比
 */
async function checkMastery(page) {
  const mastery = await page.evaluate(() => {
    // 方案 A: 掌握度元素
    for (const sel of ['.mastery-score', '.mastery-percent', '.score', '[class*="mastery"]']) {
      const el = document.querySelector(sel);
      if (el) {
        const m = el.textContent?.trim().match(/(\d{1,3})/);
        if (m) return parseInt(m[1], 10);
      }
    }

    // 方案 B: 页面文本中查找百分比
    const body = document.body.innerText || '';
    const matches = body.match(/掌握度[：:\s]*(\d{1,3})%/);
    if (matches) return parseInt(matches[1], 10);

    // 方案 C: 所有包含百分比的元素
    for (const el of document.querySelectorAll('span, div, p')) {
      const t = el.textContent?.trim() || '';
      if (/^\d{1,3}%$/.test(t) && el.offsetParent !== null) {
        return parseInt(t, 10);
      }
    }

    return null;
  });

  return mastery;
}

/**
 * 返回 learnPage 并刷新（解决缓存问题）
 */
async function goBackToLearnPage(page, pointInfo) {
  const { pointId } = pointInfo;

  if (pointId) {
    const url = `https://ai-smart-course-student-pro.zhihuishu.com/learnPage/${CONFIG.courseId}/${pointId}/${CONFIG.classId}?catalogActiveTab=personal`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CONFIG.timeout.navigation });
    await page.waitForTimeout(1000);
    // reload 解决掌握度缓存问题（v14 已验证）
    await page.reload();
    await page.waitForTimeout(CONFIG.timeout.pageStable);
  } else {
    await page.goBack();
    await page.waitForTimeout(CONFIG.timeout.pageStable);
    await page.reload();
    await page.waitForTimeout(CONFIG.timeout.pageStable);
  }
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 重试直到成功或达到最大次数
 */
async function retryUntil(fn, maxRetries, label) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (e) {
      if (i < maxRetries - 1) {
        log('WARN', `${label} 第${i + 1}次尝试失败: ${e.message}`);
      }
    }
    if (i < maxRetries - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  return false;
}

/**
 * 等待页面稳定
 */
async function waitForStable(page, ms) {
  await page.waitForTimeout(ms || CONFIG.timeout.pageStable);
}

// ============================================================
// 单轮答题
// ============================================================

async function doOneRound(page, bank, roundNum, opts) {
  log('INFO', `━━━ 第 ${roundNum} 轮答题开始 ━━━`);

  // 1. 进入答题页
  const entered = await goToExamPage(page);
  if (!entered) {
    log('ERROR', '第${roundNum}轮: 无法进入答题页，跳过本轮');
    return { success: false, matched: 0, unmatched: 0, total: 0 };
  }

  await waitForStable(page);

  // 2. 获取总题数
  const totalQs = await getTotalQuestions(page);
  if (totalQs === 0) {
    log('ERROR', `第${roundNum}轮: 检测到 0 道题，页面可能未加载完成或结构已变更`);
    return { success: false, matched: 0, unmatched: 0, total: 0, reason: 'ZERO_QUESTIONS' };
  }

  // 3. 逐题作答
  let matched = 0;
  let unmatched = 0;

  for (let qi = 0; qi < totalQs; qi++) {
    await page.waitForTimeout(500);

    // 读取题目
    const qText = await readCurrentQuestion(page);
    log('INFO', `题目 ${qi + 1}/${totalQs}: ${qText.slice(0, 80)}...`);

    // 匹配题库
    const match = matchQuestion(qText, bank);

    if (match && match.confidence !== 'LOW') {
      log('MATCH', `关键词="${match.matchedKeyword}" (${match.confidence}, ${match.entry.type})`);

      if (opts.dryRun) {
        log('INFO', `  [DRY-RUN] 将点击: ${match.entry.answers.join(', ')}`);
        matched++;
      } else {
        // 实际点击
        if (match.entry.type === 'multi') {
          await clickMultipleAnswers(page, match.entry.answers);
        } else {
          for (const ans of match.entry.answers) {
            await clickSingleAnswer(page, ans);
          }
        }
        matched++;
      }
    } else if (match && match.confidence === 'LOW') {
      // 低置信度: 使用但记录警告
      log('WARN', `低置信度匹配: 关键词="${match.matchedKeyword}" (${match.entry.type})，仍尝试使用`);
      if (!opts.dryRun) {
        if (match.entry.type === 'multi') {
          await clickMultipleAnswers(page, match.entry.answers);
        } else {
          for (const ans of match.entry.answers) {
            await clickSingleAnswer(page, ans);
          }
        }
      }
      matched++;
      logUnmatched(qText, roundNum);
    } else {
      // 无匹配
      log('WARN', `题目 ${qi + 1} 未匹配到题库答案`);
      logUnmatched(qText, roundNum);
      unmatched++;

      if (opts.dryRun) {
        log('INFO', `  [DRY-RUN] 跳过该题`);
      }
      // 不跳过，继续（答题页需要每题都点才能提交，这里不做盲猜）
      // 实际场景中，如果题库覆盖完整，不会到这里
    }

    // 下一题
    if (qi < totalQs - 1) {
      try {
        await page.getByText('下一题').click({ timeout: 3000 });
      } catch (_) {
        // 降级: JS 点击
        try {
          await page.evaluate(() => {
            for (const el of document.querySelectorAll('button, a, div, span')) {
              if (el.textContent?.trim() === '下一题') { el.click(); return; }
            }
          });
        } catch (_) {}
      }
      await page.waitForTimeout(400);
    }
  }

  // 4. 提交前检查
  if (opts.dryRun) {
    log('INFO', '[DRY-RUN] 跳过提交，匹配报告:');
    log('INFO', `  已匹配: ${matched}, 未匹配: ${unmatched}, 总题数: ${totalQs}`);
    return { success: true, matched, unmatched, total: totalQs };
  }

  // 护卫: 全部未匹配时拒绝提交（防止空白试卷破坏掌握度）
  if (unmatched >= totalQs && totalQs > 0) {
    log('ERROR', `第${roundNum}轮: ${totalQs} 道题全部未匹配！跳过提交，保护现有掌握度`);
    log('ERROR', '请先用 Claude 完善本题知识点的题库覆盖，再运行脚本');
    return { success: false, matched: 0, unmatched, total: totalQs, reason: 'ALL_UNMATCHED' };
  }

  // 护卫: 未匹配超半数时警告但仍继续（至少答对了一半）
  if (unmatched > totalQs / 2) {
    log('WARN', `第${roundNum}轮: ${unmatched}/${totalQs} 道题未匹配（>50%），提交后可能降低掌握度`);
  }

  // 5. 提交

  const submitted = await submitAndHandleDialogs(page);
  if (!submitted) {
    log('ERROR', '第${roundNum}轮: 提交失败');
    return { success: false, matched, unmatched, total: totalQs };
  }

  // 5. 检查掌握度
  await page.waitForTimeout(2000);
  const mastery = await checkMastery(page);
  log('INFO', `第 ${roundNum} 轮完成: 掌握度=${mastery ?? '?'}%, 匹配=${matched}/${totalQs}, 未匹配=${unmatched}`);

  return { success: true, mastery, matched, unmatched, total: totalQs };
}

// ============================================================
// 主流程
// ============================================================

async function processOnePoint(page, bank, pointInfo, opts) {
  const { pointName, pointId: directPointId } = pointInfo;
  log('INFO', `\n══════════════════════════════════════════`);
  log('INFO', `开始处理知识点: ${pointName}`);
  if (directPointId) log('INFO', `  pointId 已指定: ${directPointId}（跳过 DOM 搜索）`);
  log('INFO', `目标轮数: ${opts.rounds}, 模式: ${opts.dryRun ? 'DRY-RUN' : '正式'}`);
  log('INFO', `══════════════════════════════════════════\n`);

  // 确定 pointId: 优先使用直接传入的，否则从课程页搜索
  let fullPointInfo;

  if (directPointId) {
    // 直接 URL 导航模式，跳过 DOM 搜索
    fullPointInfo = { pointName, pointId: directPointId };
  } else {
    // 导航到课程主页并查找知识点
    await goToCourseHome(page);
    const point = await findKnowledgePoint(page, pointName);
    if (!point) {
      log('ERROR', `找不到知识点 "${pointName}"，跳过`);
      return { pointName, completed: false, reason: '找不到知识点' };
    }
    fullPointInfo = { ...point, ...pointInfo };
  }

  // 导航到 learnPage
  await goToLearnPage(page, fullPointInfo);

  // 读取当前掌握度
  const initialMastery = await checkMastery(page);
  log('INFO', `初始掌握度: ${initialMastery ?? '未知'}%`);

  if (initialMastery !== null && initialMastery >= 100) {
    log('SUCCESS', `知识点 "${pointName}" 已经是 100%，无需刷题`);
    return { pointName, completed: true, rounds: 0 };
  }

  // 逐轮答题
  let consecutivePasses = 0;
  const maxRounds = opts.rounds;
  const roundResults = [];

  for (let r = 1; r <= maxRounds; r++) {
    // 导航到 learnPage（每轮从 learnPage 开始以获取新 paperId）
    await goBackToLearnPage(page, fullPointInfo);

    const result = await doOneRound(page, bank, r, opts);
    roundResults.push(result);

    if (opts.dryRun) break; // dry-run 只跑一轮

    if (result.success && result.mastery !== null) {
      if (result.mastery >= 97) {
        consecutivePasses++;
        log('SUCCESS', `第 ${r} 轮 ≥97%，连续通过: ${consecutivePasses}`);

        if (consecutivePasses >= 3) {
          log('SUCCESS', `🎉 知识点 "${pointName}" 连续 3 轮 ≥97%，达到 100%！`);
          break;
        }
      } else {
        consecutivePasses = 0;
        log('WARN', `第 ${r} 轮 <97%，重置连续计数。检查未匹配题目并在下次 Claude 会话中补充题库`);
      }
    } else if (result.success && result.mastery === null) {
      // 提交成功但无法读取掌握度（可能是页面结构变化）
      log('WARN', `第 ${r} 轮: 提交成功但无法读取掌握度，假设通过继续计数`);
      consecutivePasses++;  // 乐观策略：能成功提交说明答题流程正常
    } else if (!result.success && result.reason === 'ALL_UNMATCHED') {
      // 全部未匹配，停止刷该知识点
      log('ERROR', `第 ${r} 轮: 全部未匹配，停止刷 "${pointName}"`);
      break;
    }

    if (r < maxRounds) {
      log('INFO', `等待 ${CONFIG.roundDelay / 1000}s 后开始下一轮...`);
      await page.waitForTimeout(CONFIG.roundDelay);
    }
  }

  // 最终掌握度
  await goBackToLearnPage(page, fullPointInfo);
  const finalMastery = await checkMastery(page);
  log('INFO', `最终掌握度: ${finalMastery ?? '未知'}%`);

  return {
    pointName,
    completed: finalMastery !== null && finalMastery >= 100,
    finalMastery,
    rounds: roundResults.length,
    results: roundResults,
  };
}

/**
 * 从 progress.md 读取所有未完成的知识点
 */
function parseProgressFile() {
  if (!fs.existsSync(CONFIG.progressFile)) {
    log('WARN', `进度文件不存在: ${CONFIG.progressFile}`);
    return [];
  }

  const content = fs.readFileSync(CONFIG.progressFile, 'utf-8');
  const points = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // 匹配表格行: | 知识点名 | pointId | 掌握度% | 日期 |
    const match = line.match(/^\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*(\d{1,3})%\s*\|/);
    if (match) {
      const name = match[1].trim();
      const pointId = match[2].trim();
      const mastery = parseInt(match[3], 10);
      if (name && pointId && mastery < 100) {
        points.push({ pointName: name, pointId, mastery });
      }
    }
  }

  return points;
}

/**
 * 保存未匹配题目到日志文件
 */
function saveUnmatchedLog() {
  if (unmatchedQuestions.length === 0) return;

  const lines = [
    `# 未匹配题目日志 — ${new Date().toISOString().slice(0, 10)}`,
    `# 以下题目在脚本运行中未匹配到题库答案`,
    `# 请在下次 Claude 会话中让 AI 补充这些题目到 题库.md`,
    '',
  ];

  for (const q of unmatchedQuestions) {
    lines.push(`## 第${q.round}轮 — ${q.time.slice(0, 19)}`);
    lines.push(`题目: ${q.text}`);
    lines.push('');
  }

  fs.writeFileSync(CONFIG.unmatchedLog, lines.join('\n'), 'utf-8');
  log('INFO', `未匹配题目已写入: ${CONFIG.unmatchedLog} (${unmatchedQuestions.length} 道)`);
}

// ============================================================
// 入口
// ============================================================
async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  智慧树自动刷课脚本  v1.0                 ║');
  console.log('╚══════════════════════════════════════════╝\n');

  const opts = parseArgs();

  // 加载题库
  const bank = parseQuestionBank(CONFIG.questionBank);

  // 启动浏览器
  const { browser, page } = await launchBrowser(opts);

  try {
    const results = [];

    if (opts.processAll) {
      // --all 模式: 处理 progress.md 中所有未完成知识点
      const points = parseProgressFile();
      if (points.length === 0) {
        log('INFO', 'progress.md 中没有未完成的知识点');
      } else {
        log('INFO', `从 progress.md 读取到 ${points.length} 个未完成知识点`);
        for (const p of points) {
          const result = await processOnePoint(page, bank, p, opts);
          results.push(result);
          if (!result.completed) {
            log('WARN', `"${p.pointName}" 未达到 100%，继续下一个...`);
          }
        }
      }
    } else {
      // 单知识点模式（支持 --point 名称 和 --point-id ID）
      const result = await processOnePoint(page, bank, {
        pointName: opts.pointName,
        pointId: opts.pointId,
      }, opts);
      results.push(result);
    }

    // 保存未匹配日志
    saveUnmatchedLog();

    // 汇总报告
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║  刷课完成                                ║');
    console.log('╚══════════════════════════════════════════╝');
    for (const r of results) {
      const icon = r.completed ? '✅' : '❌';
      console.log(`  ${icon} ${r.pointName}: ${r.finalMastery ?? '?'}% (${r.rounds} 轮)`);
    }
    console.log('');

  } catch (e) {
    log('ERROR', `脚本异常: ${e.message}`);
    console.error(e.stack);
  } finally {
    await browser.close();
    log('INFO', '浏览器已关闭');
  }
}

main().catch(e => {
  console.error('致命错误:', e);
  process.exit(1);
});
