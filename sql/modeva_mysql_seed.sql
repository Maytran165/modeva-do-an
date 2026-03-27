-- Modeva — MySQL/MariaDB schema + demo data (import vào phpMyAdmin)
-- Lưu ý: Dự án gốc hiện có `sql/schema.sql` dạng PostgreSQL, nên file này là bản tương thích MySQL.
-- Cách dùng:
--   1) Tạo database mới trong phpMyAdmin (ví dụ: modeva_demo)
--   2) Chọn database đó
--   3) Import file này
--   4) (Tùy chọn API Node) Import tiếp sql/modeva_mysql_api.sql để đồng bộ đơn / đăng ký từ web

SET NAMES utf8mb4;
SET time_zone = '+00:00';

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS
  `voucher_redemptions`,
  `vouchers`,
  `order_items`,
  `order_addresses`,
  `orders`,
  `inventory_losses`,
  `inventory`,
  `product_variants`,
  `products`,
  `categories`,
  `users`;

SET FOREIGN_KEY_CHECKS = 1;

-- 1) Users / roles
CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role ENUM('admin','staff','customer') NOT NULL,
  staff_position VARCHAR(255) NULL,
  phone VARCHAR(20) NULL,
  password_hash TEXT NULL,
  password_salt TEXT NULL,
  password_kdf VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2) Product catalog
