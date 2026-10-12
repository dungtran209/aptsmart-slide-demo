# APTsmart Slide – web demo tạo slide bảo vệ luận văn

Trang web 1 trang (tiếng Việt): người dùng tải **luận văn/đề án .docx**, logo trường, logo đơn vị và 3–8 ảnh đơn vị → hệ thống gọi **Claude API** đọc luận văn và sinh nội dung có cấu trúc (`deck.json`) theo **Quy chuẩn slide bảo vệ v5.2** → mã dựng cố định (pptxgenjs) vẽ 22–25 slide → **LibreOffice** xuất PDF → người dùng tải **PDF** và **PPTX** (chỉnh sửa được), kèm danh sách **số liệu mâu thuẫn** phát hiện trong luận văn.

```
Trình duyệt ──upload──▶ Express (Node 20)
                          1. docx → văn bản + bảng (mammoth, trải ô gộp)
                          2. Claude API: system = quy chuẩn v5.2 + JSON Schema + deck mẫu → deck.json
                          3. Kiểm tra zod + quy tắc quy chuẩn; lỗi → gọi lại 1 lần kèm danh sách lỗi
                          4. Renderer (pptxgenjs + motifs.js) → .pptx   (màu lấy từ logo đơn vị)
                          5. LibreOffice headless → .pdf
                          └─▶ link tải (file tự xóa sau FILE_TTL_MIN phút)
```

Claude **chỉ sinh nội dung (JSON)**; bố cục, màu, khung ảnh do mã cố định đảm nhiệm → slide luôn đúng thiết kế, chi phí thấp, cập nhật quy chuẩn dễ.

---

## 1. Cấu trúc mã nguồn

| Đường dẫn | Vai trò |
|---|---|
| `standards/quy-chuan-slide-bao-ve.md` | Bản sao quy chuẩn v5.2 — **nguồn duy nhất** gửi cho Claude khi chạy |
| `standards/deck.schema.json` | JSON Schema các loại slide (sinh tự động từ `src/schema.js` bằng `npm run schema`) |
| `standards/example-deck.bidv.json` | Deck mẫu chuẩn (đề án BIDV Bắc Ninh, 22 slide) — ví dụ cho Claude + dữ liệu kiểm thử renderer |
| `src/server.js` | Express: upload, hàng đợi job (xử lý tuần tự 1 job/lần), mật khẩu, giới hạn lượt/ngày, tải file, tự xóa file |
| `src/extract.js` | `.docx` → văn bản + bảng markdown (bỏ mục lục, lời cam đoan, tài liệu tham khảo, phiếu khảo sát trống) |
| `src/ai.js` | Gọi Anthropic SDK (stream), gửi kèm ảnh/logo thu nhỏ để Claude gán ảnh hợp lý, kiểm tra + gọi lại 1 lần, ghi số token vào log |
| `src/mock.js` | **Chế độ giả lập** (khi chưa có API key): dựng deck bằng quy tắc từ văn bản + bảng của luận văn, tự dò "tổng ≠ tổng chi tiết" |
| `src/schema.js`, `src/rules.js` | Schema zod (cấu trúc) + kiểm tra quy chuẩn (22–25 slide, 3 trang chương, tóm tắt ≤ 50 chữ, ≤ 6 ý/khối, bảng ≤ 13 dòng…) + tự sửa nhẹ |
| `src/render/renderer.js` | `deck.json` → `.pptx`; tổng quát hóa từ `build_slide_v5_bidv.js` (tự co chữ, tự tính chiều cao bảng, chọn bố cục bảng–biểu đồ) |
| `src/render/motifs.js` | Khung ảnh cắt hình khối + họa tiết (bản sao từ Project) |
| `src/render/theme.js` | Lấy màu chủ đạo/màu nhấn từ logo đơn vị (sharp), sinh bộ token màu, đảm bảo tương phản |
| `src/pdf.js` | `soffice --headless --convert-to pdf` |
| `public/` | Giao diện (HTML/CSS/JS thuần, responsive) |
| `scripts/render-example.js` | Dựng deck mẫu → PPTX/PDF để kiểm tra renderer |
| `test/e2e.js`, `test/fake-anthropic.js` | Kiểm thử đầu-cuối qua HTTP; máy chủ Anthropic giả lập để thử đường gọi API không tốn tiền |
| `Dockerfile`, `render.yaml` | Đóng gói 1 dịch vụ Docker (Node 20 + LibreOffice + font) và khai báo dịch vụ Render |

---

## 2. Biến môi trường

