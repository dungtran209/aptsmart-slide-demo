// Máy chủ giả lập Anthropic Messages API (SSE) để kiểm thử đường gọi Claude mà không tốn tiền/không cần key.
// Lần gọi 1: trả deck thiếu slide (để kiểm tra cơ chế gọi lại kèm lỗi); lần 2: trả deck mẫu hợp lệ.
// Dùng: node test/fake-anthropic.js 4010  →  ANTHROPIC_BASE_URL=http://localhost:4010 ANTHROPIC_API_KEY=test node src/server.js
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.argv[2] || 4010);
const example = JSON.parse(fs.readFileSync(path.join(__dirname, "../standards/example-deck.bidv.json"), "utf8"));
let calls = 0;

http.createServer((req, res) => {
  let body = "";
  req.on("data", c => (body += c));
  req.on("end", () => {
    if (!req.url.startsWith("/v1/messages")) { res.writeHead(404); return res.end(); }
    calls++;
    const reqJson = JSON.parse(body || "{}");
    const userText = JSON.stringify(reqJson.messages || []).length;
    console.log(`[fake] call ${calls}: model=${reqJson.model} max_tokens=${reqJson.max_tokens} messages=${reqJson.messages.length} system=${JSON.stringify(reqJson.system).length} ký tự, user≈${userText} ký tự, ảnh=${(JSON.stringify(reqJson.messages).match(/"type":"image"/g) || []).length}`);
    const deck = JSON.parse(JSON.stringify(example));
    if (calls % 2 === 1) deck.slides.splice(5, 3); // thiếu slide → lỗi quy chuẩn → buộc gọi lại
    const text = "```json\n" + JSON.stringify(deck) + "\n```";
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "request-id": "req_fake" });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const id = "msg_fake_" + calls;
    send("message_start", { type: "message_start", message: { id, type: "message", role: "assistant", model: reqJson.model, content: [], stop_reason: null, stop_sequence: null,
      usage: { input_tokens: 95000, output_tokens: 1, cache_creation_input_tokens: calls === 1 ? 14000 : 0, cache_read_input_tokens: calls === 1 ? 0 : 14000 } } });
    send("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
    for (let i = 0; i < text.length; i += 800) send("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(i, i + 800) } });
    send("content_block_stop", { type: "content_block_stop", index: 0 });
    send("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: Math.round(text.length / 3) } });
    send("message_stop", { type: "message_stop" });
    res.end();
  });
}).listen(PORT, () => console.log(`[fake] Anthropic giả lập tại http://localhost:${PORT}`));
