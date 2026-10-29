/**
 * この環境では @types/react を取得できないため、使用する API だけを型付けする。
 * コンポーネントの props は各ファイルの型で検査し、DOM 要素の属性は緩く受ける。
 */
declare module 'react' {
  export type ReactNode = ReactElement | string | number | boolean | null | undefined | ReactNode[];
  export interface ReactElement {
    type: unknown;
    props: unknown;
    key: string | null;
  }
  export type FC<P = Record<string, unknown>> = (props: P & { children?: ReactNode }) => ReactElement | null;
  export type SetStateAction<S> = S | ((prev: S) => S);
  export type Dispatch<A> = (value: A) => void;
  export interface MutableRefObject<T> {
    current: T;
  }
  export interface RefObject<T> {
    readonly current: T | null;
  }
  export type Ref<T> = RefObject<T> | ((el: T | null) => void) | null;
  export interface Context<T> {
    Provider: FC<{ value: T; children?: ReactNode }>;
  }
  export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useReducer<S, A>(reducer: (s: S, a: A) => S, initial: S): [S, Dispatch<A>];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useLayoutEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...args: never[]) => unknown>(fn: T, deps: readonly unknown[]): T;
  export function useRef<T>(initial: T): MutableRefObject<T>;
  export function useRef<T>(initial: T | null): RefObject<T>;
  export function useContext<T>(ctx: Context<T>): T;
  export function useId(): string;
  export function useSyncExternalStore<T>(subscribe: (cb: () => void) => () => void, get: () => T, getServer?: () => T): T;
  export function startTransition(fn: () => void): void;
  export function createContext<T>(value: T): Context<T>;
  export function memo<P>(c: FC<P>, eq?: (a: P, b: P) => boolean): FC<P>;
  export const Fragment: FC<{ children?: ReactNode }>;
  export function createElement(type: unknown, props?: unknown, ...children: unknown[]): ReactElement;
  const React: {
    createElement: typeof createElement;
    Fragment: typeof Fragment;
  };
  export default React;
}

declare module 'react-dom/client' {
  export function createRoot(el: Element): { render(node: unknown): void; unmount(): void };
}

declare module 'react-dom' {
  export function flushSync<T>(fn: () => T): T;
  export function createPortal(children: unknown, el: Element): import('react').ReactElement;
}

declare namespace JSX {
  type Element = import('react').ReactElement;
  interface ElementChildrenAttribute {
    children: unknown;
  }
  interface IntrinsicAttributes {
    key?: string | number | null;
  }
  interface IntrinsicElements {
    [name: string]: Record<string, unknown>;
  }
}

/** ビルド時に埋め込む値 */
declare const __BUILD__: string;
declare const __BUILT_AT__: string;
declare const __PWA__: boolean;
