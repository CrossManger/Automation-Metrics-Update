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

const { config, POWER_AUTOMATE_WEBHOOKS } = require('./config');

// Xác định Team cần gửi (MAX hoặc MSS)
const currentTeam = (process.env.TEAM || config.team || 'MAX').toUpperCase();
const powerAutomateUrl =
  process.env.POWER_AUTOMATE_URL ||
  POWER_AUTOMATE_WEBHOOKS[currentTeam] ||
  POWER_AUTOMATE_WEBHOOKS['MAX'];

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
  console.log(`GỬI DỮ LIỆU METRICS SANG POWER AUTOMATE [TEAM: ${currentTeam}]`);
  console.log('='.repeat(70));
  console.log('[*] Đang gửi cho Team:', currentTeam);
  console.log('[*] Nguồn dữ liệu:    ', DATA_FILE);
  console.log('[*] Dữ liệu thực tế đang gửi đi:');
  console.log(JSON.stringify(scrapedData, null, 2));
  console.log('='.repeat(70) + '\n');

  if (powerAutomateUrl.includes('YOUR_POWER_AUTOMATE_WEBHOOK_URL_FOR_MSS_HERE')) {
    console.error(`[X] LỖI CẤU HÌNH: Bạn đang chọn Team MSS nhưng chưa cấu hình URL Webhook Power Automate cho Team MSS!`);
    console.error(`     Vui lòng mở file config.js để dán URL Webhook của Team MSS vào biến POWER_AUTOMATE_WEBHOOKS.MSS,`);
    console.error(`     hoặc truyền biến môi trường POWER_AUTOMATE_URL_MSS trên Jenkins.`);
    process.exit(1);
  }

  console.log(`[*] Đang gửi yêu cầu POST sang Webhook của [Team ${currentTeam}]...`);
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
