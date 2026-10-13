// ai.js — gọi Claude API sinh deck.json theo schema + quy chuẩn; kiểm tra (zod + quy tắc), lỗi → gọi lại 1 lần.
// Lưu ý kỹ thuật: dòng Sonnet mới bật "adaptive thinking" mặc định và không cho ép dùng tool (tool_choice) →
// yêu cầu Claude trả JSON thuần trong văn bản, rồi tự kiểm tra bằng zod. Không ghi log nội dung luận văn.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { structural, rules, MIN_SLIDES, MAX_SLIDES } = require("./rules");

const STD_DIR = path.join(__dirname, "../standards");
const read = f => fs.readFileSync(path.join(STD_DIR, f), "utf8");

function systemPrompt() {
  const standard = read("quy-chuan-slide-bao-ve.md");
  const schema = read("deck.schema.json");
  const example = process.env.INCLUDE_EXAMPLE === "0" ? null : read("example-deck.bidv.json");
  return `Bạn là chuyên gia dựng slide bảo vệ luận văn/đề án tốt nghiệp ở Việt Nam, làm việc trong ứng dụng "APTsmart Slide".
Nhiệm vụ: đọc luận văn người dùng tải lên và trả về DUY NHẤT một đối tượng JSON (deck.json) đúng schema dưới đây. Mã cố định (renderer) sẽ đọc JSON để vẽ slide — bạn chỉ lo NỘI DUNG, không lo vị trí/màu.

# Quy chuẩn bắt buộc (bản v5.2)
${standard}

# Ánh xạ dàn ý quy chuẩn → loại slide (type) trong deck.json
1 cover · 2 context (tính cấp thiết) · 3 structure (kết cấu) · 4 chapter (Chương 1) · 5 concept (khái niệm, đặc điểm, hình thức/phân loại) ·
6–7 indicatorTable (chỉ tiêu + công thức; nếu đề tài marketing/dịch vụ thì dùng text2col hoặc indicatorTable trình bày mô hình) · 8 text2col (nhân tố chủ quan/khách quan) ·
9 chapter (Chương 2) · 10 orgIntro (giới thiệu + cơ cấu tổ chức) · 11 tableChart (kết quả kinh doanh) · 12–16 tableChart (thực trạng, 3–5 slide) ·
17 assessment (kết quả đạt được / hạn chế H1…) · 18 causes (nguyên nhân chủ quan/khách quan + câu nối sang Chương 3) · 19 chapter (Chương 3) ·
20 goals (định hướng + bảng mục tiêu nếu luận văn có số mục tiêu) · 21 solutions (GP1… ↔ H…) · 22 conclusion (kết luận + kiến nghị) · 23 thanks.
Tổng số slide: ${MIN_SLIDES}–${MAX_SLIDES}. Luận án Tiến sĩ có thể thêm 1 slide text2col "Phương pháp nghiên cứu" sau nhân tố ảnh hưởng.

# Quy tắc nội dung (kiểm tra tự động, vi phạm sẽ bị trả lại)
- Chỉ dùng số liệu có trong luận văn, chép đúng định dạng số Việt Nam (dấu chấm hàng nghìn, dấu phẩy thập phân) trong bảng/văn bản. Trong chart.series.values dùng số JSON (dấu chấm thập phân, không có dấu phân cách nghìn).
- Bảng: ≤ 13 dòng, ≤ 8 cột; mỗi dòng có số ô bằng số cột tiêu đề (trừ dòng style "group" chỉ có 1 ô). Gộp các bảng tương đương thành 1 bảng tóm tắt; chọn các cột năm chính, bỏ cột +/- nếu chật.
- Mỗi tableChart: 1 bảng chính + (nên có) 1 biểu đồ phụ minh họa 1–2 chỉ tiêu then chốt + summary 30–50 chữ (đếm theo từ), có số liệu, nêu xu hướng và điểm bất thường.
- Gạch đầu dòng ≤ 6 ý/khối, mỗi ý ≤ 25 chữ, dạng {label, text} ("Nhãn: nội dung"). Không đánh số mục (bỏ "1.3.2.") trong tiêu đề.
- Tiêu đề slide ≤ 60 ký tự, 1 dòng. Nhãn (label) dạng "Chương 1 · Cơ sở lý luận", "Chương 2 · Thực trạng", "Chương 2 · Đánh giá", "Chương 3 · Giải pháp", "Mở đầu".
- Trang chapter ghi "CHƯƠNG 1/2/3" (kể cả đề án cấu trúc Phần 1–2–3, theo quy tắc ánh xạ trong quy chuẩn); tên chương ở slide structure và chapter phải thống nhất.
- Hạn chế (H1…) và giải pháp (GP1…) đối ứng rõ qua trường link.
- notes: 1–2 câu lời thuyết trình cho các slide chính.
- issues: liệt kê MỌI mâu thuẫn số liệu phát hiện được (tổng không khớp chi tiết, số liệu cùng chỉ tiêu khác nhau giữa các mục/bảng, tỷ lệ % sai, số hiệu văn bản/địa chỉ lệch…), ghi rõ vị trí và số liệu. Không có thì [].
- Ảnh: người dùng tải các ảnh có id img1, img2… (xem trong tin nhắn). Gán ảnh phù hợp nội dung: ảnh trụ sở/tập thể cho cover và thanks; ảnh giao dịch/sản phẩm cho context, orgIntro; ảnh hoạt động/nhân viên cho structure, chapter, goals, conclusion. Hạn chế lặp lại cùng 1 ảnh quá 2 lần. Không có ảnh thì bỏ trường image.
- theme: chọn mainShape/subShape theo mục 3 của quy chuẩn (ưu tiên yêu cầu người dùng → hình dáng logo đơn vị → ngành) và motif tương ứng; primary/accent là mã màu nhận diện của đơn vị (hex 6 ký tự, không #) nếu bạn nhận ra từ logo; ghi rationale 1 câu.
- meta: lấy từ trang bìa luận văn; thông tin người dùng nhập trong form được ưu tiên hơn.

# Định dạng trả lời
Chỉ trả về JSON hợp lệ (không markdown, không giải thích), bắt đầu bằng "{" và kết thúc bằng "}".

# JSON Schema của deck.json
${schema}
${example ? `
# Ví dụ deck.json hoàn chỉnh (đề án BIDV Bắc Ninh, mẫu chuẩn v5.2 — chỉ tham khảo cách trình bày, KHÔNG chép số liệu sang đề tài khác)
${example}` : ""}`;
}

