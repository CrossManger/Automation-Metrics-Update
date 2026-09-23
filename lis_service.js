/**
 * ======================================================================
 * LIS SERVICE (MODULE THU THẬP METRICS TỪ REDMINE / LIS)
 * ======================================================================
 * Chịu trách nhiệm thu thập các chỉ số từ hệ thống LIS:
 *   1. Rework Effort (hours)
 *   2. Effort to implement IR (hours)
 *   3. Total Spend Effort (Implement + Sprint event + Release)
 *   4. Total Technical Debt Effort (hours)
 *   5. Number of Internal Bugs
 *
 * Hỗ trợ chạy độc lập để kiểm thử và gỡ lỗi: node lis_service.js
 * ======================================================================
 */

const fs = require('fs');
const { chromium } = require('playwright');
const { LIS_URL, AUTH_FILE, config: defaultConfig } = require('./config');
const { safeGoto, fillDateFilterRange, logErrorDiagnostic } = require('./utils');

// ======================================================================
// XÁC THỰC LIS (AUTHENTICATION)
// ======================================================================

/**
 * Đăng nhập vào LIS và lưu session vào auth.json.
 */
async function loginLIS(page, context, config) {
  console.log('[*] Đang tiến hành đăng nhập LIS...');
  await safeGoto(page, `${LIS_URL}login`);

  await page.fill('#username', config.username);
  await page.fill('#password', config.password);

  const rememberCb = page.locator('#autologin');
  if (await rememberCb.count() > 0) {
    await rememberCb.check();
  }

  await page.click('button[name="login"], #login-submit, input[type="submit"][name="login"]');
  await page.waitForLoadState('networkidle', { timeout: 30000 });

  const flashError = page.locator('#flash_error, .flash.error');
  if (await flashError.count() > 0 && await flashError.first().isVisible()) {
    const errorText = await flashError.first().innerText();
    throw new Error(`Đăng nhập LIS thất bại: "${errorText.trim()}". Vui lòng kiểm tra lại LIS_USERNAME và LIS_PASSWORD!`);
  }

  console.log(`  -> [✓] Đăng nhập LIS thành công! (URL: ${page.url()})`);
  await context.storageState({ path: AUTH_FILE });
  console.log('  -> [✓] Đã lưu phiên đăng nhập vào auth.json\n');
}

/**
 * Kiểm tra trạng thái đăng nhập LIS, tự động login lại nếu hết hạn.
 */
async function ensureLoggedInLIS(page, context, config) {
  await safeGoto(page, LIS_URL);
  const currentUrl = page.url();
  const isLoginPage = currentUrl.includes('login') || currentUrl.includes('signin');

  if (isLoginPage) {
    if (fs.existsSync(AUTH_FILE)) {
      console.warn('[!] Phiên đăng nhập LIS đã hết hạn. Đang xóa auth.json và đăng nhập lại...');
      fs.unlinkSync(AUTH_FILE);
    }
    await loginLIS(page, context, config);
  } else {
    console.log('  -> [✓] Phiên đăng nhập LIS hợp lệ (auth.json).\n');
  }
}

// ======================================================================
// CÁC HÀM THU THẬP TỪNG CHỈ SỐ LIS
// ======================================================================

/**
 * Tìm kiếm Sprint task và mở cấu hình nâng cao (bỏ Open tasks only).
 * Trả về URL của Sprint task.
 */
