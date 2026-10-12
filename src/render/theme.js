// theme.js — lấy màu chủ đạo/màu nhấn từ logo đơn vị (sharp), sinh bộ token màu theo quy chuẩn mục 4.
const sharp = require("sharp");

const hex2rgb = h => [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = c => c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
const mix = (a, b, t) => rgb2hex(hex2rgb(a).map((v, i) => v * (1 - t) + hex2rgb(b)[i] * t)); // t = tỉ lệ màu b
function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
const lum = h => { const c = hex2rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const darkenTo = (h, target, bg = "FFFFFF") => { let c = h; for (let i = 0; i < 20 && contrast(c, bg) < target; i++) c = mix(c, "000000", 0.08); return c; };
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

const DEFAULT = { primary: "006B68", accent: "F5A623" };

/** Trích 2 màu nổi bật từ logo: primary = cụm màu bão hòa lớn nhất (đủ đậm), accent = cụm khác hue ≥ 40°. */
async function colorsFromLogo(src) {
  const { data, info } = await sharp(src).flatten({ background: "#ffffff" }).resize(200, 200, { fit: "inside", kernel: "nearest" }).raw().toBuffer({ resolveWithObject: true });
  const buckets = new Map(); // theo hue 15°; trong mỗi bucket đếm màu lượng tử hóa để lấy màu "thật" (mode), tránh pha viền khử răng cưa
  for (let i = 0; i < data.length; i += info.channels) {
    const rgb = [data[i], data[i + 1], data[i + 2]], [h, s, l] = rgb2hsl(rgb);
    if (s < 0.25 || l < 0.12 || l > 0.9) continue;
    const k = Math.round(h / 15) % 24;
    const b = buckets.get(k) || { n: 0, h: k * 15, q: new Map() };
    b.n++;
    const qk = rgb.map(v => v >> 3).join(",");
    const q = b.q.get(qk) || { n: 0, r: 0, g: 0, b: 0 };
    q.n++; q.r += rgb[0]; q.g += rgb[1]; q.b += rgb[2]; b.q.set(qk, q);
    buckets.set(k, b);
  }
  const list = [...buckets.values()].filter(b => b.n > 30).sort((a, b) => b.n - a.n).map(b => {
    const m = [...b.q.values()].sort((x, y) => y.n - x.n)[0];
    return { n: b.n, h: b.h, hex: rgb2hex([m.r / m.n, m.g / m.n, m.b / m.n]) };
  });
  if (!list.length) return null;
  // primary: ưu tiên cụm đủ tương phản với nền trắng (làm tiêu đề); nếu cụm lớn nhất quá sáng (vàng…) thì đổi vai
  let primary = list.find(c => contrast(c.hex, "FFFFFF") >= 3 && c.n >= list[0].n * 0.25) || list[0];
  const accent = list.find(c => c !== primary && hueDist(c.h, primary.h) >= 40);
  return { primary: primary.hex, accent: accent ? accent.hex : null };
}

/** Bộ token theo quy chuẩn: teal (chính), dark, gold (nhấn), goldDeep, tint, tint2, ink, muted, line, red… */
function buildTokens(primary, accent) {
  primary = darkenTo((primary || DEFAULT.primary).toUpperCase(), 3.2);
  if (!accent) { // không có màu nhấn: lấy vàng mặc định nếu primary không phải vàng, ngược lại dùng xám đậm
    accent = hueDist(rgb2hsl(hex2rgb(primary))[0], 38) > 40 ? DEFAULT.accent : "4A4A4A";
  }
  accent = accent.toUpperCase();
  return {
    teal: primary, dark: mix(primary, "000000", 0.33), gold: accent, goldDeep: darkenTo(accent, 4.5),
    tint: mix(primary, "FFFFFF", 0.9), tint2: mix(primary, "FFFFFF", 0.96), ink: "1E2B2D", muted: "5B6B6D",
    line: mix(mix(primary, "FFFFFF", 0.8), "D0D0D0", 0.4), white: "FFFFFF", light: mix(primary, "FFFFFF", 0.5),
    gray: "B8C4C3", red: "B5462F", cream: mix(accent, "FFFFFF", 0.88), rowTotal: mix(primary, "FFFFFF", 0.82),
    onDarkMuted: mix(primary, "FFFFFF", 0.62), creamLine: mix(accent, "FFFFFF", 0.65),
    accentOnPrimary: contrast(accent, primary) >= 2.5 ? accent : "FFFFFF",   // chữ nhấn trên nền màu chính
    accentOnDark: contrast(accent, mix(primary, "000000", 0.33)) >= 3 ? accent : "FFFFFF",
    textOnAccent: contrast(accent, "1E2B2D") >= 4.5 ? "1E2B2D" : "FFFFFF",    // chữ trên nền màu nhấn
  };
}

/** Chuẩn bị logo: cắt viền trắng; nếu logo gần vuông với 4 góc trắng (con dấu tròn) → gợi ý cắt tròn. */
async function prepareLogo(src) {
  let buf = await sharp(src).rotate().png().toBuffer();
  try { buf = await sharp(buf).trim({ threshold: 12 }).png().toBuffer(); } catch (_) { /* ảnh 1 màu */ }
  const meta = await sharp(buf).metadata();
  const ar = meta.width / meta.height;
  let round = false;
  if (ar > 0.9 && ar < 1.1) {
    const { data, info } = await sharp(buf).flatten({ background: "#ffffff" }).resize(40, 40, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
    const px = (x, y) => { const i = (y * 40 + x) * info.channels; return (data[i] + data[i + 1] + data[i + 2]) / 3; };
    round = [px(1, 1), px(38, 1), px(1, 38), px(38, 38)].every(v => v > 235) && px(20, 2) < 235;
  }
  buf = await sharp(buf).resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  return { data: "image/png;base64," + buf.toString("base64"), ar, round, buffer: buf };
}

module.exports = { colorsFromLogo, buildTokens, prepareLogo, mix, contrast, DEFAULT };
