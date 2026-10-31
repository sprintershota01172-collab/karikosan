/**
 * 小さな .xlsx 書き出し（Excel・Numbers・Google スプレッドシートで開ける Office Open XML）。
 * 文字は inlineStr、日付は Excel の日付の数値＋表示形式、色・太字・罫線・列幅・セルの結合・枠の固定に対応。
 */
import JSZip from 'jszip';

export interface Style {
  bold?: boolean;
  italic?: boolean;
  /** 文字の色（#RRGGBB） */
  color?: string;
  size?: number;
  /** 塗りつぶし（#RRGGBB） */
  fill?: string;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'center';
  wrap?: boolean;
  /** 罫線: all = 四方、bottom = 下だけ */
  border?: 'all' | 'bottom' | 'none';
  borderColor?: string;
  /** 表示形式（例: 'm/d', '0%', 'yyyy/m/d'） */
  fmt?: string;
  /** 左の字下げ（段） */
  indent?: number;
}

export type Value = string | number | boolean | null | undefined;
export type Cell = Value | { v: Value; s?: Style; date?: boolean };

export interface SheetSpec {
  name: string;
  rows: Cell[][];
  /** 列の幅（文字数） */
  cols?: number[];
  /** 'A1:C1' の形 */
  merges?: string[];
  /** この行・列より上・左を固定（0 始まりの個数） */
  freeze?: { rows: number; cols: number };
  /** 行の高さ（ポイント）。行の番号（0 始まり） → 高さ */
  heights?: Record<number, number>;
  /** 印刷の向き */
  landscape?: boolean;
  /** 目盛線を隠す */
  noGrid?: boolean;
  /** 既定の行の高さ（ポイント） */
  rowHeight?: number;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase().padStart(6, '0').slice(0, 6)}`;

/** 列の番号（0 始まり）→ 'A', 'B', … 'AA' */
export function colName(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
export const ref = (r: number, c: number) => `${colName(c)}${r + 1}`;

/** 'YYYY-MM-DD' → Excel の日付の数値（1900 年方式） */
export function excelDate(d: string): number {
  const [y, m, day] = d.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, day) - Date.UTC(1899, 11, 30)) / 86400000);
}

class Styles {
  fonts: string[] = ['<font><sz val="10"/><name val="Meiryo UI"/><family val="2"/></font>'];
  fills: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  borders: string[] = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  fmts: string[] = [];
  xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  private keys = new Map<string, number>();
  private idx(list: string[], xml: string) {
    const i = list.indexOf(xml);
    if (i >= 0) return i;
    list.push(xml);
    return list.length - 1;
  }
  get(s: Style | undefined, date: boolean): number {
    const st: Style = { ...(s ?? {}) };
    if (date && !st.fmt) st.fmt = 'm/d';
    const key = JSON.stringify(st);
    const k = this.keys.get(key);
    if (k != null) return k;
    const font = `<font>${st.bold ? '<b/>' : ''}${st.italic ? '<i/>' : ''}<sz val="${st.size ?? 10}"/>${st.color ? `<color rgb="${argb(st.color)}"/>` : ''}<name val="Meiryo UI"/><family val="2"/></font>`;
    const fontId = this.idx(this.fonts, font);
    const fillId = st.fill ? this.idx(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="${argb(st.fill)}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const bc = `<color rgb="${argb(st.borderColor ?? '#C9CED6')}"/>`;
    const side = (on: boolean, n: string) => (on ? `<${n} style="thin">${bc}</${n}>` : `<${n}/>`);
    const b = st.border ?? 'none';
    const borderId = b === 'none' ? 0 : this.idx(this.borders, `<border>${side(b === 'all', 'left')}${side(b === 'all', 'right')}${side(b === 'all', 'top')}${side(true, 'bottom')}<diagonal/></border>`);
    let numFmtId = 0;
    if (st.fmt) {
      const builtin: Record<string, number> = { '0': 1, '0.00': 2, '0%': 9, '0.00%': 10 };
      if (builtin[st.fmt] != null) numFmtId = builtin[st.fmt];
      else {
        const i = this.idx(this.fmts, st.fmt);
        numFmtId = 164 + i;
      }
    }
    const al = st.align || st.valign || st.wrap || st.indent ? `<alignment${st.align || st.indent ? ` horizontal="${st.align ?? 'left'}"` : ''} vertical="${st.valign ?? 'center'}"${st.wrap ? ' wrapText="1"' : ''}${st.indent ? ` indent="${st.indent}"` : ''}/>` : '<alignment vertical="center"/>';
    const xf = `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyFont="1" applyFill="${fillId ? 1 : 0}" applyBorder="${borderId ? 1 : 0}" applyNumberFormat="${numFmtId ? 1 : 0}" applyAlignment="1">${al}</xf>`;
    this.xfs.push(xf);
    const id = this.xfs.length - 1;
    this.keys.set(key, id);
    return id;
  }
  xml(): string {
    const fmts = this.fmts.length ? `<numFmts count="${this.fmts.length}">${this.fmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join('')}</numFmts>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${fmts}<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts><fills count="${this.fills.length}">${this.fills.join('')}</fills><borders count="${this.borders.length}">${this.borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }
}

