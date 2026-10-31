// karikosan ビルド（esbuild）
//   node scripts/build.mjs → dist/（GitHub Pages /karikosan/ でもローカルでも動くよう、パスはすべて相対）
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = (...p) => path.join(root, 'dist', ...p);

// 版の番号: ソースと公開ファイルの中身から決める（同じ中身なら同じ番号）
const walk = async (dir) => (await Promise.all((await readdir(dir, { withFileTypes: true })).map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])))).flat();
const h = createHash('sha256');
for (const f of [...(await walk(path.join(root, 'src'))), ...(await walk(path.join(root, 'public'))), path.join(root, 'scripts/build.mjs')].sort()) h.update(f.slice(root.length)).update(await readFile(f));
const BUILD = h.digest('hex').slice(0, 8);
const BUILT_AT = new Date().toISOString().slice(0, 10);

const r = await build({
  entryPoints: [path.join(root, 'src/main.tsx')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020', 'safari15'],
  platform: 'browser',
  write: false,
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"', __BUILD__: JSON.stringify(BUILD), __BUILT_AT__: JSON.stringify(BUILT_AT), __PWA__: 'true' },
  logLevel: 'warning',
});
const js = r.outputFiles[0].text;
const css = (await readFile(path.join(root, 'src/ui/styles.css'), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*/g, '\n');
const jsName = `assets/app.${createHash('sha256').update(js).digest('hex').slice(0, 10)}.js`;
const cssName = `assets/app.${createHash('sha256').update(css).digest('hex').slice(0, 10)}.css`;

await rm(out(), { recursive: true, force: true });
await mkdir(out('assets'), { recursive: true });
await writeFile(out(jsName), js);
await writeFile(out(cssName), css);

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<meta name="theme-color" content="#F7F7F4">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="karikosan">
<meta name="format-detection" content="telephone=no">
<meta name="description" content="タスク・工程・スケジュールをまとめて管理する karikosan">
<title>karikosan</title>
<link rel="manifest" href="./manifest.webmanifest">
<link rel="icon" href="./icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="./icon-180.png">
<link rel="stylesheet" href="./${cssName}">
</head>
<body>
<div id="root"></div>
<noscript>JavaScript を有効にしてください。</noscript>
<script src="./${jsName}" defer></script>
</body>
</html>
`;
await writeFile(out('index.html'), html);
await writeFile(
  out('manifest.webmanifest'),
  JSON.stringify(
    {
      name: 'karikosan',
      short_name: 'karikosan',
      description: 'タスク・工程・スケジュール管理',
      lang: 'ja',
      start_url: './',
      scope: './',
      display: 'standalone',
      orientation: 'any',
      background_color: '#F7F7F4',
      theme_color: '#F7F7F4',
      icons: [
        { src: './icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: './icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    null,
    2,
  ),
);
// アイコン（PNG は scripts/icons.mjs で作って public/ に置いてある）
for (const f of ['icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable.png']) await copyFile(path.join(root, 'public', f), out(f));

// オフライン用の Service Worker。キャッシュ名に版を入れ、新しい版では古いキャッシュを消す
//  - 起動（HTML）: ネットを優先。ただし 2.5 秒で返ってこなければ（電波が弱い・オフライン）キャッシュで起動し、ネットの結果は次回のためにしまう
//  - そのほか: 版つきのファイルなのでキャッシュを優先。なければ取りに行き、取れたらしまう
const files = ['./', './index.html', `./${jsName}`, `./${cssName}`, './manifest.webmanifest', './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable.png'];
await writeFile(
  out('sw.js'),
  `// karikosan オフライン用（版 ${BUILD}）
const CACHE = 'karikosan-${BUILD}';
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('karikosan-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', (e) => { if (e.data === 'skip') self.skipWaiting(); });
const shell = () => caches.open(CACHE).then((c) => c.match('./index.html').then((r) => r || c.match('./')));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const url = new URL(req.url);
  if (url.pathname.endsWith('/version.json')) return; // 版の確認はいつも最新を
  if (req.mode === 'navigate') {
    const net = fetch(req).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((cc) => cc.put('./index.html', c)); } return r; });
    const slow = new Promise((ok) => setTimeout(ok, 2500)).then(shell);
    e.respondWith(Promise.race([net.catch(shell), slow.then((r) => r || net)]).then((r) => r || shell()).catch(shell));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((cc) => cc.put(req, c)); } return r; })));
});
`,
);
await writeFile(out('version.json'), JSON.stringify({ build: BUILD, date: BUILT_AT }));
await writeFile(out('.nojekyll'), '');
console.log(`built ${BUILD}: ${jsName} ${(js.length / 1024).toFixed(0)}KB, ${cssName} ${(css.length / 1024).toFixed(0)}KB`);