CREATE TABLE categories (
  id VARCHAR(128) NOT NULL,
  name VARCHAR(255) NOT NULL,
  parent_id VARCHAR(128) NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_categories_parent
    FOREIGN KEY (parent_id) REFERENCES categories(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE products (
  id VARCHAR(128) NOT NULL,
  name VARCHAR(255) NOT NULL,
  category_id VARCHAR(128) NULL,
  price INT UNSIGNED NOT NULL,
  sale_price INT UNSIGNED NULL,
  images_count INT UNSIGNED NOT NULL DEFAULT 0,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_products_category
    FOREIGN KEY (category_id) REFERENCES categories(id)
    ON DELETE SET NULL,
  KEY idx_products_category (category_id),
  KEY idx_products_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_variants (
  id BIGINT UNSIGNED NOT NULL,
  product_id VARCHAR(128) NOT NULL,
  size VARCHAR(64) NOT NULL,
  color VARCHAR(128) NOT NULL,
  sku VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_variants_sku (sku),
  UNIQUE KEY uq_product_variant_combo (product_id, size, color),
  KEY idx_variants_product (product_id),
  CONSTRAINT fk_product_variants_product
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3) Inventory (per variant)
CREATE TABLE inventory (
  id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  qty INT UNSIGNED NOT NULL DEFAULT 0,
  min_qty INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_inventory_variant (variant_id),
  CONSTRAINT fk_inventory_variant
    FOREIGN KEY (variant_id) REFERENCES product_variants(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4) Inventory losses / damage
CREATE TABLE inventory_losses (
  id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  qty INT UNSIGNED NOT NULL,
  reason VARCHAR(255) NOT NULL,
  noted_by BIGINT UNSIGNED NULL,
  noted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_inventory_losses_variant (variant_id),
  CONSTRAINT fk_inventory_losses_variant
    FOREIGN KEY (variant_id) REFERENCES product_variants(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_inventory_losses_noted_by
    FOREIGN KEY (noted_by) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5) Orders
CREATE TABLE orders (
  id BIGINT UNSIGNED NOT NULL,
  order_code VARCHAR(64) NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  status ENUM('processing','shipping','delivered','cancelled','completed') NOT NULL,
  subtotal INT UNSIGNED NOT NULL,
  discount INT UNSIGNED NOT NULL DEFAULT 0,
  shipping_fee INT UNSIGNED NOT NULL DEFAULT 0,
  total INT UNSIGNED NOT NULL,
  payment_method VARCHAR(64) NOT NULL,
  delivery_method VARCHAR(64) NOT NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_order_code (order_code),
  KEY idx_orders_customer (customer_id),
  KEY idx_orders_status (status),
  CONSTRAINT fk_orders_customer
    FOREIGN KEY (customer_id) REFERENCES users(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6) Order address (snapshot per order)
CREATE TABLE order_addresses (
  order_id BIGINT UNSIGNED NOT NULL,
  province VARCHAR(128) NOT NULL,
  district VARCHAR(128) NOT NULL,
  ward VARCHAR(128) NOT NULL,
  address VARCHAR(255) NOT NULL,
  PRIMARY KEY (order_id),
  CONSTRAINT fk_order_addresses_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7) Order items (snapshot price at time of purchase)
CREATE TABLE order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id VARCHAR(128) NULL,
  variant_id BIGINT UNSIGNED NULL,
  product_name VARCHAR(255) NOT NULL,
  variant_text TEXT NULL,
  qty INT UNSIGNED NOT NULL,
  unit_price INT UNSIGNED NOT NULL,
  line_total INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_order_items_order (order_id),
  CONSTRAINT fk_order_items_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_order_items_variant
    FOREIGN KEY (variant_id) REFERENCES product_variants(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8) Vouchers (one-time usage per customer)
CREATE TABLE vouchers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  percent INT UNSIGNED NOT NULL,
  max_discount INT UNSIGNED NOT NULL DEFAULT 0,
  min_order INT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vouchers_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE voucher_redemptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  voucher_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NULL,
  redeemed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_voucher_customer_once (voucher_id, customer_id),
  CONSTRAINT fk_voucher_redemptions_voucher
    FOREIGN KEY (voucher_id) REFERENCES vouchers(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_voucher_redemptions_customer
    FOREIGN KEY (customer_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_voucher_redemptions_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- Seed data (demo)
-- =========================

-- Users
INSERT INTO users (id, email, full_name, role, staff_position, phone, password_hash, password_salt, password_kdf)
VALUES
  (1, 'admin@modeva.vn', 'Quản trị viên', 'admin', NULL, NULL,
   '48724d2be291209747f932bb6046b979eceec14e569403cff13add133c3c0c2f', NULL, NULL),
  (2, 'staff@modeva.vn', 'Nhân viên bán hàng', 'staff', 'sales', NULL,
   'da978c74838a8ff795dfca7a90cda5a14bff4b584e7f8949ca89daa7c28cf421', NULL, NULL),
  (3, 'customer@modeva.vn', 'Khách hàng demo', 'customer', NULL, NULL,
   '2e11ed22e46082ed33cd5f7a83a9bf30d8fd31ebf5f07b9ca0d4a0235875f2d5', NULL, NULL),
  (4, 'minh@email.com', 'Lê Minh', 'customer', NULL, '0912345678', NULL, NULL, NULL),
  (5, 'ha@email.com', 'Phạm Hà', 'customer', NULL, '0987654321', NULL, NULL, NULL),
  (6, 'an@email.com', 'VIP — Trần An', 'customer', NULL, '0909090909', NULL, NULL, NULL),
  (7, 'kiet@email.com', 'Đỗ Kiệt', 'customer', NULL, '0933444555', NULL, NULL, NULL);

-- Categories
INSERT INTO categories (id, name, parent_id)
VALUES
  ('nam', 'Thời trang Nam', NULL),
  ('nam-ao', 'Áo nam', 'nam'),
  ('nam-quan', 'Quần nam', 'nam'),
  ('nu', 'Thời trang Nữ', NULL),
  ('nu-ao', 'Áo nữ', 'nu'),
  ('nu-vay', 'Váy', 'nu'),
  ('tre', 'Trẻ em', NULL),
  ('tre-be-trai', 'Bé trai', 'tre'),
  ('tre-be-gai', 'Bé gái', 'tre');

-- Products
INSERT INTO products (id, name, category_id, price, sale_price, images_count, is_deleted)
VALUES
  ('p1', 'Áo sơ mi linen', 'nam-ao', 890000, 690000, 3, 0),
  ('p2', 'Quần tây slim', 'nam-quan', 1190000, NULL, 4, 0),
  ('p3', 'Váy midi lụa', 'nu-vay', 1590000, 1290000, 5, 0);

-- Product variants + SKUs (từ inventory demo)
INSERT INTO product_variants (id, product_id, size, color, sku)
VALUES
  (1, 'p1', 'S', 'Trắng', 'P1-S-TR'),
  (2, 'p1', 'M', 'Be', 'P1-M-BE'),
  (3, 'p2', '32', 'Đen', 'P2-32-DEN'),
  (4, 'p3', 'S', 'Hồng', 'P3-S-HONG');

-- Inventory
INSERT INTO inventory (id, variant_id, qty, min_qty)
VALUES
  (1, 1, 24, 5),
  (2, 2, 3, 5),
  (3, 3, 0, 4),
  (4, 4, 18, 6);

-- Orders
INSERT INTO orders
  (id, order_code, customer_id, status, subtotal, discount, shipping_fee, total, payment_method, delivery_method, note)
VALUES
  (1, 'DH24001', 4, 'processing', 1750000, 0, 30000, 1780000, 'cod', 'standard', NULL),
  (2, 'DH24002', 5, 'shipping',   1260000, 0, 30000, 1290000, 'cod', 'standard', NULL),
  (3, 'DH24003', 6, 'completed',  4470000, 0, 30000, 4500000, 'cod', 'standard', NULL),
  (4, 'DH24004', 7, 'cancelled',  530000,  0, 30000, 560000,  'cod', 'standard', NULL);

-- Order addresses
INSERT INTO order_addresses (order_id, province, district, ward, address)
VALUES
  (1, 'Hà Nội', 'Cầu Giấy', 'Phường 1', '12 Nguyễn Văn Huyên'),
  (2, 'TP.HCM', 'Quận 1', 'Bến Nghé', '88 Lê Lợi, tầng 3'),
  (3, 'Đà Nẵng', 'Hải Châu', 'Thạch Thang', '5 Trần Phú'),
  (4, 'Hà Nội', 'Đống Đa', 'Văn Miếu', 'Ngõ nhỏ — không giao được');

-- Order items (snapshot)
INSERT INTO order_items (order_id, product_id, variant_id, product_name, variant_text, qty, unit_price, line_total)
VALUES
  (1, 'p1', NULL, 'Áo sơ mi linen', 'M · Trắng', 1, 690000, 690000),
  (1, 'p2', 3,    'Quần tây slim',  '32 · Đen',   1, 1090000, 1090000),
  (2, 'p3', 4,    'Váy midi lụa',    'S · Hồng',    1, 1290000, 1290000),
  (3, 'p1', NULL, 'Áo sơ mi linen', 'L',             2, 690000, 1380000),
  (3, 'p2', NULL, 'Quần tây slim',  '34 · Navy',    1, 1190000, 1190000),
  (4, NULL, NULL, 'Phụ kiện',        '',              1, 530000, 530000);

-- Vouchers (Welcome)
INSERT INTO vouchers (id, code, percent, max_discount, min_order, is_active, expires_at)
VALUES
  (1, 'WELCOME15', 15, 200000, 1000000, 1, NULL),
  (2, 'WELCOME30', 30, 500000, 5000000, 1, NULL);

-- (Không seed voucher_redemptions, inventory_losses vì bản demo hiện để rỗng)

