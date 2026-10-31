import React from 'react';
import { createRoot } from 'react-dom/client';
import { boot } from './store/store';
import { App } from './ui/App';

createRoot(document.getElementById('root')!).render(<App />);
void boot();

// オフラインで起動できるように（GitHub Pages 版のみ）
if (typeof __PWA__ !== 'undefined' && __PWA__ && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
  // 保存したデータを、端末の空き容量が少ないときにも消されにくくする
  void navigator.storage?.persist?.().catch(() => false);
}
