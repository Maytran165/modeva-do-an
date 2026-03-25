/**
 * BẢN MẪU — sao chép thành modeva-email-config.js và điền giá trị thật.
 *
 * ─── Template EmailJS (ví dụ nội dung) ─────────────────────────────
 * Subject: [Modeva] Mã xác minh — {{purpose}}
 *
 * Nội dung HTML hoặc text:
 *   Xin chào,
 *   Mã OTP của bạn: {{otp}}
 *   Hiệu lực 10 phút. Không chia sẻ mã này.
 *   Mục đích: {{purpose}}
 *
 * Trong tab Settings của template:
 *   To Email  → {{to_email}}
 *   From Name → Modeva (tuỳ chọn)
 *
 * Biến gửi kèm từ code (modeva-otp.js): to_email, email, otp, otp_code,
 * passcode, purpose, site_name
 * ─────────────────────────────────────────────────────────────────
 */
window.MODEVA_EMAILJS = {
  publicKey: 'YOUR_PUBLIC_KEY',
  serviceId: 'YOUR_SERVICE_ID',
  templateId: 'YOUR_TEMPLATE_ID'
};
