// pdf.js — chuyển .pptx → .pdf bằng LibreOffice headless.
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const SOFFICE = process.env.SOFFICE_PATH || "soffice";

function toPdf(pptxPath, outDir, timeoutMs = Number(process.env.PDF_TIMEOUT_MS || 240000)) {
  // Mỗi lần chạy dùng 1 hồ sơ người dùng riêng → tránh khóa hồ sơ khi có tiến trình treo.
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lo-profile-"));
  const args = [`-env:UserInstallation=file://${profile}`, "--headless", "--norestore", "--nolockcheck", "--convert-to", "pdf", "--outdir", outDir, pptxPath];
  return new Promise((resolve, reject) => {
    execFile(SOFFICE, args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      fs.rm(profile, { recursive: true, force: true }, () => {});
      const pdf = path.join(outDir, path.basename(pptxPath).replace(/\.pptx$/i, ".pdf"));
      if (fs.existsSync(pdf)) return resolve(pdf);
      reject(new Error("LibreOffice không tạo được PDF" + (err ? `: ${err.message}` : "") + (stderr ? ` ${String(stderr).slice(0, 300)}` : "")));
    });
  });
}

module.exports = { toPdf };
