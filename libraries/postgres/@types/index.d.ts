import { Pool, PoolClient } from 'pg';
import { MonitorManager } from 'taskcluster-lib-monitor';
import Keyring from '../src/Keyring.js';
import { CryptoKey } from '../src/Keyring.js';
import type { DbFunctions, DeprecatedDbFunctions } from './fns.d.ts';

import Schema from '../src/Schema.js';
export * from '../src/Schema.js';

import Database from '../src/Database.js';
export * from '../src/Database.js';

export default Database;
export {
  Database,
  Schema,
}

export type DbAccessMode = 'read' | 'write' | 'admin';

export interface DatabaseOptions {
  urlsByMode: Record<DbAccessMode, string>;
  monitor: MonitorManager | false;
  statementTimeout?: number;
  poolSize?: number;
  keyring: Keyring;
}

export interface SetupOptions {
  schema?: any;
  readDbUrl: string;
  writeDbUrl: string;
  dbCryptoKeys: CryptoKey[];
  azureCryptoKey?: string;
  serviceName: string;
  monitor?: MonitorManager;
  statementTimeout?: number;
  poolSize?: number;
}

export interface UpgradeOptions {
  schema: Schema;
  showProgress?: (message?: string) => void;
  usernamePrefix: string;
  toVersion?: number;
  adminDbUrl: string;
  skipChecks?: boolean;
}

export interface DowngradeOptions {
  schema: Schema;
  showProgress?: (message?: string) => void;
  usernamePrefix: string;
  toVersion: number;
  adminDbUrl: string;
}

export interface EncryptedValue {
  kid: string;
  v: number;
  __bufchunks_val: number;
  __buf0_val: string;
}