async function searchAndOpenSprint(page, sprintName) {
  console.log(`[*] [Thao tác 1] Tìm kiếm Sprint: "${sprintName}"...`);
  const searchBox = page.locator('#search_q_autocomplete');
  await searchBox.waitFor({ state: 'visible', timeout: 10000 });
  await searchBox.click();
  await searchBox.pressSequentially(sprintName, { delay: 60 });
  await searchBox.press('Enter');

  await page.waitForLoadState('load', { timeout: 30000 });

  console.log('  [*] Mở Advanced search và bỏ chọn "Open tasks only"...');
  const advSettingsBtn = page.locator('span.icon-settings, a.icon-settings, span[onclick*="options-content"]').first();
  await advSettingsBtn.waitFor({ state: 'visible', timeout: 10000 });
  await advSettingsBtn.click();
  await page.waitForTimeout(600);

  const openTasksCb = page.locator('input[type="checkbox"]#open_issues, input[type="checkbox"][name="open_issues"]').first();
  await openTasksCb.waitFor({ state: 'attached', timeout: 5000 });
  if (await openTasksCb.isChecked()) {
    await openTasksCb.uncheck();
  }

  const submitSearchBtn = page.locator('input[type="submit"][value="Submit"], input[type="submit"][name="commit"]').first();
  await submitSearchBtn.click();
  await page.waitForLoadState('load', { timeout: 30000 });
  await page.waitForTimeout(1000);

  const firstResultLink = page.locator([
    '#search-results dt a',
    '#search-results li a',
    '.search-results dt a',
    '.search-results a',
    'dt.issue a',
  ].join(', ')).first();

  await firstResultLink.waitFor({ state: 'visible', timeout: 15000 });
  const resultTitle = await firstResultLink.innerText();
  await firstResultLink.click();
  await page.waitForLoadState('load', { timeout: 30000 });

  const sprintTaskUrl = page.url();
  console.log(`  -> [✓] Đã vào trang Sprint task: "${resultTitle.trim()}" (${sprintTaskUrl})\n`);

  // Tự động nhận diện Project ID từ liên kết trên trang Sprint Task (không cần cấu hình thủ công)
  const projectId = await page.evaluate(() => {
    const link = document.querySelector('a[href*="/projects/"][href*="activity"], a[href*="/projects/"][href*="issues"], a[href*="/projects/"][href*="time_entries"]');
    if (link) {
      const m = link.getAttribute('href').match(/\/projects\/(\d+)/);
      if (m) return m[1];
    }
    const bodyMatch = document.body.innerHTML.match(/\/projects\/(\d+)\//);
    return bodyMatch ? bodyMatch[1] : '786';
  });

  return { sprintTaskUrl, projectId };
}

/**
 * Metric 1: Rework Effort (hours)
 * Lấy tổng số giờ của Activity = "Re-work" trên task Sprint.
 */
async function collectReworkEffort(page, sprintTaskUrl) {
  console.log('[*] [Thao tác 2] Thu thập Rework Effort (hours)...');
  await safeGoto(page, sprintTaskUrl);

  const spentTimeLink = page.locator('a[title="View spent time on task"]:has(.hours-int), a[href*="time_entries"]:has(.hours-int)').first();
  await spentTimeLink.waitFor({ state: 'visible', timeout: 10000 });
  await spentTimeLink.click();
  await page.waitForLoadState('load', { timeout: 30000 });

  // Mở khung Filters
  const filtersBtn = page.locator('a.icon-details, button.icon-details, a:has-text("Filters")').first();
  await filtersBtn.click();
  await page.waitForTimeout(600);

  // Thêm filter Activity
  const addFilter = page.locator('#add_filter_select');
  await addFilter.waitFor({ state: 'visible', timeout: 10000 });
  await addFilter.selectOption('activity_id');
  await page.waitForTimeout(600);

  // Xóa các tag không liên quan (như Off-work)
  await page.evaluate(() => {
    const container = document.querySelector('#values_activity_id_entity_array');
    if (!container) return;
    const tags = Array.from(container.querySelectorAll('span'));
    tags.forEach(tag => {
      if (!tag.innerText.includes('Re-work')) {
        const delBtn = tag.querySelector('.icon-del');
        if (delBtn) delBtn.click();
      }
    });
  });
  await page.waitForTimeout(400);

  // Nhập và chọn Re-work
  const activityInput = page.locator('#values_activity_id_autocomplete');
  await activityInput.click();
  await activityInput.fill('Re-work');
  await page.waitForTimeout(800);

  const reworkSuggestion = page.locator('.ui-autocomplete li a, .ui-autocomplete li').filter({ hasText: /Re-work/i }).first();
  if (await reworkSuggestion.count() > 0) {
    await reworkSuggestion.click();
  } else {
    await activityInput.press('Enter');
  }
  await page.waitForTimeout(500);

  // Bấm Apply
  const applyBtn = page.locator('a.button-positive:has-text("Apply"), a:has-text("Apply"), button:has-text("Apply")').first();
  await applyBtn.click();
  await page.waitForLoadState('load', { timeout: 30000 });

  // Đọc kết quả giờ
  const sumEl = page.locator('p:has-text("Sum:") .hours-int, .total-hours .hours-int, span.hours-int').first();
  const rawText = await sumEl.innerText().catch(() => '0');
  const reworkHours = parseFloat(rawText.replace(/[^0-9.]/g, '')) || 0;

  console.log(`  -> [✓] Rework Effort (hours) = ${reworkHours}\n`);
  return reworkHours;
}

/**
 * Metric 2: Effort to implement IR (hours)
 * Lấy tổng số giờ cho Tracker = "Improvement Request" trong khoảng startDate -> endDate.
 */
async function collectEffortToImplementIR(page, projectId, startDate, endDate) {
  console.log('[*] [Thao tác 3] Thu thập Effort to implement IR (hours)...');
  const spentTimeUrl = `${LIS_URL}projects/${projectId}/time_entries`;
  await safeGoto(page, spentTimeUrl);

  // Mở khung Filters
  const filtersBtn = page.locator('a.icon-details, button.icon-details, a:has-text("Filters")').first();
  await filtersBtn.click();
  await page.waitForTimeout(600);

  // Điền dải ngày
  await fillDateFilterRange(page, startDate, endDate);

  // Bỏ tick User
  const userCb = page.locator('#cb_user_id, input[name="fields[]"][value="user_id"]');
  if (await userCb.count() > 0 && await userCb.isChecked()) {
    await userCb.uncheck();
  }

  // Thêm filter Tracker
  const addFilter = page.locator('#add_filter_select');
  await addFilter.waitFor({ state: 'visible', timeout: 10000 });
  await addFilter.selectOption('tracker_id');
  await page.waitForTimeout(600);

  // Xóa các tag mặc định trong Tracker
  await page.evaluate(() => {
    const container = document.querySelector('#values_tracker_id_entity_array');
    if (!container) return;
    const tags = Array.from(container.querySelectorAll('span'));
    tags.forEach(tag => {
      const delBtn = tag.querySelector('.icon-del');
      if (delBtn) delBtn.click();
    });
  });
  await page.waitForTimeout(400);

  // Nhập và chọn Improvement Request
  const trackerInput = page.locator('#values_tracker_id_autocomplete');
  await trackerInput.click();
  await trackerInput.fill('Improvement Request');
  await page.waitForTimeout(800);

  const irSuggestion = page.locator('.ui-autocomplete li a, .ui-autocomplete li').filter({ hasText: /Improvement Request/i }).first();
  if (await irSuggestion.count() > 0) {
    await irSuggestion.click();
  } else {
    await trackerInput.press('Enter');
  }
  await page.waitForTimeout(500);

  // Bấm Apply
  const applyBtn = page.locator('a.button-positive:has-text("Apply"), a:has-text("Apply"), button:has-text("Apply")').first();
  await applyBtn.click();
  await page.waitForLoadState('load', { timeout: 30000 });

  // Đọc kết quả
  const sumEl = page.locator('p:has-text("Sum:") .hours-int, .total-hours p .hours-int, p:has-text("Sum:")').first();
  let irHours = 0;
  if (await sumEl.count() > 0) {
    const raw = await sumEl.innerText().catch(() => '0');
    const match = raw.match(/[\d.]+/);
    irHours = match ? parseFloat(match[0]) : 0;
  }

  console.log(`  -> [✓] Effort to implement IR = ${irHours}\n`);
  return irHours;
}

/**
 * Metric 3 & 4: Total Spend Effort & Technical Debt
 * Thu thập spent hours từ 4 subtasks: WORK ITEMS, SCRUM EVENTS, RELEASE, TECHNICAL DEBT.
 */
async function collectSprintTasksEffort(page, sprintTaskUrl) {
  console.log('[*] [Thao tác 4] Thu thập Spent Effort từ các Subtask của Sprint...');
  await safeGoto(page, sprintTaskUrl);

  // Mở rộng cây subtasks nếu chưa mở
  const expander = page.locator('#expander_issue_childs_inner');
  if (await expander.count() > 0) {
    const className = await expander.getAttribute('class').catch(() => '');
    if (!className.includes('open')) {
      await expander.click();
      await page.waitForTimeout(1000);
    }
  }

  // Trích xuất đường dẫn 4 task chính
  const tasks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('table.issues td.subject a, #issue_tree td.subject a, .child-issues td.subject a'));
    const result = {};
    for (const a of links) {
      const text = a.innerText.trim();
      const href = a.getAttribute('href');
      if (/WORK ITEMS/i.test(text) && !result.workItems) result.workItems = { name: text, href };
      else if (/SCRUM EVENTS/i.test(text) && !result.scrumEvents) result.scrumEvents = { name: text, href };
      else if (/Task #\d+: RELEASE$/i.test(text) && !result.release) result.release = { name: text, href };
      else if (/TECHNICAL DEBT/i.test(text) && !result.techDebt) result.techDebt = { name: text, href };
    }
    return result;
  });

  const origin = new URL(page.url()).origin;

  // Hàm đọc Total Hours trên từng task
  async function fetchTaskTotalHours(taskObj, label) {
    if (!taskObj || !taskObj.href) {
      console.log(`  -> [!] Không tìm thấy task "${label}" trên Sprint task.`);
      return 0;
    }
    const fullUrl = taskObj.href.startsWith('http') ? taskObj.href : `${origin}${taskObj.href}`;
    await safeGoto(page, fullUrl);

    const hours = await page.evaluate(() => {
      // Ưu tiên 1: Link Total nằm sau chữ (Total: ...) - không chứa only_issue (tổng gồm subtask)
      const totalLink = document.querySelector('.spent-time.attribute .value a[href*="period=all"]:not([href*="only_issue"])');
      if (totalLink) {
        const text = totalLink.innerText.trim();
        const cleaned = text.replace(/[^0-9.]/g, '');
        return cleaned ? parseFloat(cleaned) : 0;
      }
      // Fallback: Link spent time duy nhất nếu task không có subtask (ví dụ Technical Debt)
      const singleLink = document.querySelector('.spent-time.attribute .value a[title*="spent time"], .spent-time .hours-int');
      if (singleLink) {
        const text = singleLink.innerText.trim();
        const cleaned = text.replace(/[^0-9.]/g, '');
        return cleaned ? parseFloat(cleaned) : 0;
      }
      return 0;
    });

    return hours;
  }

  const implementHours = await fetchTaskTotalHours(tasks.workItems, 'WORK ITEMS');
  const sprintEventHours = await fetchTaskTotalHours(tasks.scrumEvents, 'SCRUM EVENTS');
  const releaseHours = await fetchTaskTotalHours(tasks.release, 'RELEASE');
  const techDebtHours = await fetchTaskTotalHours(tasks.techDebt, 'TECHNICAL DEBT');

  const totalSpendEffortFormula = `=${implementHours}+${sprintEventHours}+${releaseHours}`;

  console.log('  [*] Chi tiết giờ các subtask:');
  console.log(`    - WORK ITEMS (Implement):       ${implementHours} hours`);
  console.log(`    - SCRUM EVENTS (Sprint event):  ${sprintEventHours} hours`);
  console.log(`    - RELEASE (Release):            ${releaseHours} hours`);
  console.log(`    - TECHNICAL DEBT:               ${techDebtHours} hours`);
  console.log(`  -> [✓] Total Spend Effort (công thức Excel) = "${totalSpendEffortFormula}"`);
  console.log(`  -> [✓] Total technical debt effort           = ${techDebtHours}\n`);

  return {
    implementHours,
    sprintEventHours,
    releaseHours,
    totalSpendEffortFormula,
    techDebtHours,
  };
}

