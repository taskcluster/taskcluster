import path from 'path';
import { writeRepoFile, REPO_ROOT } from '../../utils/index.js';
import mkdirp from 'mkdirp';
import { rimraf } from 'rimraf';

const writeRsFile = async (filename, content) => {
  await writeRepoFile(path.join(filename), content.trim() + '\n');
};

const MOD_TEMPLATE = t => `
#![allow(unused_imports)]
#![cfg_attr(rustfmt, rustfmt_skip)]
/* THIS FILE IS AUTOMATICALLY GENERATED. DO NOT EDIT */
use crate::{Client, ClientBuilder, Credentials, Retry};
use anyhow::Error;
use serde_json::Value;
use std::time::Duration;
use crate::util::urlencode;

${t.description}
pub struct ${t.className} {
    /// The underlying client used to make API calls for this service.
    pub client: Client
}

#[allow(non_snake_case)]
impl ${t.className} {
    /// Create a new ${t.className} instance, based on the given client builder
    pub fn new<CB: Into<ClientBuilder>>(client_builder: CB) -> Result<Self, Error> {
        Ok(Self{
            client: client_builder
                .into()
                .path_prefix("api/${t.serviceName}/${t.apiVersion}/")
                .build()?,
        })
    }${t.methods}
}`;

// utility functions for manipulating `args`
const with_self = args => [{ name: '&self' }].concat(args);
const without_payload = args => args.filter(({ name }) => name !== 'payload');
const with_ttl = args => args.concat([{ name: 'ttl', type: 'Duration' }]);
const with_lifetimes = args => args.map(({ name, type }) => ({ name, type: type.replace(/&str/g, "&'a str") }));
const call_args = args => args.map(({ name }) => name).join(', ');
const define_args = args => args.map(({ name, type }) => name === '&self' ? name : `${name}: ${type}`).join(', ');

const QUERY_TEMPLATE = t => `\
    if let Some(q) = ${t.name} {
        query.get_or_insert_with(Vec::new).push(("${t.name}", q));
    }`;

const DETAILS_FUNC_TEMPLATE = t => `\
/// Determine the HTTP request details for ${t.name}
fn ${t.name}_details<'a>(${define_args(with_lifetimes(without_payload(t.args)))}) -> (${t.staticPath ? "&'static str" : 'String'}, Option<Vec<(&'static str, &'a str)>>) {
    let path = ${t.path};
${t.hasQuery ? `\
    let mut query = None;
${t.query.map(name => QUERY_TEMPLATE({ name })).join('\n')}\
` : `\
    let query = None;\
`}

    (path, query)
}
`;

const REQ_FUNC_TEMPLATE = t => `\
${t.doc}pub async fn ${t.name}(${define_args(with_self(t.args))}) -> Result<${t.okResult}, Error> {
    let method = "${t.method.toUpperCase()}";
    let (path, query) = Self::${t.name}_details(${call_args(without_payload(t.args))});
    let body = ${t.input ? 'Some(payload)' : 'None'};
    let resp = self.client.request(method, ${t.staticPath ? 'path' : '&path'}, query, body).await?;
${t.output ? `\
    Ok(resp.json().await?)\
` : `\
    resp.bytes().await?;
    Ok(())`}
}
`;

const URL_FUNC_TEMPLATE = t => `\
/// Generate an unsigned URL for the ${t.name} endpoint
pub fn ${t.name}_url(${define_args(with_self(t.args))}) -> Result<String, Error> {
    let (path, query) = Self::${t.name}_details(${call_args(without_payload(t.args))});
    self.client.make_url(${t.staticPath ? 'path' : '&path'}, query)
}
`;

const SIGNED_URL_FUNC_TEMPLATE = t => `\
/// Generate a signed URL for the ${t.name} endpoint
pub fn ${t.name}_signed_url(${define_args(with_ttl(with_self(t.args)))}) -> Result<String, Error> {
    let (path, query) = Self::${t.name}_details(${call_args(without_payload(t.args))});
    self.client.make_signed_url(${t.staticPath ? 'path' : '&path'}, query, ttl)
}
`;

