// Sinh standards/deck.schema.json từ src/schema.js (zod → JSON Schema). Chạy: npm run schema
const fs = require("fs");
const path = require("path");
const { Deck, z } = require("../src/schema");
const js = z.toJSONSchema(Deck, { target: "draft-7" });
fs.writeFileSync(path.join(__dirname, "../standards/deck.schema.json"), JSON.stringify(js, null, 1));
console.log("Đã ghi standards/deck.schema.json", JSON.stringify(js).length, "ký tự");
