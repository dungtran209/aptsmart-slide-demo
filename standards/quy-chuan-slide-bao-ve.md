# Bộ Quy chuẩn Thiết kế Slide Bảo vệ Luận văn / Đề án — bản v5

> Tổng hợp từ 18 bộ slide mẫu (NEU, HVNH, FTU, MBA/EMBA) và yêu cầu trực tiếp của người dùng (cập nhật 12/10/2026).
> Mỗi đoạn chat mới chỉ cần gửi **luận văn (.docx)** là dựng được slide đúng phong cách.
> File mã đi kèm trong Project:
> - `motifs.js` – **bộ hàm khung ảnh cắt hình khối + họa tiết** (bắt buộc dùng cho phần hình ảnh/trang trí).
> - `build_slide_v5_bidv.js` – **mã mẫu chuẩn v5** (đề án BIDV Bắc Ninh, 23 slide, có ảnh thật cắt khối): dùng làm khung chính cho đề tài mới.
> - `build_slide_template.js` – mã dựng hoàn chỉnh bản v4 (BIDV Bắc Ninh): dùng lại các hàm tiện ích (bảng, biểu đồ, nhận xét, sơ đồ tổ chức…). **Dàn ý và số slide theo v5 dưới đây, không theo v4.**
> Khi quy chuẩn này mâu thuẫn với file mã, **quy chuẩn thắng**.

## 0. Quy trình cho mỗi luận văn mới
1. Đọc **toàn bộ** luận văn: mục lục, mở đầu, chương 1, mọi bảng số liệu chương 2, đánh giá, chương 3. Lấy bảng bằng python-docx (pandoc hay bỏ sót bảng gộp ô).
2. Xác định: trường, hệ (Cử nhân/Thạc sĩ/MBA/Tiến sĩ), đơn vị nghiên cứu, GVHD, học viên, năm, cấu trúc (Chương 1–2–3 hay Phần 1–2–3 của đề án).
3. Chọn bảng màu theo **logo/nhận diện của đơn vị nghiên cứu** (mục 4) và báo mã màu.
4. Dựng .pptx chỉnh sửa được bằng pptxgenjs (LAYOUT_WIDE 13.333×7.5 in), dùng `motifs.js` cho khung ảnh và họa tiết.
5. Render kiểm tra (LibreOffice → PDF → ảnh), sửa chữ tràn/đè; chạy validate.
6. Giao file + liệt kê: (a) ảnh/logo cần gửi (slide nào, khung gì, ngang/dọc); (b) placeholder cần điền; (c) số liệu mâu thuẫn trong luận văn.
7. Khi có ảnh: cắt ảnh vào đúng khung bằng `M.photo(..., {src})`.

