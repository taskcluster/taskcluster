import { Provider } from './provider.js';

/**
 * The null provider does absolutely nothing.  It exists only to allow for
 * deletion of worker pools, after they are emptied of existing workers.
 */
export class NullProvider extends Provider {
  constructor(conf) {
    super(conf);
    this.configSchema = 'config-null';
  }
}