/** シート名に使えない文字を除き、31文字以内に */
const sheetName = (s: string) => s.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';

function sheetXml(sh: SheetSpec, styles: Styles): string {
  const rowsXml: string[] = [];
  sh.rows.forEach((row, r) => {
    const cells: string[] = [];
    row.forEach((cell, c) => {
      if (cell == null) return;
      const o = typeof cell === 'object' ? cell : { v: cell };
      const s = styles.get(o.s, !!o.date);
      const at = ref(r, c);
      const v = o.v;
      if (v == null || v === '') {
        if (s) cells.push(`<c r="${at}" s="${s}"/>`);
      } else if (o.date && typeof v === 'string') cells.push(`<c r="${at}" s="${s}"><v>${excelDate(v)}</v></c>`);
      else if (typeof v === 'number') cells.push(`<c r="${at}" s="${s}"><v>${Number.isFinite(v) ? v : 0}</v></c>`);
      else if (typeof v === 'boolean') cells.push(`<c r="${at}" s="${s}" t="b"><v>${v ? 1 : 0}</v></c>`);
      else cells.push(`<c r="${at}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`);
    });
    const h = sh.heights?.[r];
    rowsXml.push(`<row r="${r + 1}"${h ? ` ht="${h}" customHeight="1"` : ''}>${cells.join('')}</row>`);
  });
  const cols = sh.cols?.length ? `<cols>${sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const f = sh.freeze;
  const pane =
    f && (f.rows || f.cols)
      ? `<pane${f.cols ? ` xSplit="${f.cols}"` : ''}${f.rows ? ` ySplit="${f.rows}"` : ''} topLeftCell="${ref(f.rows, f.cols)}" activePane="${f.rows && f.cols ? 'bottomRight' : f.rows ? 'bottomLeft' : 'topRight'}" state="frozen"/>`
      : '';
  const views = `<sheetViews><sheetView workbookViewId="0"${sh.noGrid ? ' showGridLines="0"' : ''}>${pane}</sheetView></sheetViews>`;
  const merges = sh.merges?.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  const fmt = `<sheetFormatPr defaultRowHeight="${sh.rowHeight ?? 18}"${sh.rowHeight ? ' customHeight="1"' : ''}/>`;
  const page = `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="${sh.landscape ? 'landscape' : 'portrait'}" fitToHeight="0"/>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>${views}${fmt}${cols}<sheetData>${rowsXml.join('')}</sheetData>${merges}${page}</worksheet>`;
}

export async function buildXlsx(sheets: SheetSpec[], title = 'karikosan'): Promise<Uint8Array> {
  const styles = new Styles();
  const used = new Set<string>();
  const names = sheets.map((s) => {
    let n = sheetName(s.name);
    for (let i = 2; used.has(n); i++) n = `${sheetName(s.name).slice(0, 28)} ${i}`;
    used.add(n);
    return n;
  });
  const bodies = sheets.map((s) => sheetXml(s, styles));
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
  );
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  zip.file(
    'docProps/core.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>karikosan</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
  );
  zip.file('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>karikosan</Application></Properties>`);
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  bodies.forEach((b, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, b));
  zip.file('xl/styles.xml', styles.xml());
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
