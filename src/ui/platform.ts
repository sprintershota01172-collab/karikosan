/** ファイルの書き出し・共有、版の確認 */

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** スマホは共有シート（メール・LINE・ファイルに保存など）、PC はダウンロード */
export async function shareOrDownload(filename: string, body: string | Uint8Array, type = 'application/json', title = 'karikosan のデータ'): Promise<'shared' | 'saved' | 'cancelled'> {
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean; share?: (d: unknown) => Promise<void> };
  const part = body as BlobPart;
  try {
    const file = new File([part], filename, { type });
    if (nav.share && nav.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
      await nav.share({ files: [file], title });
      return 'shared';
    }
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') return 'cancelled';
  }
  const url = URL.createObjectURL(new Blob([part], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  // すぐに消すと、ブラウザによってはファイル名が付かない
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 4000);
  return 'saved';
}

export const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';
export const BUILT_AT = typeof __BUILT_AT__ !== 'undefined' ? __BUILT_AT__ : '';

export async function latestBuild(): Promise<string | null> {
  try {
    const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const v = await r.json();
    return typeof v?.build === 'string' ? v.build : null;
  } catch {
    return null;
  }
}

/** 新しい版を読み込む（古いキャッシュを残さない） */
export async function applyUpdate() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    reg?.waiting?.postMessage('skip');
  } catch {
    /* 読み込み直せば新しい画面になる */
  }
  location.reload();
}
