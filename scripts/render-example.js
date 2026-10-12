// Dựng deck mẫu (standards/example-deck.bidv.json) → .pptx (+ .pdf) để kiểm tra renderer.
// Dùng: node scripts/render-example.js [thư_mục_ảnh] [logo_don_vi] [logo_truong] [out_dir]
// Ảnh trong thư mục được gán id img1, img2… theo thứ tự tên file.
const fs = require("fs");
const path = require("path");
const { structural, rules } = require("../src/rules");
const { renderDeck } = require("../src/render/renderer");
const { toPdf } = require("../src/pdf");

(async () => {
  const [imgDir, orgLogo, schoolLogo, outDir = "out"] = process.argv.slice(2);
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "../standards/example-deck.bidv.json"), "utf8"));
  const { deck, errors } = structural(raw);
  if (!deck) { console.error("Schema lỗi:", errors); process.exit(1); }
  console.log("Kiểm tra quy chuẩn:", rules(deck));
  const images = imgDir && fs.existsSync(imgDir)
    ? fs.readdirSync(imgDir).filter(f => /\.(jpe?g|png)$/i.test(f)).sort().map((f, i) => ({ id: `img${i + 1}`, path: path.join(imgDir, f) }))
    : [];
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, "example-bidv.pptx");
  const r = await renderDeck(deck, { orgLogo, schoolLogo, images }, out);
  console.log("PPTX:", out, r);
  if (process.env.NO_PDF !== "1") console.log("PDF:", await toPdf(out, outDir));
})().catch(e => { console.error(e); process.exit(1); });
