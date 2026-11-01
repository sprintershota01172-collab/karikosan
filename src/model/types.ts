/** karikosan のデータモデル。保存・同期の単位は AppData 全体（スキーマ番号つき） */

export type ID = string;
/** 日付（'YYYY-MM-DD'、時差の影響を受けないよう文字列で持つ） */
export type DateStr = string;
/** 時刻（'HH:MM'） */
export type TimeStr = string;

export interface Vehicle {
  id: ID;
  name: string;
  /** バー・印の色（CSS の色） */
  color: string;
  order: number;
}

/** グループ（parentId が null）と子ツリー（parentId にグループの id） */
export interface Group {
  id: ID;
  /** 所属する車種。null = 車種なし（個人・共通） */
  vehicleId: ID | null;
  parentId: ID | null;
  name: string;
  order: number;
  /** 最上位に固定 */
  pinned: boolean;
  collapsed: boolean;
  /** ガントのバーの色（色分けが「グループ」のとき）。null = 自動（順番に色を割り当て、子ツリーは親の色） */
  color: string | null;
}

/** 0 = 自動（期限・進捗から判断）、1 低 / 2 中 / 3 高 / 4 至急 = 手動 */
export type Priority = 0 | 1 | 2 | 3 | 4;

export interface Task {
  id: ID;
  title: string;
  memo: string;
  start: DateStr | null;
  due: DateStr | null;
  done: boolean;
  doneAt: number | null;
  priority: Priority;
  /** 0〜100 */
  progress: number;
  vehicleId: ID | null;
  groupId: ID | null;
  assignee: string;
  /** 土日も作業日として扱う */
  weekendWork: boolean;
  /** 手動の並び順（同じグループ内で小さいほど上） */
  order: number;
  createdAt: number;
  updatedAt: number;
  /** 「今日のタスク」から外した日 */
  hiddenOn: DateStr[];
}

export type RepeatKind = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly';

export interface CalEvent {
  id: ID;
  title: string;
  date: DateStr;
  startTime: TimeStr | null;
  endTime: TimeStr | null;
  place: string;
  vehicleId: ID | null;
  memo: string;
  repeat: RepeatKind;
  /** 繰り返しの終わり（含む）。null = ずっと */
  until: DateStr | null;
  createdAt: number;
  updatedAt: number;
}

/** 大日程の種類（バーの色） */
export type PlanKind = 'design' | 'proto' | 'eval' | 'prep' | 'mass' | 'other';

/**
 * 大日程のイベント（車種ごとの、週の単位の予定。試作・評価・量産など）。
 * start は週の初め（月曜）、end は週の終わり（日曜）にそろえて持つ。
 */
export interface PlanEvent {
  id: ID;
  /** null = 共通（車種に関係しない） */
  vehicleId: ID | null;
  title: string;
  start: DateStr;
  end: DateStr;
  kind: PlanKind;
  /** 負荷の重み 1 小 / 2 中 / 3 大（週ごとの負荷の合計に使う） */
  load: 1 | 2 | 3;
  memo: string;
  createdAt: number;
  updatedAt: number;
}

export interface CheckItem {
  id: ID;
  text: string;
  done: boolean;
  order: number;
}

export interface Checklist {
  id: ID;
  name: string;
  order: number;
  collapsed: boolean;
  items: CheckItem[];
}

export type SortMode = 'manual' | 'due' | 'priority';
export type GanttZoom = 'day' | 'week' | 'month';
/** ガントのバーの色分け: 車種の色・グループの色・優先度の色 */
export type BarColorMode = 'vehicle' | 'group' | 'priority';

export interface Settings {
  /** 文字サイズ 1〜10（初期 4） */
  fontStep: number;
  showDone: boolean;
  sortMode: SortMode;
  /** 表示中の車種（'all' = すべて） */
  vehicle: ID | 'all';
  ganttZoom: GanttZoom;
  /** ガントのバーの色分け */
  barColor: BarColorMode;
  /** ガントの項目名の列の幅（rem。null = 画面の幅に合わせて自動） */
  ganttNameW: number | null;
  /** グループは1つずつ開く（開くとほかのグループを閉じ、1画面に収める） */
  oneGroup: boolean;
  /** 大日程の1マス: week = 1週を広く、month = 1年を見渡す */
  planZoom: 'week' | 'month';
  /** ホームの表示: today = 今日のタスクと予定、quad = 4分割 */
  homeMode: 'today' | 'quad';
  /** 4分割の分け方: priority = 至急・高・中・低、group = 選んだ4つのグループ */
  quadBy: 'priority' | 'group';
  /** 4分割（グループ）で使うグループ（4つ。null = 未設定） */
  quadGroups: (ID | null)[];
  /** 4分割の枠の名前（自分で付けた名前。空 = 自動）。priority と group で別々に4つずつ */
  quadNames: { priority: string[]; group: string[] };
  /** 折りたたんだ大項目（車種の id。'-' = 車種なし、'pinned' = 固定したグループ） */
  collapsedV: string[];
}

/** 状況報告の行（その時点の写し。あとでタスクを変えても報告は変わらない） */
export interface ReportRow {
  /** v = 車種、g = グループ、t = タスク */
  kind: 'v' | 'g' | 't';
  /** 元のタスク・グループ・車種の id（古い報告では空） */
  id: string;
  depth: number;
  title: string;
  color: string;
  start: DateStr | null;
  due: DateStr | null;
  /** 0〜100（車種・グループは平均） */
  progress: number;
  done: boolean;
  doneAt: number | null;
  /** 優先度 1〜4（完了・見出しは 0） */
  level: number;
  assignee: string;
  /** 車種・グループの名前（タスクの所属） */
  where: string;
  /** 見出し: 件数・完了数・遅れの数 */
  total: number;
  doneCount: number;
  overdue: number;
}

/** 課題（前回の報告から引き継ぐ） */
export interface ReportIssue {
  id: ID;
  text: string;
  /** open = 対応中、closed = 解決 */
  status: 'open' | 'closed';
  /** 最初に挙げた日 */
  since: DateStr;
}

/** 状況報告（その日の状況の写しと、課題・所感） */
export interface Report {
  id: ID;
  date: DateStr;
  createdAt: number;
  updatedAt: number;
  /** 対象の車種（'all' = すべて）と、その名前 */
  vehicleId: ID | 'all';
  scope: string;
  total: number;
  done: number;
  overdue: number;
  /** 7日以内の期限（未完了） */
  soon: number;
  /** 進捗率（0〜100） */
  progress: number;
  rows: ReportRow[];
  issues: ReportIssue[];
  /** 所感・連絡事項 */
  note: string;
}

export interface AppData {
  schema: number;
  vehicles: Vehicle[];
  groups: Group[];
  tasks: Task[];
  events: CalEvent[];
  checklists: Checklist[];
  /** 大日程 */
  plans: PlanEvent[];
  /** 状況報告（新しい順） */
  reports: Report[];
  settings: Settings;
  updatedAt: number;
}