## 1. Dàn ý (22–25 slide) — bám kết cấu luận văn: Mở đầu · Chương 1 · Chương 2 · Chương 3
| # | Slide | Nội dung & bố cục |
|---|---|---|
| 1 | **Cover** | Tên đề tài (nổi bật), đơn vị, trường, GVHD, học viên, chuyên ngành, năm. Ảnh trụ sở đơn vị cắt hình khối + dải chéo màu. |
| 2 | **Tính cấp thiết** | Lấy từ "Tính cấp thiết" của luận văn, rút gọn 3–4 ý; dòng kết **highlight tên đề tài**. Có ảnh cắt khối. |
| 3 | **Kết cấu đề án** | 3 chương: số "01/02/03" trong hình thoi + "CHƯƠNG x" + **tên chương đúng như luận văn** + 1 dòng nội dung chính; ảnh trang trí bên phải. |
| 4 | Trang chương 1 | Số chương lớn + tên chương + ảnh cắt khối. |
| 5 | **Định nghĩa & đặc điểm** | 1 slide: định nghĩa ngắn gọn (1–2 câu), đặc điểm/vai trò dạng gạch đầu dòng ngắn. |
| 6–7 | **Nội dung / chỉ tiêu đánh giá** | 1–2 slide (tùy số chỉ tiêu): gạch đầu dòng và/hoặc công thức; nếu đề tài marketing/dịch vụ thì trình bày **các mô hình** (SERVQUAL, SERVPERF, IMC…). Các chỉ tiêu này phải **tương ứng với phần thực trạng chương 2**. |
| 8 | **Nhân tố ảnh hưởng** | 1 slide, mỗi dòng theo cấu trúc **[Nhân tố]: [tóm tắt tác động 1 câu]**, chia chủ quan / khách quan. |
| (8b) | Phương pháp nghiên cứu | **Chỉ với luận án Tiến sĩ**, đặt sau cơ sở lý thuyết (quy trình, mô hình, mẫu, công cụ). |
| 9 | Trang chương 2 | |
| 10 | **Giới thiệu đơn vị** | Lịch sử hình thành, giới thiệu (text **bên trái**) · cơ cấu tổ chức (**sơ đồ bên phải**). Có thể dùng mốc thời gian (timeline) cho lịch sử. |
| 11 | **Kết quả hoạt động kinh doanh** | Bảng kết quả chung với chỉ tiêu chính: doanh thu/thu nhập, chi phí, lợi nhuận (+ biểu đồ nhỏ nếu còn chỗ) + 1–2 câu tóm tắt. |
| 12–16 | **Thực trạng** (tối đa **5 slide**) | Tương ứng từ 1.3 (hoặc 2.2) đến hết thực trạng trong luận văn. Bảng và biểu đồ; **mỗi bảng/biểu đồ có 1–2 câu tóm tắt 30–40 chữ**. Gộp các bảng có nội dung tương đương thành 1 bảng tóm tắt. |
| 17 | **Đánh giá: kết quả đạt được & hạn chế** | 1 slide, 2 khối song song. Mỗi ý ngắn, có số liệu. |
| 18 | **Nguyên nhân** | 1 slide: chủ quan / khách quan. Ghi chú hoặc đánh dấu để **liên kết sang Chương 3** (vấn đề ↔ giải pháp). |
| 20 | Trang chương 3 | |
| 21 | **Định hướng phát triển** | 1 slide tóm tắt định hướng + mục tiêu (có thể kèm bảng mục tiêu ngắn). |
| 22 | **Các giải pháp** | 1 slide tóm tắt tất cả giải pháp; mỗi giải pháp 1 dòng tên + 1 câu nội dung, có nhãn "↔ hạn chế x" để nối với chương 2. |
| 23 | **Kết luận & kiến nghị** | 1 slide: kết luận 30–50 chữ + kiến nghị (với cấp trên/hệ thống · với cơ quan quản lý). |
| 24 | **Cảm ơn** | Trang cover cuối: THANK YOU + lời cảm ơn hội đồng + GVHD/học viên; ảnh cắt khối. |

Ghi chú:
- **Đề án thạc sĩ cấu trúc Phần 1–2–3** (HVTC, HVNH…): ánh xạ Phần 1 lý luận → Chương 1; Phần 1 thực tiễn → Chương 2; Phần 2 + Phần 3 → Chương 3. Trên slide vẫn ghi nhãn "Phần" đúng như đề án. **Không làm slide căn cứ chính trị, pháp lý.**
- **Không làm** slide "Tóm tắt" và slide "Mục tiêu – đối tượng – phương pháp" riêng.
- **Trang tiêu đề chương ghi "CHƯƠNG 1/2/3" + tên chương, thống nhất với slide Kết cấu** (kể cả đề án cấu trúc Phần 1–2–3: không ghi "Phần"). Nhãn góc slide nội dung: "CHƯƠNG 2 · THỰC TRẠNG".
- **Không làm slide riêng chỉ để ảnh** (ảnh công ty/hoạt động). Ảnh chỉ dùng để trang trí cạnh text: cover, tính cấp thiết, kết cấu, trang chương, giới thiệu đơn vị, định hướng, kiến nghị, cảm ơn.
- Trang tiêu đề chương: chỉ cho Chương 1, 2, 3 (Mở đầu không có trang riêng).
- Số slide điều chỉnh trong khoảng 22–25 bằng số slide chỉ tiêu (1–2) và thực trạng (3–5).

## 2. Nguyên tắc trình bày nội dung
- **Không đánh số và không đặt tiêu đề cho sub-section** (bỏ "1.3.2.1."; trong slide không cần tiêu đề phụ đánh số). Tiêu đề slide là tên ngắn gọn. Giữ 1 nhãn nhỏ góc trên (vd "CHƯƠNG 2 · THỰC TRẠNG") để hội đồng biết vị trí.
- **Các đoạn tóm tắt: 30–50 chữ**, ngắn gọn, đủ ý, **mang tính thực tiễn cao** (có số liệu, có tên đơn vị). Tóm tắt bảng/biểu đồ: 1–2 câu, 30–40 chữ.
- Gạch đầu dòng: tối đa ~6 ý/khối, mỗi ý ≤ 2 dòng, cấu trúc "**Nhãn:** nội dung".
- **Ưu tiên bảng, nhiều text hơn (phong cách học thuật)**: mỗi slide thực trạng có 1 bảng số liệu chính (tên bảng, đơn vị, nguồn) + 1 biểu đồ phụ nhỏ hơn + đoạn tóm tắt 40–50 chữ. Không làm slide chỉ có biểu đồ.
- Cân bằng chữ – bảng – biểu đồ – sơ đồ (người dùng không thích cả 2 thái cực "toàn bảng" hoặc "toàn card/icon kiểu business"). Gợi ý trên ~24 slide: 4–5 bảng, 3–5 biểu đồ native (chỉnh sửa được), 3–4 sơ đồ (tổ chức, timeline lịch sử, mô hình, giải pháp).
- Hạn chế (chương 2) ↔ giải pháp (chương 3) phải đối ứng rõ.
- Mọi số liệu lấy đúng từ luận văn; không bịa số/trích dẫn; không tự đánh số "Hình x.y" nếu luận văn không có.

