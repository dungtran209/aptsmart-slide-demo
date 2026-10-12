// server.js — Express: upload, hàng đợi job (xử lý tuần tự), mật khẩu truy cập, giới hạn lượt/ngày, tải file.
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const sharp = require("sharp");

const { extractDocx } = require("./extract");
const { generateDeck } = require("./ai");
const { mockDeck } = require("./mock");
const { structural, rules, repair } = require("./rules");
const { renderDeck } = require("./render/renderer");
const { toPdf } = require("./pdf");
const { SHAPES } = require("./schema");

// ---------- cấu hình (mọi thông tin tài khoản nằm trong biến môi trường) ----------
const PORT = Number(process.env.PORT || 3000);
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "";
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT || 10);
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 30);
const FILE_TTL_MIN = Number(process.env.FILE_TTL_MIN || 60);
const MIN_IMAGES = Number(process.env.MIN_IMAGES ?? 3);
const MAX_IMAGES = Number(process.env.MAX_IMAGES || 8);
const APP_TZ = process.env.APP_TZ || "Asia/Ho_Chi_Minh";
const DATA_DIR = process.env.DATA_DIR || path.join(os.tmpdir(), "aptsmart-data");
const JOBS_DIR = path.join(DATA_DIR, "jobs");
const MOCK = process.env.AI_MODE === "mock" || !process.env.ANTHROPIC_API_KEY;
fs.mkdirSync(JOBS_DIR, { recursive: true });

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------- giới hạn lượt/ngày (lưu file; reset theo ngày giờ Việt Nam) ----------
const USAGE_FILE = path.join(DATA_DIR, "usage.json");
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ }).format(new Date());
function usage() {
  try { const u = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8")); if (u.date === today()) return u; } catch (_) {}
  return { date: today(), count: 0 };
}
function bumpUsage() { const u = usage(); u.count++; fs.writeFileSync(USAGE_FILE, JSON.stringify(u)); return u; }

// ---------- mật khẩu ----------
const hash = s => crypto.createHash("sha256").update(String(s)).digest();
const passOk = p => !ACCESS_PASSWORD || crypto.timingSafeEqual(hash(p || ""), hash(ACCESS_PASSWORD));
const fails = new Map(); // ip → {n, t}
function tooManyFails(ip) { const f = fails.get(ip); return f && f.n >= 10 && Date.now() - f.t < 15 * 60 * 1000; }
function noteFail(ip) { const f = fails.get(ip); const now = Date.now(); if (!f || now - f.t > 15 * 60 * 1000) fails.set(ip, { n: 1, t: now }); else f.n++; }
function requirePass(req, res, next) {
  const ip = req.ip;
  if (tooManyFails(ip)) return res.status(429).json({ error: "Nhập sai mật khẩu quá nhiều lần. Vui lòng thử lại sau 15 phút." });
  if (!passOk(req.get("x-access-password"))) { noteFail(ip); return res.status(401).json({ error: "Mật khẩu truy cập không đúng." }); }
  next();
}

// ---------- jobs ----------
const jobs = new Map();
const queue = [];
let running = false;
const publicJob = j => ({ id: j.id, status: j.status, progress: j.progress, step: j.step, message: j.message, error: j.error, position: j.status === "queued" ? queue.indexOf(j.id) + 1 : 0,
  result: j.result || null, createdAt: j.createdAt, expiresAt: j.createdAt + FILE_TTL_MIN * 60000 });

async function runQueue() {
  if (running) return;
  running = true;
  while (queue.length) {
    const id = queue[0];
    const job = jobs.get(id);
    if (job) {
      try { await processJob(job); } catch (e) {
        job.status = "error"; job.error = e.message || String(e); job.message = "Có lỗi khi tạo slide.";
        log(`job ${id} lỗi: ${job.error}`);
      }
    }
    queue.shift();
  }
  running = false;
}

const asciiName = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^\w\s.-]/g, "").replace(/\s+/g, " ").trim();

