# E-Commerce Website - Đồ Án Tốt Nghiệp

## 🌟 Giới thiệu

Website thương mại điện tử hiện đại được xây dựng bằng HTML, CSS và JavaScript thuần túy, áp dụng các xu hướng thiết kế 2025.

## 🎯 Tính năng chính

### 1. Trang chủ (index.html)
- Banner chào mừng
- Danh sách sản phẩm nổi bật
- Các tính năng nổi bật của website

### 2. Chi tiết sản phẩm (product-detail.html)
- ✅ Hình ảnh sản phẩm với thumbnail
- ✅ Mô tả chi tiết sản phẩm
- ✅ Giá bán, giá khuyến mãi (hiển thị % giảm giá)
- ✅ Chọn size, màu sắc
- ✅ Hiển thị tình trạng tồn kho
- ✅ Đánh giá & bình luận từ khách hàng
- ✅ Tab mô tả, thông số kỹ thuật, đánh giá
- ✅ Sản phẩm tương tự

### 3. Giỏ hàng (cart.html)
- ✅ Thêm / xóa / cập nhật số lượng sản phẩm
- ✅ Tính tổng tiền tự động
- ✅ Áp dụng mã giảm giá (WELCOME2025, FREESHIP, SALE100K)
- ✅ Chọn nhiều sản phẩm để thanh toán
- ✅ Sản phẩm đề xuất

### 4. Thanh toán (checkout.html)
- ✅ Form nhập thông tin giao hàng đầy đủ
- ✅ Chọn phương thức thanh toán:
  - COD (Thanh toán khi nhận hàng)
  - Ví điện tử MoMo
  - Ví điện tử ZaloPay
  - VNPay (Thẻ ngân hàng)
  - Chuyển khoản ngân hàng
- ✅ Chọn phương thức vận chuyển (Tiêu chuẩn, Nhanh, Miễn phí)
- ✅ Xác nhận đơn hàng
- ✅ Modal thông báo đặt hàng thành công

### 5. Trung tâm khách hàng (customer-care.html)
- ✅ Truy cập nhanh: đơn hàng, danh mục, giỏ hàng & voucher, tài khoản
- ✅ Tóm tắt chính sách giao hàng & đổi trả (đồng bộ luồng checkout / giỏ hàng)
- ✅ FAQ mở rộng bằng `<details>` (không cần JS riêng)
- ✅ Liên hệ hotline & email

### 6. Theo dõi đơn hàng (order-tracking.html)
- ✅ Xem danh sách đơn hàng
- ✅ Lọc theo trạng thái:
  - Đang xử lý
  - Đang giao
  - Đã giao
  - Đã hủy
- ✅ Timeline theo dõi chi tiết từng bước
- ✅ Thông tin vận đơn
- ✅ Chức năng: Hủy đơn, Mua lại, Đánh giá

## 🎨 Thiết kế — MODEVA 2026 (Design System)

Toàn bộ giao diện nằm trong **`css/style.css`**: base → header → trang chủ → tài khoản → catalog → giỏ/checkout/đơn hàng (legacy + modern).

- **Tokens**: biến CSS `--ink`, `--canvas`, `--accent`, `--coral`, `--navy`, spacing, shadow, radius
- **Font**: Manrope + Space Grotesk (Google Fonts, đã link trong `index.html`)
- **Responsive**: breakpoints ~1100 / 900 / 768 / 640px
- **Patch**: `.address-card__tag`, `.security-list`, ô tìm kiếm catalog trên mobile, `:has()` cho label checkbox trong form đăng nhập/hồ sơ

**Lưu ý**: Đoạn cuối file CSS **không** được thêm chữ tiếng Việt (ví dụ “thêm code vào bài”) — chỉ giữ mã CSS hợp lệ.

## 🎨 Thiết kế (tổng quan)

- **Modern & Minimalist**: Thiết kế tối giản, hiện đại
- **Responsive**: Desktop, tablet, mobile
- **Icons**: Font Awesome 6.4.0

## 📁 Cấu trúc thư mục

```
do_an_tot_nghiep/
├── index.html                 # Trang chủ
├── css/
│   └── style.css             # File CSS chính
├── js/
│   ├── main.js               # JavaScript chung
│   ├── cart.js               # JavaScript giỏ hàng
│   ├── checkout.js           # JavaScript thanh toán
│   └── order-tracking.js     # JavaScript theo dõi đơn hàng
├── pages/
│   ├── product-detail.html   # Trang chi tiết sản phẩm
│   ├── cart.html             # Trang giỏ hàng
│   ├── checkout.html         # Trang thanh toán
│   ├── customer-care.html    # Trung tâm hỗ trợ khách hàng
│   └── order-tracking.html   # Trang theo dõi đơn hàng
├── images/                   # Thư mục chứa hình ảnh
└── README.md                 # File hướng dẫn
```

## 🚀 Hướng dẫn sử dụng

## 🧩 Demo dữ liệu (ẩn danh) — khách hàng/đơn hàng/sản phẩm

Dự án lưu dữ liệu bằng **LocalStorage / SessionStorage** (front-end only). Để người chấm/test có sẵn dữ liệu **khách hàng + đơn hàng + sản phẩm** mà không lộ thông tin thật, repo có snapshot ẩn danh:

