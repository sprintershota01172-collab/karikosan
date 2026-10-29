// アプリのアイコン（PNG）を public/icon.svg から作る。アイコンを変えたときだけ実行する: npm run icons
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const svg = await readFile(path.join(root, 'public/icon.svg'));
for (const [name, size] of [['icon-180.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) await sharp(svg).resize(size, size).png().toFile(path.join(root, 'public', name));
// マスク用（Android）: 角丸なしの背景に、絵を少し小さく
const mask = String(svg).replace('rx="116"', 'rx="0"').replace('<g ', '<g transform="translate(51 51) scale(0.8)" ').replace('<path d="M318', '<path transform="translate(51 51) scale(0.8)" d="M318');
await sharp(Buffer.from(mask)).resize(512, 512).png().toFile(path.join(root, 'public/icon-maskable.png'));
console.log('icons written');
