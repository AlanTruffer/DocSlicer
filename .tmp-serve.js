// Servidor estatico minimo para inspeccionar el renderer en el navegador.
// Uso: node .tmp-serve.js [puerto]
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.argv[2]) || 8778;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.join(root, rel);

  if (!file.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found: ' + rel);
      return;
    }
    res.writeHead(200, {
      'content-type': types[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(buf);
  });
}).listen(port, '127.0.0.1', () => {
  console.log('listo en http://127.0.0.1:' + port);
});