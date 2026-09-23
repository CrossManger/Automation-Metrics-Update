/**
 * ======================================================================
 * JENKINS SERVICE (MODULE THU THẬP METRICS TỪ JENKINS CI/CD)
 * ======================================================================
 * Chịu trách nhiệm thu thập các chỉ số từ hệ thống Jenkins:
 *   1. Unit Test Coverage (FE) [Branches]
 *   2. Unit Test Coverage (BE) [Overall Coverage]
 *   3. Security Vulnerability (BE) [Total Issues]
 *   4. Security Vulnerability (MHUB) [Brakeman Issues]
 *   5. Unit Test Coverage (MAXHUB) [Line Coverage]
 *
 * Hỗ trợ chạy độc lập để kiểm thử và gỡ lỗi: node jenkins_service.js
 * ======================================================================
 */

const fs = require('fs');
const { chromium } = require('playwright');
const { JENKINS_URL, AUTH_JENKINS_FILE, config: defaultConfig } = require('./config');
const { logErrorDiagnostic } = require('./utils');

/**
 * Đăng nhập vào Jenkins và lưu session vào auth_jenkins.json.
 */
async function loginJenkins(page, context, config) {
  console.log('  [!] Phiên Jenkins đã hết hạn. Đang đăng nhập lại...');
  await page.fill('#j_username', config.jenkins_username);
  await page.fill('#j_password', config.jenkins_password);
  await page.click('button[name="Submit"]');
  await page.waitForLoadState('load', { timeout: 30000 });

  const storage = await context.storageState();
  fs.writeFileSync(AUTH_JENKINS_FILE, JSON.stringify(storage, null, 2));
  console.log('  -> [✓] Đã lưu phiên mới vào auth_jenkins.json');
}

/**
 * Điều phối thu thập tất cả metrics từ Jenkins.
 * @param {import('playwright').Browser} browser
 * @param {object} config
 * @returns {Promise<object>}
 */
