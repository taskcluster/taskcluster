/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let _ = require('lodash');

// Export methods and classes from other files
_.defaults(exports,
  require('./client'),
  require('./utils'),
  require('./upload'),
  require('./download'),
);
