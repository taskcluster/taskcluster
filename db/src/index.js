export * from "./setup.js";
export * from "./upgrade.js";
export * from './schema.js';

import { setup } from './setup.js';
import { schema } from './schema.js';
import { upgrade, downgrade } from './upgrade.js';

export default {
  schema,

  upgrade,
  downgrade,

  setup,
};
