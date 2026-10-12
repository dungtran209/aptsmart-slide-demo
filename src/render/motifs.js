// motifs.js — khung ảnh cắt hình khối + họa tiết trang trí cho slide bảo vệ (pptxgenjs).
// Bản sao từ Project (claude/motifs.js), bổ sung: kiểm tra kind hợp lệ, fallback "diamond".
// Dùng: const M = require("./motifs")(pres, C, F);
//   await M.photo(slide, "hex", x, y, w, h, { src: "anh.jpg" })   // ảnh thật: cắt theo khung (PNG có nền trong)
//   M.photo(slide, "hex", x, y, w, h, { label: "Trụ sở" })         // chưa có ảnh: khung giữ chỗ cùng hình dạng
//   M.frame(slide, "hex", x, y, w, h, color, { dx, dy, width })    // viền lệch phía sau ảnh
//   M.dots / M.slashes / M.rings / M.band / M.corner ...           // họa tiết
const sharp = require("sharp");

const KINDS = ["hex", "hexTall", "slantR", "slantL", "diamond", "shard", "tab", "arrow", "blob", "circle"];

module.exports = (pres, C, F) => {
  const shapes = {
    hex: (w, h) => [[0.22 * w, 0], [0.78 * w, 0], [w, 0.5 * h], [0.78 * w, h], [0.22 * w, h], [0, 0.5 * h]],
    hexTall: (w, h) => [[0.5 * w, 0], [w, 0.2 * h], [w, 0.8 * h], [0.5 * w, h], [0, 0.8 * h], [0, 0.2 * h]],
    slantR: (w, h) => [[0.18 * w, 0], [w, 0], [0.82 * w, h], [0, h]],
    slantL: (w, h) => [[0, 0], [0.82 * w, 0], [w, h], [0.18 * w, h]],
    diamond: (w, h) => [[0.5 * w, 0], [w, 0.5 * h], [0.5 * w, h], [0, 0.5 * h]],
    shard: (w, h) => [[0.3 * w, 0], [w, 0], [w, h], [0, h], [0, 0.35 * h]],
    tab: (w, h) => [[0, 0], [w, 0], [w, 0.78 * h], [0.78 * w, h], [0, h]],
    arrow: (w, h) => [[0, 0], [0.82 * w, 0], [w, 0.5 * h], [0.82 * w, h], [0, h], [0.12 * w, 0.5 * h]],
  };
  const norm = k => (KINDS.includes(k) ? k : "diamond");
  const blobPath = (w, h, r = 0.42) => {
    const R = Math.min(w, h) * r, q = Math.min(w, h) * 0.08;
    return { svg: `M${q},0 H${w - R} Q${w},0 ${w},${R} V${h - q} Q${w},${h} ${w - q},${h} H${R} Q0,${h} 0,${h - R} V${q} Q0,0 ${q},0 Z`,
      pts: [{ x: q, y: 0 }, { x: w - R, y: 0 }, { x: w, y: R, curve: { type: "quadratic", x1: w, y1: 0 } }, { x: w, y: h - q },
        { x: w - q, y: h, curve: { type: "quadratic", x1: w, y1: h } }, { x: R, y: h }, { x: 0, y: h - R, curve: { type: "quadratic", x1: 0, y1: h } },
        { x: 0, y: q }, { x: q, y: 0, curve: { type: "quadratic", x1: 0, y1: 0 } }, { close: true }] };
  };
  const ptsOf = (kind, w, h) => {
    if (kind === "blob") return blobPath(w, h).pts;
    return [...shapes[kind](w, h).map(([x, y]) => ({ x, y })), { close: true }];
  };
  const svgOf = (kind, w, h) => {
    if (kind === "circle") return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}"/>`;
    if (kind === "blob") return `<path d="${blobPath(w, h).svg}"/>`;
    return `<polygon points="${shapes[kind](w, h).map(p => p.join(",")).join(" ")}"/>`;
  };
  const poly = (s, kind, x, y, w, h, opt = {}) => {
    kind = norm(kind);
    if (kind === "circle") return s.addShape(pres.shapes.OVAL, Object.assign({ x, y, w, h }, opt));
    s.addShape(pres.shapes.CUSTOM_GEOMETRY, Object.assign({ x, y, w, h, points: ptsOf(kind, w, h) }, opt));
  };

  async function maskImage(src, kind, w, h, dpi = Number(process.env.PHOTO_DPI || 130)) {
    kind = norm(kind);
    const W = Math.round(w * dpi), Hh = Math.round(h * dpi);
    const img = await sharp(src).rotate().resize(W, Hh, { fit: "cover", position: "attention" }).png().toBuffer();
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" viewBox="0 0 ${w} ${h}">${svgOf(kind, w, h)}</svg>`);
    const out = await sharp(img).composite([{ input: mask, blend: "dest-in" }]).png({ compressionLevel: 9 }).toBuffer();
    return "image/png;base64," + out.toString("base64");
  }
  async function photo(s, kind, x, y, w, h, o = {}) {
    kind = norm(kind);
    if (o.src) { s.addImage({ data: await maskImage(o.src, kind, w, h), x, y, w, h }); return; }
    poly(s, kind, x, y, w, h, { fill: { color: o.fill || C.tint }, line: { color: o.lineColor || C.teal, width: 1.25, dashType: "dash" } });
    s.addText([{ text: "[ẢNH]", options: { bold: true, fontSize: 11, color: C.teal, breakLine: true } }, { text: o.label || "", options: { fontSize: 10, italic: true, color: C.muted } }],
      { x: x + w * 0.15, y, w: w * 0.7, h, align: "center", valign: "middle", fontFace: F, margin: 0, isTextBox: true });
  }
  const frame = (s, kind, x, y, w, h, color, o = {}) =>
    poly(s, kind, x + (o.dx ?? 0.18), y + (o.dy ?? 0.18), w, h, { fill: { type: "none" }, line: { color, width: o.width || 6 } });
  const block = (s, kind, x, y, w, h, color, o = {}) =>
    poly(s, kind, x + (o.dx ?? -0.2), y + (o.dy ?? 0.2), w, h, { fill: { color, transparency: o.transparency || 0 }, line: { type: "none" } });

  const dots = (s, x, y, cols = 6, rows = 3, color = C.teal, gap = 0.16, d = 0.05) => {
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++)
      s.addShape(pres.shapes.OVAL, { x: x + i * gap, y: y + j * gap, w: d, h: d, fill: { color }, line: { type: "none" } });
  };
  const slashes = (s, x, y, n = 4, color = C.gold, w = 0.09, h = 0.28, gap = 0.13) => {
    for (let i = 0; i < n; i++) s.addShape(pres.shapes.CUSTOM_GEOMETRY, { x: x + i * gap, y, w: w + 0.08, h, fill: { color }, line: { type: "none" },
      points: [{ x: 0.08, y: 0 }, { x: w + 0.08, y: 0 }, { x: w, y: h }, { x: 0, y: h }, { close: true }] });
  };
  const rings = (s, cx, cy, r = 0.6, n = 3, color = C.line, step = 0.18) => {
    for (let i = 0; i < n; i++) { const rr = r + i * step; s.addShape(pres.shapes.OVAL, { x: cx - rr, y: cy - rr, w: 2 * rr, h: 2 * rr, fill: { type: "none" }, line: { color, width: 0.75 } }); }
  };
  const band = (s, x, y, w, h, color, slant = 0.35, o = {}) =>
    s.addShape(pres.shapes.CUSTOM_GEOMETRY, { x, y, w, h, fill: { color, transparency: o.transparency || 0 }, line: { type: "none" },
      points: [{ x: slant, y: 0 }, { x: w, y: 0 }, { x: w - slant, y: h }, { x: 0, y: h }, { close: true }] });
  const corner = (s, corner, size, color, o = {}) => {
    const W = 13.333, H = 7.5, x = corner.includes("r") ? W - size : 0, y = corner.includes("b") ? H - size : 0;
    const P = { tl: [[0, 0], [size, 0], [0, size]], tr: [[0, 0], [size, 0], [size, size]], bl: [[0, 0], [size, size], [0, size]], br: [[size, 0], [size, size], [0, size]] }[corner];
    s.addShape(pres.shapes.CUSTOM_GEOMETRY, { x, y, w: size, h: size, fill: { color, transparency: o.transparency || 0 }, line: { type: "none" }, points: [...P.map(([a, b]) => ({ x: a, y: b })), { close: true }] });
  };
  const badge = (s, text, x, y, d = 0.6, fill = C.teal) => {
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: C.white, width: 3 } });
    s.addText(text, { x, y, w: d, h: d, fontFace: F, fontSize: Math.round(d * 26), bold: true, color: C.white, align: "center", valign: "middle", margin: 0, isTextBox: true });
  };
  return { KINDS, shapes, poly, photo, maskImage, frame, block, dots, slashes, rings, band, corner, badge };
};
module.exports.KINDS = KINDS;
