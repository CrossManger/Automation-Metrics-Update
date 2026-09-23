/**
 * ======================================================================
 * UTILITIES (HÀM BỔ TRỢ & TIỆN ÍCH)
 * ======================================================================
 * Chứa các hàm dùng chung:
 *   - safeGoto: Điều hướng URL có cơ chế retry khi mạng chập chờn
 *   - fillDateFilterRange: Điền dải ngày cho bộ lọc LIS ổn định ở chế độ headless
 *   - formatMonthName: Chuẩn hóa tên tháng/sprint (VD: "2026 Sep 01 Sprint" -> "Sep 01")
 *   - printSummaryReport: In bảng tổng hợp kết quả theo phong cách Automation-LIS
 * ======================================================================
 */

const fs = require('fs');
const path = require('path');

/**
 * Điều hướng an toàn tới một URL, tự động retry nhiều lần nếu gặp timeout/lỗi mạng.
 * @param {import('playwright').Page} page
 * @param {string} url
 * @param {number} maxRetries
 * @param {number} timeout
 */
async function safeGoto(page, url, maxRetries = 6, timeout = 60000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await page.goto(url, { waitUntil: 'load', timeout });
      if (attempt > 1) {
        console.log(`  -> [✓] Đã kết nối lại thành công ở lần thử ${attempt}/${maxRetries}!`);
      }
      return res;
    } catch (e) {
      console.warn(`[!] Cảnh báo mạng khi truy cập ${url} (Lần thử ${attempt}/${maxRetries}): ${e.message}`);
      if (attempt < maxRetries) {
        const delay = 2000 * attempt;
        console.log(`  [*] Đang đợi ${delay / 1000}s để tự động thử kết nối lại...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw e;
      }
    }
  }
}

/**
 * Điền dải ngày cho Date filter (spent_on) an toàn tuyệt đối khi chạy headless trên Linux/CI.
 * Thao tác trực tiếp trên DOM và dispatch đầy đủ các sự kiện input, change, jQuery change.
 * @param {import('playwright').Page} page
 * @param {string} fromDate (định dạng YYYY-MM-DD)
 * @param {string} toDate (định dạng YYYY-MM-DD)
 */
async function fillDateFilterRange(page, fromDate, toDate) {
  console.log(`  [*] Thiết lập dải ngày Date: From ${fromDate} -> To ${toDate}...`);
  await page.evaluate(({ from, to }) => {
    // 1. Tích chọn radio button custom range (#spent_on_date_period_2)
    const radio = document.querySelector('#spent_on_date_period_2');
    if (radio) {
      radio.checked = true;
      radio.dispatchEvent(new Event('click', { bubbles: true }));
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      if (window.jQuery) window.jQuery(radio).trigger('change');
    }

    // 2. Điền From và To trực tiếp kèm dispatch các event input, change
    const fromInp = document.querySelector('#spent_on_from');
    if (fromInp) {
      fromInp.value = from;
      fromInp.dispatchEvent(new Event('input', { bubbles: true }));
      fromInp.dispatchEvent(new Event('change', { bubbles: true }));
      if (window.jQuery) window.jQuery(fromInp).trigger('change');
    }

    const toInp = document.querySelector('#spent_on_to');
    if (toInp) {
      toInp.value = to;
      toInp.dispatchEvent(new Event('input', { bubbles: true }));
      toInp.dispatchEvent(new Event('change', { bubbles: true }));
      if (window.jQuery) window.jQuery(toInp).trigger('change');
    }
  }, { from: fromDate, to: toDate });
  await page.waitForTimeout(600);
}

/**
 * Trích xuất tên tháng/sprint ngắn gọn (VD: "2026 Sep 01 Sprint" -> "Sep 01").
 * @param {string} sprintName
 * @returns {string}
 */
function formatMonthName(sprintName) {
  if (!sprintName) return '';
  const monthMatch = sprintName.match(/(?:20\d{2}\s+)?([A-Za-z]{3}\s+\d{2})/i);
  return monthMatch ? monthMatch[1] : sprintName;
}

/**
 * In bảng báo cáo tổng hợp các chỉ số đã thu thập theo định dạng chuẩn Automation-LIS.
 * @param {object} metrics
 * @param {object} config
 */
function printSummaryReport(metrics, config) {
  console.log('\n' + '='.repeat(70));
  console.log('BÁO CÁO TỔNG HỢP THU THẬP METRICS HOÀN TẤT (LIS + JENKINS)');
  console.log('='.repeat(70));
  console.log(`  [*] Tháng / Sprint:                                         ${metrics.monthName || config.sprint}`);
  console.log(`  [✓] Rework Effort (hours):                                  ${metrics.reworkEffortHoursValue ?? 0}`);
  console.log(`  [✓] Effort to implement IR:                                 ${metrics.effortToImplementIRValue ?? 0}`);
  console.log(`  [✓] Total Spend Effort (Implement + Sprint event + Release): ${metrics.totalSpendEffortValue || 'N/A'}`);
  console.log(`      - Implement (WORK ITEMS):                               ${metrics.implementEffortValue ?? 0} hours`);
  console.log(`      - Sprint event (SCRUM EVENTS):                          ${metrics.sprintEventEffortValue ?? 0} hours`);
  console.log(`      - Release (RELEASE):                                    ${metrics.releaseEffortValue ?? 0} hours`);
  console.log(`  [✓] Total technical debt effort:                            ${metrics.totalTechnicalDebtEffortValue ?? 0}`);
  console.log(`  [✓] Number of Internal Bugs:                                ${metrics.numberOfInternalBugsValue ?? 0}`);
  console.log(`  [✓] Unit test coverage (FE):                                ${metrics.unitTestCoverageFE ?? 'N/A'}`);
  console.log(`  [✓] Unit test coverage (BE):                                ${metrics.unitTestCoverageBE ?? 'N/A'}`);
  console.log(`  [✓] Unit test coverage (MAXHUB):                            ${metrics.unitTestCoverageMAXHUB ?? 'N/A'}`);
  console.log(`  [✓] Security Vulnerability (BE):                            ${metrics.securityVulnerabilityBE ?? 0}`);
  console.log(`  [✓] Security Vulnerability (MHUB):                          ${metrics.securityVulnerabilityMHUB ?? 0}`);
  console.log('='.repeat(70));
}

/**
 * Gợi ý khắc phục lỗi dựa trên ngữ cảnh thao tác và thông điệp lỗi.
 * @param {string} stepName
 * @param {Error} error
 * @returns {string}
 */
function getTroubleshootingTip(stepName, error) {
  const msg = (error?.message || '').toLowerCase();
  const step = (stepName || '').toLowerCase();

  if (step.includes('login') || msg.includes('login') || msg.includes('password') || msg.includes('unauthorized')) {
    return '  • Kiểm tra lại LIS_USERNAME / LIS_PASSWORD hoặc JENKINS_USERNAME / JENKINS_PASSWORD.\n  • Kiểm tra tài khoản có bị khóa hoặc cần đổi mật khẩu trên hệ thống hay không.';
  }
  if (step.includes('sprint') || msg.includes('sprint') || msg.includes('not found')) {
    return '  • Kiểm tra lại chính xác tên Sprint (khoảng trắng, viết hoa, định dạng VD: "2026 Sep 01 Sprint").\n  • Đảm bảo Sprint này thực sự tồn tại trên hệ thống LIS.';
  }
  if (msg.includes('timeout') || msg.includes('waiting for locator')) {
    return '  • Hệ thống LIS hoặc Jenkins phản hồi chậm do quá tải mạng.\n  • Selector của phần tử trên trang có thể đã bị thay đổi.';
  }
  if (step.includes('power_automate') || msg.includes('power automate') || msg.includes('400')) {
    return '  • Kiểm tra kiểu dữ liệu trong Request Body JSON Schema của Power Automate.\n  • Đảm bảo các trường nhận số lẻ có kiểu "type": "number" thay vì "integer".\n  • Kiểm tra URL Webhook có bị hết hạn hoặc sai lệch không.';
  }
  return '  • Kiểm tra chi tiết Stack Trace và log các thao tác trước đó để xác định nguyên nhân.';
}

/**
 * In thông báo lỗi chi tiết ra console theo định dạng chuẩn dễ debug trên Jenkins (Không chụp ảnh màn hình).
 * @param {string} stepName Tên bước thao tác bị lỗi
 * @param {string} currentUrl URL của trang web tại thời điểm xảy ra lỗi
 * @param {Error} error Đối tượng lỗi
 */
function logErrorDiagnostic(stepName, currentUrl, error) {
  console.error('\n' + '='.repeat(70));
  console.error('❌ PHÁT HIỆN LỖI THỰC THI (ERROR DIAGNOSTIC)');
  console.error('='.repeat(70));
  console.error(`  [*] Thao tác bị lỗi:    ${stepName}`);
  console.error(`  [*] URL tại thời điểm:  ${currentUrl || 'N/A'}`);
  console.error(`  [*] Thông điệp lỗi:     ${error?.message || error}`);
  console.error('  ----------------------------------------------------------------------');
  console.error('  [*] Gợi ý khắc phục (Troubleshooting Tips):');
  console.error(getTroubleshootingTip(stepName, error));
  console.error('  ----------------------------------------------------------------------');
  if (error?.stack) {
    console.error('  [*] Chi tiết Stack Trace:');
    console.error(error.stack);
  }
  console.error('='.repeat(70) + '\n');
}

module.exports = {
  safeGoto,
  fillDateFilterRange,
  formatMonthName,
  printSummaryReport,
  logErrorDiagnostic,
};
