// mock.js — CHẾ ĐỘ GIẢ LẬP (không gọi Claude API): dựng deck.json bằng quy tắc đơn giản từ văn bản trích xuất.
// Mục đích: chạy thử toàn bộ quy trình (upload → deck.json → PPTX → PDF) khi chưa có ANTHROPIC_API_KEY.
// Chất lượng nội dung chỉ ở mức minh họa: số liệu lấy trực tiếp từ bảng của luận văn, câu chữ cắt từ văn bản gốc.

// ---------- phân tích văn bản trích xuất thành cây mục ----------
function parse(text) {
  const lines = text.split("\n");
  const nodes = []; // {kind:'h', level, text} | {kind:'p', text} | {kind:'t', grid, caption, source}
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) { nodes.push({ kind: "h", level: h[1].length, text: h[2].replace(/^\*+/, "").trim() }); continue; }
    if (/^\[BẢNG \d+\]$/.test(l)) {
      const rows = [];
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith("|")) {
        i++;
        const r = lines[i].trim();
        if (/^\|\s*---/.test(r)) continue;
        rows.push(r.replace(/^\||\|$/g, "").split("|").map(c => c.trim()));
      }
      nodes.push({ kind: "t", grid: rows });
      continue;
    }
    nodes.push({ kind: "p", text: l });
  }
  // gắn tên bảng (dòng "Bảng…" phía trước) và nguồn (dòng "Nguồn:" phía sau)
  nodes.forEach((n, i) => {
    if (n.kind !== "t") return;
    for (let k = i - 1; k >= Math.max(0, i - 3); k--) if (nodes[k].kind === "p" && /^(Bảng|Biểu)\s*\d/i.test(nodes[k].text)) { n.caption = nodes[k].text.replace(/(\d)\.\s+(\d)/, "$1.$2"); break; }
    for (let k = i + 1; k <= Math.min(nodes.length - 1, i + 2); k++) if (nodes[k].kind === "p" && /^Nguồn\s*:/i.test(nodes[k].text)) { n.source = nodes[k].text; break; }
  });
  return nodes;
}