async function processJob(job) {
  const set = (progress, step, message) => Object.assign(job, { progress, step, message: message || job.message });
  const t0 = Date.now();
  job.status = "running";
  const dir = job.dir;

  // 1. đọc luận văn
  set(5, "extract", "Đang đọc luận văn…");
  const ex = await extractDocx(job.files.thesis);
  if (ex.stats.chars < 3000) throw new Error("Không đọc được nội dung luận văn (file quá ngắn hoặc là ảnh scan).");
  log(`job ${job.id} extract: ${ex.stats.chars} ký tự, ${ex.stats.tables} bảng${ex.stats.truncated ? " (đã cắt bớt)" : ""}`);

  // 2. chuẩn hóa ảnh (xoay EXIF, giới hạn 1600 px, JPEG) → giảm dung lượng PPTX
  set(12, "images", "Đang xử lý ảnh…");
  const images = [];
  for (const [i, f] of job.files.images.entries()) {
    const out = path.join(dir, `img${i + 1}.jpg`);
    await sharp(f.path).rotate().flatten({ background: "#ffffff" }).resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(out);
    images.push({ id: `img${i + 1}`, path: out, name: f.name });
  }

  // 3. nội dung: Claude API hoặc giả lập
  let deck, aiInfo = { mode: MOCK ? "mock" : "claude" }, warnings = [];
  if (MOCK) {
    set(30, "ai", "Chế độ giả lập: dựng nội dung từ luận văn (không gọi Claude API)…");
    const st = structural(mockDeck(ex, job.form));
    if (!st.deck) throw new Error("Giả lập tạo deck lỗi: " + st.errors.slice(0, 3).join("; "));
    deck = st.deck;
    warnings.push(...rules(deck).errors.map(e => "Giả lập: " + e));
  } else {
    const r = await generateDeck({ text: ex.text, form: job.form, images, orgLogo: job.files.orgLogo, schoolLogo: job.files.schoolLogo,
      onProgress: (p, m) => set(Math.round(p), "ai", m), log: m => log(`job ${job.id} ${m}`) });
    deck = r.deck; warnings.push(...r.warnings);
    aiInfo = { mode: "claude", model: r.model, attempts: r.attempts, usage: r.usage };
    log(`job ${job.id} tokens: in=${r.usage.input} out=${r.usage.output} cacheRead=${r.usage.cacheRead} cacheWrite=${r.usage.cacheWrite}`);
  }
  warnings.push(...repair(deck));
  // thông tin người dùng nhập trong form luôn được ưu tiên
  const f = job.form;
  Object.assign(deck.meta, Object.fromEntries(Object.entries({ student: f.student, supervisor: f.supervisor, school: f.school, year: f.year }).filter(([, v]) => v)));
  if (f.degree) deck.meta.docType = f.degree.toUpperCase();
  fs.writeFileSync(path.join(dir, "deck.json"), JSON.stringify(deck, null, 1));

  // 4. dựng PPTX
  set(78, "render", "Đang dựng slide…");
  const base = `Slide bao ve - ${asciiName(deck.meta.student) || "Hoc vien"} - ${asciiName(deck.meta.orgShort) || "Don vi"}`.slice(0, 120);
  const pptx = path.join(dir, "slide.pptx");
  const [mainShape, subShape] = (f.shape && f.shape !== "auto" ? f.shape.split("/") : []);
  const rr = await renderDeck(deck, { orgLogo: job.files.orgLogo, schoolLogo: job.files.schoolLogo, images, primary: f.primary, accent: f.accent, mainShape, subShape }, pptx);
  warnings.push(...rr.warnings);

  // 5. PDF
  set(90, "pdf", "Đang xuất PDF…");
  let pdf = null;
  try { pdf = await toPdf(pptx, dir); } catch (e) { warnings.push("Không xuất được PDF: " + e.message); log(`job ${job.id} pdf lỗi: ${e.message}`); }

  job.output = { pptx, pdf, base };
  job.result = { pages: rr.pages, issues: deck.issues || [], warnings: [...new Set(warnings)].slice(0, 30), colors: rr.colors, shapes: rr.shapes,
    meta: { title: deck.meta.titleFull, student: deck.meta.student, org: deck.meta.orgShort }, ai: aiInfo, hasPdf: !!pdf, seconds: Math.round((Date.now() - t0) / 1000) };
  job.status = "done"; job.progress = 100; job.step = "done"; job.message = "Hoàn tất!";
  log(`job ${job.id} xong: ${rr.pages} slide, ${job.result.seconds}s, mode=${aiInfo.mode}`);
  // xóa file đầu vào ngay (chỉ giữ kết quả tới khi hết hạn)
  for (const p of [job.files.thesis, job.files.orgLogo, job.files.schoolLogo, ...job.files.images.map(i => i.path)]) if (p) fs.rm(p, { force: true }, () => {});
}