## 3. Hình ảnh, khung cắt và họa tiết (điểm nhấn thẩm mỹ)
**Nguyên tắc:** ảnh **không đặt trong khung vuông/chữ nhật trơn**. Dùng ảnh cắt theo hình khối, kết hợp viền lệch, khối màu lệch, dải chéo và họa tiết. Dùng ảnh hợp lý để slide không trống trải nhưng **không dày đặc gây rối**: slide nội dung tối đa 1 ảnh; slide bảng/biểu đồ dày có thể không có ảnh mà chỉ có họa tiết nhỏ.

Thư viện hình khối (`motifs.js` – `M.photo(slide, kind, x, y, w, h, {src|label})`):
| kind | Hình | Dùng cho (theo mẫu) |
|---|---|---|
| `hex`, `hexTall` | Lục giác ngang / dọc | Cover, trang chương, ảnh hoạt động (mẫu MB) |
| `slantR`, `slantL` | Hình bình hành nghiêng | Trang chương, banner ảnh (mẫu Hikvision, ACOCI) |
| `diamond` | Hình thoi | Ảnh hoạt động, cụm ảnh nhỏ (mẫu HVNH – BIDV) |
| `blob` | Chữ nhật bo 1 góc rất lớn | Slide nội dung có ảnh bên phải (mẫu VPBank, ACOCI) |
| `circle` | Tròn | Ảnh tròn + vòng đồng tâm + huy hiệu (mẫu SeaBank) |
| `shard`, `tab`, `arrow` | Cắt chéo góc / mũi tên | Biến thể cho trang chương, ảnh nhỏ |

**Chọn bộ khung cho từng đề tài (bắt buộc, ghi rõ khi báo màu cho người dùng):**
- Mỗi bộ slide chọn **1 hình chủ đạo + 1 hình phụ** và giữ nhất quán toàn bộ (cover, trang chương, slide nội dung). Không làm slide riêng chỉ chứa ảnh. Không trộn nhiều loại khung trong một bộ.
- Thứ tự ưu tiên khi chọn: (1) yêu cầu riêng của người dùng; (2) hình dáng logo/nhận diện đơn vị; (3) ngành.
- Theo logo: nhiều góc cạnh, ngôi sao → `hex` / `slantR` (vd MB) · tròn, mềm → `circle` / `blob` (vd SeaBank) · dạng hộp, vuông → `diamond` / `shard` (vd BIDV, HVNH) · cong, chuyển động → `blob` / `circle` (vd VPBank).
- Theo ngành: công nghệ, viễn thông → `slantR` / `shard` · xây dựng, kỹ thuật → `slantR` / `hex` · ngân hàng, tài chính → `diamond` hoặc `hex` · dịch vụ, bán lẻ, giáo dục → `circle` / `blob` · cơ quan nhà nước, địa phương → `blob` / `circle`.
- Họa tiết cũng chọn theo bộ (2–3 loại): bộ "năng động" = dải chéo + vạch "////" (+ tam giác góc); bộ "mềm mại" = vòng tròn đồng tâm + lưới chấm (+ khối lệch).

Lớp trang trí đi kèm ảnh (chọn 1–2, không dùng hết):
- `M.frame` – **viền dày lệch** cùng hình (màu nhấn) phía sau ảnh.
- `M.block` – **khối màu đặc lệch** cùng hình phía sau ảnh.
- `M.badge` – huy hiệu tròn (số chương, icon "i") đè lên mép ảnh.

Họa tiết nền (mỗi slide 1–2 loại, kích thước nhỏ, đặt ở lề/góc):
- `M.band` – **dải chéo màu** (nghiêng) ở mép phải/cover/trang chương.
- `M.dots` – lưới chấm (::::).
- `M.slashes` – vạch chéo "////" màu nhấn, đặt dưới tiêu đề hoặc góc.
- `M.rings` – vòng tròn đồng tâm nét mảnh.
- `M.corner` – tam giác góc slide (2 lớp màu chính + nhấn).