const sentences = t => String(t).split(/(?<=[.!?;])\s+(?=[A-ZÀ-ỸĐ“"(])/u).map(s => s.trim()).filter(Boolean);
const clipWords = (s, n) => { const w = String(s).split(/\s+/); return w.length <= n ? String(s) : w.slice(0, n).join(" ").replace(/[,;:–-]$/, "") + "…"; };
const capFirst = s => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = s => (/^.[A-ZĐÀ-Ỹ]/u.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const stripNum = s => String(s).replace(/^[\dIVX]+(\.\d+)*\.?\s*/, "").replace(/^\*?(Thứ\s+\w+,?\s*)/i, "").trim();
const num = s => { const v = String(s).replace(/%/g, "").replace(/\./g, "").replace(",", ".").trim(); return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : NaN; };

// lấy các nút thuộc 1 mục (từ tiêu đề khớp regex tới tiêu đề cùng cấp hoặc cao hơn)
function section(nodes, re, from = 0, to = nodes.length) {
  for (let i = from; i < to; i++) {
    const n = nodes[i];
    if (n.kind === "h" && re.test(n.text)) {
      let j = i + 1;
      while (j < to && !(nodes[j].kind === "h" && nodes[j].level <= n.level)) j++;
      return { start: i, end: j, head: n, nodes: nodes.slice(i + 1, j) };
    }
  }
  return null;
}
function goodSentences(nodesArr, n, minLen = 40, maxLen = 260) {
  const out = [];
  for (const nd of nodesArr) {
    if (nd.kind !== "p" || /^(Bảng|Nguồn|Biểu đồ|Hình|Sơ đồ)/i.test(nd.text)) continue;
    for (let s of sentences(nd.text.replace(/^[*•\-–]\s*/, ""))) {
      if (s.length >= minLen && s.length <= maxLen && /[.;:!?…”)]$/.test(s)) out.push(s);
      if (out.length >= n) return out;
    }
  }
  return out;
}
// tách "Nhãn: nội dung" từ câu kiểu "Thứ nhất, về X: ..." hoặc "X là ..."
function toBullet(s, words = 22) {
  s = s.replace(/^(Thứ\s+\w+|Một là|Hai là|Ba là|Bốn là|Năm là|Sáu là)[,:]\s*/i, "").replace(/^[-–•]\s*/, "");
  const m = s.match(/^([^:]{3,40}):\s*(.+)$/);
  if (m) return { label: capFirst(m[1].trim()), text: clipWords(m[2], words) };
  return { text: clipWords(capFirst(s), words) };
}

// ---------- bảng số liệu → bảng gọn theo năm ----------
function compactTable(n) {
  const g = n.grid;
  if (!g || g.length < 3) return null;
  const head = g[0];
  const yearCols = [];
  head.forEach((h, i) => { const y = (h.match(/20\d\d/) || [])[0]; if (i > 0 && y && !yearCols.find(c => c.y === y)) yearCols.push({ y, i }); });
  if (yearCols.length < 2) return null;
  let bodyStart = 1;
  if (g[1] && g[1][0] === g[0][0] || (g[1] && g[1].slice(1).every(c => !/\d/.test(c) || /\d\d\/\d\d/.test(c)))) {
    bodyStart = 2;
    // nếu dòng tiêu đề phụ có "Số tiền" thì chọn đúng cột "Số tiền" của từng năm
    yearCols.forEach(c => { for (let k = c.i; k < head.length && (head[k].match(/20\d\d/) || [])[0] === c.y; k++) if (/số tiền|giá trị|số lượng/i.test(g[1][k] || "")) { c.i = k; break; } });
  }
  const rows = [];
  for (const r of g.slice(bodyStart)) {
    const label = clipWords(r[0], 9);
    const cells = yearCols.map(c => r[c.i] || "");
    if (r.slice(1).every(c => c === r[0] || c === "")) { rows.push({ cells: [label], style: "group" }); continue; }
    if (cells.every(c => !c)) continue;
    rows.push({ cells: [label, ...cells.map(c => c || "–")], style: /^(tổng|lợi nhuận)/i.test(r[0]) ? "total" : undefined });
    if (rows.length >= 11) break;
  }
  if (rows.filter(r => r.style !== "group").length < 1) return null;
  rows.forEach(r => { if (!r.style) delete r.style; });
  return { header: ["Chỉ tiêu", ...yearCols.map(c => c.y)], rows, years: yearCols.map(c => c.y) };
}
function chartFor(tbl) {
  const rows = tbl.rows.filter(r => r.style !== "group" && r.cells.slice(1).every(c => Number.isFinite(num(c))));
  if (!rows.length) return null;
  const r = rows.find(x => !/%/.test(x.cells.slice(1).join(""))) || rows[0];
  const values = r.cells.slice(1).map(num);
  const pct = /%/.test(r.cells.slice(1).join(""));
  return { type: pct ? "line" : "column", title: clipWords(r.cells[0], 8), labels: tbl.years, series: [{ name: clipWords(r.cells[0], 6), values }], percent: pct || undefined };
}
function summaryFor(tbl) {
  const rows = tbl.rows.filter(r => r.style !== "group" && r.cells.slice(1).every(c => Number.isFinite(num(c)))).slice(0, 3);
  if (!rows.length) return "Bảng tổng hợp số liệu giai đoạn nghiên cứu; cần bổ sung nhận xét xu hướng và điểm bất thường khi chạy với Claude API.";
  const y0 = tbl.years[0], y1 = tbl.years[tbl.years.length - 1];
  const parts = rows.map(r => {
    const a = r.cells[1], b = r.cells[r.cells.length - 1], up = num(b) >= num(a);
    return `${lowerFirst(clipWords(r.cells[0], 7))} ${up ? "tăng" : "giảm"} từ ${a} (${y0}) ${up ? "lên" : "xuống"} ${b} (${y1})`;
  });
  return clipWords(capFirst(parts.join("; ")) + ". Số liệu cho thấy xu hướng chung của giai đoạn, cần lưu ý các năm biến động mạnh.", 48);
}
// Kiểm tra "dòng Tổng = tổng các dòng con" → số liệu mâu thuẫn
function sumIssues(nodes) {
  const issues = [];
  nodes.filter(n => n.kind === "t").forEach(n => {
    const g = n.grid; if (!g || g.length < 4) return;
    for (let i = 1; i < g.length; i++) {
      if (!/^tổng/i.test(g[i][0])) continue;
      const kids = [];
      for (let j = i + 1; j < g.length && !/^(tổng|lợi nhuận|\d+\.)/i.test(g[j][0]); j++) kids.push(g[j]);
      if (kids.length < 2) continue;
      for (let c = 1; c < g[i].length; c++) {
        const tot = num(g[i][c]); if (!Number.isFinite(tot) || /%/.test(g[i][c])) continue;
        if (kids.some(k => /%/.test(k[c]))) continue; // dòng tỷ trọng (%) không cộng vào tổng
        const vs = kids.map(k => num(k[c])); if (vs.some(v => !Number.isFinite(v))) continue;
        const s = vs.reduce((a, b) => a + b, 0);
        if (Math.abs(s - tot) > Math.max(0.6, Math.abs(tot) * 0.01)) {
          issues.push({ where: `${n.caption || "Bảng"} – dòng "${g[i][0]}", cột ${g[0][c]}${g[1] && g[1][c] !== g[0][c] && !Number.isFinite(num(g[1][c])) ? " / " + g[1][c] : ""}`,
            detail: `Tổng ghi ${g[i][c]} nhưng cộng ${kids.length} dòng chi tiết được ${s.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}.` });
          break;
        }
      }
    }
  });
  return issues.slice(0, 8);
}

function pickShapes(text) {
  const t = text.toLowerCase();
  if (/ngân hàng|tài chính|chứng khoán|bảo hiểm|tín dụng/.test(t)) return ["diamond", "shard", "dynamic"];
  if (/công nghệ|viễn thông|phần mềm|số hóa/.test(t)) return ["slantR", "shard", "dynamic"];
  if (/xây dựng|kỹ thuật|cơ khí|năng lượng/.test(t)) return ["slantR", "hex", "dynamic"];
  if (/ubnd|ủy ban|sở |huyện|tỉnh|xã |cơ quan|kho bạc|thuế/.test(t)) return ["blob", "circle", "soft"];
  if (/dịch vụ|bán lẻ|giáo dục|du lịch|khách sạn|bệnh viện/.test(t)) return ["circle", "blob", "soft"];
  return ["hex", "slantR", "dynamic"];
}

function mockDeck(extracted, form = {}) {
  const nodes = parse(extracted.text);
  const paras = nodes.filter(n => n.kind === "p").map(n => n.text);
  // trang bìa: đoạn văn đầu + chữ trong bảng bìa (nhiều luận văn đặt tên trường trong bảng)
  const firstH = nodes.findIndex(n => n.kind === "h");
  const coverCells = nodes.slice(0, firstH < 0 ? 30 : firstH).filter(n => n.kind === "t").flatMap(n => n.grid.flat()).filter(Boolean);
  const front = [...new Set([...coverCells, ...paras.slice(0, 25)])];
  // ----- meta -----
  const titleLine = front.filter(l => l === l.toUpperCase() && l.split(/\s+/).length >= 6 && !/^(BỘ|HỌC VIỆN|TRƯỜNG|ĐẠI HỌC|ĐỀ ÁN|LUẬN|KHÓA)/.test(l)).sort((a, b) => b.length - a.length)[0] || "ĐỀ TÀI";
  const quoted = (extracted.text.match(/(?:đề án|đề tài|luận văn)[^“"]{0,30}[“"]([^”"]{20,250})[”"]/i) || [])[1];
  const titleFull = form.title || quoted || capFirst(titleLine.toLowerCase());
  const docType = (front.find(l => /^(ĐỀ ÁN|LUẬN VĂN|LUẬN ÁN|KHÓA LUẬN)/i.test(l)) || "LUẬN VĂN THẠC SĨ").toUpperCase();
  const supervisor = form.supervisor || ((extracted.text.match(/hướng dẫn[^:\n]{0,30}:\s*([^\n]{4,60})/i) || [])[1] || "").trim();
  const student = form.student || ((extracted.text.match(/Tác giả[^\n]*\n([^\n]{4,40})/i) || [])[1] || front.find(l => l === l.toUpperCase() && /^[A-ZÀ-ỸĐ\s]{6,40}$/.test(l) && l.split(/\s+/).length <= 5 && !/^(BỘ|HỌC|TRƯỜNG)/.test(l)) || "").trim();
  const school = form.school || front.find(l => /^(HỌC VIỆN|TRƯỜNG|ĐẠI HỌC)/i.test(l)) || "";
  const parents = front.filter(l => /^BỘ /.test(l)).slice(0, 2);
  const cy = front.map(l => l.match(/^([A-ZÀ-ỸĐ .]{2,20})\s*[-–]\s*(20\d\d)$/)).find(Boolean);
  const year = form.year || (cy ? cy[2] : String(new Date().getFullYear()));
  const city = cy ? capFirst(cy[1].trim().toLowerCase()).replace(/(\s)(\S)/g, (m, a, b) => a + b.toUpperCase()) : "";
  const split = titleFull.match(/^(.*?)\s+(tại\s+.+)$/i);
  const titleMain = (split ? split[1] : titleFull).toUpperCase();
  const titleSub = split ? lowerFirst(split[2]) : "";
  const orgName = split ? split[2].replace(/^tại\s+/i, "") : "";
  const acr = (extracted.text.match(/\b([A-Z]{2,8})\s*[–-]\s*Chi nhánh\s+([A-ZÀ-ỸĐ][\wÀ-ỹ]+(?:\s+[A-ZÀ-ỸĐ][\wÀ-ỹ]+)?)/) || []);
  const orgShort = acr[1] ? `${acr[1]} ${acr[2]}` : clipWords(orgName, 4).replace("…", "");
  const meta = { titleMain: titleMain.length > 42 ? titleMain.replace(/^(.{20,40}?)\s/, "$1\n") : titleMain, titleSub, titleFull, docType, school: capFirst(school.toLowerCase()).replace(/(\s)(tài|tài chính|ngân hàng|kinh tế)/g, "$1$2").replace(/^(Học viện|Trường đại học|Đại học)\s+(.*)$/i, (m, a, b) => a + " " + b.replace(/(^|\s)(\S)/g, (x, s, c) => s + c.toUpperCase())),
    schoolParent: parents.length ? parents.join("  ·  ") : undefined, orgName, orgShort, student: student ? student.replace(/\S+/g, w => w.charAt(0) + w.slice(1).toLowerCase()) : "", supervisor, year, city: city || undefined };
  if (form.degree) meta.docType = form.degree.toUpperCase();

  // ----- khung chương -----
  const h1 = nodes.map((n, i) => [n, i]).filter(([n]) => n.kind === "h" && /^(CHƯƠNG|PHẦN)\s*(\d+|[IVX]+)/i.test(n.text));
  const isPhan = h1.length && /^PHẦN/i.test(h1[0][0].text);
  const idx = k => (h1[k] ? h1[k][1] : nodes.length);
  const r1 = [idx(0), idx(1)], r2 = isPhan ? [idx(0), idx(1)] : [idx(1), idx(2)], r3 = isPhan ? [idx(1), nodes.length] : [idx(2), nodes.length];
  const theory = isPhan ? (section(nodes, /lý luận|cơ sở lý/i, r1[0], r1[1]) || { start: r1[0], end: r1[1] }) : { start: r1[0], end: r1[1] };
  const practice = isPhan ? (section(nodes, /thực tiễn|thực trạng/i, r1[0], r1[1]) || { start: r1[0], end: r1[1] }) : { start: r2[0], end: r2[1] };
  const ch3 = { start: r3[0], end: r3[1] };
  const topic = lowerFirst(titleMain.replace(/\n/g, " ").toLowerCase());
  const chName = (k, fallback) => (!isPhan && h1[k] ? capFirst(stripNum(h1[k][0].text.replace(/^(CHƯƠNG|PHẦN)\s*(\d+|[IVX]+)[:.\s–-]*/i, "")).toLowerCase()) : fallback);
  const names = [chName(0, `Cơ sở lý luận về ${topic}`), chName(1, `Thực trạng ${lowerFirst(titleFull)}`), chName(2, `Giải pháp ${lowerFirst(titleFull)}`)];
  const L = ["Chương 1 · Cơ sở lý luận", "Chương 2 · Thực trạng", "Chương 3 · Giải pháp"];
  const slice = r => nodes.slice(r.start, r.end);

  // ----- Mở đầu -----
  const urg = section(nodes, /cấp thiết/i);
  const ctxBullets = goodSentences(urg ? urg.nodes : nodes.slice(0, 80), 4, 60, 320).map(s => toBullet(s, 26));

  // ----- Chương 1 -----
  const thNodes = slice(theory);
  const defS = goodSentences(thNodes.filter(n => n.kind === "p" && /khái niệm|là (một|hoạt động|việc)|được hiểu/i.test(n.text)), 1, 40, 400)[0] || goodSentences(thNodes, 1)[0] || "";
  const feat = goodSentences(thNodes.filter(n => n.kind === "p" && /đặc điểm|vai trò|thứ (nhất|hai|ba)/i.test(n.text)), 5).map(s => toBullet(s, 16));
  const formsS = thNodes.filter(n => n.kind === "p" && /^(căn cứ|theo|dựa vào|xét)\s/i.test(n.text)).slice(0, 5).map(n => {
    const m = n.text.match(/^(?:căn cứ vào|căn cứ|theo|dựa vào|xét về|xét)\s+([^,:]{3,30})[,:]\s*(.*)$/i);
    return m && !/\(\s*\d{4}|\d{4}\s*\)/.test(m[1]) ? { label: capFirst(m[1]), text: clipWords(m[2], 14) } : null;
  }).filter(Boolean);
  const ind = section(nodes, /chỉ tiêu/i, theory.start, theory.end);
  const formulas = (ind ? ind.nodes : []).filter(n => n.kind === "p" && /(=|×|x\s*100\s*%)/.test(n.text) && n.text.length < 220).slice(0, 9)
    .map(n => { const [a, b] = n.text.split(/=(.+)/); return { indicator: clipWords(stripNum(a || "Chỉ tiêu"), 8), formula: clipWords((b || n.text).trim(), 16) }; });
  const indHeads = (ind ? ind.nodes : []).filter(n => n.kind === "h").map(n => clipWords(stripNum(n.text), 8));
  const fac = section(nodes, /nhân tố/i, theory.start, theory.end);
  const facS = goodSentences(fac ? fac.nodes : [], 10, 40, 300).map(s => toBullet(s, 16));
  const half = Math.ceil(facS.length / 2) || 1;

  // ----- Chương 2 -----
  const prNodes = slice(practice);
  const intro = section(nodes, /khái quát|giới thiệu|tổng quan|lịch sử/i, practice.start, practice.end);
  const introP = (intro ? intro.nodes : prNodes).filter(n => n.kind === "p");
  const ms = [];
  const est = introP.map(n => n.text).join(" ").match(/[^.]*thành lập[^.]*\./i);
  if (est) ms.push({ label: (est[0].match(/\d{1,2}\/\d{1,2}\/\d{4}|năm \d{4}/) || ["Thành lập"])[0], text: clipWords(est[0].trim(), 18) });
  const addr = introP.map(n => n.text).join(" ").match(/(?:trụ sở|địa chỉ)[^.]*\./i);
  if (addr) ms.push({ label: "Trụ sở", text: clipWords(addr[0].trim(), 16) });
  goodSentences(introP, 6, 50, 260).filter(s => !ms.find(m => m.text.startsWith(s.slice(0, 20)))).slice(0, 4 - ms.length).forEach(s => ms.push({ label: "Hoạt động", text: clipWords(s, 18) }));
  const units = [...new Set((introP.map(n => n.text).join(" ").match(/Phòng\s+[A-ZĐÀ-Ỹ][^,.;():]{2,38}?(?=\s+Phòng|\s+Hình|[,.;():]|$)/g) || []).map(u => u.trim()))].slice(0, 8);
  const tables = nodes.map((n, i) => [n, i]).filter(([n, i]) => n.kind === "t" && i >= practice.start && i < practice.end)
    .map(([n]) => ({ n, c: compactTable(n) })).filter(x => x.c);
  const kq = tables.find(x => /kết quả (hoạt động )?kinh doanh|lợi nhuận/i.test((x.n.caption || "") + x.n.grid.map(r => r[0]).join(" "))) || tables[0];
  const rest = tables.filter(x => x !== kq);
  // tối đa 5 bảng thực trạng, ưu tiên bảng có số liệu đầy đủ, khác chủ đề
  const chosen = [];
  for (const x of rest) { if (chosen.length >= 5) break; if (!chosen.find(y => (y.n.caption || "").slice(0, 25) === (x.n.caption || "").slice(0, 25))) chosen.push(x); }
  const tSlide = (x, title) => {
    const tb = x.c, ch = chartFor(tb);
    return { type: "tableChart", label: L[1], title: clipWords(title || stripNum((x.n.caption || "Số liệu thực trạng").replace(/^(Bảng|Biểu)\s*[\d. ]+\s*/i, "")).replace(/\s+(của|tại)\s+.*$/i, ""), 9),
      table: { caption: clipWords((x.n.caption || "Bảng số liệu").replace(/\s+giai đoạn\s+\d{4}\s*[–-]\s*\d{4}$/, ""), 20), unit: undefined, source: x.n.source, header: tb.header, rows: tb.rows }, chart: ch || undefined, summary: summaryFor(tb) };
  };
  const ev = section(nodes, /đánh giá/i, practice.start, practice.end);
  const evN = ev ? ev.nodes : [];
  const cut = re => { const k = evN.findIndex(n => (n.kind === "p" || n.kind === "h") && re.test(n.text) && n.text.length < 120); return k; };
  const kRes = cut(/kết quả đạt được|ưu điểm|thành tựu/i), kLim = cut(/hạn chế|tồn tại/i), kCau = cut(/nguyên nhân/i);
  const part = (a, b) => (a >= 0 ? evN.slice(a + 1, b > a ? b : evN.length) : []);
  const ach = goodSentences(part(kRes, kLim), 6, 30, 260).map(s => toBullet(s, 14));
  const lim = goodSentences(part(kLim, kCau), 6, 30, 260).map((s, i) => {
    const b = toBullet(s, 14);
    if (b.label) return { code: `H${i + 1}`, label: b.label, text: b.text };
    const m = b.text.match(/^([^,]{8,45}),\s*(.+)$/);
    return m ? { code: `H${i + 1}`, label: m[1], text: clipWords(m[2], 12) } : { code: `H${i + 1}`, label: clipWords(b.text, 5).replace("…", ""), text: clipWords(b.text.split(/\s+/).slice(5).join(" "), 12) };
  });
  const cauN = part(kCau, -1);
  const kObj = cauN.findIndex(n => /khách quan/i.test(n.text) && n.text.length < 120);
  const subj = goodSentences(kObj > 0 ? cauN.slice(0, kObj) : cauN.slice(0, Math.ceil(cauN.length / 2)), 6, 30, 260).map(s => toBullet(s, 12));
  const obj = goodSentences(kObj > 0 ? cauN.slice(kObj + 1) : cauN.slice(Math.ceil(cauN.length / 2)), 6, 30, 260).map(s => toBullet(s, 12));

  // ----- Chương 3 -----
  const c3 = slice(ch3);
  const dir = section(nodes, /định hướng|mục tiêu|quan điểm/i, ch3.start, ch3.end);
  const goalB = goodSentences(dir ? dir.nodes : c3, 5, 40, 260).map(s => toBullet(s, 16));
  const sol = section(nodes, /giải pháp/i, ch3.start, ch3.end);
  const solHeads = (sol ? sol.nodes : []).map((n, i) => [n, i]).filter(([n]) => n.kind === "h");
  const items = solHeads.slice(0, 8).map(([h, i], k) => {
    const body = sol.nodes.slice(i + 1).find(n => n.kind === "p");
    return { code: `GP${k + 1}`, name: clipWords(capFirst(stripNum(h.text)), 11), text: clipWords(body ? sentences(body.text)[0] : "", 22), link: lim[k] ? lim[k].code : undefined };
  });
  const concl = section(nodes, /kết luận/i, ch3.start, ch3.end);
  const conclText = clipWords(goodSentences(concl ? concl.nodes : c3.slice(-20), 2, 40, 400).join(" "), 45);
  const recHeads = nodes.map((n, i) => [n, i]).filter(([n, i]) => n.kind === "h" && i >= ch3.start && /kiến nghị (với|đối với)/i.test(n.text)).slice(0, 2);
  const recs = recHeads.map(([h, i]) => {
    const s = section(nodes, new RegExp(h.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), i, ch3.end);
    return { heading: clipWords(capFirst(stripNum(h.text).replace(/^kiến nghị đối với/i, "Kiến nghị với")), 7), bullets: goodSentences(s ? s.nodes : [], 4, 30, 260).map(x => toBullet(x, 12)) };
  }).filter(r => r.bullets.length);

  // ----- lắp deck -----
  const nonEmpty = (a, fb) => (a && a.length ? a : fb);
  const PH = t => [{ text: t }];
  const slides = [];
  slides.push({ type: "cover" });
  slides.push({ type: "context", label: "Mở đầu", title: "Tính cấp thiết của đề tài", bullets: nonEmpty(ctxBullets, PH("[Bổ sung lý do chọn đề tài]")), highlight: titleFull });
  slides.push({ type: "structure", label: "Mở đầu", title: isPhan ? "Kết cấu đề án" : "Kết cấu luận văn",
    parts: names.map((nm, i) => ({ label: `Chương ${i + 1}`, name: nm, desc: ["Khái niệm, đặc điểm; chỉ tiêu đánh giá; nhân tố ảnh hưởng.", `Giới thiệu đơn vị; thực trạng ${tables.length ? "qua " + tables.length + " bảng số liệu" : ""}; đánh giá kết quả, hạn chế, nguyên nhân.`, `Định hướng; ${items.length || "các"} nhóm giải pháp; kết luận và kiến nghị.`][i] })) });
  const chap = (k, sub) => ({ type: "chapter", num: `0${k + 1}`, chapterLabel: `CHƯƠNG ${k + 1}`, name: names[k], sub });
  slides.push(chap(0, "Khái niệm, đặc điểm · Chỉ tiêu đánh giá · Nhân tố ảnh hưởng"));
  slides.push({ type: "concept", label: L[0], title: "Khái niệm, đặc điểm và phân loại", definition: { label: "Khái niệm", text: clipWords(defS || "[Bổ sung định nghĩa]", 40) },
    featuresTitle: "Đặc điểm và vai trò", features: nonEmpty(feat, PH("[Bổ sung đặc điểm]")), formsTitle: "Phân loại", forms: formsS.length >= 2 ? formsS : [{ label: "Thời hạn", text: "[Bổ sung]" }, { label: "Mục đích", text: "[Bổ sung]" }] });
  if (formulas.length) slides.push({ type: "indicatorTable", label: L[0], title: "Chỉ tiêu đánh giá", groups: [{ name: "Chỉ tiêu định lượng", items: formulas.slice(0, 4) }, ...(formulas.length > 4 ? [{ name: "Chỉ tiêu khác", items: formulas.slice(4, 8) }] : [])] });
  else slides.push({ type: "text2col", label: L[0], title: "Chỉ tiêu đánh giá", columns: [{ heading: "Nhóm chỉ tiêu", bullets: nonEmpty(indHeads.slice(0, 6).map(t => ({ text: t })), PH("[Bổ sung]")) }, { heading: "Ghi chú", bullets: PH("Chỉ tiêu tương ứng phần thực trạng Chương 2") }] });
  slides.push({ type: "text2col", label: L[0], title: "Nhân tố ảnh hưởng", columns: [{ heading: "Nhân tố chủ quan", bullets: nonEmpty(facS.slice(0, Math.min(half, 6)), PH("[Bổ sung]")) }, { heading: "Nhân tố khách quan", bullets: nonEmpty(facS.slice(half, half + 6), PH("[Bổ sung]")) }] });
  slides.push(chap(1, "Giới thiệu đơn vị · Kết quả kinh doanh · Thực trạng · Đánh giá"));
  slides.push({ type: "orgIntro", label: L[1], title: clipWords(`Giới thiệu ${orgShort || "đơn vị"}`, 9), milestones: ms.length >= 2 ? ms : [...ms, { label: "Đơn vị", text: orgName || "[Bổ sung]" }, { label: "Hoạt động", text: "[Bổ sung]" }].slice(0, 3),
    org: { top: "Ban Giám đốc", units: units.length >= 2 ? units : ["[Phòng/ban 1]", "[Phòng/ban 2]", "[Phòng/ban 3]", "[Phòng/ban 4]"] } });
  if (kq) slides.push(tSlide(kq, "Kết quả hoạt động kinh doanh"));
  chosen.forEach(x => slides.push(tSlide(x)));
  slides.push({ type: "assessment", label: "Chương 2 · Đánh giá", title: "Kết quả đạt được và hạn chế", achievements: nonEmpty(ach, PH("[Bổ sung kết quả]")), limitations: lim.length ? lim : [{ code: "H1", label: "[Hạn chế]", text: "[Bổ sung]" }] });
  slides.push({ type: "causes", label: "Chương 2 · Đánh giá", title: "Nguyên nhân của hạn chế", subjective: nonEmpty(subj, PH("[Bổ sung]")), objective: nonEmpty(obj, PH("[Bổ sung]")),
    bridge: `các nguyên nhân là căn cứ cho ${items.length || "các"} nhóm giải pháp${lim.length && items.length ? ` (H1–H${lim.length} ↔ GP1–GP${items.length})` : ""}` });
  slides.push(chap(2, "Định hướng · Các nhóm giải pháp · Kết luận và kiến nghị"));
  slides.push({ type: "goals", label: L[2], title: "Định hướng và mục tiêu", bullets: nonEmpty(goalB, PH("[Bổ sung định hướng]")) });
  slides.push({ type: "solutions", label: L[2], title: "Các nhóm giải pháp", items: items.length >= 2 ? items : [{ code: "GP1", name: "[Giải pháp 1]", text: "[Bổ sung]" }, { code: "GP2", name: "[Giải pháp 2]", text: "[Bổ sung]" }] });
  slides.push({ type: "conclusion", label: "Chương 3 · Kết luận và kiến nghị", title: "Kết luận và kiến nghị", conclusion: conclText || "[Bổ sung kết luận]", recommendations: recs.length ? recs : [{ heading: "Kiến nghị", bullets: PH("[Bổ sung]") }] });
  slides.push({ type: "thanks" });
  slides.forEach(s => { if (s.type !== "cover" && s.type !== "thanks" && !s.notes) s.notes = "[Giả lập] Lời thuyết trình sẽ do Claude soạn khi có API key."; });

  const [mainShape, subShape, motif] = pickShapes(titleFull + " " + orgName);
  return {
    meta, theme: { mainShape, subShape, motif, rationale: "Chế độ giả lập: chọn khung theo từ khóa ngành trong tên đề tài." },
    issues: sumIssues(nodes), slides,
  };
}

module.exports = { mockDeck, parse, compactTable };
