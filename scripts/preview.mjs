// Server tĩnh đơn giản để xem thử trang web trong thư mục docs/ trước khi deploy.
//   npm run preview   ->   http://localhost:4173
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "docs");
const PORT = process.env.PORT || 4173;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png" };

http
  .createServer((req, res) => {
    let url = decodeURIComponent(req.url.split("?")[0].split("#")[0]);
    if (url === "/") url = "/index.html";
    let file = path.join(root, url);
    // thư mục -> phục vụ index.html bên trong (vd /checkin/ -> /checkin/index.html)
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      return res.end("404");
    }
    res.writeHead(200, { "content-type": (TYPES[path.extname(file)] || "application/octet-stream") + "; charset=utf-8" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => {
    console.log(`\n🌐 Xem thử tại: http://localhost:${PORT}`);
    const idx = path.join(root, "g");
    if (fs.existsSync(idx)) {
      const first = fs.readdirSync(idx).find((f) => f.endsWith(".json"));
      if (first) console.log(`   Thử 1 khách: http://localhost:${PORT}/#${first.replace(".json", "")}\n`);
    }
  });