async function collectJenkinsMetrics(browser, config = defaultConfig) {
  console.log('='.repeat(70));
  console.log('GIAI ĐOẠN 2: THU THẬP METRICS TỪ HỆ THỐNG JENKINS CI/CD');
  console.log('='.repeat(70) + '\n');

  const contextOptions = {
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
    ...(fs.existsSync(AUTH_JENKINS_FILE) ? { storageState: AUTH_JENKINS_FILE } : {}),
  };

  if (fs.existsSync(AUTH_JENKINS_FILE)) {
    console.log('[*] Nạp phiên đăng nhập Jenkins đã lưu (auth_jenkins.json)...');
  }
  const context = await browser.newContext(contextOptions);

  const page = await context.newPage();
  try {
    console.log(`[*] Đang kết nối tới Jenkins MAX view (${JENKINS_URL})...`);
    await page.goto(JENKINS_URL, { waitUntil: 'load', timeout: 30000 });

    // Kiểm tra và tự động đăng nhập Jenkins nếu phiên hết hạn
    if (page.url().includes('/login')) {
      await loginJenkins(page, context, config);
      await page.goto(JENKINS_URL, { waitUntil: 'load', timeout: 30000 });
    }
    console.log('  -> [✓] Đã vào tab MAX trên Jenkins thành công!\n');

    const jenkinsMetrics = {};

    // 1. MAX_Frontend_Unit_Test -> Branches
    console.log('[*] [Thao tác 6] Thu thập Unit test coverage (FE)...');
    console.log('  [*] Truy cập MAX_Frontend_Unit_Test -> Jest Coverage...');
    await page.goto('http://172.16.4.215:8080/job/MAX_Frontend_Unit_Test/Jest_20Coverage/index.html', {
      waitUntil: 'load',
      timeout: 30000,
    });
    const feBranchesText = await page.evaluate(() => {
      const pad = document.querySelector('.pad1 .clearfix');
      if (!pad) return null;
      const divs = Array.from(pad.querySelectorAll('.pad1y'));
      for (const div of divs) {
        const quiet = div.querySelector('.quiet');
        if (quiet && quiet.innerText.trim().toLowerCase() === 'branches') {
          const strong = div.querySelector('.strong');
          return strong ? strong.innerText.trim() : null;
        }
      }
      return null;
    });
    console.log(`  -> [✓] Unit test coverage (FE) [Branches] = ${feBranchesText}\n`);
    jenkinsMetrics.unitTestCoverageFE = feBranchesText;

    // 2. MAX_Go_Services_BE_Unit_Test -> Overall Coverage
    console.log('[*] [Thao tác 7] Thu thập Unit test coverage (BE)...');
    console.log('  [*] Truy cập artifacts của MAX_Go_Services_BE_Unit_Test...');
    const beApiRes = await context.request.get('http://172.16.4.215:8080/job/MAX_Go_Services_BE_Unit_Test/lastSuccessfulBuild/api/json?tree=artifacts[relativePath]');
    const beApiData = await beApiRes.json().catch(() => ({}));
    const summaryArtifact = beApiData.artifacts?.find(a => a.relativePath.endsWith('coverage_summary.txt'));
    if (summaryArtifact) {
      const summaryRes = await context.request.get(`http://172.16.4.215:8080/job/MAX_Go_Services_BE_Unit_Test/lastSuccessfulBuild/artifact/${summaryArtifact.relativePath}`);
      const summaryText = await summaryRes.text();
      const match = summaryText.match(/•\s*Overall Coverage:\s*([\d.]+%?)/i);
      jenkinsMetrics.unitTestCoverageBE = match ? match[1] : null;
      console.log(`  -> [✓] Unit test coverage (BE) [Overall Coverage] = ${jenkinsMetrics.unitTestCoverageBE}\n`);
    } else {
      console.log('  [!] Cảnh báo: Không tìm thấy file coverage_summary.txt trong artifacts.');
      jenkinsMetrics.unitTestCoverageBE = null;
    }

    // 3. MAX_GoSec_Test -> Security Vulnerability (BE)
    console.log('[*] [Thao tác 8] Thu thập Security Vulnerability (BE)...');
    console.log('  [*] Kiểm tra báo cáo MAX_GoSec_Test...');
    const gosecRes = await context.request.get('http://172.16.4.215:8080/job/MAX_GoSec_Test/lastSuccessfulBuild/artifact/security-reports/security-report.html');
    const gosecHtml = await gosecRes.text();
    const gosecMatch = gosecHtml.match(/<div class="stat-card total">\s*<h3>Total Issues<\/h3>\s*<h2>(\d+)<\/h2>/i);
    let gosecIssues = 0;
    if (gosecMatch) {
      gosecIssues = parseInt(gosecMatch[1], 10);
    } else {
      const jsonRes = await context.request.get('http://172.16.4.215:8080/job/MAX_GoSec_Test/lastSuccessfulBuild/artifact/security-reports/gosec-report.json');
      const jsonData = await jsonRes.json().catch(() => ({}));
      gosecIssues = jsonData?.Stats?.found ?? 0;
    }
    console.log(`  -> [✓] Security Vulnerability (BE) [Total Issues] = ${gosecIssues}\n`);
    jenkinsMetrics.securityVulnerabilityBE = gosecIssues;

    // 4. MAX HUB Security -> Security Vulnerability (MHUB)
    console.log('[*] [Thao tác 9] Thu thập Security Vulnerability (MHUB)...');
    console.log('  [*] Kiểm tra báo cáo MAX HUB Security (Brakeman)...');
    const mhubRes = await context.request.get('http://172.16.4.215:8080/job/MAX%20HUB%20Security/lastSuccessfulBuild/brakeman/api/json');
    const mhubData = await mhubRes.json().catch(() => ({}));
    const mhubIssues = mhubData.totalSize ?? 0;
    console.log(`  -> [✓] Security Vulnerability (MHUB) [Issues] = ${mhubIssues}\n`);
    jenkinsMetrics.securityVulnerabilityMHUB = mhubIssues;

    // 5. MAX_Hub_Unit_Test -> Line Coverage
    console.log('[*] [Thao tác 10] Thu thập Unit test coverage (MAXHUB)...');
    console.log('  [*] Kiểm tra báo cáo Coverage Report của MAX_Hub_Unit_Test...');
    const hubCoverageRes = await context.request.get('http://172.16.4.215:8080/job/MAX_Hub_Unit_Test/lastSuccessfulBuild/coverage/api/json');
    const hubCoverageData = await hubCoverageRes.json().catch(() => ({}));
    const hubLineCoverage = hubCoverageData?.projectStatistics?.line ?? null;
    console.log(`  -> [✓] Unit test coverage (MAXHUB) [Line Coverage] = ${hubLineCoverage}\n`);
    jenkinsMetrics.unitTestCoverageMAXHUB = hubLineCoverage;

    console.log('[✓] Đã hoàn thành toàn bộ thao tác trên hệ thống Jenkins!\n');
    return jenkinsMetrics;

  } catch (error) {
    const currentUrl = page && !page.isClosed() ? page.url() : JENKINS_URL;
    logErrorDiagnostic('Giai đoạn 2: Thu thập metrics từ Jenkins CI/CD', currentUrl, error);
    throw error;
  } finally {
    await context.close();
  }
}

// Cho phép chạy độc lập file này để test/debug riêng Jenkins: node jenkins_service.js
if (require.main === module) {
  (async () => {
    console.log('[*] Đang chạy kiểm thử độc lập jenkins_service.js...');
    const browser = await chromium.launch({
      headless: defaultConfig.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    try {
      const results = await collectJenkinsMetrics(browser, defaultConfig);
      console.log('\n[✓] KẾT QUẢ THU THẬP JENKINS:');
      console.log(JSON.stringify(results, null, 2));
    } catch (err) {
      console.error('[X] LỖI jenkins_service:', err);
    } finally {
      await browser.close();
    }
  })();
}

module.exports = {
  collectJenkinsMetrics,
  loginJenkins,
};
