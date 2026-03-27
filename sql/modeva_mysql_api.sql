-- Modeva — Bổ sung schema để API Node đồng bộ đơn hàng / đăng ký khách
-- Chạy SAU khi đã import modeva_mysql_seed.sql
-- Trên phpMyAdmin: chọn database → SQL → dán từng khối; nếu báo lỗi "Duplicate column" thì bỏ qua dòng tương ứng.

SET NAMES utf8mb4;

-- Cho phép thêm user / đơn mới từ API (id tự tăng)
ALTER TABLE users MODIFY id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE orders MODIFY id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT;

-- Khách bị admin reset (xóa mềm) — ẩn khỏi hoạt động, dữ liệu lịch sử có thể giữ
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER created_at;

-- Trạng thái thanh toán tách khỏi trạng thái giao hàng
ALTER TABLE orders ADD COLUMN payment_status VARCHAR(32) NULL DEFAULT NULL COMMENT 'pending|paid' AFTER status;

ALTER TABLE orders ADD COLUMN paid_at TIMESTAMP NULL DEFAULT NULL AFTER payment_status;

ALTER TABLE orders ADD COLUMN voucher_code VARCHAR(64) NULL DEFAULT NULL AFTER note;
