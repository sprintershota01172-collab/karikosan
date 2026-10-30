/**
 * 要素（とそのまとまり）が見えるように、入っているスクロール領域だけを動かす。
 * scrollIntoView はページ全体（iPhone ではキーボードの出ている画面）まで動かすことがあるので使わない。
 *
 * data-level のある見出し（車種 0・グループ 1・子ツリー 2）を渡すと、次の同じ段以上の見出しまでを1つのまとまりとして扱う。
 */
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function revealIn(el: Element | null) {
  if (!(el instanceof HTMLElement)) return;
  const sc = el.closest<HTMLElement>('.scroll, .gscroll, .sheet-body');
  if (!sc) return;
  // 上に貼りついている見出し（ガントの日付）の高さ
  const head = sc.classList.contains('gscroll') ? sc.querySelector<HTMLElement>('.ghead')?.offsetHeight ?? 0 : 0;
  let last: HTMLElement = el;
  const level = Number(el.dataset.level);
  if (el.dataset.level != null && Number.isFinite(level)) {
    for (let n = el.nextElementSibling as HTMLElement | null; n; n = n.nextElementSibling as HTMLElement | null) {
      if (n.dataset.level != null && Number(n.dataset.level) <= level) break;
      if (n.offsetHeight) last = n;
    }
  }
  const box = sc.getBoundingClientRect();
  const top = el.getBoundingClientRect().top - box.top + sc.scrollTop - head;
  const bottom = last.getBoundingClientRect().bottom - box.top + sc.scrollTop;
  const view = sc.clientHeight - head;
  const s = sc.scrollTop;
  let to = s;
  if (top < s) to = top; // 上に隠れている → 先頭を上端に
  else if (bottom > s + head + view) to = Math.min(top, bottom - view - head); // 下に隠れている → 収まるなら全体、収まらないなら先頭を上端に
  if (Math.abs(to - s) < 1) return;
  sc.scrollTo({ top: Math.max(0, to), behavior: reduced() ? 'auto' : 'smooth' });
}
