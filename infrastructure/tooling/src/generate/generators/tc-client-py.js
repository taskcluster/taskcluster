import util from 'util';
import path from 'path';
import { writeRepoFile, REPO_ROOT } from '../../utils/index.js';
import mkdirp from 'mkdirp';
import * as _rimraf from 'rimraf';
const rimraf = util.promisify(_rimraf.default);

const HEADER = `\
# coding=utf-8
#####################################################
# THIS FILE IS AUTOMATICALLY GENERATED. DO NOT EDIT #
#####################################################
`;

const writePyFile = async (filename, content, omitHeader) => {
  await writeRepoFile(path.join(filename), (omitHeader ? '' : HEADER) + content.trim() + '\n');
};

// poor man's python repr(..)
const repr = v => {
  if (typeof v === 'string') {
    if (!v.includes("'")) {
      return `'${v}'`;
    }
  } else if (Array.isArray(v)) {
    return `[${v.map(e => repr(e)).join(', ')}]`;
  } else if (v === true) {
    return 'True';
  } else if (v === false) {
    return 'False';
  }
  return JSON.stringify(v);
};

const cleanDocstring = (docstring, indent) => {
  const lines = docstring
    .replace('\'\'\'', '\\\'\\\'\\\'')
    .replace('```js', '```')
    .replace('```javascript', '```')
    .split('\n')
    .map(s => s.trimEnd());
  lines.unshift('"""');
  lines.push('"""');
  lines.push('');

  const prefix = ' '.repeat(indent);
  return lines
    .map(line => line.trim().length > 0 ? (prefix + line) : line)
    .join('\n');
};

