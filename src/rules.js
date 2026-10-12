// rules.js — kiểm tra deck.json theo quy chuẩn (ngoài kiểm tra cấu trúc của zod) + tự sửa nhẹ.
const { Deck } = require("./schema");

const MIN_SLIDES = Number(process.env.MIN_SLIDES || 22);
const MAX_SLIDES = Number(process.env.MAX_SLIDES || 25);
const words = s => String(s || "").trim().split(/\s+/).filter(Boolean).length;

function structural(raw) {
  const r = Deck.safeParse(raw);
  if (r.success) return { deck: r.data, errors: [] };
  const errors = r.error.issues.slice(0, 40).map(i => `${i.path.join(".") || "(gốc)"}: ${i.message}`);
  return { deck: null, errors };
}

function rules(deck) {
  const errors = [], warnings = [];
  const S = deck.slides, n = S.length;
  if (n < MIN_SLIDES || n > MAX_SLIDES) errors.push(`Số slide = ${n}, yêu cầu ${MIN_SLIDES}–${MAX_SLIDES}.`);
  if (S[0]?.type !== "cover") errors.push("Slide đầu phải là 'cover'.");
  if (S[n - 1]?.type !== "thanks") errors.push("Slide cuối phải là 'thanks'.");
  const ch = S.filter(s => s.type === "chapter").length;
  if (ch < 3) errors.push(`Cần 3 trang 'chapter' (Chương 1, 2, 3), hiện có ${ch}.`);
  const tc = S.filter(s => s.type === "tableChart").length;
  if (tc > 7) errors.push(`Quá nhiều slide tableChart (${tc}); KQKD + tối đa 5 slide thực trạng.`);
  S.forEach((s, i) => {
    const at = `slides[${i}] (${s.type})`;
    if (s.title && s.title.length > 70) warnings.push(`${at}: tiêu đề dài ${s.title.length} ký tự.`);
    if (s.title && /^\d+(\.\d+)+/.test(s.title)) errors.push(`${at}: tiêu đề không được đánh số mục ("${s.title}").`);
    if (s.type === "tableChart") {
      const w = words(s.summary);
      if (w > 55) errors.push(`${at}: tóm tắt ${w} chữ (tối đa 50).`);
      else if (w < 20) warnings.push(`${at}: tóm tắt chỉ ${w} chữ (nên 30–50).`);
      const cols = s.table.header.length;
      s.table.rows.forEach((r, j) => { if (r.style !== "group" && r.cells.length !== cols) errors.push(`${at}: dòng ${j + 1} của bảng có ${r.cells.length} ô, tiêu đề có ${cols} cột.`); });
      if (s.chart) s.chart.series.forEach(se => { if (se.values.length !== s.chart.labels.length) errors.push(`${at}: chuỗi "${se.name}" có ${se.values.length} giá trị nhưng ${s.chart.labels.length} nhãn.`); });
    }
    if (s.type === "conclusion" && words(s.conclusion) > 60) errors.push(`${at}: kết luận ${words(s.conclusion)} chữ (30–50).`);
    if (s.type === "goals" && s.table) {
      const cols = s.table.header.length;
      s.table.rows.forEach((r, j) => { if (r.style !== "group" && r.cells.length !== cols) errors.push(`${at}: dòng ${j + 1} bảng mục tiêu lệch số cột.`); });
    }
  });
  return { errors, warnings };
}

// Tự sửa các lỗi còn lại sau lần gọi lại (để vẫn ra được slide), trả về cảnh báo.
function repair(deck) {
  const notes = [];
  deck.slides.forEach((s, i) => {
    for (const t of [s.table].filter(Boolean)) {
      const cols = t.header.length;
      t.rows = t.rows.map(r => r.style === "group" ? r : { ...r, cells: [...r.cells, ...Array(cols).fill("")].slice(0, cols) });
    }
    if (s.type === "tableChart" && s.chart) {
      const L = s.chart.labels.length;
      if (s.chart.series.some(se => se.values.length !== L || se.values.some(v => !Number.isFinite(v)))) {
        delete s.chart; notes.push(`Slide ${i + 1}: bỏ biểu đồ do dữ liệu không khớp nhãn.`);
      }
    }
    if (s.type === "tableChart" && words(s.summary) > 55) {
      s.summary = s.summary.split(/\s+/).slice(0, 50).join(" ").replace(/[,;:]$/, "") + "…";
      notes.push(`Slide ${i + 1}: rút gọn tóm tắt còn 50 chữ.`);
    }
  });
  // Quá nhiều slide: bớt slide tableChart thực trạng ở cuối chuỗi
  while (deck.slides.length > MAX_SLIDES) {
    const idx = deck.slides.map((s, i) => [s, i]).filter(([s]) => s.type === "tableChart").map(([, i]) => i).pop();
    if (idx === undefined) break;
    notes.push(`Bỏ slide "${deck.slides[idx].title}" để giữ tối đa ${MAX_SLIDES} slide.`);
    deck.slides.splice(idx, 1);
  }
  return notes;
}

module.exports = { structural, rules, repair, words, MIN_SLIDES, MAX_SLIDES };
