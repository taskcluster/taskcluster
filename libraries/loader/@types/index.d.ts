declare module '@taskcluster/lib-loader' {
  /**
   * A generic type for the shape of a single component definition
   * in the componentDirectory.
   *
   * @typeParam TRequires  - an object whose keys are the names
   *                        of required components and values are the types
   *                        returned by those components' `setup(...)`.
   * @typeParam TReturn    - the type returned by this component’s `setup`.
   */
  export interface ComponentDefinition<
    TRequires extends Record<string, any> = Record<string, any>,
    TReturn = any
  > {
    /**
     * The names of components this component depends on. When `setup` is called,
     * the `ctx` argument will have the same keys as `requires`, each referencing
     * the loaded/returned value of those components.
     */
    requires?: (keyof TRequires)[];

    /**
     * The setup function that instantiates this component.
     *
     * @param ctx  - An object mapping each required component's name
     *               to its returned value.
     * @param name - The name of this component (as it appears in the directory).
     * @returns    - The instantiated component (e.g. a class, object, etc.).
     */
    setup(ctx: TRequires, name: string): TReturn | Promise<TReturn>;
  }

  /**
   * This interface describes the loader function returned by `loader(...)`.
   *
   * The loader function can be called with:
   *   1. A target component name (one of the keys in the `componentDirectory` or
   *      `virtualComponents`).
   *   2. An optional object specifying values for any virtual components.
   *
   * It returns a Promise that resolves to the loaded target component.
   */
  export interface Loader {
    /**
     * Loads a given component (by name), returns a Promise of that component.
     *
     * @param target  - The name of the component to load.
     * @param options - An object specifying values for virtual components.
     * @returns       - A Promise resolving to the loaded target.
     */
    (target: string, options?: Record<string, any>): Promise<any>;

    /**
     * Invokes loader and crashes the process on error.
     *
     * @param target - The name of the component to load.
     */
    crashOnError(target: string): void;
  }

  /**
   * The default export of the module is the `loader` function.
   *
   * @param componentDirectory - An object where each key is a component’s name
   *                             and each value is a component definition.
   * @param virtualComponents  - Either an array of string names for virtual components
   *                             or an object mapping names to their values.
   * @returns                  - A `Loader` function.
   */
  export default function loader(
    componentDirectory: Record<string, ComponentDefinition<any, any>>,
    virtualComponents?: Record<string, any> | string[]
  ): Loader;
}
