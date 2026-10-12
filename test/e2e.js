// Kiểm thử đầu-cuối qua HTTP như trình duyệt: upload → polling → tải PDF/PPTX.
// Dùng: BASE_URL=http://localhost:3000 ACCESS_PASSWORD=... node test/e2e.js <luan_van.docx> <thu_muc_anh> [logo_don_vi] [logo_truong] [out_dir]
const fs = require("fs");
const path = require("path");

(async () => {
  const [docx, imgDir, orgLogo, schoolLogo, outDir = "out-e2e"] = process.argv.slice(2);
  if (!docx || !imgDir) { console.error("Thiếu tham số. Xem đầu file."); process.exit(2); }
  const BASE = process.env.BASE_URL || "http://localhost:3000";
  const pass = process.env.ACCESS_PASSWORD || "";
  const file = (p, type) => new Blob([fs.readFileSync(p)], { type });
  const imgType = p => (/\.png$/i.test(p) ? "image/png" : "image/jpeg");

  const cfg = await (await fetch(BASE + "/api/config")).json();
  console.log("config:", cfg);
  // mật khẩu sai phải bị từ chối
  if (cfg.passwordRequired) {
    const bad = await fetch(BASE + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "sai-mat-khau" }) });
    console.log("login sai →", bad.status);
    if (bad.status !== 401) throw new Error("Mật khẩu sai không bị chặn");
  }
  const fd = new FormData();
  fd.append("thesis", file(docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), path.basename(docx));
  if (orgLogo) fd.append("orgLogo", file(orgLogo, imgType(orgLogo)), path.basename(orgLogo));
  if (schoolLogo) fd.append("schoolLogo", file(schoolLogo, imgType(schoolLogo)), path.basename(schoolLogo));
  for (const f of fs.readdirSync(imgDir).filter(f => /\.(jpe?g|png)$/i.test(f)).sort()) fd.append("images", file(path.join(imgDir, f), imgType(f)), f);
  fd.append("shape", "auto");

  const t0 = Date.now();
  const r = await fetch(BASE + "/api/jobs", { method: "POST", body: fd, headers: { "x-access-password": pass } });
  const job = await r.json();
  console.log("POST /api/jobs →", r.status, job.id || job.error);
  if (r.status !== 202) process.exit(1);
  let j;
  for (;;) {
    await new Promise(res => setTimeout(res, 1500));
    j = await (await fetch(`${BASE}/api/jobs/${job.id}`)).json();
    process.stdout.write(`\r${j.status} ${j.progress}% ${j.step} – ${j.message}                    `);
    if (j.status === "done" || j.status === "error") break;
  }
  console.log();
  if (j.status === "error") { console.error("LỖI:", j.error); process.exit(1); }
  fs.mkdirSync(outDir, { recursive: true });
  for (const kind of ["pptx", "pdf", "deck"]) {
    const d = await fetch(`${BASE}/api/jobs/${job.id}/${kind}`);
    const name = decodeURIComponent((d.headers.get("content-disposition") || "").match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i)?.[1] || kind);
    const buf = Buffer.from(await d.arrayBuffer());
    fs.writeFileSync(path.join(outDir, kind === "deck" ? "deck.json" : `result.${kind}`), buf);
    console.log(`${kind}: ${d.status} ${(buf.length / 1024).toFixed(0)} KB  (tên tải về: ${name})`);
  }
  console.log("Kết quả:", JSON.stringify(j.result, null, 1));
  console.log(`Tổng thời gian: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
})().catch(e => { console.error(e); process.exit(1); });
