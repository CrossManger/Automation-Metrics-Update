/**
 * ======================================================================
 * AUTO COLLECT METRICS (MAIN ORCHESTRATOR)
 * ======================================================================
 * File điều phối chính (Orchestrator):
 *   - Nạp cấu hình hệ thống từ config.js
 *   - Khởi chạy trình duyệt Playwright (Hỗ trợ hoàn hảo cả Headless và Headed)
 *   - Gọi lis_service.js để cào metrics từ LIS (Redmine)
 *   - Gọi jenkins_service.js để cào metrics từ Jenkins CI/CD
 *   - Tổng hợp dữ liệu, trích xuất tên tháng/sprint
 *   - Lưu kết quả vào scraped_data.json cho main.js gửi sang Power Automate
 *   - In báo cáo tổng kết theo chuẩn định dạng phong cách Automation-LIS
 *
 * Cách chạy:
 *   - Mặc định (Headless ngầm): node scraper.js
 *   - Bật giao diện trình duyệt: HEADLESS=false node scraper.js
 * ======================================================================
 */

const { chromium } = require('playwright');
const fs = require('fs');
const {
  config: defaultConfig,
  LIS_URL,
  JENKINS_URL,
  OUTPUT_DATA_FILE,
} = require('./config');
const { printSummaryReport, formatMonthName } = require('./utils');
const { collectLISMetrics } = require('./lis_service');
const { collectJenkinsMetrics } = require('./jenkins_service');

/**
 * Hàm điều phối chính để thu thập toàn bộ metrics từ LIS và Jenkins.
 * @param {object} [customConfig] Tùy chọn truyền config từ bên ngoài nếu cần.
 * @returns {Promise<object>} Dữ liệu metrics đã thu thập.
 */
async function scrape(customConfig = null) {
  const config = customConfig || defaultConfig;

  console.log('\n' + '='.repeat(70));
  console.log('CHƯƠNG TRÌNH TỰ ĐỘNG THU THẬP DỮ LIỆU METRICS (LIS + JENKINS)');
  console.log('='.repeat(70));
  console.log(`[*] Team dự án:          ${config.team || 'MAX'}`);
  console.log(`[*] Sprint cấu hình:     ${config.sprint}`);
  console.log(`[*] Khoảng thời gian:    ${config.startDate || 'Tự động lấy từ Sprint'} -> ${config.endDate || 'Tự động lấy từ Sprint'}`);
  console.log(`[*] Hệ thống LIS:        ${LIS_URL}`);
  console.log(`[*] Hệ thống Jenkins:    ${JENKINS_URL}`);
  console.log(`[*] Chế độ Headless:     ${config.headless ? 'BẬT (Chạy ngầm không giao diện)' : 'TẮT (Hiển thị trình duyệt)'}`);
  console.log('='.repeat(70) + '\n');

  console.log('[*] Khởi động trình duyệt Playwright...');
  const browser = await chromium.launch({
    headless: config.headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--ignore-certificate-errors',
      '--start-maximized',
    ],
  });

  const collectedMetrics = {};

  try {
    // ────────────────────────────────────────────────────────────────
    // BƯỚC 1: THU THẬP METRICS TỪ HỆ THỐNG LIS
    // ────────────────────────────────────────────────────────────────
    const lisMetrics = await collectLISMetrics(browser, config);
    Object.assign(collectedMetrics, lisMetrics);
    if (lisMetrics.startDate) config.startDate = lisMetrics.startDate;
    if (lisMetrics.endDate) config.endDate = lisMetrics.endDate;

    // ────────────────────────────────────────────────────────────────
    // BƯỚC 2: THU THẬP METRICS TỪ HỆ THỐNG JENKINS
    // ────────────────────────────────────────────────────────────────
    const jenkinsMetrics = await collectJenkinsMetrics(browser, config);
    Object.assign(collectedMetrics, jenkinsMetrics);

    // Trích xuất tự động tên tháng/sprint (VD: "2026 Sep 01 Sprint" -> "Sep 01")
    collectedMetrics.monthName = formatMonthName(config.sprint);

    // Ghi kết quả vào file JSON để main.js sử dụng
    fs.writeFileSync(OUTPUT_DATA_FILE, JSON.stringify(collectedMetrics, null, 2), 'utf-8');

    // In báo cáo tổng kết chuẩn phong cách Automation-LIS
    printSummaryReport(collectedMetrics, config);
    console.log(`[✓] Đã lưu kết quả hoàn chỉnh vào file: ${OUTPUT_DATA_FILE}\n`);

    return collectedMetrics;

  } catch (error) {
    console.error(`\n[X] LỖI THỰC THI TRONG QUÁ TRÌNH THU THẬP: ${error.message}`);
    console.error(error.stack);
    throw error;
  } finally {
    await browser.close();
    console.log('[✓] Đã đóng trình duyệt Playwright an toàn.\n');
  }
}

// Chạy trực tiếp từ dòng lệnh: node scraper.js
if (require.main === module) {
  scrape().catch(() => process.exit(1));
}

module.exports = { scrape };
