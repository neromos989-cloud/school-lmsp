/* School Lms: jendela AI mode guru.
   Taruh file ini di repo aplikasi, lalu tambahkan sebelum </body>:
   <script src="school-lms-ai.js" defer></script>
   Buka aplikasi dengan tambahan ?guru di alamatnya agar jendela muncul.

   Versi ini membaca SEMUA gambar pada soal: <img>, <canvas>, <svg>, dan gambar latar CSS,
   termasuk gambar di pilihan jawaban. Semua dikirim dalam satu permintaan. */
(function () {
  "use strict";

  // ===== PENGATURAN: sesuaikan tiga baris pertama =====
  const CONFIG = {
    API_URL: "https://damp-paper-8239.neromos989.workers.dev",
    // Kosongkan ("") agar seluruh halaman dibaca otomatis (teks + semua gambar), tanpa penanda.
    // Atau isi penanda elemen soal jika ingin lebih tepat, contoh: "#soal, #pilihan"
    QUESTION_SELECTOR: "",
    AUTO_ANSWER: false,
    MAX_IMAGES: 20, // batas pengaman per soal (harus sama atau lebih kecil dari MAX_IMAGES di worker.js)
    TITLE: "School Lms",
    isTeacher: () => true,
  };
  if (!CONFIG.isTeacher()) return;
  if (document.getElementById("slms")) return; // sudah dipasang (aplikasi bisa menyuntik ulang)

  const css = `
#slms{position:fixed;right:16px;bottom:16px;width:min(380px,calc(100vw - 32px));height:320px;min-width:240px;min-height:120px;max-width:calc(100vw - 8px);max-height:90vh;display:flex;flex-direction:column;overflow:hidden;resize:both;background:#16352b;color:#eef6f1;border:1px solid #e8c533;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.35);z-index:2147483000;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;box-sizing:border-box}
#slms *{box-sizing:border-box}
#slms.slms-min{width:52px!important;height:52px!important;min-width:0;min-height:0;border-radius:50%;resize:none}
#slms.slms-min .slms-body,#slms.slms-min strong,#slms.slms-min .slms-mn{display:none}
#slms.slms-min .slms-hd{padding:0;height:100%;justify-content:center;border-bottom:0}
#slms .slms-robot{display:none}
#slms.slms-min .slms-robot{display:block}
#slms .slms-hd{display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:grab;touch-action:none;user-select:none;border-bottom:1px solid rgba(255,255,255,.18)}
#slms .slms-hd strong{flex:1;font-size:14px}
#slms button{font:600 12px system-ui,sans-serif;padding:4px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.35);background:transparent;color:inherit;cursor:pointer}
#slms .slms-body{flex:1;overflow:auto;padding:10px 12px}
#slms .slms-ctl{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;font-size:12px;margin-bottom:8px}
#slms .slms-ctl label{display:flex;align-items:center;gap:6px}
#slms .slms-out{white-space:pre-wrap;word-break:break-word;margin:0;font:inherit;font-size:14px}
#slms .slms-st{font-size:12px;opacity:.85;margin-top:6px}`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "slms";
  root.setAttribute("role", "complementary");
  root.innerHTML = `
<div class="slms-hd">
  <svg class="slms-robot" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 5v3"/><circle cx="16" cy="4" r="1.5"/><rect x="6" y="8" width="20" height="17" rx="4"/><circle cx="12" cy="15" r="1.6" fill="currentColor"/><circle cx="20" cy="15" r="1.6" fill="currentColor"/><path d="M12 20h8"/><path d="M3 14v4M29 14v4"/></svg>
  <strong></strong>
  <button class="slms-mn" type="button" aria-label="Kecilkan jendela">Kecilkan</button>
</div>
<div class="slms-body">
  <div class="slms-ctl">
    <label><input type="checkbox" class="slms-auto"> Jawab otomatis</label>
    <label>Transparansi <input type="range" class="slms-op" min="40" max="100" value="100"></label>
    <button class="slms-ask" type="button">Jawab sekarang</button>
    <button class="slms-img" type="button">Tambah gambar</button>
    <input class="slms-file" type="file" accept="image/*" hidden>
  </div>
  <pre class="slms-out"></pre>
  <div class="slms-st" role="status"></div>
</div>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  $("strong").textContent = CONFIG.TITLE;
  $(".slms-auto").checked = CONFIG.AUTO_ANSWER;

  let ctl = null, timer = null, manualImgs = [], lastKey = "", lastBase = "";
  const cache = new Map();
  const st = (t) => { $(".slms-st").textContent = t || ""; };
  const show = (t) => { $(".slms-out").textContent = t || ""; };
  const getCode = () => { try { return sessionStorage.getItem("slms_code") || ""; } catch (e) { return ""; } };
  const setCode = (c) => { try { c ? sessionStorage.setItem("slms_code", c) : sessionStorage.removeItem("slms_code"); } catch (e) {} };

  // Gambar sumber (bitmap, canvas, atau Image) -> JPEG base64, maks 1600 px.
  // Jika hasilnya masih terlalu besar, ukuran dikecilkan lagi sampai muat.
  function jpeg(src, w, h) {
    let k = Math.min(1, 1600 / Math.max(w, h)), q = 0.9, d = "";
    for (let i = 0; i < 4; i++) {
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(w * k));
      c.height = Math.max(1, Math.round(h * k));
      const g = c.getContext("2d");
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(src, 0, 0, c.width, c.height);
      d = c.toDataURL("image/jpeg", q).split(",")[1];
      if (d.length < 3500000) break;
      k *= 0.75; q = 0.8;
    }
    return { media_type: "image/jpeg", data: d };
  }
  async function toImage(blob) {
    const bmp = await createImageBitmap(blob);
    return jpeg(bmp, bmp.width, bmp.height);
  }
  async function svgToImage(svg) {
    const r = svg.getBoundingClientRect();
    const copy = svg.cloneNode(true);
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("width", Math.round(r.width));
    copy.setAttribute("height", Math.round(r.height));
    const im = new Image();
    im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(copy));
    await im.decode();
    return jpeg(im, Math.round(r.width), Math.round(r.height));
  }
  function whenLoaded(img) {
    if (img.complete) return Promise.resolve();
    return new Promise((res) => {
      img.addEventListener("load", res, { once: true });
      img.addEventListener("error", res, { once: true });
      setTimeout(res, 3000);
    });
  }
  async function loadItem(it) {
    if (it.kind === "canvas") return jpeg(it.el, it.el.width, it.el.height);
    if (it.kind === "svg") return svgToImage(it.el);
    if (it.el) await whenLoaded(it.el);
    try {
      return await toImage(await (await fetch(it.src)).blob());
    } catch (e) {
      // Cadangan: gambar yang sudah tampil digambar ulang (berhasil jika tidak diblokir CORS).
      if (it.el && it.el.naturalWidth) return jpeg(it.el, it.el.naturalWidth, it.el.naturalHeight);
      throw e;
    }
  }

  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  // Mode seluruh halaman: jawab otomatis hanya jika halaman punya isian jawaban (pilihan ganda / esai).
  const hasAnswerInputs = () =>
    [...document.querySelectorAll("input[type=radio],input[type=checkbox],textarea")].some((e) => !root.contains(e));
  const big = (n) => { const r = n.getBoundingClientRect(); return r.width >= 8 && r.height >= 8; };

  // Baca teks dan SEMUA gambar pada elemen soal.
  function readQuestion() {
    let els = [];
    if (CONFIG.QUESTION_SELECTOR) { try { els = [...document.querySelectorAll(CONFIG.QUESTION_SELECTOR)]; } catch (e) {} }
    const page = !els.length; // tanpa penanda: baca seluruh halaman
    if (page) els = [document.body];
    const okImg = (n) => {
      if (root.contains(n) || !big(n)) return false;
      if (!page) return true;
      const r = n.getBoundingClientRect(); // di mode halaman, abaikan ikon/logo kecil dan header/menu/footer
      return r.width >= 60 && r.height >= 40 && !n.closest("header,nav,footer");
    };
    const shown = root.style.display;
    root.style.display = "none"; // jendela AI tidak ikut terbaca sebagai teks soal
    let text = "";
    try { text = els.map((e) => (e.innerText || "").trim()).filter(Boolean).join("\n").trim(); }
    finally { root.style.display = shown; }
    const items = [], seen = new Set();
    const add = (it) => { if (!seen.has(it.key)) { seen.add(it.key); items.push(it); } };
    els.forEach((el) => {
      el.querySelectorAll("img,canvas,svg").forEach((n) => {
        const tag = n.localName;
        if (tag === "svg" && n.parentElement && n.parentElement.closest("svg")) return;
        if (!okImg(n)) return;
        if (tag === "img") {
          const src = n.currentSrc || n.src;
          if (src) add({ kind: "img", el: n, src, key: src });
        } else if (tag === "canvas") {
          try { add({ kind: "canvas", el: n, key: "c" + n.width + "x" + n.height + hash(n.toDataURL("image/png")) }); } catch (e) {}
        } else {
          add({ kind: "svg", el: n, key: "s" + hash(new XMLSerializer().serializeToString(n)) });
        }
      });
      el.querySelectorAll("*").forEach((n) => {
        const m = /url\(["']?([^"')]+)["']?\)/.exec(getComputedStyle(n).backgroundImage || "");
        if (m && okImg(n)) add({ kind: "bg", el: null, src: m[1], key: m[1] });
      });
    });
    return { text, items, page, key: text.replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, "") + "|" + items.map((i) => i.key).join(",") };
  }
  const keyOf = (q) => q.key + "|" + manualImgs.map((m) => m.id).join(",");

  async function ask(force) {
    const q = readQuestion();
    if (!q) { st("Halaman tidak bisa dibaca."); return; }
    if (!q.text && !q.items.length && !manualImgs.length) { st("Soal kosong."); return; }
    const key = keyOf(q);
    if (!force && cache.has(key)) { show(cache.get(key)); return; }

    let code = getCode();
    if (!code) {
      code = (prompt("Masukkan kode guru:") || "").trim();
      if (!code) { st("Kode guru diperlukan."); return; }
      setCode(code);
    }
    if (ctl) ctl.abort();
    const c = new AbortController();
    ctl = c;
    st("AI sedang menjawab…");
    const notes = [];
    try {
      const room = Math.max(0, CONFIG.MAX_IMAGES - manualImgs.length);
      const picked = q.items.slice(0, room);
      if (q.items.length > picked.length) notes.push((q.items.length - picked.length) + " gambar tidak dikirim (melebihi MAX_IMAGES).");
      const images = [];
      let fail = 0;
      for (const it of picked) {
        try { images.push(await loadItem(it)); } catch (e) { fail++; }
        if (c.signal.aborted) return;
      }
      if (fail) notes.push(fail + " gambar tidak bisa dibaca otomatis. Pakai tombol Tambah gambar.");
      manualImgs.forEach((m) => images.push(m.image));

      const res = await fetch(CONFIG.API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Teacher-Code": code },
        body: JSON.stringify({ question: q.text, images }),
        signal: c.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) { setCode(""); st("Kode guru salah. Tekan Jawab sekarang untuk mengisi ulang."); return; }
      if (!res.ok) throw new Error(data.error || "Kesalahan " + res.status);
      cache.set(key, data.answer);
      const now = readQuestion();
      if (now && keyOf(now) === key) { show(data.answer); st(notes.join(" ")); }
    } catch (e) {
      if (c.signal.aborted) return;
      st("Gagal menjawab: " + (e.message || "tidak diketahui") + ". Coba lagi.");
    }
  }

  // Pantau pergantian soal dan jawab otomatis.
  function schedule() {
    if (timer) return; // dibatasi, bukan di-reset, supaya animasi/penghitung waktu tidak menahan pembacaan
    timer = setTimeout(() => {
      timer = null;
      const q = readQuestion();
      if (!q) return;
      if (q.key !== lastBase) { lastBase = q.key; manualImgs = []; }
      const k = keyOf(q);
      if (k === lastKey) return;
      lastKey = k;
      if (ctl) ctl.abort();
      show(cache.get(k) || "");
      st(getCode() ? "" : "Tekan “Jawab sekarang” dan masukkan kode guru.");
      if ($(".slms-auto").checked && getCode() && (q.text || q.items.length) && !cache.has(k) && (!q.page || hasAnswerInputs())) ask(false);
    }, 800);
  }
  function watch() {
    const mo = new MutationObserver((muts) => { if (muts.some((m) => !root.contains(m.target))) schedule(); });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["src", "srcset", "style"] });
    schedule();
  }
  watch();

  $(".slms-ask").onclick = () => ask(true);
  $(".slms-img").onclick = () => $(".slms-file").click();
  $(".slms-file").onchange = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      manualImgs.push({ id: Date.now(), image: await toImage(f) });
      st("Gambar ditambahkan (" + manualImgs.length + ").");
      ask(true);
    } catch (err) { st("Gagal membaca gambar."); }
  };
  $(".slms-op").oninput = (e) => { root.style.opacity = e.target.value / 100; };

  // Kecilkan menjadi ikon robot, geser, dan buka kembali.
  const hd = $(".slms-hd");
  function setMin(m) {
    root.classList.toggle("slms-min", m);
    if (m) { hd.setAttribute("role", "button"); hd.setAttribute("tabindex", "0"); hd.setAttribute("aria-label", "Buka jendela AI"); }
    else { hd.removeAttribute("role"); hd.removeAttribute("tabindex"); hd.removeAttribute("aria-label"); }
  }
  $(".slms-mn").onclick = () => setMin(true);
  hd.addEventListener("keydown", (e) => {
    if (root.classList.contains("slms-min") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setMin(false); }
  });
  let dx = 0, dy = 0, sx = 0, sy = 0, moved = 0, drag = false;
  hd.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    drag = true; moved = 0; sx = e.clientX; sy = e.clientY;
    const r = root.getBoundingClientRect();
    dx = e.clientX - r.left; dy = e.clientY - r.top;
    hd.setPointerCapture(e.pointerId);
    hd.style.cursor = "grabbing";
  });
  hd.addEventListener("pointermove", (e) => {
    if (!drag) return;
    moved = Math.max(moved, Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy));
    root.style.left = Math.min(Math.max(0, e.clientX - dx), innerWidth - 80) + "px";
    root.style.top = Math.min(Math.max(0, e.clientY - dy), innerHeight - 44) + "px";
    root.style.right = "auto"; root.style.bottom = "auto";
  });
  const end = () => {
    const was = drag;
    drag = false; hd.style.cursor = "grab";
    if (was && moved < 6 && root.classList.contains("slms-min")) setMin(false);
  };
  hd.addEventListener("pointerup", end);
  hd.addEventListener("pointercancel", end);
})();
