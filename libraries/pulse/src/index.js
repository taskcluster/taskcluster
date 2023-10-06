import { Client } from './client';
import { consume } from './consumer';
import { pulseCredentials, connectionStringCredentials } from './credentials';
import { Exchanges } from './publisher';

export default {
  Client,
  consume,
  pulseCredentials,
  connectionStringCredentials,
  Exchanges,
};
