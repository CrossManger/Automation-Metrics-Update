/**
 * BƯỚC 1: Chạy file này MỘT LẦN để đăng nhập thủ công vào LIS
 * và lưu session vào file auth.json.
 *
 * Cách chạy: node save_auth.js
 */

const { chromium } = require('playwright');

const LIS_URL = 'https://lis.larion.com/';
const AUTH_FILE = 'auth.json';

(async () => {
  console.log('=== BƯỚC 1: LƯU SESSION ĐĂNG NHẬP ===');
  console.log('Đang mở trình duyệt có giao diện...\n');

  const browser = await chromium.launch({
    headless: false, // Mở giao diện để bạn tự đăng nhập
    slowMo: 50,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(LIS_URL);
  console.log(`✅ Đã mở: ${LIS_URL}`);
  console.log('');
  console.log('👉 Hãy đăng nhập vào LIS trên trình duyệt vừa mở.');
  console.log('👉 Sau khi đăng nhập xong và trang đã load hoàn toàn,');
  console.log('   quay lại đây và nhấn ENTER để lưu session...');
  console.log('');

  // Dừng chờ bạn đăng nhập xong
  await new Promise((resolve) => process.stdin.once('data', resolve));

  // Lưu toàn bộ cookie và session storage
  await context.storageState({ path: AUTH_FILE });

  console.log(`\n✅ Đã lưu session vào file "${AUTH_FILE}" thành công!`);
  console.log('   Bây giờ bạn có thể chạy: node scraper.js');

  await browser.close();
  process.exit(0);
})();
