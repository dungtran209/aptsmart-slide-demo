// renderer.js — deck.json → .pptx (pptxgenjs, LAYOUT_WIDE 13.333×7.5 in).
// Tổng quát hóa từ mã mẫu chuẩn v5.2 (build_slide_v5_bidv.js): cùng bố cục, nhưng
//  • màu lấy từ theme (logo đơn vị), khung chủ đạo/phụ theo deck.theme (thay "diamond"/"shard" của mẫu BIDV);
//  • cỡ chữ, chiều cao dòng bảng, bố cục bảng–biểu đồ tự co giãn theo độ dài nội dung do AI sinh.
const pptxgen = require("pptxgenjs");
const makeMotifs = require("./motifs");
const { buildTokens, colorsFromLogo, prepareLogo } = require("./theme");

const F = "Arial", W = 13.333, H = 7.5, MX = 0.6, CW = W - 2 * MX;

// ---------- ước lượng kích thước chữ (Arial, tiếng Việt) ----------
const PT = 1 / 72;
function nLines(str, wIn, pt, bold = false) {
  const cpl = Math.max(1, Math.floor((wIn * 72) / (pt * (bold ? 0.56 : 0.52))));
  return String(str ?? "").split("\n").reduce((a, p) => a + Math.max(1, Math.ceil((p.length * 1.06) / cpl)), 0);
}
const textH = (str, wIn, pt, bold, spacing = 1.2) => nLines(str, wIn, pt, bold) * pt * spacing * PT;
const lab = b => (b.label ? b.label.replace(/[:：]\s*$/, "") + ": " : "");
function bulletsH(items, wIn, pt, gap) {
  const wi = wIn - 0.25; // thụt lề bullet
  return items.reduce((a, b) => a + textH(lab(b) + b.text, wi, pt) + gap * PT, 0);
}
function fitBullets(items, w, h, start = 15, min = 12, gapStart = 14) {
  for (let pt = start; pt >= min; pt -= 0.5) {
    for (const g of [gapStart, gapStart * 0.6, gapStart * 0.35]) if (bulletsH(items, w, pt, g) <= h) return { pt, gap: g };
  }
  return { pt: min, gap: 4 };
}
function fitText(str, w, h, start, min, bold = false, spacing = 1.2) {
  for (let pt = start; pt >= min; pt -= 0.5) if (textH(str, w, pt, bold, spacing) <= h) return pt;
  return min;
}
const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1).trimEnd() + "…" : String(s));

/**
 * @param {object} deck   deck.json đã kiểm tra
 * @param {object} assets { orgLogo, schoolLogo: path|null, images: [{id, path, label}], primary, accent (ghi đè), mainShape, subShape (ghi đè) }
 * @param {string} outPath đường dẫn .pptx
 */
