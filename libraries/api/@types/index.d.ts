// with index.d.ts Typescript only checks this file, so we need to export all once again
export * from '../src/index.js';
import { APIBuilder, ErrorReply } from '../src/index.js';

export type StabilityLevel = 'deprecated' | 'experimental' | 'stable';

export type ValidationMap = {
  [key: string]: RegExp | ((val: string) => string | null);
};

export type ErrorCodes = Record<string, number>;

import type { Request, Response } from 'express';
// add extra context API is injecting into the request
export interface APIRequest extends Request {
  traceId: string; // 'x-taskcluster-trace-id' header
  requestId: string;

  text?: string; // parseBody middleware

  // we don't pass TContext template here to make it simple
  tcContext: Record<string, any>; // Proxy to route context

  // auth middleware
  scopes: () => Promise<string[]>;
  clientId: () => Promise<string>;
  expires: () => Promise<Date|undefined>;
  /** @throws Error */
  satisfies: () => never;
  /** @throws ErrorReply */
  authorize: (opts: object) => Promise<void>;
  authenticated?: boolean;
  satisfyingScopes?: string[];
  public?: boolean;
}
export interface APIResponse extends Response {
  reply: (json: object, responseCode?: number) => never | void;

  /** @throws {ErrorReply} */
  reportError: (code: string, message: string, details?: object) => never;
}

export type APIRequestHandler<TContext extends Record<string, any>> = (
  this: Pick<TContext, keyof TContext>,
  req: APIRequest,
  res: APIResponse,
  next: import('express').NextFunction
) => void | Promise<void>;

export type APIRequestErrrorHandler<TContext extends Record<string, any>> = (
  this: Pick<TContext, keyof TContext>,
  err: Error & Record<string, any>,
  req: APIRequest,
  res: APIResponse,
  next: import('express').NextFunction
) => void | Promise<void>;

export type ScopesExpression = string | {
  AllOf?: string[] | ScopesExpression[];
  AnyOf?: string[] | ScopesExpression[];
} | {
  for: string;
  in: string;
  each: string;
};

export interface APIEntryOptions<TContext extends Record<string, any>> {
  /** HTTP method */
  method: 'post' | 'head' | 'put' | 'get' | 'delete';
  /** URL pattern with parameters (e.g., '/object/:id/action/:param') */
  route: string;
  /** Identifier for client libraries */
  name: string;
  /** API method title */
  title: string;
  /** Markdown description of the method */
  description: string;
  /** API method category */
  category: string;
  /** API stability level */
  stability: StabilityLevel;
  /** Patterns for URL parameters */
  params?: ValidationMap;
  /** Query-string parameter validations */
  query?: ValidationMap;
  /** Scopes expression */
  scopes?: ScopesExpression | null;
  /** Input schema filename */
  input?: string;
  /** Output schema filename or 'blob' */
  output?: string;
  /** Skip input validation */
  skipInputValidation?: boolean;
  /** Skip output validation */
  skipOutputValidation?: boolean;
  /** Exclude from API references */
  noPublish?: boolean;
  /** @deprecated */
  deferAuth?: never;
  /** Function to sanitize payload for error messages */
  cleanPayload?: (payload: any) => any;
  /** Request handler */
  handler?: APIRequestHandler<TContext>;
}

export interface APIBuilderOptions<TContext extends Record<string, any>> {
  /** @deprecated property:version is now apiVersion */
  version?: never;
  /** @deprecated property:schemaPrefix is no longer allowed */
  schemaPrefix?: never;
  title: string;
  description: string;
  serviceName: string;
  apiVersion: string;
  errorCodes: ErrorCodes;
  params?: Record<string, any>;
  context?: (keyof TContext)[];
}

export interface SignatureValidatorOptions {
  method: string;
  resource: string;
  host: string;
  port: number;
  authorization?: string;
  sourceIp?: string;
}

export type SignatureValidatorResult =
  { status: 'no-auth', scheme: 'none', expires: Date, scopes: string[] }
  | { status: 'auth-failed'; message: string, computedHash?: string }
  | { status: 'auth-success', clientId: string, scheme: string, expires: Date, scopes: string[], hash?: string };

export type SignatureValidator = (options: SignatureValidatorOptions, extra?: Record<string, any>)
  => Promise<SignatureValidatorResult>;

export interface APIOptions<TContext extends Record<string, any>> {
  // Required properties
  rootUrl: string;
  monitor: import('@taskcluster/lib-monitor').Monitor;
  builder: APIBuilder<TContext>;
  context: Record<keyof TContext, any> & { monitor: import('@taskcluster/lib-monitor').Monitor };
  validator?: any;
  schemaset: any;

  // Optional properties (with defaults provided in constructor)
  inputLimit: string;
  allowedCORSOrigin?: string;
  signatureValidator: SignatureValidator
  referenceBucket?: string;
  serviceName?: string;
  apiVersion?: string;

  // Deprecated properties
  /** @deprecated */
  referencePrefix?: never;
  /** @deprecated */
  authBaseUrl?: never;
  /** @deprecated */
  baseUrl?: never;
}