Khi **chưa có ảnh**: `M.photo` vẽ khung giữ chỗ cùng hình dạng (viền đứt, ghi chú nội dung ảnh). Người dùng có thể tự chèn ảnh trong PowerPoint: chọn khung → Format Shape → Fill → Picture. Khi người dùng gửi ảnh: Claude cắt ảnh vào khung bằng `M.photo(..., {src})`.

Ảnh cần xin người dùng: logo trường, logo đơn vị, trụ sở (cover), ảnh giao dịch/sản phẩm/nhân viên (tính cấp thiết, trang chương, giới thiệu), 2–3 ảnh công việc / hoạt động để trang trí các slide text (kết cấu, kiến nghị, định hướng). Không tự lấy ảnh trên mạng, không tự vẽ logo.

## 4. Theme theo doanh nghiệp
- Màu chủ đạo, màu nhấn, màu bảng biểu **lấy theo logo/nhận diện của đơn vị nghiên cứu** (vd BIDV: teal `006B68`, teal đậm `00474A`, vàng `F5A623`; MB: xanh `141ED4` + đỏ `C00000`; SeaBank: đỏ; VPBank: xanh lá + đỏ; TPBank: tím + cam; Hikvision/Phương Việt: đỏ + đen). Cơ quan nhà nước/địa phương: màu theo cảnh quan hoặc nhận diện cơ quan.
- Bộ token chuẩn: `teal` (chính), `dark` (chính đậm), `gold` (nhấn), `goldDeep` (chữ nhấn trên nền trắng), `tint`, `tint2`, `ink 1E2B2D`, `muted 5B6B6D`, `line CFDCDB`, `red B5462F`.
- Bảng: hàng tiêu đề nền màu chính chữ trắng; dòng nhóm nền tint; dòng tổng in đậm; viền mảnh. Biểu đồ dùng màu chính + nhấn.
- Nền trắng cho slide nội dung; cover / trang chương dùng dải chéo màu chính; slide cảm ơn có thể nền màu đậm.

## 5. Chữ và bố cục
- Font **Arial** (tránh font Việt hóa "#9Slide…" gây tràn chữ trên máy hội đồng).
- Tiêu đề slide 24–28pt đậm màu chính, 1 dòng; nhãn chương 11–12pt IN HOA màu `goldDeep`; nội dung 14–15pt (không dưới 12.5); bảng 12–13pt; nguồn/đơn vị 11pt nghiêng.
- Logo đơn vị góc trên phải mọi slide nội dung; số trang góc dưới phải.
- Bảng: "Bảng x.y. …" 13pt đậm phía trên, "Đơn vị" phải, "Nguồn" dưới. PowerPoint tôn trọng `rowH` tối thiểu → tính tổng chiều cao bảng trước khi đặt chữ bên dưới (preview LibreOffice hay nén bảng).
- Biểu đồ native: nhãn giá trị, ẩn lưới đứng, tiêu đề ngắn.

## 6. Kiểm tra trước khi giao
- Số slide 22–25; mỗi chương có trang tiêu đề; không có tiêu đề phụ đánh số.
- Tóm tắt 30–50 chữ; tóm tắt bảng 30–40 chữ.
- Không ảnh nào nằm trong khung chữ nhật trơn; không slide nào quá 1 ảnh lớn + 2 loại họa tiết.
- Rà và báo **mâu thuẫn số liệu** trong luận văn (tổng không khớp, số hiệu văn bản lệch, địa chỉ khác nhau…).
- Speaker notes 1–2 câu cho slide chính. Tên file: "Slide bao ve - <Tên học viên> - <Đơn vị>.pptx".

## 7. Lịch sử thay đổi
- v4 (01/10/2026): 26 slide, phong cách học thuật cân bằng, có trang chuyển cho 3 phần.
- v5.2 (12/10/2026): slide Kết cấu thay Tóm tắt; trang chương ghi "Chương"; ưu tiên bảng + nhiều text; bỏ slide chỉ chứa ảnh (mẫu chuẩn: build_slide_v5_bidv.js, 22 slide).
- v5.1 (12/10/2026): thêm quy tắc chọn 1 khung chủ đạo + 1 khung phụ theo logo/ngành cho từng đề tài.
- **v5 (12/10/2026):** dàn ý mới theo Mở đầu–Ch1–Ch2–Ch3 (22–25 slide); thêm slide Tóm tắt, slide Hình ảnh hoạt động; bỏ slide mục tiêu/kết cấu/căn cứ pháp lý/lộ trình; Chương 3 còn 3 slide; bỏ đánh số sub-section; tóm tắt 30–50 chữ; ảnh cắt hình khối + họa tiết (`motifs.js`).