async function renderDeck(deck, assets = {}, outPath) {
  const warnings = [];
  const meta = Object.assign({ student: "[Họ tên học viên]", supervisor: "[Giảng viên hướng dẫn]", school: "[Tên trường]", year: String(new Date().getFullYear()) }, deck.meta);
  const th = deck.theme || {};

  // ---- màu ----
  let primary = assets.primary || null, accent = assets.accent || null;
  if ((!primary || !accent) && assets.orgLogo) {
    const c = await colorsFromLogo(assets.orgLogo).catch(() => null);
    if (c) { primary = primary || c.primary; accent = accent || c.accent; }
  }
  primary = primary || th.primary; accent = accent || th.accent;
  const C = buildTokens(primary, accent);
  const MAIN = assets.mainShape || th.mainShape || "diamond";
  const SUB = assets.subShape || th.subShape || "shard";
  const SOFT = th.motif === "soft";

  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.title = meta.titleFull || meta.titleSub || "Slide bảo vệ";
  pres.author = meta.student;
  pres.company = "APTsmart Slide";
  const M = makeMotifs(pres, C, F);
  let pageNo = 0;

  // ---- logo ----
  const LOGO = assets.orgLogo ? await prepareLogo(assets.orgLogo).catch(() => null) : null;
  const SCH = assets.schoolLogo ? await prepareLogo(assets.schoolLogo).catch(() => null) : null;
  const schoolRound = SCH && SCH.round ? await M.maskImage(SCH.buffer, "circle", 1, 1, 300) : null;

  // ---- ảnh: chọn theo id, nếu thiếu thì lần lượt lấy từ kho ảnh ----
  const pool = (assets.images || []).filter(Boolean);
  const byId = new Map(pool.map(im => [im.id, im]));
  const used = new Map();
  let rr = 0;
  function pick(ref, fallbackLabel) {
    if (ref && byId.has(ref.id)) { used.set(ref.id, (used.get(ref.id) || 0) + 1); return { src: byId.get(ref.id).path, shape: ref.shape }; }
    if (!pool.length) return { label: fallbackLabel, shape: ref && ref.shape };
    // ảnh ít dùng nhất, xoay vòng
    const sorted = pool.map((im, i) => [im, used.get(im.id) || 0, (i - rr + pool.length) % pool.length]).sort((a, b) => a[1] - b[1] || a[2] - b[2]);
    const im = sorted[0][0]; rr = (pool.indexOf(im) + 1) % pool.length; used.set(im.id, (used.get(im.id) || 0) + 1);
    return { src: im.path, shape: ref && ref.shape };
  }
  async function photo(s, kind, x, y, w, h, ref, label) {
    const p = pick(ref, label);
    await M.photo(s, p.shape || kind, x, y, w, h, p.src ? { src: p.src } : { label: p.label });
  }

  // ---- tiện ích dựng chữ ----
  const t = (s, text, o) => s.addText(text, Object.assign({ fontFace: F, color: C.ink, margin: 0, isTextBox: true, valign: "top" }, o));
  const bl = (items, size = 14, gap = 6, color = C.ink) => items.map((it, i) => {
    const last = i === items.length - 1;
    const lb = lab(it);
    if (lb) return [{ text: lb, options: { bold: true, color: C.dark, bullet: { indent: 15 }, fontSize: size, paraSpaceAfter: gap } }, { text: it.text, options: { color, fontSize: size, paraSpaceAfter: gap, breakLine: !last } }];
    return [{ text: it.text, options: { color, bullet: { indent: 15 }, fontSize: size, paraSpaceAfter: gap, breakLine: !last } }];
  }).flat();
  const bulletsBox = (s, items, x, y, w, h, start = 15, min = 12, gap = 14, o = {}) => {
    const f = fitBullets(items, w, h, start, min, gap);
    if (f.pt === min && bulletsH(items, w, min, 4) > h) warnings.push(`Slide ${pageNo}: nội dung có thể tràn khung, nên rút gọn.`);
    t(s, bl(items, f.pt, f.gap), Object.assign({ x, y, w, h }, o));
  };
  const marker = (s, x, y, d = 0.16, color = C.gold) => M.poly(s, MAIN, x, y, d, d, { fill: { color }, line: { type: "none" } });
  const deco = (s, x, y) => (SOFT ? M.dots(s, x, y, 8, 3, C.light) : M.dots(s, x, y, 8, 3, C.light));
  const accentRow = (s, x, y, n = 5) => (SOFT ? M.dots(s, x, y + 0.08, n * 2, 1, C.gold, 0.16, 0.09) : M.slashes(s, x, y, n, C.gold));
  const chartBase = {
    catAxisLabelColor: C.ink, valAxisLabelColor: C.muted, catAxisLabelFontFace: F, valAxisLabelFontFace: F, catAxisLabelFontSize: 11, valAxisLabelFontSize: 10,
    valGridLine: { color: "E3EBEA", size: 0.5 }, catGridLine: { style: "none" }, dataLabelFontFace: F, dataLabelFontSize: 10, dataLabelColor: C.ink,
    titleFontFace: F, titleFontSize: 12, titleColor: C.dark, showTitle: true, legendFontFace: F, legendFontSize: 10,
  };
  const logoBox = (s, x, y, maxW, maxH) => {
    if (!LOGO) return false;
    let h = maxH, w = h * LOGO.ar;
    if (w > maxW) { w = maxW; h = w / LOGO.ar; }
    s.addImage({ data: LOGO.data, x: x - w, y: y + (maxH - h) / 2, w, h });
    return true;
  };

  function slide(label, title) {
    const s = pres.addSlide(); pageNo++;
    s.background = { color: C.white };
    marker(s, MX, 0.36);
    t(s, String(label || "").toUpperCase(), { x: MX + 0.26, y: 0.3, w: 8, h: 0.28, fontSize: 11, bold: true, color: C.goldDeep, charSpacing: 1, valign: "middle" });
    t(s, title, { x: MX, y: 0.6, w: 10.2, h: 0.65, fontSize: fitText(title, 10.2, 0.65, 26, 18, true), bold: true, color: C.teal, valign: "middle" });
    if (!logoBox(s, W - MX, 0.34, 2.2, 0.56)) t(s, meta.orgShort || "", { x: W - MX - 2.4, y: 0.34, w: 2.4, h: 0.5, fontSize: 13, bold: true, color: C.teal, align: "right", valign: "middle" });
    M.corner(s, "br", 0.75, C.teal); M.corner(s, "br", 0.4, C.gold);
    t(s, String(pageNo), { x: W - 0.5, y: H - 0.36, w: 0.4, h: 0.3, fontSize: 11, bold: true, color: C.white, align: "right" });
    return s;
  }
  function summary(s, x, y, w, h, text, size = 13.5) {
    s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: C.tint }, line: { type: "none" } });
    marker(s, x + 0.18, y + h / 2 - 0.1, 0.2, C.teal);
    t(s, text, { x: x + 0.55, y, w: w - 0.75, h, fontSize: fitText(text, w - 0.8, h - 0.1, size, 11.5), valign: "middle" });
  }
  const caption = (s, text, x, y, w) => t(s, text, { x, y, w, h: 0.3, fontSize: fitText(text, w, 0.3, 13, 11, true), bold: true, color: C.dark, align: "center", valign: "middle" });
  const note = (s, text, x, y, w, align = "left") => t(s, text, { x, y, w, h: 0.25, fontSize: 10.5, italic: true, color: C.muted, align, valign: "middle" });
  const notes = (s, n) => { if (n) s.addNotes(n); };

  // ---- bảng tự co giãn ----
  // Cột số: đủ rộng cho giá trị dài nhất (không ngắt "18,59%"); cột đầu (chỉ tiêu) nhận phần còn lại.
  function colWidths(header, rows, w, fs = 13, firstMin = 1.6) {
    const n = header.length;
    const body = rows.filter(r => r.style !== "group");
    const need = header.map((h, i) => {
      const cells = body.map(r => String(r.cells[i] ?? ""));
      const longest = Math.max(...cells.map(c => c.length), 1);
      const hdrWord = Math.max(...String(h).split(/\s+/).map(x => x.length));
      const textual = cells.some(c => /[A-Za-zÀ-ỹ]{3,}/.test(c.replace(/^(Khá|Tốt|Kém|TB)$/, "")));
      const base = textual ? Math.min(longest, 26) : Math.max(longest, hdrWord);
      return Math.max(0.7, base * fs * 0.56 / 72 + 0.16);
    });
    if (n === 1) return [w];
    const rest = need.slice(1);
    let restSum = rest.reduce((a, b) => a + b, 0);
    let first = Math.max(firstMin, Math.min(need[0], w * 0.5));
    if (first + restSum > w) {                  // chật: co cột cuối trước, rồi co tỉ lệ
      const k = (w - first) / restSum;
      return [first, ...rest.map(x => x * k)];
    }
    // dư: chia thêm cho cột đầu (tối đa nhu cầu thực), phần còn lại rải đều các cột số
    const firstNeed = Math.max(first, Math.min(...[need[0], w - restSum]));
    first = Math.max(first, Math.min(firstNeed, w - restSum));
    const extra = (w - first - restSum) / rest.length;
    return [first, ...rest.map(x => x + extra)];
  }
  function tableLayout(table, w, maxH, start = 13, min = 11) {
    const colW = colWidths(table.header, table.rows, w, start);
    const n = table.header.length;
    for (let fs = start; fs >= min; fs -= 0.5) {
      const rh = r => Math.max(fs * 1.8 * PT, ...r.map((c, i) => textH(c, (r.length === 1 ? w : colW[i]) - 0.12, fs, false, 1.15) + 0.09));
      let heights = [rh(table.header), ...table.rows.map(r => rh(r.style === "group" ? [r.cells[0]] : r.cells))];
      let tot = heights.reduce((a, b) => a + b, 0);
      if (tot <= maxH || fs - 0.5 < min) {
        // còn chỗ: nới dòng (tối đa 0,48 in/dòng) cho bảng thoáng như mẫu v5.2
        const target = Math.min(0.48, maxH / heights.length);
        heights = heights.map(h => Math.max(h, Math.min(target, h + (maxH - tot) / heights.length)));
        tot = heights.reduce((a, b) => a + b, 0);
        return { fs, colW, heights, tot, n };
      }
    }
  }
  function drawTable(s, table, x, y, w, maxH, o = {}) {
    let yy = y;
    if (table.caption) { caption(s, table.caption, x, yy, w); yy += 0.28; }
    if (table.unit) { note(s, table.unit, x, yy, w, "right"); yy += 0.26; } else if (table.caption) yy += 0.08;
    const reserve = table.source ? 0.32 : 0.05;
    const L = tableLayout(table, w, maxH - (yy - y) - reserve, o.fs || 13, o.min || 11);
    let z = 0;
    const hdr = table.header.map((h, i) => ({ text: h, options: { bold: true, color: C.white, fill: { color: C.teal }, align: i === 0 ? "left" : "center" } }));
    const body = table.rows.map(r => {
      if (r.style === "group") { z = 0; return [{ text: r.cells[0], options: { colspan: L.n, bold: true, color: C.dark, fill: { color: C.tint }, align: "left" } }]; }
      const b = r.style === "total";
      const fill = b ? C.rowTotal : z++ % 2 ? C.tint2 : C.white;
      return r.cells.map((v, i) => ({ text: String(v ?? ""), options: { bold: b, color: C.ink, fill: { color: fill }, align: i === 0 ? "left" : o.alignBody || "center" } }));
    });
    s.addTable([hdr, ...body], { x, y: yy, w, colW: L.colW, rowH: L.heights, fontFace: F, fontSize: L.fs, valign: "middle", border: { type: "solid", pt: 0.5, color: C.line }, margin: [2, 5, 2, 5], autoPage: false });
    yy += L.tot;
    if (table.source) { note(s, table.source, x, yy + 0.04, w); yy += 0.3; }
    if (yy - y > maxH + 0.15) warnings.push(`Slide ${pageNo}: bảng "${clip(table.caption || "", 40)}" khá dài, nên kiểm tra lại.`);
    return yy;
  }

  // ---- biểu đồ native ----
  function drawChart(s, ch, x, y, w, h, o = {}) {
    const vals = ch.series.flatMap(se => se.values);
    const dec = ch.decimals ?? Math.min(2, Math.max(0, ...vals.map(v => (String(v).split(".")[1] || "").length)));
    const fmt = (dec ? "#,##0." + "0".repeat(dec) : "#,##0") + (ch.percent ? '"%"' : "");
    const data = ch.series.map(se => ({ name: se.name, labels: ch.labels, values: se.values }));
    const multi = ch.series.length > 1;
    const colors = [C.teal, C.gold, C.dark, C.light];
    const mx = Math.max(...vals), mn = Math.min(...vals);
    const common = Object.assign({}, chartBase, { x, y, w, h, title: ch.title, showTitle: o.showTitle !== false, showLegend: multi, legendPos: "b" });
    if (ch.type === "doughnut") {
      s.addChart(pres.charts.DOUGHNUT, [data[0]], Object.assign(common, { holeSize: 50, chartColors: [C.teal, C.gold, C.light, C.dark, C.gray, C.red, C.cream], showPercent: true, showValue: false,
        dataLabelColor: C.white, dataLabelFontSize: 10, showLegend: true, legendPos: "b" }));
    } else if (ch.type === "line") {
      const span = mx - mn || Math.abs(mx) || 1;
      let lo = mn - span * 0.35, hi = mx + span * 0.3;
      if (mn >= 0 && lo < 0) lo = 0;
      const step = Math.pow(10, Math.floor(Math.log10(span)));
      lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
      s.addChart(pres.charts.LINE, data, Object.assign(common, { chartColors: multi ? [C.gold, C.teal, C.dark] : [C.gold], lineSize: 2.5, lineDataSymbol: "circle", lineDataSymbolSize: 7,
        showValue: true, dataLabelPosition: multi ? "r" : "t", dataLabelFormatCode: fmt, dataLabelFontSize: 9.5, valAxisMinVal: lo, valAxisMaxVal: hi, valAxisLabelFormatCode: (dec ? "#,##0.0" : "#,##0") + (ch.percent ? '"%"' : "") }));
    } else {
      const horiz = ch.type === "bar";
      const opt = { barDir: horiz ? "bar" : "col", barGrouping: "clustered", barGapWidthPct: multi ? 60 : horiz ? 35 : 80, chartColors: multi ? colors : [C.teal], showValue: true,
        dataLabelPosition: "outEnd", dataLabelFormatCode: fmt, valAxisHidden: true, valGridLine: { style: "none" } };
      if (mn >= 0) { opt.valAxisMinVal = horiz && mn > 0 && (mx - mn) / mx < 0.3 ? Math.floor(mn * 0.85 * 10) / 10 : 0; opt.valAxisMaxVal = mx * 1.18; }
      if (multi) opt.dataLabelFontSize = 9;
      s.addChart(pres.charts.BAR, data, Object.assign(common, opt));
    }
  }

  // ================= các loại slide =================
  async function divider(sl) {
    const s = pres.addSlide(); pageNo++;
    s.background = { color: C.white };
    M.band(s, 7.0, 0, 6.4, H, C.teal, 2.0);
    M.band(s, 11.6, 0, 1.8, H, C.dark, 0.9);
    M.frame(s, MAIN, 7.55, 1.15, 5.2, 5.2, C.gold, { dx: 0.28, dy: 0.0, width: 7 });
    await photo(s, MAIN, 7.55, 1.15, 5.2, 5.2, sl.image, "Ảnh hoạt động / nhân viên đơn vị");
    M.poly(s, MAIN, MX, 1.3, 1.5, 1.5, { fill: { color: C.teal }, line: { type: "none" } });
    t(s, sl.num, { x: MX, y: 1.3, w: 1.5, h: 1.5, fontSize: 36, bold: true, color: C.white, align: "center", valign: "middle" });
    t(s, sl.chapterLabel.toUpperCase(), { x: MX, y: 3.15, w: 6, h: 0.45, fontSize: 18, bold: true, color: C.goldDeep, charSpacing: 1 });
    t(s, sl.name, { x: MX, y: 3.6, w: 6.2, h: 1.4, fontSize: fitText(sl.name, 6.2, 1.4, 25, 17, true), bold: true, color: C.dark });
    t(s, sl.sub || "", { x: MX, y: 5.0, w: 5.9, h: 1.0, fontSize: fitText(sl.sub || "", 5.9, 1.0, 15, 12), color: C.muted });
    accentRow(s, MX, 6.2, 5);
    M.dots(s, 5.2, 6.3, 7, 3, C.light);
    t(s, String(pageNo), { x: W - 0.6, y: H - 0.4, w: 0.4, h: 0.3, fontSize: 11, bold: true, color: C.white, align: "right" });
    notes(s, sl.notes);
  }

  const schoolLogo = (s, x, y, d, dark = false) => {
    if (!SCH) return 0;
    if (schoolRound) { s.addImage({ data: schoolRound, x, y, w: d, h: d }); return d; }
    let h = d, w = h * SCH.ar; if (w > d * 2.2) { w = d * 2.2; h = w / SCH.ar; }
    if (dark) s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x - 0.06, y: y - 0.06, w: w + 0.12, h: h + 0.12, fill: { color: C.white }, line: { type: "none" }, rectRadius: 0.08 });
    s.addImage({ data: SCH.data, x, y: y + (d - h) / 2, w, h });
    return w;
  };

  async function cover(sl) {
    const s = pres.addSlide(); pageNo++; s.background = { color: C.white };
    M.band(s, 6.9, 0, 6.5, H, C.teal, 2.1); M.band(s, 11.5, 0, 1.9, H, C.dark, 0.9);
    M.block(s, SUB, 6.75, 0.85, 6.0, 4.1, C.gold, { dx: 0.22, dy: 0.22 });
    await photo(s, SUB, 6.75, 0.85, 6.0, 4.1, sl.image, "Ảnh trụ sở / tập thể đơn vị");
    M.frame(s, MAIN, 6.15, 4.25, 2.7, 2.7, C.white, { dx: 0, dy: 0, width: 8 });
    await photo(s, MAIN, 6.15, 4.25, 2.7, 2.7, sl.image2, "Ảnh giao dịch");
    const lw = schoolLogo(s, MX, 0.4, 0.85);
    const tx = lw ? MX + lw + 0.15 : MX;
    const sp = meta.schoolParent ? [{ text: meta.schoolParent.toUpperCase(), options: { fontSize: 11, color: C.muted, breakLine: true } }] : [];
    t(s, [...sp, { text: meta.school.toUpperCase(), options: { fontSize: fitText(meta.school.toUpperCase(), 5.0, 0.4, 15, 11, true), bold: true, color: C.dark } }], { x: tx, y: 0.45, w: 5.2, h: 0.8, valign: "middle" });
    t(s, (meta.docType || "").toUpperCase(), { x: MX, y: 1.75, w: 5.6, h: 0.4, fontSize: 14, bold: true, color: C.goldDeep, charSpacing: 2 });
    const tm = meta.titleMain.toUpperCase();
    t(s, tm, { x: MX, y: 2.2, w: 6.0, h: 1.5, fontSize: fitText(tm, 6.0, 1.5, 34, 22, true, 1.05), bold: true, color: C.teal, lineSpacingMultiple: 0.95, valign: "bottom" });
    t(s, meta.titleSub || "", { x: MX, y: 3.75, w: 5.4, h: 0.95, fontSize: fitText(meta.titleSub || "", 5.4, 0.95, 18, 12.5), color: C.dark });
    accentRow(s, MX, 4.85, 5);
    const people = [["Giảng viên hướng dẫn", meta.supervisor], ["Học viên thực hiện", meta.student]];
    if (meta.major) people.push(["Chuyên ngành", meta.major]);
    const pw = people.length > 2 ? 1.9 : 2.6;
    people.forEach((p, i) => t(s, [{ text: p[0], options: { fontSize: 11, color: C.muted, breakLine: true } }, { text: p[1], options: { fontSize: fitText(p[1], pw - 0.1, 0.4, 14, 11, true), bold: true, color: C.dark } }], { x: MX + i * pw, y: 5.35, w: pw - 0.1, h: 0.65 }));
    t(s, [meta.city, meta.year].filter(Boolean).join(" – "), { x: MX, y: 6.55, w: 3, h: 0.3, fontSize: 12, color: C.muted });
    notes(s, sl.notes || `Kính thưa Hội đồng. Em là ${meta.student}, xin trình bày ${meta.docType ? meta.docType.toLowerCase() : "đề tài"}: ${meta.titleFull || ""}.`);
  }

  async function context(sl) {
    const s = slide(sl.label, sl.title);
    bulletsBox(s, sl.bullets, MX, 1.55, 7.2, 4.0, 16, 12.5, 20, { align: "justify" });
    s.addShape(pres.shapes.RECTANGLE, { x: MX, y: 5.7, w: 7.2, h: 1.05, fill: { color: C.teal }, line: { type: "none" } });
    const hl = `“${sl.highlight}”`;
    t(s, [{ text: "Đề tài: ", options: { color: C.accentOnPrimary, bold: true } }, { text: hl, options: { color: C.white, bold: true } }],
      { x: MX + 0.25, y: 5.7, w: 6.8, h: 1.05, fontSize: fitText("Đề tài: " + hl, 6.8, 1.0, 15, 11.5, true), valign: "middle" });
    M.frame(s, MAIN, 8.35, 1.55, 4.4, 4.4, C.gold, { dx: 0.25, dy: 0.0, width: 6 });
    await photo(s, MAIN, 8.35, 1.55, 4.4, 4.4, sl.image, "Ảnh sảnh giao dịch / sản phẩm");
    deco(s, 8.6, 6.2);
    notes(s, sl.notes);
  }

  async function structure(sl) {
    const s = slide(sl.label, sl.title);
    const n = sl.parts.length, step = 5.35 / n, d = Math.min(1.25, step - 0.35);
    sl.parts.forEach((p, i) => {
      const y = 1.5 + i * step;
      M.poly(s, MAIN, MX, y + (step - 0.2 - d) / 2, d, d, { fill: { color: i === 1 ? C.gold : C.teal }, line: { type: "none" } });
      t(s, String(i + 1).padStart(2, "0"), { x: MX, y: y + (step - 0.2 - d) / 2, w: d, h: d, fontSize: 24, bold: true, color: C.white, align: "center", valign: "middle" });
      const head = p.label.toUpperCase() + "  " + p.name;
      let f = 1;
      while (f > 0.75 && textH(head, 6.4, 16 * f, true) + textH(p.desc, 6.4, 13.5 * f) > step - 0.2) f -= 0.05;
      t(s, [{ text: p.label.toUpperCase() + "  ", options: { bold: true, color: C.goldDeep, fontSize: 14 * f } }, { text: p.name, options: { bold: true, color: C.teal, fontSize: 16 * f, breakLine: true } },
        { text: p.desc, options: { fontSize: 13.5 * f, color: C.ink } }], { x: MX + d + 0.25, y, w: 6.4, h: step - 0.2, valign: "middle", paraSpaceAfter: 4 });
    });
    M.frame(s, MAIN, 8.5, 1.55, 4.25, 4.25, C.gold, { dx: 0.25, dy: 0, width: 6 });
    await photo(s, MAIN, 8.5, 1.55, 4.25, 4.25, sl.image, "Ảnh hoạt động đơn vị");
    deco(s, 8.9, 6.15);
    notes(s, sl.notes);
  }

  function concept(sl) {
    const s = slide(sl.label, sl.title);
    const def = sl.definition;
    s.addShape(pres.shapes.RECTANGLE, { x: MX, y: 1.5, w: 6.1, h: 1.35, fill: { color: C.tint }, line: { type: "none" } });
    t(s, [{ text: lab({ label: def.label || "Khái niệm" }), options: { bold: true, color: C.teal } }, { text: def.text, options: {} }],
      { x: MX + 0.2, y: 1.5, w: 5.7, h: 1.35, fontSize: fitText(lab(def) + def.text, 5.7, 1.25, 14, 11.5), valign: "middle" });
    t(s, sl.featuresTitle, { x: MX, y: 3.05, w: 6, h: 0.4, fontSize: 15, bold: true, color: C.dark });
    bulletsBox(s, sl.features, MX, 3.55, 6.1, 3.3, 15, 12, 12);
    t(s, sl.formsTitle, { x: 7.15, y: 1.5, w: 5.6, h: 0.4, fontSize: 15, bold: true, color: C.dark });
    const n = sl.forms.length, step = Math.min(0.95, 4.9 / n), hh = step - 0.2;
    sl.forms.forEach((f, i) => {
      const y = 2.0 + i * step;
      M.poly(s, "arrow", 7.15, y, 1.95, hh, { fill: { color: i % 2 ? C.dark : C.teal }, line: { type: "none" } });
      t(s, f.label || "", { x: 7.3, y, w: 1.6, h: hh, fontSize: fitText(f.label || "", 1.55, hh, 13, 10.5, true), bold: true, color: C.white, align: "center", valign: "middle" });
      s.addShape(pres.shapes.RECTANGLE, { x: 9.2, y, w: 3.55, h: hh, fill: { color: C.tint2 }, line: { color: C.line, width: 0.5 } });
      t(s, f.text, { x: 9.35, y, w: 3.3, h: hh, fontSize: fitText(f.text, 3.3, hh - 0.04, 13, 10.5), valign: "middle" });
    });
    notes(s, sl.notes);
  }

  function twoCols(s, cols, y0, hBody, colors) {
    cols.forEach((c, i) => {
      const x = MX + i * 6.15;
      M.poly(s, "tab", x, y0, 5.95, 0.55, { fill: { color: colors[i] }, line: { type: "none" } });
      t(s, c.heading, { x: x + 0.25, y: y0, w: 5.4, h: 0.55, fontSize: 16, bold: true, color: C.white, valign: "middle" });
      bulletsBox(s, c.bullets, x + 0.05, y0 + 0.8, 5.85, hBody, 15.5, 12, 16);
    });
  }
  function text2col(sl) {
    const s = slide(sl.label, sl.title);
    twoCols(s, sl.columns, 1.5, 4.6, [C.teal, C.dark]);
    notes(s, sl.notes);
  }

  function indicatorTable(sl) {
    const s = slide(sl.label, sl.title);
    const hdrTxt = sl.header || ["Nhóm chỉ tiêu", "Chỉ tiêu", "Công thức / nội dung"];
    const colW = [2.3, 3.4, 5.3], wT = 11.0;
    const nRows = sl.groups.reduce((a, g) => a + g.items.length, 0);
    let fs = 13, heights;
    for (; fs >= 10.5; fs -= 0.5) {
      heights = [0.45];
      sl.groups.forEach(g => g.items.forEach((it, j) => heights.push(Math.max(0.36, textH(it.indicator, colW[1] - 0.2, fs, false, 1.15) + 0.1, textH(it.formula, colW[2] - 0.2, fs, false, 1.15) + 0.1,
        j === 0 ? textH(g.name, colW[0] - 0.2, fs, true, 1.15) / g.items.length + 0.1 : 0))));
      if (heights.reduce((a, b) => a + b, 0) <= 5.3) break;
    }
    if (nRows < 8) heights = heights.map((h, i) => (i ? Math.max(h, 0.5) : h));
    const G = (x, rs) => ({ text: x, options: { rowspan: rs, bold: true, color: C.dark, fill: { color: C.tint }, align: "left", valign: "middle" } });
    const c = x => ({ text: x, options: { color: C.ink, fill: { color: C.white }, align: "left" } });
    const rows = [hdrTxt.map(h => ({ text: h, options: { bold: true, color: C.white, fill: { color: C.teal } } }))];
    sl.groups.forEach(g => g.items.forEach((it, j) => rows.push(j === 0 ? [G(g.name, g.items.length), c(it.indicator), c(it.formula)] : [c(it.indicator), c(it.formula)])));
    s.addTable(rows, { x: MX, y: 1.5, w: wT, colW, rowH: heights, fontFace: F, fontSize: fs, valign: "middle", border: { type: "solid", pt: 0.5, color: C.line }, margin: [2, 7, 2, 7], autoPage: false });
    M.rings(s, 12.6, 3.4, 0.35, 3, C.line, 0.15);
    notes(s, sl.notes);
  }

  async function orgIntro(sl) {
    const s = slide(sl.label, sl.title);
    const ms = sl.milestones, n = ms.length;
    const step = n >= 5 ? 0.72 : 0.8;
    s.addShape(pres.shapes.LINE, { x: MX + 0.12, y: 1.65, w: 0, h: step * (n - 1) + 0.2, line: { color: C.light, width: 1.5 } });
    ms.forEach((m, i) => {
      const y = 1.5 + i * step;
      marker(s, MX + 0.02, y + 0.08, 0.22, i ? C.teal : C.gold);
      const fsz = fitText(m.text, 5.2, step - 0.3, 13, 10.5);
      t(s, [{ text: m.label || "", options: { bold: true, color: C.teal, breakLine: true, fontSize: 14 } }, { text: m.text, options: { fontSize: fsz } }], { x: MX + 0.45, y, w: 5.2, h: step - 0.02 });
    });
    const py = 1.5 + n * step + 0.1, ph = Math.min(1.95, 6.85 - py);
    if (ph > 1.1) {
      M.block(s, SUB, MX + 0.4, py, ph * 1.85, ph, C.tint, { dx: 0.18, dy: 0.12 });
      await photo(s, SUB, MX + 0.4, py, ph * 1.85, ph, sl.image, "Ảnh trụ sở / quầy giao dịch");
    }
    const ox = 6.6;
    t(s, "Cơ cấu tổ chức", { x: ox, y: 1.45, w: 6, h: 0.35, fontSize: 15, bold: true, color: C.dark });
    s.addShape(pres.shapes.RECTANGLE, { x: ox + 1.7, y: 1.9, w: 2.75, h: 0.65, fill: { color: C.teal }, line: { type: "none" } });
    t(s, sl.org.topSub ? [{ text: sl.org.top, options: { bold: true, breakLine: true } }, { text: sl.org.topSub, options: { fontSize: 11 } }] : [{ text: sl.org.top, options: { bold: true } }],
      { x: ox + 1.7, y: 1.9, w: 2.75, h: 0.65, fontSize: 13, color: C.white, align: "center", valign: "middle" });
    s.addShape(pres.shapes.LINE, { x: ox + 3.075, y: 2.55, w: 0, h: 0.22, line: { color: C.teal, width: 1 } });
    s.addShape(pres.shapes.LINE, { x: ox + 1.4, y: 2.77, w: 3.35, h: 0, line: { color: C.teal, width: 1 } });
    [ox + 1.4, ox + 4.75].forEach(x => s.addShape(pres.shapes.LINE, { x, y: 2.77, w: 0, h: 0.18, line: { color: C.teal, width: 1 } }));
    const u = sl.org.units, rowsN = Math.ceil(u.length / 2), rstep = Math.min(0.8, 3.15 / rowsN), bh = rstep - 0.18;
    u.forEach((d, i) => {
      const x = ox + (i % 2) * 3.35, y = 2.95 + Math.floor(i / 2) * rstep;
      s.addShape(pres.shapes.RECTANGLE, { x, y, w: 2.8, h: bh, fill: { color: i === 0 ? C.gold : C.tint }, line: { color: C.line, width: 0.5 } });
      t(s, d, { x: x + 0.08, y, w: 2.64, h: bh, fontSize: fitText(d, 2.6, bh, 12, 10, true), bold: true, align: "center", valign: "middle" });
    });
    if (sl.source) note(s, sl.source, ox, 2.95 + rowsN * rstep + 0.05, 6.1);
    notes(s, sl.notes);
  }

  function tableChart(sl) {
    const s = slide(sl.label, sl.title);
    const tb = sl.table, ch = sl.chart;
    const cols = tb.header.length;
    const avgCell = tb.rows.flatMap(r => r.cells.slice(1)).reduce((a, c) => a + String(c).length, 0) / Math.max(1, tb.rows.flatMap(r => r.cells.slice(1)).length);
    const wide = cols > 6 || avgCell > 16;
    const sumW = CW - 0.6;
    if (!ch) {
      const bottom = drawTable(s, tb, MX, 1.42, sumW, 4.35, { fs: 13.5 });
      summary(s, MX, Math.max(bottom + 0.15, 5.6), sumW, 1.1, sl.summary);
    } else if (wide) {
      // bảng full chiều ngang, biểu đồ nhỏ dưới trái, tóm tắt dưới phải (mẫu slide SERVPERF)
      const bottom = drawTable(s, tb, MX, 1.38, sumW, 3.45, { fs: 12.5, min: 10.5 });
      const y2 = Math.max(bottom + 0.1, 4.75), h2 = 6.95 - y2;
      drawChart(s, ch, MX, y2, 5.6, h2, { showTitle: h2 > 2.2 });
      summary(s, 6.4, y2 + 0.05, 5.75, Math.min(1.85, h2 - 0.1), sl.summary, 13);
    } else {
      const tw = cols <= 3 ? 6.3 : cols === 4 ? 6.6 : 6.9;
      const bottom = drawTable(s, tb, MX, 1.42, tw, 3.85, { fs: 13 });
      const sy = Math.max(bottom + 0.15, 4.7);
      drawChart(s, ch, tw + MX + 0.25, 1.4, CW - tw - 0.25, sy - 1.55);
      summary(s, MX, sy, sumW, Math.min(1.3, 6.85 - sy), sl.summary, 13);
    }
    notes(s, sl.notes);
  }

  function assessment(sl) {
    const s = slide(sl.label, sl.title);
    const lim = sl.limitations.map(l => ({ label: `${l.code} · ${l.label}`, text: l.text }));
    const cols = [["Kết quả đạt được", C.tint2, C.teal, sl.achievements, C.line], ["Hạn chế", C.cream, C.goldDeep, lim, C.creamLine]];
    cols.forEach((c, i) => {
      const x = MX + i * 6.15;
      M.poly(s, "tab", x, 1.45, 5.95, 5.35, { fill: { color: c[1] }, line: { color: c[4], width: 0.75 } });
      marker(s, x + 0.25, 1.68, 0.26, c[2]);
      t(s, c[0], { x: x + 0.65, y: 1.6, w: 5, h: 0.45, fontSize: 18, bold: true, color: c[2], valign: "middle" });
      bulletsBox(s, c[3], x + 0.25, 2.3, 5.5, 4.3, 15, 12, 15);
    });
    notes(s, sl.notes);
  }

  function causes(sl) {
    const s = slide(sl.label, sl.title);
    twoCols(s, [{ heading: "Nguyên nhân chủ quan", bullets: sl.subjective }, { heading: "Nguyên nhân khách quan", bullets: sl.objective }], 1.45, 3.5, [C.teal, C.dark]);
    M.poly(s, "arrow", MX, 5.85, CW - 0.6, 0.8, { fill: { color: C.gold }, line: { type: "none" } });
    const head = "Hướng sang Chương 3: ";
    t(s, [{ text: head, options: { bold: true } }, { text: sl.bridge, options: {} }], { x: MX + 0.5, y: 5.85, w: CW - 1.8, h: 0.8, fontSize: fitText(head + sl.bridge, CW - 1.8, 0.75, 14, 11), color: C.textOnAccent, valign: "middle" });
    notes(s, sl.notes);
  }

  async function goals(sl) {
    const s = slide(sl.label, sl.title);
    if (sl.table) {
      bulletsBox(s, sl.bullets, MX, 1.5, 5.5, 3.4, 15, 12, 16);
      M.block(s, SUB, MX + 0.3, 5.0, 3.2, 1.75, C.tint, { dx: 0.15, dy: 0.1 });
      await photo(s, SUB, MX + 0.3, 5.0, 3.2, 1.75, sl.image, "Ảnh hoạt động");
      drawTable(s, Object.assign({ caption: "Chỉ tiêu mục tiêu" }, sl.table), 6.4, 1.45, 6.35, 5.4, { fs: 13 });
    } else {
      bulletsBox(s, sl.bullets, MX, 1.5, 7.2, 5.2, 16, 12.5, 18);
      M.frame(s, MAIN, 8.35, 1.55, 4.4, 4.4, C.gold, { dx: 0.25, dy: 0, width: 6 });
      await photo(s, MAIN, 8.35, 1.55, 4.4, 4.4, sl.image, "Ảnh hoạt động");
      deco(s, 8.6, 6.2);
    }
    notes(s, sl.notes);
  }

  function solutions(sl) {
    const s = slide(sl.label, sl.title);
    const items = sl.items, n = items.length;
    const perRow = n <= 3 ? n : n === 4 ? 2 : n <= 6 ? 3 : 4;
    const rows = Math.ceil(n / perRow);
    const gapX = 0.2, cw = (CW - gapX * (perRow - 1)) / perRow, ch = (5.3 - 0.25 * (rows - 1)) / rows;
    items.forEach((g, i) => {
      const x = MX + (i % perRow) * (cw + gapX), y = 1.5 + Math.floor(i / perRow) * (ch + 0.25);
      M.poly(s, "tab", x, y, cw, ch, { fill: { color: C.tint2 }, line: { color: C.line, width: 0.75 } });
      const d = 0.75;
      M.poly(s, MAIN, x + 0.2, y + 0.2, d, d, { fill: { color: i % 2 ? C.dark : C.teal }, line: { type: "none" } });
      t(s, g.code, { x: x + 0.2, y: y + 0.2, w: d, h: d, fontSize: 12, bold: true, color: C.white, align: "center", valign: "middle" });
      t(s, g.name, { x: x + 1.1, y: y + 0.15, w: cw - 1.25, h: 0.85, fontSize: fitText(g.name, cw - 1.25, 0.85, 14, 11, true), bold: true, color: C.teal, valign: "middle" });
      const bodyH = ch - 1.05 - 0.4;
      t(s, g.text, { x: x + 0.22, y: y + 1.05, w: cw - 0.4, h: bodyH, fontSize: fitText(g.text, cw - 0.4, bodyH, 13, 10.5) });
      if (g.link) t(s, "↔ " + g.link, { x: x + cw - 1.6, y: y + ch - 0.42, w: 1.45, h: 0.3, fontSize: 11, bold: true, color: C.goldDeep, align: "right" });
    });
    notes(s, sl.notes);
  }

  async function conclusion(sl) {
    const s = slide(sl.label, sl.title);
    s.addShape(pres.shapes.RECTANGLE, { x: MX, y: 1.45, w: CW, h: 1.05, fill: { color: C.teal }, line: { type: "none" } });
    t(s, [{ text: "Kết luận: ", options: { bold: true, color: C.accentOnPrimary } }, { text: sl.conclusion, options: { color: C.white } }],
      { x: MX + 0.3, y: 1.45, w: CW - 0.6, h: 1.05, fontSize: fitText("Kết luận: " + sl.conclusion, CW - 0.6, 1.0, 14.5, 11.5), valign: "middle" });
    const recs = sl.recommendations, colW = recs.length === 1 ? 8.6 : 4.3;
    recs.forEach((c, i) => {
      const x = MX + i * 4.55;
      marker(s, x, 2.82, 0.24, i ? C.dark : C.gold);
      t(s, c.heading, { x: x + 0.4, y: 2.72, w: colW - 0.3, h: 0.45, fontSize: fitText(c.heading, colW - 0.3, 0.45, 16, 12, true), bold: true, color: i ? C.dark : C.teal, valign: "middle" });
      bulletsBox(s, c.bullets, x, 3.35, colW, 3.45, 14.5, 11.5, 16);
    });
    M.frame(s, MAIN, 9.85, 2.95, 3.0, 3.0, C.gold, { dx: 0.2, dy: 0, width: 5 });
    await photo(s, MAIN, 9.85, 2.95, 3.0, 3.0, sl.image, "Ảnh hoạt động");
    notes(s, sl.notes);
  }

  async function thanks(sl) {
    const s = pres.addSlide(); pageNo++; s.background = { color: C.dark };
    M.band(s, 7.6, 0, 3.0, H, C.teal, 1.6);
    M.frame(s, MAIN, 7.75, 1.0, 5.2, 5.2, C.gold, { dx: 0.28, dy: 0, width: 7 });
    await photo(s, MAIN, 7.75, 1.0, 5.2, 5.2, sl.image, "Ảnh tập thể đơn vị");
    M.corner(s, "tl", 1.0, C.gold);
    const lw = schoolLogo(s, MX, 1.1, 0.9, true);
    t(s, meta.school.toUpperCase(), { x: lw ? MX + lw + 0.2 : MX, y: 1.1, w: 5, h: 0.9, fontSize: 15, bold: true, color: C.white, valign: "middle" });
    t(s, "THANK YOU", { x: MX, y: 2.45, w: 7, h: 1.2, fontSize: 60, bold: true, color: C.white });
    const msg = sl.message || "Trân trọng cảm ơn quý thầy cô trong Hội đồng đã lắng nghe!";
    t(s, msg, { x: MX, y: 3.7, w: 6.6, h: 0.9, fontSize: fitText(msg, 6.6, 0.9, 19, 14), color: C.accentOnDark });
    accentRow(s, MX, 4.8, 6);
    [["Giảng viên hướng dẫn", meta.supervisor], ["Học viên thực hiện", meta.student]].forEach((p, i) => t(s, [{ text: p[0], options: { fontSize: 11, color: C.onDarkMuted, breakLine: true } }, { text: p[1], options: { fontSize: 14, bold: true, color: C.white } }], { x: MX + i * 2.6, y: 5.5, w: 2.5, h: 0.65 }));
    notes(s, sl.notes);
  }

  const R = { cover, context, structure, chapter: divider, concept, text2col, indicatorTable, orgIntro, tableChart, assessment, causes, goals, solutions, conclusion, thanks };
  for (const sl of deck.slides) {
    const fn = R[sl.type];
    if (!fn) { warnings.push(`Bỏ qua loại slide không hỗ trợ: ${sl.type}`); continue; }
    try { await fn(sl); } catch (e) { warnings.push(`Lỗi dựng slide ${pageNo} (${sl.type}): ${e.message}`); }
  }
  await pres.writeFile({ fileName: outPath });
  return { pages: pageNo, warnings, colors: { primary: C.teal, accent: C.gold }, shapes: { main: MAIN, sub: SUB } };
}

module.exports = { renderDeck };