/**
 * Metric 5: Number of Internal Bugs
 * Đếm số lượng task có Tracker = "Defect / Bug" thuộc Sprint (cả Open và Closed).
 */
async function collectInternalBugs(page, projectId, sprintName) {
  console.log('[*] [Thao tác 5] Thu thập Number of Internal Bugs...');
  const issuesUrl = `${LIS_URL}projects/${projectId}/issues`;
  await safeGoto(page, issuesUrl);

  // Mở khung Filters
  const filtersBtn = page.locator('a.icon-details, button.icon-details, a:has-text("Filters")').first();
  await filtersBtn.click();
  await page.waitForTimeout(600);

  // Bỏ tick Status để tìm tất cả bug (cả Open và Closed)
  const statusCb = page.locator('#cb_status_id, input[name="fields[]"][value="status_id"]');
  if (await statusCb.count() > 0 && await statusCb.isChecked()) {
    await statusCb.uncheck();
  }

  // Thêm filter Sprint
  const addFilter = page.locator('#add_filter_select');
  await addFilter.waitFor({ state: 'visible', timeout: 10000 });
  await addFilter.selectOption('easy_sprint_id');
  await page.waitForTimeout(600);

  // Xóa các tag sprint mặc định không liên quan
  await page.evaluate((sprintKw) => {
    const container = document.querySelector('#values_easy_sprint_id_entity_array');
    if (!container) return;
    const tags = Array.from(container.querySelectorAll('span'));
    tags.forEach(tag => {
      if (!tag.innerText.includes(sprintKw)) {
        const delBtn = tag.querySelector('.icon-del');
        if (delBtn) delBtn.click();
      }
    });
  }, sprintName);
  await page.waitForTimeout(400);

  // Nhập sprint
  const sprintInput = page.locator('#values_easy_sprint_id_autocomplete');
  await sprintInput.click();
  await sprintInput.fill(sprintName);
  await page.waitForTimeout(800);

  const sprintSuggestion = page.locator('.ui-autocomplete li a, .ui-autocomplete li').filter({ hasText: new RegExp(sprintName, 'i') }).first();
  if (await sprintSuggestion.count() > 0) {
    await sprintSuggestion.click();
  } else {
    await sprintInput.press('Enter');
  }
  await page.waitForTimeout(500);

  // Thêm filter Tracker -> Defect / Bug
  await addFilter.selectOption('tracker_id');
  await page.waitForTimeout(600);

  await page.evaluate(() => {
    const container = document.querySelector('#values_tracker_id_entity_array');
    if (!container) return;
    const tags = Array.from(container.querySelectorAll('span'));
    tags.forEach(tag => {
      const delBtn = tag.querySelector('.icon-del');
      if (delBtn) delBtn.click();
    });
  });
  await page.waitForTimeout(400);

  const trackerInput = page.locator('#values_tracker_id_autocomplete');
  await trackerInput.click();
  await trackerInput.fill('Defect / Bug');
  await page.waitForTimeout(800);

  const bugSuggestion = page.locator('.ui-autocomplete li a, .ui-autocomplete li').filter({ hasText: /Defect \/ Bug/i }).first();
  if (await bugSuggestion.count() > 0) {
    await bugSuggestion.click();
  } else {
    await trackerInput.press('Enter');
  }
  await page.waitForTimeout(500);

  // Bấm Apply
  const applyBtn = page.locator('a.button-positive:has-text("Apply"), a:has-text("Apply"), button:has-text("Apply")').first();
  await applyBtn.click();
  await page.waitForLoadState('load', { timeout: 30000 });
  await page.waitForTimeout(1000);

  // Lấy số lượng bugs
  const headingEl = page.locator('h2, .easy-query-heading, #content h2').first();
  const headingText = (await headingEl.innerText().catch(() => ''));
  const match = headingText.match(/Task list\s*\(?(\d+)\)?/i);

  let bugCount = 0;
  if (match) {
    bugCount = parseInt(match[1], 10);
  } else {
    bugCount = await page.locator('table.issues tr.issue').count();
  }

  console.log(`  -> [✓] Number of Internal Bugs = ${bugCount}\n`);
  return bugCount;
}