// dọn file hết hạn
setInterval(() => {
  const now = Date.now();
  for (const [id, j] of jobs) {
    if (j.status !== "running" && now - j.createdAt > FILE_TTL_MIN * 60000) {
      fs.rm(j.dir, { recursive: true, force: true }, () => {});
      jobs.delete(id);
      const qi = queue.indexOf(id); if (qi > 0) queue.splice(qi, 1);
    }
  }
  // thư mục mồ côi (sau khi khởi động lại)
  for (const d of fs.readdirSync(JOBS_DIR)) {
    const p = path.join(JOBS_DIR, d);
    try { if (!jobs.has(d) && now - fs.statSync(p).mtimeMs > FILE_TTL_MIN * 60000) fs.rmSync(p, { recursive: true, force: true }); } catch (_) {}
  }
}, 60 * 1000).unref();

// ---------- upload ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { req.jobId = req.jobId || crypto.randomUUID(); const d = path.join(JOBS_DIR, req.jobId, "in"); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
    filename: (req, file, cb) => cb(null, `${file.fieldname}-${crypto.randomBytes(4).toString("hex")}${path.extname(file.originalname).toLowerCase().slice(0, 6)}`),
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: MAX_IMAGES + 3, fields: 20 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === "thesis") return cb(ext === ".docx" ? null : new Error("Luận văn phải là file .docx"), ext === ".docx");
    if ([".png", ".jpg", ".jpeg"].includes(ext)) return cb(null, true);
    cb(new Error(`File "${file.originalname}" không phải ảnh PNG/JPG`));
  },
}).fields([{ name: "thesis", maxCount: 1 }, { name: "orgLogo", maxCount: 1 }, { name: "schoolLogo", maxCount: 1 }, { name: "images", maxCount: MAX_IMAGES }]);

function magicOk(p, kind) {
  const b = Buffer.alloc(8); const fd = fs.openSync(p, "r"); fs.readSync(fd, b, 0, 8, 0); fs.closeSync(fd);
  if (kind === "docx") return b[0] === 0x50 && b[1] === 0x4b;
  return (b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47);
}
const HEX = /^#?[0-9a-fA-F]{6}$/;
const clean = (v, n = 120) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n) : "");
const SHAPE_PAIRS = ["auto", "diamond/shard", "hex/slantR", "slantR/shard", "slantR/hex", "circle/blob", "blob/circle"];

// ---------- app ----------
const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((req, res, next) => { res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY" }); next(); });
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "../public"), { maxAge: "10m" }));

app.get("/healthz", (req, res) => res.json({ ok: true }));
app.get("/api/config", (req, res) => {
  const u = usage();
  res.json({ mode: MOCK ? "mock" : "claude", passwordRequired: !!ACCESS_PASSWORD, dailyLimit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - u.count),
    maxUploadMb: MAX_UPLOAD_MB, minImages: MIN_IMAGES, maxImages: MAX_IMAGES, ttlMin: FILE_TTL_MIN, shapes: SHAPE_PAIRS });
});
app.post("/api/login", (req, res) => {
  if (tooManyFails(req.ip)) return res.status(429).json({ error: "Nhập sai mật khẩu quá nhiều lần. Vui lòng thử lại sau 15 phút." });
  if (!passOk(req.body && req.body.password)) { noteFail(req.ip); return res.status(401).json({ error: "Mật khẩu không đúng." }); }
  res.json({ ok: true });
});

