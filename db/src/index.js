export * from './schema.js';
export * from './setup.js';
export * from './upgrade.js';

import { schema } from './schema.js';
import { setup } from './setup.js';
import { downgrade, upgrade } from './upgrade.js';

export default {
  schema,

  upgrade,
  downgrade,

  setup,
};
