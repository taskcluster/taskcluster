/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export * from './client.js';
export * from './download.js';
export * from './upload.js';
export * from './utils.js';

import * as client from './client.js';
import * as download from './download.js';
import * as upload from './upload.js';
import * as utils from './utils.js';

export default {
  ...client,
  ...client.clients,
  ...utils,
  ...upload,
  ...download,
};
