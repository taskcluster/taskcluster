declare module 'lodash' {
  function isPlainObject(value: any): value is Record<string, unknown>;
  function isEqual(a: any, b: any): boolean;
  function pick<T extends object, K extends keyof T>(obj: T, ...props: K[]): Pick<T, K>;
  function shuffle<T extends object>(items: T[]): T[];
}

declare module 'js-yaml' {
  function load(content: string): any;
}