// ======================================================================
// HÀM ĐIỀU PHỐI TOÀN BỘ METRICS LIS
// ======================================================================

/**
 * Điều phối thu thập tất cả metrics từ LIS:
 * @param {import('playwright').Browser} browser
 * @param {object} config
 * @returns {Promise<object>}
 */
async function collectLISMetrics(browser, config = defaultConfig) {
  console.log('='.repeat(70));
  console.log('GIAI ĐOẠN 1: THU THẬP METRICS TỪ HỆ THỐNG LIS (REDMINE)');
  console.log('='.repeat(70) + '\n');

  const contextOptions = fs.existsSync(AUTH_FILE)
    ? { storageState: AUTH_FILE, viewport: { width: 1920, height: 1080 } }
    : { viewport: { width: 1920, height: 1080 } };

  const lisContext = await browser.newContext(contextOptions);
  const lisPage = await lisContext.newPage();
  const lisMetrics = {};

  try {
    // 1. Kiểm tra đăng nhập LIS
    await ensureLoggedInLIS(lisPage, lisContext, config);

    // 2. Tìm kiếm Sprint task và tự động trích xuất Project ID
    const { sprintTaskUrl, projectId } = await searchAndOpenSprint(lisPage, config.sprint);

    // 3. Metric: Rework Effort (hours)
    lisMetrics.reworkEffortHoursValue = await collectReworkEffort(lisPage, sprintTaskUrl);

    // 4. Metric: Effort to implement IR
    lisMetrics.effortToImplementIRValue = await collectEffortToImplementIR(lisPage, projectId, config.startDate, config.endDate);

    // 5. Metric: Total Spend Effort & Technical Debt
    const spendResults = await collectSprintTasksEffort(lisPage, sprintTaskUrl);
    lisMetrics.implementEffortValue = spendResults.implementHours;
    lisMetrics.sprintEventEffortValue = spendResults.sprintEventHours;
    lisMetrics.releaseEffortValue = spendResults.releaseHours;
    lisMetrics.totalSpendEffortValue = spendResults.totalSpendEffortFormula;
    lisMetrics.totalTechnicalDebtEffortValue = spendResults.techDebtHours;

    // 6. Metric: Number of Internal Bugs
    lisMetrics.numberOfInternalBugsValue = await collectInternalBugs(lisPage, projectId, config.sprint);

    console.log('[✓] Đã hoàn thành toàn bộ thao tác trên hệ thống LIS!\n');
    return lisMetrics;

  } catch (error) {
    const currentUrl = lisPage && !lisPage.isClosed() ? lisPage.url() : 'N/A';
    logErrorDiagnostic('Giai đoạn 1: Thu thập metrics từ LIS (Redmine)', currentUrl, error);
    throw error;
  } finally {
    await lisPage.close();
    await lisContext.close();
  }
}

// Cho phép chạy độc lập file này để test/debug riêng LIS: node lis_service.js
if (require.main === module) {
  (async () => {
    console.log('[*] Đang chạy kiểm thử độc lập lis_service.js...');
    const browser = await chromium.launch({
      headless: defaultConfig.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    try {
      const results = await collectLISMetrics(browser, defaultConfig);
      console.log('\n[✓] KẾT QUẢ THU THẬP LIS:');
      console.log(JSON.stringify(results, null, 2));
    } catch (err) {
      console.error('[X] LỖI lis_service:', err);
    } finally {
      await browser.close();
    }
  })();
}

module.exports = {
  collectLISMetrics,
  loginLIS,
  ensureLoggedInLIS,
  searchAndOpenSprint,
  collectReworkEffort,
  collectEffortToImplementIR,
  collectSprintTasksEffort,
  collectInternalBugs,
};
