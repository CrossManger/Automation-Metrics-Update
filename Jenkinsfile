pipeline {
    agent any

    parameters {
        // =========================================================================
        // THÔNG TIN XÁC THỰC (CREDENTIALS)
        // =========================================================================
        string(name: 'LIS_USERNAME', defaultValue: '', description: 'LIS Username')
        password(name: 'LIS_PASSWORD', defaultValue: '', description: 'LIS Password')
        string(name: 'JENKINS_USERNAME', defaultValue: '', description: 'Jenkins Username')
        password(name: 'JENKINS_PASSWORD', defaultValue: '', description: 'Jenkins Password')

        // =========================================================================
        // THÔNG TIN SPRINT & BỘ LỌC DỮ LIỆU (SPRINT & METRICS FILTER)
        // =========================================================================
        string(name: 'SPRINT_NAME', defaultValue: '', description: 'Sprint Name')
        string(name: 'START_DATE', defaultValue: '', description: '(YYYY-MM-DD)')
        string(name: 'END_DATE', defaultValue: '', description: '(YYYY-MM-DD)')
    }

    environment {
        HEADLESS = 'true'
        CI = 'true'
        PATH = "/home/minhvh/.nvm/versions/node/v24.20.0/bin:$HOME/.local/bin:$PATH"
    }

    stages {
        stage('1. Kiểm Tra Tính Hợp Lệ Của Tham Số (Validate Parameters)') {
            steps {
                script {
                    echo "=========================================="
                    echo "🔍 Đang kiểm tra thông tin nhập liệu..."
                    echo "=========================================="

                    def missingParams = []

                    if (!params.LIS_USERNAME?.trim()) missingParams.add("LIS_USERNAME (Tài khoản LIS)")
                    if (!params.LIS_PASSWORD?.toString()?.trim()) missingParams.add("LIS_PASSWORD (Mật khẩu LIS)")
                    if (!params.SPRINT_NAME?.trim()) missingParams.add("SPRINT_NAME (Tên Sprint)")
                    if (!params.START_DATE?.trim()) missingParams.add("START_DATE (Ngày bắt đầu)")
                    if (!params.END_DATE?.trim()) missingParams.add("END_DATE (Ngày kết thúc)")

                    if (missingParams.size() > 0) {
                        error("""
========================================================================
❌ LỖI THIẾU THÔNG TIN BẮT BUỘC!
Vui lòng điền đầy đủ các trường sau trên giao diện Build with Parameters:
- ${missingParams.join('\n- ')}
========================================================================
""")
                    }

                    echo "✅ Tất cả thông tin nhập liệu đã đầy đủ và hợp lệ."
                    echo "   - Sprint:     ${params.SPRINT_NAME}"
                    echo "   - Dải ngày:   ${params.START_DATE} -> ${params.END_DATE}"
                    echo "   - Cập nhật:   Tự động gửi sang Power Automate (Bắt buộc)"
                }
            }
        }

        stage('2. Chuẩn Bị Môi Trường Node.js & Playwright') {
            steps {
                script {
                    echo "=========================================="
                    echo "🚀 Đang thiết lập môi trường chạy Playwright trên Jenkins..."
                    echo "=========================================="

                    sh '''
                        export PATH="/home/minhvh/.nvm/versions/node/v24.20.0/bin:$PATH"

                        echo "[*] Node version: $(node -v)"
                        echo "[*] NPM version:  $(npm -v)"

                        # 1. Cài đặt các thư viện (dependencies)
                        npm install

                        # 2. Tải trình duyệt Chromium cho Playwright
                        npx playwright install chromium
                    '''
                }
            }
        }

        stage('3. Thu Thập Dữ Liệu Metrics (Scrape LIS & Jenkins)') {
            steps {
                script {
                    echo "=========================================="
                    echo "▶ [BƯỚC 1] Khởi chạy thu thập Metrics từ LIS & Jenkins..."
                    echo "User LIS:   ${params.LIS_USERNAME}"
                    echo "Sprint:     ${params.SPRINT_NAME}"
                    echo "Dải ngày:   ${params.START_DATE} -> ${params.END_DATE}"
                    echo "=========================================="

                    def jenkinsUser = params.JENKINS_USERNAME?.trim() ?: params.LIS_USERNAME
                    def jenkinsPass = params.JENKINS_PASSWORD?.toString()?.trim() ?: params.LIS_PASSWORD

                    withEnv([
                        "LIS_USERNAME=${params.LIS_USERNAME}",
                        "LIS_PASSWORD=${params.LIS_PASSWORD}",
                        "JENKINS_USERNAME=${jenkinsUser}",
                        "JENKINS_PASSWORD=${jenkinsPass}",
                        "SPRINT_NAME=${params.SPRINT_NAME}",
                        "START_DATE=${params.START_DATE}",
                        "END_DATE=${params.END_DATE}",
                        "HEADLESS=true"
                    ]) {
                        sh '''
                            export PATH="/home/minhvh/.nvm/versions/node/v24.20.0/bin:$PATH"
                            node scraper.js
                        '''
                    }

                    // Lưu trữ file kết quả làm Build Artifact
                    archiveArtifacts artifacts: 'scraped_data.json', fingerprint: true, allowEmptyArchive: false
                }
            }
        }

        stage('4. Gửi Dữ Liệu Sang Power Automate & Excel') {
            steps {
                script {
                    echo "=========================================="
                    echo "▶ [BƯỚC 2] Gửi dữ liệu Metrics sang Power Automate cập nhật Excel..."
                    echo "=========================================="

                    sh '''
                        export PATH="/home/minhvh/.nvm/versions/node/v24.20.0/bin:$PATH"
                        node main.js
                    '''
                }
            }
        }
    }

    post {
        always {
            echo "=========================================="
            echo "🏁 Kết thúc tiến trình Build trên Jenkins."
            echo "=========================================="
            // Dọn dẹp session và file tạm để đảm bảo an toàn bảo mật
            sh '''
                rm -f auth.json auth_jenkins.json
            '''
        }
        success {
            echo "✅ TỰ ĐỘNG HÓA THU THẬP VÀ CẬP NHẬT METRICS THÀNH CÔNG RỰC RỠ!"
        }
        failure {
            echo """
========================================================================
❌ TIẾN TRÌNH BUILD THẤT BẠI HOẶC DỪNG DO PHÁT HIỆN LỖI!
========================================================================
🔍 HƯỚNG DẪN KIỂM TRA & GỠ LỖI (TROUBLESHOOTING GUIDE):
1. ĐỌC KHUNG CHẨN ĐOÁN LỖI (ERROR DIAGNOSTIC):
   - Cuộn lên phần trên trong Console Output để xem khung '❌ PHÁT HIỆN LỖI THỰC THI'.
   - Khung này cung cấp chính xác: Tên bước bị lỗi, URL trình duyệt đang đứng, nguyên nhân và gợi ý khắc phục.

2. CÁC NGUYÊN NHÂN PHỔ BIẾN & CÁCH XỬ LÝ:
   • Lỗi đăng nhập (Login failed):
     -> Kiểm tra lại tham số LIS_USERNAME / LIS_PASSWORD hoặc JENKINS_USERNAME / JENKINS_PASSWORD.
   • Lỗi không tìm thấy Sprint (Sprint not found):
     -> Kiểm tra chính xác tên SPRINT_NAME (khoảng trắng, chữ hoa/thường, VD: '2026 Sep 01 Sprint').
   • Lỗi kết nối mạng hoặc Timeout:
     -> Kiểm tra đường truyền nội bộ hoặc thử chạy lại (Build) lần nữa.
   • Lỗi gửi sang Power Automate:
     -> Kiểm tra lại URL Webhook hoặc kiểm tra Request Body JSON Schema trong Power Automate.
========================================================================
"""
        }
    }
}
