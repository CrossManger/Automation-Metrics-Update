/**
 * ======================================================================
 * GỬI DỮ LIỆU SANG POWER AUTOMATE (MAIN CONNECTOR)
 * ======================================================================
 * File cầu nối gửi dữ liệu metrics đã thu thập từ scraped_data.json
 * sang Power Automate Webhook để cập nhật vào SharePoint Excel.
 *
 * Cách chạy: node main.js
 * ======================================================================
 */

const fs = require('fs');
const path = require('path');

// Đường dẫn file dữ liệu đã cào
const DATA_FILE = path.join(__dirname, 'scraped_data.json');

// URL Webhook Power Automate
const powerAutomateUrl =
  process.env.POWER_AUTOMATE_URL ||
  'https://default57a2790d9e61427a87f06ede7caf4a.2e.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/28/workflows/abe30c32b5464a70ac08b95238b100fa/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=Vas5QgQqPhAwKj8cK5kvqWBZMWzj46278ITgInUv5MU';

// Hàm đọc dữ liệu từ scraped_data.json
function loadScrapedData() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error('[X] LỖI: Không tìm thấy file scraped_data.json!');
    console.error('     Vui lòng chạy lệnh "node scraper.js" để thu thập dữ liệu trước.');
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(DATA_FILE, 'utf-8');
    const data = JSON.parse(content);

    // Tương thích alias: hỗ trợ cả internalBugsValue và numberOfInternalBugsValue
    if (data.internalBugsValue === undefined && data.numberOfInternalBugsValue !== undefined) {
      data.internalBugsValue = data.numberOfInternalBugsValue;
    }

    return data;
  } catch (error) {
    console.error(`[X] LỖI khi đọc file scraped_data.json: ${error.message}`);
    process.exit(1);
  }
}

const { logErrorDiagnostic } = require('./utils');

async function sendData() {
  const scrapedData = loadScrapedData();

  console.log('\n' + '='.repeat(70));
  console.log('GỬI DỮ LIỆU METRICS SANG POWER AUTOMATE');
  console.log('='.repeat(70));
  console.log('[*] Nguồn dữ liệu:', DATA_FILE);
  console.log('[*] Dữ liệu thực tế đang gửi đi:');
  console.log(JSON.stringify(scrapedData, null, 2));
  console.log('='.repeat(70) + '\n');

  console.log('[*] Đang gửi yêu cầu POST sang Power Automate Webhook...');
  try {
    const response = await fetch(powerAutomateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(scrapedData),
    });

    if (response.ok) {
      console.log('-> [✓] Thành công! Office Script đang chạy cập nhật Excel trên SharePoint.\n');
    } else {
      const errorText = await response.text().catch(() => '');
      const httpError = new Error(`HTTP ${response.status} ${response.statusText}${errorText ? ': ' + errorText : ''}`);
      logErrorDiagnostic('Giai đoạn 3: Gửi dữ liệu sang Power Automate Webhook', powerAutomateUrl, httpError);
      process.exit(1);
    }
  } catch (error) {
    logErrorDiagnostic('Giai đoạn 3: Gửi dữ liệu sang Power Automate Webhook (Lỗi mạng/Kết nối)', powerAutomateUrl, error);
    process.exit(1);
  }
}

sendData();
