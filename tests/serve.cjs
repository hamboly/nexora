// Local-only allowlist server. Never expose .env, Git, or deployment metadata.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.argv[2] || 8472);
const assets = new Set(['index.html', 'app.js','alarm-clock.js', 'widget-layout.js', 'widget-canvas.js', 'styles.css', 'favicon.svg', 'tests/widget-sizes.html', 'tests/fixtures.js', 'tests/widget-sizes.js', 'tests/widget-canvas.html', 'tests/widget-canvas.js']);
http.createServer((req, res) => {
  const name = new URL(req.url, 'http://127.0.0.1').pathname.slice(1) || 'index.html';
  if (!assets.has(name)) { res.writeHead(404); return res.end(); }
  fs.readFile(path.join(root, name), (error, data) => {
    if (error) { res.writeHead(500); return res.end(); }
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(name)] + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => console.log(`Local preview: http://127.0.0.1:${port}/`));
