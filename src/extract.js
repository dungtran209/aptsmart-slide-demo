// extract.js — .docx → văn bản có cấu trúc (tiêu đề markdown + bảng markdown) để gửi cho Claude.
// mammoth giữ bảng (kể cả ô gộp colspan/rowspan) dưới dạng HTML; ta trải ô gộp thành lưới đầy đủ.
const mammoth = require("mammoth");
const cheerio = require("cheerio");

const clean = s => String(s || "").replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim();

function tableToGrid($, tbl) {
  const grid = [];
  $(tbl).find("tr").each((r, tr) => {
    grid[r] = grid[r] || [];
    let c = 0;
    $(tr).children("td,th").each((_, td) => {
      while (grid[r][c] !== undefined) c++;
      const text = clean($(td).text());
      const cs = Number($(td).attr("colspan") || 1), rs = Number($(td).attr("rowspan") || 1);
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) {
        grid[r + i] = grid[r + i] || [];
        grid[r + i][c + j] = text;
      }
      c += cs;
    });
  });
  const width = Math.max(0, ...grid.map(r => r.length));
  return grid.map(r => Array.from({ length: width }, (_, i) => r[i] ?? ""));
}
function gridToMd(grid) {
  if (!grid.length) return "";
  const esc = s => s.replace(/\|/g, "/");
  const lines = grid.map(r => "| " + r.map(esc).join(" | ") + " |");
  lines.splice(1, 0, "|" + grid[0].map(() => " --- ").join("|") + "|");
  return lines.join("\n");
}

// Mục bỏ qua (không cần cho slide, tiết kiệm token)
const SKIP_H1 = /^(LỜI CAM ĐOAN|DANH MỤC (CÁC )?(TỪ VIẾT TẮT|BẢNG|HÌNH|SƠ ĐỒ|BIỂU ĐỒ)|MỤC LỤC|DANH MỤC TÀI LIỆU THAM KHẢO|TÀI LIỆU THAM KHẢO)/i;

async function extractDocx(input) {
  const opts = Buffer.isBuffer(input) ? { buffer: input } : { path: input };
  const { value: html } = await mammoth.convertToHtml(opts, { ignoreEmptyParagraphs: true });
  const $ = cheerio.load(html);
  const out = [], headings = [];
  let skipping = false, tables = 0, tablesSkipped = 0;
  $("body").children().each((_, el) => {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const text = clean($(el).text());
      if (!text) return;
      const level = Number(tag[1]);
      if (level === 1 || /^(MỞ ĐẦU|LỜI MỞ ĐẦU|LỜI NÓI ĐẦU|CHƯƠNG|PHẦN|KẾT LUẬN|PHỤ LỤC)/i.test(text)) skipping = SKIP_H1.test(text);
      if (skipping) return;
      headings.push({ level, text });
      out.push("\n" + "#".repeat(level) + " " + text);
      return;
    }
    if (skipping) return;
    if (tag === "table") {
      const grid = tableToGrid($, el);
      const flat = grid.flat().join(" ");
      if (/[☐□]/.test(flat)) { tablesSkipped++; return; } // phiếu khảo sát trống
      tables++;
      out.push("\n[BẢNG " + tables + "]\n" + gridToMd(grid) + "\n");
      return;
    }
    if (tag === "ul" || tag === "ol") {
      $(el).find("li").each((__, li) => { const t = clean($(li).text()); if (t) out.push("- " + t); });
      return;
    }
    const text = clean($(el).text());
    if (!text) return;
    if (/\t?\s*\d{1,3}$/.test($(el).text()) && /\t/.test($(el).text()) && text.length < 200) return; // dòng mục lục "… 12"
    out.push(text);
  });
  let text = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const maxChars = Number(process.env.MAX_INPUT_CHARS || 450000);
  let truncated = false;
  if (text.length > maxChars) { text = text.slice(0, maxChars); truncated = true; }
  return { text, headings, stats: { chars: text.length, tables, tablesSkipped, truncated } };
}

module.exports = { extractDocx };
