// テスト用の静的サーバー（/karikosan/ の下に dist を置き、GitHub Pages と同じパスで確かめる）
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

export function serve(dir, base = '/karikosan/') {
  return new Promise((resolve) => {
    const srv = createServer(async (req, res) => {
      const u = new URL(req.url, 'http://x');
      if (!u.pathname.startsWith(base)) {
        res.writeHead(302, { location: base });
        return res.end();
      }
      let p = path.join(dir, decodeURIComponent(u.pathname.slice(base.length)));
      try {
        if ((await stat(p)).isDirectory()) p = path.join(p, 'index.html');
        const body = await readFile(p);
        res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
    });
    srv.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${srv.address().port}${base}`, close: () => srv.close() }));
  });
}