async function imageBlock(p) {
  const buf = await sharp(p).rotate().flatten({ background: "#ffffff" }).resize(640, 640, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
  return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: buf.toString("base64") } };
}

function parseJson(text) {
  let s = String(text || "").trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1];
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("Không tìm thấy JSON trong phản hồi");
  return JSON.parse(s.slice(a, b + 1));
}

/**
 * @param {object} p { text, form, images:[{id,path,name}], orgLogo, schoolLogo, onProgress(pct,msg), log }
 * @returns {{deck, usage, attempts, warnings}}
 */
async function generateDeck(p) {
  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 15 * 60 * 1000, maxRetries: 2 });
  const model = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
  const maxTokens = Number(process.env.AI_MAX_TOKENS || 32000);

  const form = p.form || {};
  const formLines = Object.entries({
    "Tên học viên": form.student, "Giảng viên hướng dẫn": form.supervisor, "Trường": form.school, "Hệ đào tạo": form.degree, "Năm": form.year,
    "Màu chủ đạo (người dùng chọn)": form.primary, "Màu nhấn (người dùng chọn)": form.accent, "Khung ảnh (người dùng chọn)": form.shape,
  }).filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`).join("\n") || "- (để trống — tự lấy từ luận văn)";

  const content = [{ type: "text", text: `Thông tin người dùng nhập:\n${formLines}` }];
  if (p.orgLogo) content.push({ type: "text", text: "Logo đơn vị nghiên cứu:" }, await imageBlock(p.orgLogo));
  if (p.schoolLogo) content.push({ type: "text", text: "Logo trường:" }, await imageBlock(p.schoolLogo));
  for (const im of p.images || []) content.push({ type: "text", text: `Ảnh ${im.id} (tệp "${im.name || im.id}"):` }, await imageBlock(im.path));
  content.push({ type: "text", text: `NỘI DUNG LUẬN VĂN (đã trích xuất từ .docx; bảng ở dạng markdown, ô gộp đã được trải ra):\n\n${p.text}` });
  content.push({ type: "text", text: `Hãy trả về deck.json (${MIN_SLIDES}–${MAX_SLIDES} slide) đúng schema và quy chuẩn. Chỉ JSON.` });

  const system = [{ type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } }];
  const messages = [{ role: "user", content }];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const warnings = [];
  let last = null, lastErrors = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    p.onProgress && p.onProgress(attempt === 1 ? 25 : 55, attempt === 1 ? "Đang phân tích nội dung luận văn…" : "Đang sửa các lỗi kiểm tra…");
    const stream = client.messages.stream({ model, max_tokens: maxTokens, system, messages });
    let chars = 0;
    stream.on("text", d => { chars += d.length; if (p.onProgress && chars % 2000 < d.length) p.onProgress(Math.min(attempt === 1 ? 52 : 72, (attempt === 1 ? 28 : 58) + chars / 1500), "Đang viết nội dung slide…"); });
    const msg = await stream.finalMessage();
    const u = msg.usage || {};
    usage.input += u.input_tokens || 0; usage.output += u.output_tokens || 0;
    usage.cacheRead += u.cache_read_input_tokens || 0; usage.cacheWrite += u.cache_creation_input_tokens || 0;
    p.log && p.log(`AI attempt ${attempt}: model=${model} stop=${msg.stop_reason} in=${u.input_tokens} out=${u.output_tokens} cacheR=${u.cache_read_input_tokens || 0} cacheW=${u.cache_creation_input_tokens || 0}`);
    if (msg.stop_reason === "refusal") throw new Error("Hệ thống không xử lý được tài liệu này.");
    const text = msg.content.filter(b => b.type === "text").map(b => b.text).join("");

    let raw = null, errors = [];
    try { raw = parseJson(text); } catch (e) { errors = [`JSON không hợp lệ: ${e.message}${msg.stop_reason === "max_tokens" ? " (bị cắt do hết max_tokens — hãy viết gọn hơn)" : ""}`]; }
    if (raw) {
      const st = structural(raw);
      if (st.deck) { const r = rules(st.deck); errors = r.errors; warnings.push(...r.warnings); last = st.deck; }
      else errors = st.errors;
    }
    if (!errors.length) return { deck: last, usage, attempts: attempt, warnings, model };
    lastErrors = errors;
    p.log && p.log(`AI attempt ${attempt}: ${errors.length} lỗi kiểm tra`);
    if (attempt === 1) {
      messages.push({ role: "assistant", content: [{ type: "text", text: text || "{}" }] });
      messages.push({ role: "user", content: [{ type: "text", text: `deck.json chưa đạt kiểm tra. Lỗi:\n- ${errors.join("\n- ")}\n\nHãy sửa và trả lại TOÀN BỘ deck.json (chỉ JSON).` }] });
    }
  }
  if (last) return { deck: last, usage, attempts: 2, warnings: [...warnings, ...lastErrors.map(e => "Chưa đạt: " + e)], model, needsRepair: true };
  throw new Error("Chưa tạo được nội dung slide hợp lệ: " + lastErrors.slice(0, 3).join("; "));
}

module.exports = { generateDeck, systemPrompt, parseJson };
