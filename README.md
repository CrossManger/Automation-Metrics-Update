# Tự Động Hóa Thu Thập Metrics (LIS & Jenkins) Lên SharePoint Excel

Dự án tự động hóa thu thập 10 chỉ số đo lường hiệu quả (Metrics) từ hai hệ thống **LIS (Easy Redmine)** và **Jenkins CI/CD**, sau đó tự động đẩy dữ liệu sang **Power Automate Webhook** để cập nhật trực tiếp vào file **SharePoint Excel**.

Hệ thống được thiết kế dạng module hóa, hỗ trợ chạy trực tiếp trên máy trạm lập trình hoặc triển khai tập trung trên **Jenkins Pipeline**.

---

## 1. Danh Sách Các Chỉ Số Tự Động Thu Thập

| STT | Tên Chỉ Số (Metric) | Nguồn Dữ Liệu | Cách Thức Thu Thập |
| :---: | :--- | :--- | :--- |
| **1** | `reworkEffortHoursValue` | LIS (Sprint Task) | Lọc Spent Time với Activity = `Re-work` |
| **2** | `effortToImplementIRValue` | LIS (Time Entries) | Lọc Tracker = `Improvement Request` trong dải ngày Sprint |
| **3** | `totalSpendEffortValue` | LIS (Sprint Subtasks) | Công thức Excel tổng giờ: `WORK ITEMS` + `SCRUM EVENTS` + `RELEASE` |
| **4** | `totalTechnicalDebtEffortValue`| LIS (Sprint Subtasks) | Tổng số giờ trên task `TECHNICAL DEBT` |
| **5** | `numberOfInternalBugsValue` | LIS (Project Issues) | Đếm toàn bộ task có Tracker = `Defect / Bug` trong Sprint |
| **6** | `unitTestCoverageFE` | Jenkins (`MAX_Frontend_Unit_Test`) | Báo cáo Jest Coverage -> Tỷ lệ `Branches` |
| **7** | `unitTestCoverageBE` | Jenkins (`MAX_Go_Services_BE_Unit_Test`) | Artifact `coverage_summary.txt` -> `Overall Coverage` |
| **8** | `unitTestCoverageMAXHUB` | Jenkins (`MAX_Hub_Unit_Test`) | Báo cáo Coverage API -> Tỷ lệ `Line` |
| **9** | `securityVulnerabilityBE` | Jenkins (`MAX_GoSec_Test`) | Báo cáo `security-report.html` -> `Total Issues` |
| **10**| `securityVulnerabilityMHUB` | Jenkins (`MAX HUB Security`) | Báo cáo Brakeman API -> Tổng số issues |

---

## 2. Kiến Trúc Mã Nguồn

```text
Auto_Collect_Metrics/
├── Jenkinsfile           # Pipeline Jenkins CI/CD hoàn chỉnh (Build with Parameters)
├── config.js             # Cấu hình tập trung (hỗ trợ cả config.json và biến môi trường Jenkins)
├── utils.js              # Tiện ích: safeGoto (retry mạng), fillDateFilterRange, in báo cáo tổng hợp
├── lis_service.js        # Module thu thập 5 chỉ số từ LIS (hỗ trợ test độc lập)
├── jenkins_service.js    # Module thu thập 5 chỉ số từ Jenkins (hỗ trợ test độc lập)
├── scraper.js            # File điều phối chính (Orchestrator) kết hợp LIS + Jenkins
├── main.js               # Cầu nối gửi kết quả sang Power Automate Webhook
├── scraped_data.json     # File lưu trữ dữ liệu sau khi thu thập
└── package.json          # Quản lý dependencies và npm scripts
```

---

## 3. Hướng Dẫn Vận Hành Trên Jenkins CI/CD

### Bước 1: Tạo Pipeline Job trên Jenkins
1. Đăng nhập vào Jenkins (`http://172.16.4.215:8080/` hoặc server Jenkins nội bộ).
2. Chọn **New Item** $\rightarrow$ Đặt tên Job (VD: `Auto.Collect.Metrics.MAX`).
3. Chọn kiểu **Pipeline** $\rightarrow$ Nhấn **OK**.

### Bước 2: Thiết Lập Cấu Hình SCM
1. Trong trang cấu hình của Job, cuộn xuống mục **Pipeline**:
   - **Definition**: Chọn `Pipeline script from SCM`
   - **SCM**: Chọn `Git`
   - **Repository URL**: Nhập URL kho chứa Git của dự án
   - **Branch Specifier**: `*/main` (hoặc branch chứa code)
   - **Script Path**: `Jenkinsfile`
2. Nhấn **Save**.

### Bước 3: Nạp Tham Số & Chạy Lần Đầu
1. Nhấn **Build Now** một lần để Jenkins đọc `Jenkinsfile` và đăng ký các tham số vào hệ thống.
2. Tải lại trang (F5) $\rightarrow$ Nút **Build Now** sẽ chuyển thành **Build with Parameters**.
3. Điền các tham số:
   - `LIS_USERNAME`: Tài khoản LIS
   - `LIS_PASSWORD`: Mật khẩu LIS
   - `SPRINT_NAME`: Tên Sprint (VD: `2026 Sep 01 Sprint`)
   - `START_DATE`: Ngày bắt đầu Sprint (VD: `2026-08-04`)
   - `END_DATE`: Ngày kết thúc Sprint (VD: `2026-08-17`)
4. Nhấn **Build** để khởi chạy tiến trình (hệ thống sẽ tự động cào và gửi kết quả lên Excel).

---

## 4. Chạy Trực Tiếp Dưới Máy Local (Terminal)

```bash
# 1. Thu thập toàn bộ metrics từ LIS và Jenkins (chế độ chạy ngầm)
npm start
# hoặc: node scraper.js

# 2. Nếu muốn mở giao diện trình duyệt để quan sát:
HEADLESS=false node scraper.js

# 3. Gửi dữ liệu đã cào lên Power Automate:
npm run send
# hoặc: node main.js

# 4. Kiểm thử độc lập từng dịch vụ:
npm run scrape:lis       # Chỉ cào LIS
npm run scrape:jenkins   # Chỉ cào Jenkins
```