const generateServiceClient = (className, reference) => {
  const methods = [];

  for (let entry of reference.entries) {
    if (entry.type !== 'function') {
      continue;
    }

    // For each API method, we generate:
    // * methodName_details -- returns method, path, and query
    // * pub methodName -- calls the method
    // * pub methodName_url -- generates a URL for the method (GET only)
    // * pub methodName_signed_url -- generates a signed URL (GET only)

    // "template" variables for the templates defined above
    const t = {
      // HTTP method(uppercase)
      method: entry.method,
      // method name
      name: entry.name,
      // arguments to the method, in format [{name, type}, ..], excluding &self
      args: [],
      // true if the URL path is formatted (and generatd by {name}_details, and of type String)
      staticPath: undefined,
      // expression to generate the path
      path: undefined,
      // true if there's an input payload
      input: undefined,
      // true if there's an ouptut body
      output: undefined,
      // type of the Ok variant of the result
      okResult: undefined,
      // true if there are query parameters
      hasQuery: undefined,
      // vec of query parameters
      query: undefined,
      // documentation comments
      doc: undefined,
    };

    // slice off the leading `/` in the route
    const route = entry.route.slice(1);

    if (entry.args.length) {
      entry.args.forEach(arg => {
        t.args.push({ name: arg, type: '&str' });
      });
      const splitRoute = route.split(/<([a-zA-Z0-9]*)>/);
      const fmtStr = [];
      const fmtArgs = [];
      while (splitRoute.length > 0) {
        const path = splitRoute.shift();
        const argName = splitRoute.shift();
        if (path.length) {
          fmtStr.push(path);
        }
        if (argName) {
          fmtStr.push('{}');
          fmtArgs.push(`urlencode(${argName})`);
        }
      }
      t.staticPath = false;
      t.path = `format!("${fmtStr.join('')}", ${fmtArgs.join(', ')})`;
    } else {
      t.staticPath = true;
      t.path = `"${route}"`;
    }

    if (entry.input) {
      t.input = true;
      t.args.push({ name: 'payload', type: '&Value' });
    }

    if (entry.output) {
      t.output = true;
      t.okResult = 'Value';
    } else {
      t.output = false;
      t.okResult = '()';
    }

    if (entry.query.length > 0) {
      t.hasQuery = true;
      t.query = entry.query;
      entry.query.forEach(arg => {
        t.args.push({ name: arg, type: 'Option<&str>' });
      });
    }

    if (entry.description) {
      let ds = entry.description.trim().split('\n');
      if (entry.title) {
        ds.unshift('');
        ds.unshift(entry.title);
      }
      t.doc = ds.map(l => l ? `/// ${l}` : '///').join('\n') + '\n';
    } else {
      t.doc = '';
    }

    const indent = s => s
      .trim()
      .split('\n')
      .map(l => l.length > 0 ? '    ' + l : l)
      .join('\n');

    methods.push('\n\n' + indent(REQ_FUNC_TEMPLATE(t)));

    if (entry.method === 'get') {
      methods.push('\n\n' + indent(URL_FUNC_TEMPLATE(t)));
      methods.push('\n\n' + indent(SIGNED_URL_FUNC_TEMPLATE(t)));
    }

    methods.push('\n\n' + indent(DETAILS_FUNC_TEMPLATE(t)));
  }

  let description = reference.description.split('\n');
  if (reference.title) {
    description.unshift('');
    description.unshift(`${reference.title}`);
  }
  description = description.map(l => `///${l.length ? ` ${l}` : ''}`).join('\n');

  return MOD_TEMPLATE({
    serviceName: reference.serviceName,
    apiVersion: reference.apiVersion,
    description,
    className,
    methods: methods.join(''),
  });
};

const generateModFile = apis => {
  const mods = [];
  const uses = [];

  for (let [className, { referenceKind }] of Object.entries(apis)) {
    if (referenceKind !== 'api') {
      continue;
    }
    const moduleName = className.toLowerCase();
    mods.push(`mod ${moduleName};`);
    uses.push(`pub use ${moduleName}::${className};`);
  }
  return `${mods.sort().join('\n')}\n\n${uses.sort().join('\n')}\n`;
};

export const tasks = [{
  title: 'Generate Taskcluster-Client-Rust',
  requires: ['apis'],
  provides: ['target-taskcluster-client-rust'],
  run: async (requirements, utils) => {
    const apis = requirements['apis'];
    const moduleDir = path.join(REPO_ROOT, 'clients', 'client-rust', 'client', 'src', 'generated');

    // clean up the clients directory to eliminate any "leftovers"
    utils.status({ message: 'cleanup' });
    await rimraf(moduleDir);
    await mkdirp(moduleDir);

    utils.status({ message: 'mod.rs' });
    await writeRsFile(path.join(moduleDir, 'mod.rs'), generateModFile(apis));

    for (let [className, { reference, referenceKind }] of Object.entries(apis)) {
      if (referenceKind !== 'api') {
        continue;
      }
      const moduleName = className.toLowerCase();

      utils.status({ message: `${moduleName}.rs` });
      await writeRsFile(path.join(moduleDir, `${moduleName}.rs`), generateServiceClient(className, reference));
    }
  },
}];
