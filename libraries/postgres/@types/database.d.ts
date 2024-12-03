import { Pool, PoolClient } from 'pg';
import { MonitorManager } from 'taskcluster-lib-monitor';
// import { CryptoKey } from './Keyring';
import type { DbFunctions, DeprecatedDbFunctions } from './fns.d.ts';
import Schema from '../src/Schema.js';

// todo
type CryptoKey = {}
type Keyring = {}

export interface DatabaseOptions {
  urlsByMode: {
    read?: string;
    write?: string;
    admin?: string;
  };
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
  monitor: MonitorManager | false;
  statementTimeout?: number;
  poolSize?: number;
}

export interface UpgradeOptions {
  schema: Schema;
  showProgress?: (message: string) => void;
  usernamePrefix: string;
  toVersion?: number;
  adminDbUrl: string;
  skipChecks?: boolean;
}

export interface DowngradeOptions {
  schema: Schema;
  showProgress?: (message: string) => void;
  usernamePrefix: string;
  toVersion: number;
  adminDbUrl: string;
}

export interface WrappedClient {
  query(query: string, values?: any[]): Promise<any>;
}

export interface EncryptParams {
  value: Buffer;
}

export interface DecryptParams {
  value: {
    kid: string;
    v: number;
    __bufchunks_val: number;
    [key: string]: any;
  };
}

declare class Database {
  fns: DbFunctions;
  deprecatedFns: DeprecatedDbFunctions;
  monitor: MonitorManager | false;
  pools: { [key: string]: Pool };
  keyring: Keyring;

  static setup(options: SetupOptions): Promise<Database>;
  static upgrade(options: UpgradeOptions): Promise<void>;
  static downgrade(options: DowngradeOptions): Promise<void>;

  constructor(options: DatabaseOptions);

  _withClient(mode: string, cb: (client: WrappedClient) => Promise<any>): Promise<any>;
  currentVersion(): Promise<number>;
  close(): Promise<void>;

  encrypt(params: EncryptParams): {
    kid: string;
    v: number;
    __bufchunks_val: number;
    __buf0_val: string;
  };

  decrypt(params: DecryptParams): Buffer;

  private _createProcs(options: { schema: any; serviceName: string }): void;
  private _startMonitoringPools(): void;
  private _stopMonitoringPools(): void;
  private _logDbFunctionCall(fields: { name: string }): void;
  private _logDbPoolCounts(fields: {
    pool: string;
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  }): void;

  static _validUsernamePrefix(usernamePrefix: string): boolean;
  private static _checkPermissions(options: { db: Database; schema: any; usernamePrefix: string }): Promise<void>;
  private static _checkTableColumns(options: { db: Database; schema: any }): Promise<void>;
  private _checkVersion(): Promise<void>;
  private _createExtensions(): Promise<void>;
  private _checkDbSettings(): Promise<void>;
}

export default Database;
