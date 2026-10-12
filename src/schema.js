// schema.js — Schema nội dung deck.json (nguồn duy nhất). standards/deck.schema.json được sinh từ file này
// bằng `npm run schema`. Claude chỉ sinh NỘI DUNG; renderer lo bố cục.
const { z } = require("zod");

const SHAPES = ["diamond", "hex", "hexTall", "slantR", "slantL", "shard", "tab", "arrow", "blob", "circle"];
const Shape = z.enum(SHAPES);
const Hex = z.string().regex(/^[0-9A-Fa-f]{6}$/, "Mã màu 6 ký tự hex, không có #");

const Bullet = z.object({
  label: z.string().optional().describe("Nhãn in đậm đầu dòng, 1–4 chữ, KHÔNG kèm dấu ':' (vd 'Quy mô')"),
  text: z.string().describe("Nội dung ngắn ≤ 25 chữ, có số liệu nếu có"),
});
const Bullets = z.array(Bullet).min(1).max(6);
const ImageRef = z.object({
  id: z.string().describe("id ảnh người dùng tải lên (img1, img2…)"),
  shape: Shape.optional().describe("Chỉ ghi khi muốn khác khung mặc định của slide"),
}).describe("Ảnh trang trí cắt khối");

const Row = z.object({
  cells: z.array(z.string()).min(1),
  style: z.enum(["normal", "group", "total"]).optional().describe("group = dòng nhóm (chỉ 1 ô, trải ngang); total = dòng tổng/in đậm"),
});
const Table = z.object({
  caption: z.string().describe("Tên bảng, giữ số hiệu như luận văn nếu có, vd 'Bảng 1.4. Dư nợ cho vay KHCN'"),
  unit: z.string().optional().describe("vd 'Đơn vị: tỷ đồng'"),
  source: z.string().optional().describe("vd 'Nguồn: Báo cáo tín dụng …'"),
  header: z.array(z.string()).min(2).max(8),
  rows: z.array(Row).min(1).max(13),
});
const Chart = z.object({
  type: z.enum(["column", "bar", "line", "doughnut"]).describe("column = cột đứng; bar = thanh ngang; doughnut = cơ cấu %"),
  title: z.string().describe("Tiêu đề ngắn kèm đơn vị"),
  labels: z.array(z.string()).min(2).max(10),
  series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })).min(1).max(3),
  decimals: z.number().int().min(0).max(2).optional().describe("Số chữ số thập phân hiển thị"),
  percent: z.boolean().optional().describe("true nếu giá trị là % (hiển thị kèm ký hiệu %)"),
});

const base = {
  label: z.string().describe("Nhãn chương góc trên, vd 'Chương 2 · Thực trạng'"),
  title: z.string().describe("Tiêu đề slide ngắn gọn, 1 dòng (≤ 60 ký tự), không đánh số"),
  notes: z.string().optional().describe("Lời thuyết trình 1–2 câu"),
};

