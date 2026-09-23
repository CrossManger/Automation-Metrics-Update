/**
 * ======================================================================
 * CONFIGURATION & CONSTANTS
 * ======================================================================
 * Nạp cấu hình từ config.json và định nghĩa các hằng số hệ thống.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'config.json');
const AUTH_FILE = path.join(__dirname, 'auth.json');
const AUTH_JENKINS_FILE = path.join(__dirname, 'auth_jenkins.json');
const OUTPUT_DATA_FILE = path.join(__dirname, 'scraped_data.json');

const LIS_URL = 'https://lis.larion.com/';
const JENKINS_URL = 'http://172.16.4.215:8080/view/MAX/';

// Bảng ánh xạ Webhook Power Automate theo Team
const POWER_AUTOMATE_WEBHOOKS = {
  MAX:
    process.env.POWER_AUTOMATE_URL_MAX ||
    process.env.POWER_AUTOMATE_URL ||
    'https://default57a2790d9e61427a87f06ede7caf4a.2e.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/28/workflows/abe30c32b5464a70ac08b95238b100fa/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=Vas5QgQqPhAwKj8cK5kvqWBZMWzj46278ITgInUv5MU',
  MSS:
    process.env.POWER_AUTOMATE_URL_MSS ||
    'https://YOUR_POWER_AUTOMATE_WEBHOOK_URL_FOR_MSS_HERE',
};

function loadConfig() {
  let config = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch (e) {
      console.warn(`[!] Không đọc được file config.json: ${e.message}`);
    }
  }

  // Ưu tiên biến môi trường (phù hợp khi chạy trên Jenkins CI/CD hoặc Docker)
  config.team = (process.env.TEAM || config.team || 'MAX').toUpperCase();
  config.username = process.env.LIS_USERNAME || config.username;
  config.password = process.env.LIS_PASSWORD || config.password;
  config.jenkins_username = process.env.JENKINS_USERNAME || config.jenkins_username || config.username;
  config.jenkins_password = process.env.JENKINS_PASSWORD || config.jenkins_password || config.password;
  config.sprint = process.env.SPRINT_NAME || process.env.SPRINT || config.sprint;
  config.startDate = process.env.START_DATE || config.startDate;
  config.endDate = process.env.END_DATE || process.env.DUE_DATE || config.endDate;

  if (!config.username || !config.password) {
    console.error('[X] LỖI: Thiếu "username" hoặc "password" đăng nhập LIS! (Kiểm tra config.json hoặc biến LIS_USERNAME / LIS_PASSWORD)');
    process.exit(1);
  }
  if (!config.jenkins_username || !config.jenkins_password) {
    console.warn('[!] CẢNH BÁO: Chưa có "jenkins_username" hoặc "jenkins_password"!');
  }
  if (!config.sprint) {
    console.error('[X] LỖI: Thiếu "sprint"! (Kiểm tra config.json hoặc biến SPRINT_NAME)');
    process.exit(1);
  }
  if (!config.startDate || !config.endDate) {
    console.error('[X] LỖI: Thiếu "startDate" hoặc "endDate"! (Kiểm tra config.json hoặc biến START_DATE / END_DATE)');
    process.exit(1);
  }

  // Cấu hình headless: ưu tiên biến môi trường HEADLESS, sau đó tới config.json, mặc định là true
  if (process.env.HEADLESS !== undefined) {
    config.headless = process.env.HEADLESS.toLowerCase() === 'true';
  } else if (config.headless === undefined) {
    config.headless = true;
  }

  return config;
}

const config = loadConfig();

module.exports = {
  config,
  LIS_URL,
  JENKINS_URL,
  CONFIG_FILE,
  AUTH_FILE,
  AUTH_JENKINS_FILE,
  OUTPUT_DATA_FILE,
  POWER_AUTOMATE_WEBHOOKS,
};