const generateStaticClient = async (className, reference, filename, genAsync) => {
  const baseModule = genAsync ? '...aio.asyncclient' : '..client';
  const baseClass = genAsync ? 'AsyncBaseClient' : 'BaseClient';
  const lines = [];

  lines.push(`# noqa: E128,E201`);
  lines.push(`from ${baseModule} import ${baseClass}`);
  lines.push(`from ${baseModule} import createApiClient`);
  lines.push(`from ${baseModule} import config`);
  lines.push(`from ${baseModule} import createTemporaryCredentials`);
  lines.push(`from ${baseModule} import createSession`);
  lines.push('_defaultConfig = config');
  lines.push('');
  lines.push('');

  lines.push(`class ${className}(${baseClass}):`);

  if (reference.description) {
    lines.push(cleanDocstring(reference.description, 4));
  }

  lines.push('    classOptions = {');
  for (let opt of ['exchangePrefix']) {
    if (reference[opt]) {
      lines.push(`        "${opt}": "${reference[opt]}",`);
    }
  }
  lines.push('    }');

  for (let opt of ['serviceName', 'apiVersion']) {
    if (reference[opt]) {
      lines.push(`    ${opt} = ${repr(reference[opt])}`);
    }
  }
  lines.push('');

  const funcinfo = {};
  for (let entry of reference.entries) {
    if (entry.type === 'function') {
      const funcRef = {
        args: entry.args,
        method: entry.method,
        name: entry.name,
        route: entry.route,
        stability: entry.stability,
      };

      if (entry.input) {
        funcRef.input = entry.input;
      }

      if (entry.output) {
        funcRef.output = entry.output;
      }

      if (entry.query.length > 0) {
        funcRef.query = entry.query;
      }

      funcinfo[entry.name] = funcRef;

      let docstring = 'This method has no documentation, womp womp';
      if (entry.description) {
        let ds = entry.description;
        if (entry.title) {
          ds = entry.title + '\n\n' + ds;
        }
        if (entry.stability) {
          ds = `${ds}\n\nThis method is \`\`${entry.stability}\`\``;
        }
        docstring = cleanDocstring(ds, 8);
      }

      lines.push(`    ${genAsync ? 'async ' : ''}def ${entry.name}(self, *args, **kwargs):`);
      lines.push(docstring);
      lines.push(
        `        return ${genAsync ? 'await ' : ''}self._makeApiCall(` +
        `self.funcinfo["${entry.name}"], *args, **kwargs)`);
      lines.push('');
    } else if (entry.type === 'topic-exchange') {
      const exRef = {
        exchange: entry.exchange,
        name: entry.name,
        routingKey: entry.routingKey,
      };

      if (entry.schema) {
        exRef.schema = entry.schema;
      }

      let ds;
      if (entry.description) {
        ds = entry.description || '';
        if (entry.title) {
          ds = entry.title + '\n\n' + ds;
        }
        if (entry.stability) {
          ds = `${ds}\n\nThis method is \`\`${entry.stability}\`\``;
        }

        ds += '\n\nThis exchange takes the following keys:';
        for (let key of entry.routingKey) {
          ds += `\n\n * ${key.name}: ${key.summary}${key.required ? ' (required)' : ''}`;
        }
      }

      lines.push(`    def ${entry.name}(self, *args, **kwargs):`);
      lines.push(cleanDocstring(ds, 8));
      lines.push(`        ref = {`);
      for (let [refK, refV] of Object.entries(exRef).sort()) {
        if (refK === 'routingKey') {
          lines.push('            \'routingKey\': [');
          for (let routingKey of refV) {
            lines.push('                {');
            for (let routingK of ['constant', 'multipleWords', 'name']) {
              let routingV = routingKey[routingK];
              if (routingV !== undefined) {
                lines.push(`                    '${routingK}': ${repr(routingV)},`);
              }
            }
            lines.push('                },');
          }
          lines.push('            ],');
        } else {
          lines.push(`            '${refK}': ${repr(refV)},`);
        }
      }
      lines.push('        }');
      lines.push(`        return self._makeTopicExchange(ref, *args, **kwargs)`);
      lines.push('');
    }
  }

  lines.push('    funcinfo = {');
  for (let [funcname, ref] of Object.entries(funcinfo).sort()) {
    lines.push(`        "${funcname}": {`);
    for (let [keyname, keyvalue] of Object.entries(ref).sort()) {
      lines.push(`            '${keyname}': ${repr(keyvalue)},`);
    }
    lines.push('        },');
  }
  lines.push('    }');

  lines.push('');
  lines.push('');
  lines.push('__all__ = ' + repr([
    'createTemporaryCredentials',
    'config',
    '_defaultConfig',
    'createApiClient',
    'createSession',
    className,
  ]));

  await writePyFile(filename, lines.join('\n'));
};

export const tasks = [{
  title: 'Generate Taskcluster-Client-Py',
  requires: ['apis'],
  provides: ['target-taskcluster-client-py'],
  run: async (requirements, utils) => {
    const apis = requirements['apis'];
    const moduleDir = path.join(REPO_ROOT, 'clients', 'client-py', 'taskcluster', 'generated');

    // clean up the clients directory to eliminate any "leftovers"
    utils.status({ message: 'cleanup' });
    await rimraf(moduleDir);
    await mkdirp(moduleDir);
    await mkdirp(path.join(moduleDir, 'aio'));

    // generate Python package semaphore files
    await writeRepoFile(path.join(moduleDir, '__init__.py'), '');
    await writeRepoFile(path.join(moduleDir, 'aio', '__init__.py'), '');

    const clientImporter = [];

    for (let [className, { reference }] of Object.entries(apis)) {
      const moduleName = className.toLowerCase();

      utils.status({ message: `${className}` });
      clientImporter.push(`from .${moduleName} import ${className}  # NOQA`);
      await generateStaticClient(
        className, reference,
        path.join(moduleDir, `${moduleName}.py`),
        false);
      await generateStaticClient(
        className, reference,
        path.join(moduleDir, 'aio', `${moduleName}.py`),
        true);
    }

    utils.status({ message: 'client importers' });
    const clientImporterString = clientImporter.sort().join('\n');
    await writePyFile(path.join(moduleDir, '_client_importer.py'), clientImporterString);
    await writePyFile(path.join(moduleDir, 'aio', '_client_importer.py'), clientImporterString);
  },
}];