- File snapshot: `data/snapshot.anonymized.json`
- Trang import/export: `pages/data-tools.html`

### Import nhanh snapshot demo (khuyến nghị)

1. Chạy web bằng Live Server hoặc `python -m http.server`.
2. Mở `pages/data-tools.html`
3. Bấm **Import snapshot demo (trong repo)**.
4. Sau đó vào:
   - `pages/admin-dashboard.html` để xem đơn hàng/khách/sản phẩm (admin)
   - `pages/order-tracking.html` để xem đơn theo khách (demo)

### Export snapshot ẩn danh (từ dữ liệu trên máy bạn)

1. Mở `pages/data-tools.html`
2. Bấm **Export anonymized** → dữ liệu sẽ tự ẩn danh email/sđt/địa chỉ
3. Bấm **Download JSON** để lưu file snapshot

## 🔐 Lưu ý bảo mật (EmailJS OTP)

File `js/modeva-email-config.js` chứa key dịch vụ EmailJS nên **đã được đưa vào `.gitignore`** và không được đẩy lên GitHub.
Repo có file mẫu để bạn tự điền khi chạy local: `js/modeva-email-config.example.js`.

### Chạy trên Visual Studio Code (khuyến nghị)

1. **Live Server**: cài extension *Live Server* → mở thư mục `do_an_tot_nghiep` → chuột phải `index.html` → **Open with Live Server**.  
   Tránh mở file trực tiếp `file://` nếu có lỗi đường dẫn tương đối tới `pages/`, `css/`, `js/`.

2. **Python** (trong thư mục `do_an_tot_nghiep`):

```bash
python -m http.server 8080
```

Sau đó mở trình duyệt: `http://localhost:8080/index.html`

### 1. Mở website
- Mở file `index.html` bằng trình duyệt, hoặc dùng Live Server / `http.server` như trên.

### 2. Xem chi tiết sản phẩm
- Click vào sản phẩm bất kỳ hoặc nút "Mua sắm ngay"
- Chọn màu sắc và kích thước
- Điều chỉnh số lượng
- Click "Thêm vào giỏ hàng" hoặc "Mua ngay"

### 3. Quản lý giỏ hàng
- Click icon giỏ hàng ở header
- Cập nhật số lượng sản phẩm
- Nhập mã giảm giá: `WELCOME2025`, `FREESHIP`, hoặc `SALE100K`
- Click "Tiến hành thanh toán"

### 4. Thanh toán
- Điền đầy đủ thông tin giao hàng
- Chọn phương thức thanh toán
- Chọn phương thức vận chuyển
- Click "Đặt hàng"

### 5. Theo dõi đơn hàng
- Click "Xem demo" tại trang chủ hoặc menu "Theo dõi đơn hàng"
- Xem danh sách đơn hàng
- Lọc theo trạng thái
- Xem chi tiết timeline đơn hàng

## 🎁 Mã giảm giá demo

- **WELCOME2025**: Giảm 50.000₫
- **FREESHIP**: Miễn phí vận chuyển (giảm 30.000₫)
- **SALE100K**: Giảm 100.000₫ cho đơn từ 1.000.000₫

## 💻 Công nghệ sử dụng

- **HTML5**: Cấu trúc trang web
- **CSS3**: Styling và animations
  - CSS Grid & Flexbox
  - CSS Variables
  - Media Queries (Responsive)
  - Animations & Transitions
- **JavaScript**: Tương tác và xử lý logic
  - ES6+ features
  - DOM Manipulation
  - LocalStorage/SessionStorage
  - Event Handling

## 📱 Responsive Design

Website được tối ưu cho các kích thước màn hình:
- **Desktop**: ≥ 1200px
- **Laptop**: 992px - 1199px
- **Tablet**: 768px - 991px
- **Mobile**: ≤ 767px

## ✨ Điểm nổi bật

1. **UI/UX hiện đại**: Áp dụng xu hướng thiết kế 2025
2. **Performance**: Tối ưu tốc độ tải trang
3. **Accessibility**: Hỗ trợ người dùng khuyết tật
4. **Clean Code**: Code sạch, dễ đọc, có comments
5. **Scalable**: Dễ dàng mở rộng thêm tính năng

## 🔧 Tùy chỉnh

### Thay đổi màu sắc / theme MODEVA
Chỉnh các biến ở đầu `css/style.css` trong `:root` (ví dụ `--accent`, `--ink`, `--canvas`, và các biến legacy `--primary-color`, …).

### Thêm sản phẩm mới
Thêm HTML code tương tự trong file `index.html` hoặc các trang khác.

## 📝 Ghi chú

- Hình ảnh sản phẩm hiện đang sử dụng placeholder từ `placeholder.com`
- Trong dự án thực tế, thay thế bằng hình ảnh sản phẩm thật
- Tích hợp backend API để lưu trữ và xử lý dữ liệu thực

## 👨‍💻 Tác giả

Đồ án tốt nghiệp - E-Commerce Website
Created: 2025

## 📄 License

This project is for educational purposes only.

---

**Happy Coding! 🎉**