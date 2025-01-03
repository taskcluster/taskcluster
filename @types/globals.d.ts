declare module 'lodash' {
  function isPlainObject(value: any): value is Record<string, unknown>;
}

declare module 'js-yaml' {
  function load(content: string): any;
}