const Slide = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cover"), notes: base.notes, image: ImageRef.optional().describe("Ảnh lớn (khung phụ)"), image2: ImageRef.optional().describe("Ảnh nhỏ (khung chủ đạo)") }),
  z.object({ type: z.literal("context"), ...base, bullets: Bullets, highlight: z.string().describe("Tên đề tài đầy đủ để highlight ở dòng kết"), image: ImageRef.optional() }),
  z.object({ type: z.literal("structure"), ...base,
    parts: z.array(z.object({ label: z.string().describe("'Chương 1'…"), name: z.string().describe("Tên chương đúng như luận văn"), desc: z.string().describe("1 dòng nội dung chính ≤ 25 chữ") })).min(2).max(4),
    image: ImageRef.optional() }),
  z.object({ type: z.literal("chapter"), num: z.string().describe("'01', '02', '03'"), chapterLabel: z.string().describe("'CHƯƠNG 1'…"), name: z.string(), sub: z.string().describe("Các nội dung chính, nối bằng ' · '"), notes: base.notes, image: ImageRef.optional() }),
  z.object({ type: z.literal("concept"), ...base,
    definition: Bullet.describe("label = 'Khái niệm'; text = định nghĩa 1–2 câu"),
    featuresTitle: z.string(), features: Bullets,
    formsTitle: z.string(), forms: z.array(Bullet).min(2).max(5).describe("label = tiêu chí phân loại; text = các loại, nối bằng ' · '") }),
  z.object({ type: z.literal("text2col"), ...base,
    columns: z.array(z.object({ heading: z.string(), bullets: Bullets })).length(2).describe("vd Nhân tố chủ quan / khách quan; mỗi dòng '[Nhân tố]: [tác động 1 câu]'") }),
  z.object({ type: z.literal("indicatorTable"), ...base,
    header: z.array(z.string()).length(3).optional().describe("Mặc định: Nhóm chỉ tiêu | Chỉ tiêu | Công thức / nội dung"),
    groups: z.array(z.object({ name: z.string(), items: z.array(z.object({ indicator: z.string(), formula: z.string() })).min(1).max(4) })).min(1).max(6) }),
  z.object({ type: z.literal("orgIntro"), ...base,
    milestones: z.array(Bullet).min(2).max(5).describe("label = mốc thời gian/khía cạnh (Thành lập, Trụ sở…); text = nội dung"),
    org: z.object({ top: z.string().describe("Cấp lãnh đạo, vd 'Ban Giám đốc'"), topSub: z.string().optional(), units: z.array(z.string()).min(2).max(10) }),
    source: z.string().optional(), image: ImageRef.optional() }),
  z.object({ type: z.literal("tableChart"), ...base, table: Table, chart: Chart.optional(), summary: z.string().describe("Tóm tắt 30–50 chữ, có số liệu, nêu xu hướng và điểm bất thường") }),
  z.object({ type: z.literal("assessment"), ...base, achievements: Bullets,
    limitations: z.array(z.object({ code: z.string().describe("H1, H2…"), label: z.string(), text: z.string() })).min(1).max(6) }),
  z.object({ type: z.literal("causes"), ...base, subjective: Bullets, objective: Bullets, bridge: z.string().describe("Câu nối sang Chương 3, vd 'H1–H6 ↔ GP1–GP6'") }),
  z.object({ type: z.literal("goals"), ...base, bullets: Bullets, table: Table.optional().describe("Bảng mục tiêu ngắn ≤ 8 dòng"), image: ImageRef.optional() }),
  z.object({ type: z.literal("solutions"), ...base,
    items: z.array(z.object({ code: z.string().describe("GP1…"), name: z.string().describe("Tên giải pháp ≤ 8 chữ"), text: z.string().describe("1 câu nội dung ≤ 25 chữ"), link: z.string().optional().describe("Hạn chế đối ứng, vd 'H1'") })).min(2).max(8) }),
  z.object({ type: z.literal("conclusion"), ...base, conclusion: z.string().describe("Kết luận 30–50 chữ"),
    recommendations: z.array(z.object({ heading: z.string(), bullets: Bullets })).min(1).max(2), image: ImageRef.optional() }),
  z.object({ type: z.literal("thanks"), message: z.string().optional(), notes: base.notes, image: ImageRef.optional() }),
]);

const Deck = z.object({
  meta: z.object({
    titleMain: z.string().describe("Phần chính tên đề tài, IN HOA, ≤ 40 ký tự, có thể xuống dòng bằng \\n (vd 'CHO VAY\\nKHÁCH HÀNG CÁ NHÂN')"),
    titleSub: z.string().describe("Phần còn lại của tên đề tài (vd 'tại Ngân hàng … – Chi nhánh Bắc Ninh')"),
    titleFull: z.string().describe("Tên đề tài đầy đủ đúng như luận văn"),
    docType: z.string().describe("vd 'ĐỀ ÁN TỐT NGHIỆP THẠC SĨ', 'LUẬN VĂN THẠC SĨ'"),
    school: z.string(), schoolParent: z.string().optional().describe("Cơ quan chủ quản, vd 'BỘ GIÁO DỤC VÀ ĐÀO TẠO · BỘ TÀI CHÍNH'"),
    orgName: z.string().describe("Tên đầy đủ đơn vị nghiên cứu"), orgShort: z.string().describe("Tên ngắn, vd 'BIDV Bắc Ninh'"),
    student: z.string(), supervisor: z.string(), major: z.string().optional(),
    city: z.string().optional(), year: z.string(),
  }),
  theme: z.object({
    primary: Hex.optional(), accent: Hex.optional(),
    mainShape: Shape.describe("Khung chủ đạo theo quy chuẩn mục 3"), subShape: Shape.describe("Khung phụ"),
    motif: z.enum(["dynamic", "soft"]).describe("dynamic = dải chéo + ////; soft = vòng tròn + chấm"),
    rationale: z.string().optional().describe("1 câu lý do chọn màu/khung"),
  }),
  issues: z.array(z.object({ where: z.string().describe("Vị trí trong luận văn (bảng/mục/trang)"), detail: z.string().describe("Mô tả mâu thuẫn, kèm số liệu") })).describe("Số liệu mâu thuẫn phát hiện trong luận văn; [] nếu không có"),
  slides: z.array(Slide).min(10).max(30),
});

module.exports = { Deck, Slide, SHAPES, z };