app.post("/api/jobs", requirePass, (req, res) => {
  const u = usage();
  if (u.count >= DAILY_LIMIT) return res.status(429).json({ error: `Đã hết ${DAILY_LIMIT} lượt tạo slide hôm nay. Vui lòng quay lại vào ngày mai.` });
  if (queue.length >= 5) return res.status(503).json({ error: "Hệ thống đang bận (hàng đợi đầy). Vui lòng thử lại sau ít phút." });
  upload(req, res, err => {
    const dir = req.jobId ? path.join(JOBS_DIR, req.jobId) : null;
    const fail = (code, msg) => { if (dir) fs.rm(dir, { recursive: true, force: true }, () => {}); res.status(code).json({ error: msg }); };
    if (err) return fail(400, err.code === "LIMIT_FILE_SIZE" ? `Mỗi file tối đa ${MAX_UPLOAD_MB} MB.` : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE" ? `Tối đa ${MAX_IMAGES} ảnh.` : err.message);
    const F = req.files || {};
    if (!F.thesis) return fail(400, "Vui lòng chọn file luận văn (.docx).");
    const total = Object.values(F).flat().reduce((a, f) => a + f.size, 0);
    if (total > MAX_UPLOAD_MB * 1024 * 1024) return fail(400, `Tổng dung lượng tối đa ${MAX_UPLOAD_MB} MB.`);
    const imgs = F.images || [];
    if (imgs.length < MIN_IMAGES || imgs.length > MAX_IMAGES) return fail(400, `Cần ${MIN_IMAGES}–${MAX_IMAGES} ảnh đơn vị (hiện có ${imgs.length}).`);
    if (!magicOk(F.thesis[0].path, "docx")) return fail(400, "File luận văn không phải .docx hợp lệ.");
    for (const f of [...imgs, ...(F.orgLogo || []), ...(F.schoolLogo || [])]) if (!magicOk(f.path, "img")) return fail(400, `File "${f.originalname}" không phải ảnh PNG/JPG hợp lệ.`);
    const b = req.body || {};
    const form = { student: clean(b.student, 80), supervisor: clean(b.supervisor, 80), school: clean(b.school, 120), degree: clean(b.degree, 60), year: clean(b.year, 10),
      primary: HEX.test(b.primary || "") ? b.primary.replace("#", "").toUpperCase() : "", accent: HEX.test(b.accent || "") ? b.accent.replace("#", "").toUpperCase() : "",
      shape: SHAPE_PAIRS.includes(b.shape) ? b.shape : "auto" };
    if (form.shape !== "auto" && !form.shape.split("/").every(s => SHAPES.includes(s))) form.shape = "auto";
    const id = req.jobId;
    const job = { id, dir, createdAt: Date.now(), status: "queued", progress: 0, step: "queued", message: "Đang chờ xử lý…", form,
      files: { thesis: F.thesis[0].path, orgLogo: F.orgLogo ? F.orgLogo[0].path : null, schoolLogo: F.schoolLogo ? F.schoolLogo[0].path : null,
        images: imgs.map(f => ({ path: f.path, name: clean(f.originalname, 60) })) } };
    jobs.set(id, job); queue.push(id);
    const uu = bumpUsage();
    log(`job ${id} tạo (lượt ${uu.count}/${DAILY_LIMIT}, ${imgs.length} ảnh, ${(total / 1048576).toFixed(1)} MB)`);
    runQueue();
    res.status(202).json(publicJob(job));
  });
});

app.get("/api/jobs/:id", (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j) return res.status(404).json({ error: "Không tìm thấy yêu cầu (có thể đã hết hạn)." });
  res.json(publicJob(j));
});
app.get("/api/jobs/:id/:kind", (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j || j.status !== "done") return res.status(404).json({ error: "File chưa sẵn sàng hoặc đã hết hạn." });
  const kind = req.params.kind;
  const file = kind === "pdf" ? j.output.pdf : kind === "pptx" ? j.output.pptx : kind === "deck" ? path.join(j.dir, "deck.json") : null;
  if (!file || !fs.existsSync(file)) return res.status(404).json({ error: "Không có file này." });
  const name = kind === "deck" ? "deck.json" : `${j.output.base}.${kind}`;
  res.download(file, name);
});

app.use((err, req, res, next) => { log("lỗi:", err.message); res.status(500).json({ error: "Lỗi máy chủ." }); });

if (require.main === module) {
  app.listen(PORT, () => {
    log(`APTsmart Slide chạy tại http://localhost:${PORT} — chế độ ${MOCK ? "GIẢ LẬP (chưa có ANTHROPIC_API_KEY)" : "Claude API (" + (process.env.CLAUDE_MODEL || "claude-sonnet-5-5") + ")"}`);
    if (!ACCESS_PASSWORD) log("CẢNH BÁO: chưa đặt ACCESS_PASSWORD — ai cũng dùng được trang này.");
  });
}
module.exports = { app };
