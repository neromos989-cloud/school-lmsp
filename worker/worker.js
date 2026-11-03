/* Perantara (proxy) aman antara aplikasi di GitHub dan API Anthropic.
   Kunci API disimpan di sini sebagai Secret, tidak pernah masuk ke repo GitHub.

   Variabel yang harus diisi di Cloudflare (Settings > Variables and Secrets):
   - ANTHROPIC_API_KEY  (Secret)  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
   - TEACHER_CODE       (Secret)  ROXB
   - ALLOWED_ORIGIN     (Text)    "*"
   - MODEL              (Text, opsional) bawaan: claude-sonnet-5-5
*/

const MAX_IMAGES = 20;        // jumlah gambar per soal
const MAX_ONE = 6000000;      // batas satu gambar (karakter base64)
const MAX_TOTAL = 24000000;   // batas total semua gambar (di bawah batas 32 MB dari API)

const PROMPT =
  "Kamu membantu guru memeriksa soal ujian. Jawab soal berikut dengan tepat dalam bahasa Indonesia. " +
  "Jika soal disertai gambar, baca semua gambar itu dengan teliti (angka, label, grafik, diagram) dan gunakan untuk menjawab. " +
  "Jika ada beberapa gambar, gambar diberi nomor sesuai urutan di halaman (misalnya satu gambar untuk tiap pilihan jawaban); perhatikan semuanya. " +
  "Tulis baris \"Jawaban:\" (huruf dan isi pilihan untuk pilihan ganda; ringkas untuk isian atau esai), " +
  "lalu baris \"Alasan:\" berisi langkah singkat satu sampai tiga kalimat. " +
  "Jika soal ambigu, gambar kurang jelas, atau kamu tidak yakin, tambahkan baris \"Catatan:\" tentang apa yang perlu diperiksa guru. " +
  "Jangan memakai markdown dan jangan menulis pembuka atau penutup.\n\nSoal:\n";

const json = (obj, status, headers) =>
  new Response(JSON.stringify(obj), { status, headers: { ...headers, "Content-Type": "application/json" } });

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
      "Access-Control-Allow-Headers": "Content-Type, X-Teacher-Code",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "Metode tidak diizinkan" }, 405, cors);
    if (origin !== env.ALLOWED_ORIGIN) return json({ error: "Asal tidak diizinkan" }, 403, cors);
    if (request.headers.get("X-Teacher-Code") !== env.TEACHER_CODE) return json({ error: "Kode guru salah" }, 401, cors);

    let body;
    try { body = await request.json(); } catch (e) { return json({ error: "Format permintaan salah" }, 400, cors); }

    const question = String(body.question || "").slice(0, 8000);
    const list = Array.isArray(body.images) ? body.images : (body.image ? [body.image] : []);
    const content = [];
    let n = 0, total = 0;
    for (const image of list) {
      if (n >= MAX_IMAGES) break;
      if (
        image && typeof image.data === "string" &&
        /^image\/(png|jpeg|webp|gif)$/.test(image.media_type) &&
        image.data.length < MAX_ONE && total + image.data.length <= MAX_TOTAL
      ) {
        n++;
        total += image.data.length;
        if (list.length > 1) content.push({ type: "text", text: "Gambar " + n + ":" });
        content.push({ type: "image", source: { type: "base64", media_type: image.media_type, data: image.data } });
      }
    }
    if (!question && n === 0) return json({ error: "Soal kosong" }, 400, cors);
    content.push({ type: "text", text: PROMPT + (question || "(Soal ada pada gambar.)") });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: env.MODEL || "claude-sonnet-5-5",
        max_tokens: 1500,
        messages: [{ role: "user", content }],
      }),
    });

    if (!r.ok) {
      const status = r.status === 429 ? 429 : 502;
      return json({ error: status === 429 ? "Terlalu banyak permintaan, coba sebentar lagi" : "Layanan AI sedang bermasalah" }, status, cors);
    }
    const data = await r.json();
    const answer = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    return json({ answer: answer || "(AI tidak memberi jawaban)" }, 200, cors);
  },
};
