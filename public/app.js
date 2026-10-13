// APTsmart Slide — giao diện (không dùng framework)
(() => {
  const $ = s => document.querySelector(s);
  const state = { cfg: null, pass: "", thesis: null, orgLogo: null, schoolLogo: null, images: [], jobId: null, timer: null };
  try { state.pass = sessionStorage.getItem("aptsmart-pass") || ""; } catch (_) {}

  const show = (el, on = true) => { el.hidden = !on; };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const mb = n => (n / 1048576).toFixed(1) + " MB";

  async function init() {
    try { state.cfg = await (await fetch("/api/config")).json(); } catch (e) { state.cfg = { passwordRequired: false, dailyLimit: 10, remaining: 10, maxUploadMb: 30, minImages: 3, maxImages: 8, ttlMin: 60, mode: "claude" }; }
    const c = state.cfg;
    $("#quota").textContent = `Còn ${c.remaining}/${c.dailyLimit} lượt hôm nay`;
    $("#imgHint").textContent = `${c.minImages}–${c.maxImages} ảnh`;
    $("#ttl").textContent = c.ttlMin;
    if (c.mode === "mock") { const b = $("#modeBadge"); b.textContent = "Chế độ giả lập (chưa có API key)"; show(b); }
    if (c.passwordRequired && !state.pass) { show($("#gate")); $("#gatePass").focus(); }
    else show($("#mainForm"));
    drawShapes();
  }

  // ---------- mật khẩu ----------
  $("#gateForm").addEventListener("submit", async e => {
    e.preventDefault();
    const p = $("#gatePass").value;
    const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: p }) });
    if (!r.ok) { $("#gateErr").textContent = (await r.json().catch(() => ({}))).error || "Mật khẩu không đúng."; return; }
    state.pass = p; try { sessionStorage.setItem("aptsmart-pass", p); } catch (_) {}
    show($("#gate"), false); show($("#mainForm"));
  });

  // ---------- chọn file ----------
  function bindDrop(zone, input, onFiles) {
    input.addEventListener("change", () => { onFiles([...input.files]); input.value = ""; });
    ["dragenter", "dragover"].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add("over"); }));
    ["dragleave", "drop"].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove("over"); }));
    zone.addEventListener("drop", e => onFiles([...e.dataTransfer.files]));
  }
  const tooBig = f => f.size > state.cfg.maxUploadMb * 1048576;
  const isImg = f => /\.(png|jpe?g)$/i.test(f.name);

  bindDrop($("#thesisDrop"), $("#thesis"), fs => {
    const f = fs[0]; if (!f) return;
    if (!/\.docx$/i.test(f.name)) return err("Luận văn phải là file .docx");
    if (tooBig(f)) return err(`File quá lớn (tối đa ${state.cfg.maxUploadMb} MB)`);
    state.thesis = f; err("");
    $("#thesisName").innerHTML = `<b>${esc(f.name)}</b> · ${mb(f.size)}`;
    $("#thesisDrop").classList.add("has");
  });
  function logoTile(tile, input, key) {
    bindDrop(tile, input, fs => {
      const f = fs[0]; if (!f) return;
      if (!isImg(f)) return err("Logo phải là ảnh PNG/JPG");
      state[key] = f; err("");
      const url = URL.createObjectURL(f);
      tile.querySelector(".tile-img").innerHTML = `<img alt="" src="${url}">`;
      if (key === "orgLogo") logoColors(url);
    });
  }
  logoTile($("#schoolTile"), $("#schoolLogo"), "schoolLogo");
  logoTile($("#orgTile"), $("#orgLogo"), "orgLogo");

  bindDrop($("#imgDrop"), $("#images"), fs => {
    const ok = fs.filter(isImg);
    if (ok.length < fs.length) err("Bỏ qua file không phải PNG/JPG"); else err("");
    for (const f of ok) if (state.images.length < state.cfg.maxImages && !state.images.find(x => x.name === f.name && x.size === f.size)) state.images.push(f);
    if (state.images.length >= state.cfg.maxImages && ok.length) err(`Tối đa ${state.cfg.maxImages} ảnh`);
    renderThumbs();
  });
  function renderThumbs() {
    $("#thumbs").innerHTML = state.images.map((f, i) => `<li><img alt="" src="${URL.createObjectURL(f)}"><span class="id">img${i + 1}</span><button type="button" data-i="${i}" aria-label="Xóa ảnh ${i + 1}">×</button></li>`).join("");
  }
  $("#thumbs").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; state.images.splice(+b.dataset.i, 1); renderThumbs(); });

  // ---------- màu từ logo (xem trước; máy chủ tính lại chính xác) ----------
  function logoColors(url) {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"), n = 120, k = Math.min(n / img.width, n / img.height);
      c.width = Math.max(1, img.width * k | 0); c.height = Math.max(1, img.height * k | 0);
      const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      const d = x.getImageData(0, 0, c.width, c.height).data, B = new Map();
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2;
        const s = mx === mn ? 0 : (mx - mn) / (l > .5 ? 2 - mx - mn : mx + mn);
        if (s < .25 || l < .12 || l > .9) continue;
        const key = `${r >> 4},${g >> 4},${b >> 4}`; const v = B.get(key) || { n: 0, r: 0, g: 0, b: 0 }; v.n++; v.r += r; v.g += g; v.b += b; B.set(key, v);
      }
      const top = [...B.values()].sort((a, b) => b.n - a.n).map(v => [v.r / v.n, v.g / v.n, v.b / v.n].map(z => Math.round(z).toString(16).padStart(2, "0")).join("").toUpperCase());
      if (!top.length) return show($("#swatches"), false);
      const dist = (a, b) => { const p = h => [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); const A = p(a), C = p(b); return Math.hypot(A[0] - C[0], A[1] - C[1], A[2] - C[2]); };
      const second = top.find(h => dist(h, top[0]) > 120) || top[0];
      $("#sw1").style.background = "#" + top[0]; $("#sw1t").textContent = "#" + top[0];
      $("#sw2").style.background = "#" + second; $("#sw2t").textContent = "#" + second;
      $("#primary").value = "#" + top[0]; $("#accent").value = "#" + second;
      show($("#swatches"));
    };
    img.src = url;
  }
  $("#autoColor").addEventListener("change", e => show($("#pickers"), !e.target.checked));

  // ---------- xem trước khung ảnh ----------
  const SH = {
    diamond: "50,0 100,50 50,100 0,50", hex: "22,0 78,0 100,50 78,100 22,100 0,50", slantR: "18,0 100,0 82,100 0,100",
    shard: "30,0 100,0 100,100 0,100 0,35", tab: "0,0 100,0 100,78 78,100 0,100",
  };
  function shapeSvg(k, w = 80) {
    const h = 54;
    if (k === "circle") return `<svg viewBox="0 0 100 100" style="width:${h}px"><circle cx="50" cy="50" r="48" fill="var(--brand)"/></svg>`;
    if (k === "blob") return `<svg viewBox="0 0 140 100" style="width:${w}px"><path d="M8,0 H98 Q140,0 140,42 V92 Q140,100 132,100 H42 Q0,100 0,58 V8 Q0,0 8,0Z" fill="#2C8C87"/></svg>`;
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:${k === "diamond" || k === "hex" ? h : w}px"><polygon points="${SH[k]}" fill="var(--brand)"/></svg>`;
  }
  function drawShapes() {
    const v = $("#shape").value;
    const [a, b] = v === "auto" ? ["diamond", "shard"] : v.split("/");
    $("#shapePrev").innerHTML = shapeSvg(a) + shapeSvg(b).replace("var(--brand)", "#2C8C87") + (v === "auto" ? `<span class="muted small">ví dụ — hệ thống tự chọn theo logo/ngành</span>` : `<span class="muted small">khung chủ đạo + khung phụ</span>`);
  }
  $("#shape").addEventListener("change", drawShapes);

  // ---------- gửi ----------
  function err(m) { $("#formErr").textContent = m || ""; }
  $("#mainForm").addEventListener("submit", e => {
    e.preventDefault();
    const c = state.cfg;
    if (!state.thesis) return err("Vui lòng chọn file luận văn (.docx).");
    if (state.images.length < c.minImages) return err(`Vui lòng chọn ít nhất ${c.minImages} ảnh đơn vị.`);
    const total = [state.thesis, state.orgLogo, state.schoolLogo, ...state.images].filter(Boolean).reduce((a, f) => a + f.size, 0);
    if (total > c.maxUploadMb * 1048576) return err(`Tổng dung lượng ${mb(total)} vượt giới hạn ${c.maxUploadMb} MB. Hãy giảm kích thước ảnh.`);
    const fd = new FormData();
    fd.append("thesis", state.thesis);
    if (state.orgLogo) fd.append("orgLogo", state.orgLogo);
    if (state.schoolLogo) fd.append("schoolLogo", state.schoolLogo);
    state.images.forEach(f => fd.append("images", f));
    for (const el of $("#mainForm").querySelectorAll("input[name]")) if (el.value.trim()) fd.append(el.name, el.value.trim());
    fd.append("shape", $("#shape").value);
    if (!$("#autoColor").checked) { fd.append("primary", $("#primary").value); fd.append("accent", $("#accent").value); }
    start(fd);
  });

  function setStep(step, pct, msg) {
    const order = ["upload", "extract", "images", "ai", "render", "pdf", "done"];
    const cur = order.indexOf(step === "images" ? "extract" : step);
    document.querySelectorAll("#steps li").forEach(li => {
      const i = order.indexOf(li.dataset.step);
      li.classList.toggle("done", i < cur || step === "done"); li.classList.toggle("active", i === cur && step !== "done");
    });
    $("#barFill").style.width = Math.max(2, Math.min(100, pct)) + "%";
    if (msg) $("#progMsg").textContent = msg;
  }

  function start(fd) {
    err(""); $("#submitBtn").disabled = true;
    show($("#mainForm"), false); show($("#result"), false); show($("#failed"), false); show($("#progress"));
    window.scrollTo({ top: 0, behavior: "smooth" });
    setStep("upload", 1, "Đang tải file lên…");
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/jobs");
    xhr.setRequestHeader("x-access-password", state.pass);
    xhr.upload.onprogress = e => { if (e.lengthComputable) setStep("upload", e.loaded / e.total * 4, `Đang tải file lên… ${Math.round(e.loaded / e.total * 100)}%`); };
    xhr.onload = () => {
      let j = {}; try { j = JSON.parse(xhr.responseText); } catch (_) {}
      if (xhr.status === 401) { try { sessionStorage.removeItem("aptsmart-pass"); } catch (_) {} state.pass = ""; return fail(j.error || "Mật khẩu không đúng.", true); }
      if (xhr.status !== 202) return fail(j.error || `Lỗi máy chủ (${xhr.status}).`);
      state.jobId = j.id; poll();
    };
    xhr.onerror = () => fail("Mất kết nối khi tải file lên. Vui lòng thử lại.");
    xhr.send(fd);
  }

  async function poll() {
    clearTimeout(state.timer);
    try {
      const r = await fetch(`/api/jobs/${state.jobId}`);
      const j = await r.json();
      if (!r.ok) return fail(j.error || "Không tìm thấy yêu cầu.");
      if (j.status === "queued") setStep("extract", 4, j.position > 1 ? `Đang xếp hàng (vị trí ${j.position})…` : "Đang chờ xử lý…");
      else if (j.status === "running") setStep(j.step, j.progress, j.message);
      else if (j.status === "done") return done(j);
      else if (j.status === "error") return fail(j.error || "Có lỗi khi tạo slide.");
    } catch (_) { /* thử lại */ }
    state.timer = setTimeout(poll, 2000);
  }

  function done(j) {
    setStep("done", 100, "Hoàn tất!");
    const R = j.result;
    show($("#progress"), false); show($("#result"));
    $("#resMeta").textContent = [R.meta.title, R.meta.student, R.meta.org].filter(Boolean).join(" · ");
    const pdf = $("#dlPdf"); pdf.href = `/api/jobs/${j.id}/pdf`; show(pdf, R.hasPdf);
    $("#dlPptx").href = `/api/jobs/${j.id}/pptx`;
    const shapeName = { diamond: "hình thoi", hex: "lục giác", hexTall: "lục giác dọc", slantR: "nghiêng", slantL: "nghiêng trái", shard: "cắt góc", tab: "cắt góc dưới", arrow: "mũi tên", blob: "bo góc", circle: "tròn" };
    $("#facts").innerHTML = [
      `<span class="fact">${R.pages} slide</span>`,
      `<span class="fact"><i style="background:#${esc(R.colors.primary)}"></i>#${esc(R.colors.primary)} <i style="background:#${esc(R.colors.accent)}"></i>#${esc(R.colors.accent)}</span>`,
      `<span class="fact">Khung: ${esc(shapeName[R.shapes.main] || R.shapes.main)} + ${esc(shapeName[R.shapes.sub] || R.shapes.sub)}</span>`,
      `<span class="fact">${R.ai.mode === "mock" ? "Nội dung: giả lập" : "Nội dung: APTsmart AI"}</span>`,
      `<span class="fact">${R.seconds} giây</span>`,
    ].join("");
    $("#issues").innerHTML = R.issues.length ? R.issues.map(i => `<li><b>${esc(i.where)}:</b> ${esc(i.detail)}</li>`).join("") : "<li>Không phát hiện mâu thuẫn số liệu.</li>";
    $("#warns").innerHTML = R.warnings.map(w => `<li>${esc(w)}</li>`).join("");
    $("#warnN").textContent = R.warnings.length; show($("#warnBox"), R.warnings.length > 0);
    const exp = new Date(j.expiresAt);
    $("#expire").textContent = `File sẽ tự xóa lúc ${exp.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}. Hãy tải về ngay.`;
    refreshQuota();
  }
  function fail(msg, needPass) {
    show($("#progress"), false); show($("#failed")); $("#failMsg").textContent = msg; $("#submitBtn").disabled = false;
    $("#retry").onclick = () => { show($("#failed"), false); if (needPass) show($("#gate")); else show($("#mainForm")); };
    refreshQuota();
  }
  async function refreshQuota() { try { const c = await (await fetch("/api/config")).json(); state.cfg = c; $("#quota").textContent = `Còn ${c.remaining}/${c.dailyLimit} lượt hôm nay`; } catch (_) {} }
  $("#again").addEventListener("click", () => { show($("#result"), false); show($("#mainForm")); $("#submitBtn").disabled = false; });

  init();
})();