Mọi thông tin tài khoản nằm trong biến môi trường (không có trong mã) → chuyển sang tài khoản doanh nghiệp chỉ cần thay biến.

| Biến | Ý nghĩa | Demo |
|---|---|---|
| `ANTHROPIC_API_KEY` | API key (workspace `aptsmart-slide-demo`). **Để trống = chế độ giả lập** | key cá nhân |
| `CLAUDE_MODEL` | Model sinh nội dung | `claude-sonnet-5-5` |
| `ACCESS_PASSWORD` | Mật khẩu truy cập trang | tự đặt |
| `DAILY_LIMIT` | Số lượt tối đa/ngày toàn app (reset 0h giờ VN) | `10` |
| `MAX_UPLOAD_MB` | Dung lượng tối đa mỗi lần tải lên | `30` |
| `FILE_TTL_MIN` | Thời gian giữ file trước khi xóa | `60` |

Tùy chọn nâng cao xem `.env.example` (`AI_MODE=mock`, `AI_MAX_TOKENS`, `MIN_IMAGES`/`MAX_IMAGES`, `MIN_SLIDES`/`MAX_SLIDES`, `INCLUDE_EXAMPLE`, `PHOTO_DPI`…).

---

## 3. Chạy trên máy (tùy chọn)

Cần Node ≥ 20 và LibreOffice (`soffice` trong PATH; Windows/macOS có thể đặt `SOFFICE_PATH`).

```bash
npm install
cp .env.example .env          # điền ANTHROPIC_API_KEY, ACCESS_PASSWORD
npm run start:local           # http://localhost:3000
npm run dev                   # chế độ giả lập, không cần API key
```

Hoặc bằng Docker (giống hệt môi trường Render):

```bash
docker build -t aptsmart-slide .
docker run --rm -p 3000:10000 --env-file .env aptsmart-slide
```

Kiểm thử:

```bash
npm run render:example -- <thu_muc_anh> <logo_don_vi.png> <logo_truong.png> out   # dựng deck mẫu BIDV
BASE_URL=http://localhost:3000 ACCESS_PASSWORD=... node test/e2e.js luan_van.docx <thu_muc_anh> logo_don_vi.png logo_truong.png out-e2e
```

---

## 4. Đưa mã lên GitHub (repo Private `aptsmart-slide-demo`)

**Cách A – trên web (đơn giản):**
1. github.com → **New repository** → tên `aptsmart-slide-demo` → chọn **Private** → Create.
2. Trong repo trống: **uploading an existing file** (hoặc *Add file → Upload files*).
3. Giải nén file .zip, mở thư mục `aptsmart-slide-demo`, **chọn toàn bộ nội dung bên trong** (kể cả `.gitignore`, `.dockerignore`, `.env.example` – trên macOS bấm `Cmd+Shift+.` để hiện file ẩn) rồi kéo thả vào trang → **Commit changes**.
   - Kiểm tra trên GitHub thấy `Dockerfile`, `package.json`, `package-lock.json` nằm ngay ở thư mục gốc repo (không lồng thêm 1 cấp thư mục).
   - **Không** tải lên file `.env` hoặc API key.

**Cách B – GitHub Desktop:** File → Add local repository → chọn thư mục đã giải nén → Publish repository (tích *Keep this code private*).

---

## 5. Deploy lên Render

1. render.com → đăng nhập bằng GitHub → **New → Web Service** → chọn repo `aptsmart-slide-demo` (lần đầu cần *Configure account* để cấp quyền repo Private).
2. Thiết lập:
   - **Runtime / Language:** `Docker` (Render tự đọc `Dockerfile`)
   - **Region:** Singapore (gần Việt Nam)
   - **Instance type:** `Free` để thử; nếu xuất PDF lỗi/dịch vụ tự khởi động lại do thiếu RAM → đổi **Starter**.
   - **Health Check Path** (mục Advanced): `/healthz`
3. **Environment Variables:** thêm `ANTHROPIC_API_KEY`, `ACCESS_PASSWORD`, `CLAUDE_MODEL=claude-sonnet-5-5`, `DAILY_LIMIT=10`, `MAX_UPLOAD_MB=30`, `FILE_TTL_MIN=60`. (`PORT` do Render tự cấp, không cần đặt.)
4. **Create Web Service** → chờ build (lần đầu ~5–10 phút vì cài LibreOffice) → log hiện `APTsmart Slide chạy tại …`.
5. Mở `https://<tên>.onrender.com` → nhập mật khẩu → chạy thử 1 đề án → kiểm tra PDF/PPTX.

