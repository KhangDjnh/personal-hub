# Hub Cá Nhân (Personal File Hub)

Web Hub cá nhân lưu trữ file trực tiếp vào thư mục Google Drive (`17p6bKfYSoXevyRjzcH90COqLO0U1wURF`), bảo vệ hoàn toàn bằng đăng nhập `username` + `password`, triển khai **miễn phí 0đ** trên **Cloudflare Workers** (không cần thẻ tín dụng, không ngủ đông).

## Tính năng chính
- **Xác thực bắt buộc:** Toàn bộ API `/api/files/*` bị khóa cho đến khi đăng nhập thành công (`HttpOnly; SameSite=Lax` JWT cookie). Có chống dò mật khẩu (khóa 15 phút sau 5 lần nhập sai theo IP).
- **Upload file lớn trực tiếp lên Google Drive:** Trình duyệt đẩy file thẳng lên Google Drive qua Resumable Upload Session URI (chia chunk 16 MiB), vượt qua giới hạn body của serverless và hiển thị tiến trình `%` chính xác.
- **Download streaming & bảo vệ thư mục gốc:** Server stream file trực tiếp từ Google Drive về trình duyệt và luôn kiểm tra file phải nằm bên trong thư mục gốc của Hub.
- **Quản lý tiện lợi:** Duyệt & tạo thư mục con, tìm kiếm theo tên, sắp xếp, đổi tên, xóa vào thùng rác, xem trước ảnh/PDF/audio/video/text, hỗ trợ giao diện Sáng/Tối.

---

## Hướng dẫn Cài đặt & Deploy Miễn phí

### Bước 1: Tạo OAuth Client trên Google Cloud Console (làm 1 lần)
1. Truy cập [Google Cloud Console](https://console.cloud.google.com/), tạo hoặc chọn 1 Project.
2. Vào **APIs & Services → Library**, tìm và bấm **Enable** cho **Google Drive API**.
3. Vào **APIs & Services → OAuth consent screen**:
   - Chọn **External** → điền tên app & email của bạn.
   - **RẤT QUAN TRỌNG:** Tại mục *Publishing status*, bấm **Publish App** (chuyển sang **In production**) để Refresh Token không bị hết hạn sau 7 ngày. *(App cá nhân chỉ tự bạn đăng nhập 1 lần nên không cần qua bước xác minh public của Google).*
4. Vào **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Tại **Authorized redirect URIs**, thêm đúng dòng:
     ```
     http://127.0.0.1:43210/callback
     ```
   - Lưu lại `Client ID` và `Client Secret`.

### Bước 2: Lấy Google Refresh Token & Tạo Hash Mật khẩu
Mở terminal tại thư mục `d:\web\hub-ca-nhan`:

1. Tạo file `.dev.vars` từ `.dev.vars.example`:
   ```powershell
   Copy-Item .dev.vars.example .dev.vars
   ```
2. Chạy script tạo và tự động lưu `AUTH_USERNAME`, `AUTH_PEPPER`, `AUTH_PASSWORD_HASH`, `JWT_SECRET` vào `.dev.vars`:
   ```powershell
   npm run hash-password
   ```
3. Điền `GOOGLE_CLIENT_ID` và `GOOGLE_CLIENT_SECRET` vào `.dev.vars` (hoặc nhập trực tiếp khi chạy script), sau đó chạy script lấy và tự động lưu `GOOGLE_REFRESH_TOKEN` vào `.dev.vars`:
   ```powershell
   npm run get-google-token
   ```
   *(Khi trình duyệt mở màn hình cảnh báo "Google hasn't verified this app", chọn **Advanced → Go to ... (unsafe)** và cấp quyền Drive cho chính tài khoản chứa thư mục `17p6bKfYSoXevyRjzcH90COqLO0U1wURF`).*

### Bước 3: Chạy thử ở Local
```powershell
npm run dev
```
Mở `http://localhost:5173`, đăng nhập bằng tài khoản vừa tạo ở Bước 2 để kiểm tra upload / download / xóa file.

### Bước 4: Deploy Miễn phí lên Cloudflare Workers (Không cần thẻ)
1. Đăng nhập Wrangler (tự mở trình duyệt kết nối tài khoản Cloudflare miễn phí):
   ```powershell
   npx wrangler login
   ```
2. Tạo KV Namespace miễn phí để cache Access Token & lưu bộ đếm chống brute-force:
   ```powershell
   npx wrangler kv namespace create HUB_KV
   ```
   Copy `id` vừa nhận được dán vào `kv_namespaces[0].id` trong file `wrangler.jsonc`.
3. Nạp các Secrets lên Cloudflare Workers (copy đúng các giá trị từ `.dev.vars`):
   ```powershell
   npx wrangler secret put AUTH_USERNAME
   npx wrangler secret put AUTH_PEPPER
   npx wrangler secret put AUTH_PASSWORD_HASH
   npx wrangler secret put JWT_SECRET
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put GOOGLE_REFRESH_TOKEN
   ```
4. Build và Deploy:
   ```powershell
   npm run deploy
   ```
   Sau vài giây, Wrangler sẽ in ra địa chỉ Web Hub cá nhân của bạn (`https://hub-ca-nhan.<subdomain>.workers.dev`).

---

## Kiến trúc mở rộng (Option 2: Cloudflare R2)
Toàn bộ thao tác kho lưu trữ được trừu tượng hóa qua interface `StorageProvider` tại `src/server/services/storage/types.ts`. Nếu sau này muốn chuyển sang **Cloudflare R2** (10 GB miễn phí, cần thẻ để mở khóa R2), bạn chỉ cần cài đặt adapter `r2.ts` theo interface này và bind `R2Bucket` trong `wrangler.jsonc`.