> Có thể dùng **New → Blueprint** và chọn repo: Render đọc `render.yaml` và hỏi giá trị cho `ANTHROPIC_API_KEY`, `ACCESS_PASSWORD`.

**Lưu ý gói Free:** dịch vụ "ngủ" sau 15 phút không dùng (lần mở đầu chờ ~1 phút); khi ngủ/khởi động lại, job đang chạy và bộ đếm lượt/ngày (lưu ở `/tmp`) bị xóa. Gói Starter không ngủ.

**Mỗi lần push lên GitHub, Render tự deploy lại** (autoDeploy).

---

## 6. Bảo mật & chi phí

- Mật khẩu truy cập (so sánh an toàn thời gian; sai 10 lần/15 phút → khóa IP tạm thời) + giới hạn lượt/ngày + giới hạn hàng đợi 5 job.
- **Đặt giới hạn chi tiêu (spend limit) cho workspace `aptsmart-slide-demo` trong Anthropic Console** — lớp bảo vệ cuối cùng.
- Không ghi log nội dung luận văn; file đầu vào xóa ngay sau khi dựng xong, file kết quả xóa sau `FILE_TTL_MIN`; trang hiển thị thông báo quyền riêng tư.
- Kiểm tra đuôi file + "magic bytes" (docx/png/jpg), giới hạn dung lượng, số ảnh; ảnh được nén (≤ 1600 px, JPEG) trước khi đưa vào PPTX.
- Mỗi job ghi số token vào log Render, ví dụ: `job … tokens: in=118000 out=11000 cacheRead=0 cacheWrite=31000`. Ước tính ban đầu 0,3–0,8 USD/lượt (Sonnet); đo thực tế từ log/Console. `INCLUDE_EXAMPLE=0` bớt ~12k token đầu vào nếu cần tiết kiệm.

---

## 7. Cập nhật quy chuẩn sau này

1. Sửa quy chuẩn trong Project claude.ai.
2. Dán cùng nội dung vào `standards/quy-chuan-slide-bao-ve.md` (GitHub web: mở file → ✏️ Edit → Commit).
3. Nếu thêm/đổi **loại slide** hoặc trường dữ liệu: sửa `src/schema.js` → `npm run schema` → sửa `src/render/renderer.js` (và `standards/example-deck.bidv.json` nếu cần).
4. Push → Render tự deploy lại.

---

## 8. Chuyển sang tài khoản doanh nghiệp

- **GitHub:** Settings của repo → *Transfer ownership* sang organization công ty (Render cần được cấp quyền lại cho org).
- **Anthropic:** tạo workspace + API key ở Console công ty (đặt spend limit) → thay `ANTHROPIC_API_KEY` trên Render (hoặc tạo dịch vụ Render mới dưới tài khoản công ty).
- **claude.ai:** tạo Project mới ở tài khoản doanh nghiệp, tải lại các file trong Project hiện tại.
- Xóa API key cá nhân sau khi chuyển xong.

---

## 9. Chế độ giả lập & giới hạn hiện tại

- Không có `ANTHROPIC_API_KEY` (hoặc `AI_MODE=mock`) → trang hiện nhãn **"Chế độ giả lập"**: nội dung được cắt trực tiếp từ luận văn bằng quy tắc (số liệu bảng đúng, câu chữ chưa được tóm tắt). Dùng để kiểm tra luồng upload → PPTX → PDF trước khi nạp tiền API.
- Ngoài phạm vi demo: đăng nhập nhiều người dùng, thanh toán, lưu lịch sử, chỉnh sửa slide trên web, đầu vào PDF (chỉ nhận .docx).
- Hàng đợi và bộ đếm nằm trong bộ nhớ/`/tmp` (1 instance). Nếu chạy nhiều instance cần chuyển sang Redis/DB.

## 10. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| "Không xuất được PDF" (vẫn tải được PPTX) | Thiếu RAM trên gói Free → nâng Starter; hoặc tăng `PDF_TIMEOUT_MS` |
| Lỗi 401 khi tạo slide | Sai `ACCESS_PASSWORD`; tải lại trang, nhập lại |
| "Đã hết N lượt hôm nay" | Tăng `DAILY_LIMIT` hoặc chờ sang ngày (giờ VN) |
| Claude trả JSON lỗi 2 lần | Xem log Render (`AI attempt …`); thử lại; nếu luận văn quá dài có thể tăng `AI_MAX_TOKENS` |
| Chữ PDF hơi khác PowerPoint | PDF dùng Liberation Sans thay Arial (cùng kích thước); bản PPTX mở bằng PowerPoint dùng Arial thật |
