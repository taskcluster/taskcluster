import path from 'path';
import glob from 'glob';
import { REPO_ROOT, readRepoYAML, modifyRepoFile, writeRepoFile, execCommand } from '../../utils/index.js';
import { rimraf } from 'rimraf';
export const tasks = [];

const tempDir = path.join(REPO_ROOT, 'temp');

tasks.push({
  title: 'Generate Generic-Worker',
  requires: ['references-json', 'target-go-version'],
  provides: ['target-generic-worker'],
  run: async (requirements, utils) => {
    await execCommand({
      dir: path.join(REPO_ROOT, 'workers', 'generic-worker'),
      command: ['go', 'generate', './...'],
      utils,
    });
  },
});

tasks.push({
  title: `Generate Generic-Worker Schemas`,
  requires: [],
  provides: [
    'generic-worker-schemas',
  ],
  run: async (requirements, utils) => {
    const schemaFiles = glob.sync('workers/generic-worker/schemas/*.yml', { cwd: REPO_ROOT });
    return {
      'generic-worker-schemas': await Promise.all(schemaFiles.map(async filename => {
        const content = await readRepoYAML(filename);

        // the `title` property of the on-disk schema file is used to generate a Go identifier
        // that must be the same (`GenericWorkerPayload`) for all of these schemas.  So we substitute
        // a nicer title in here.
        const [engine, platform] = path.basename(filename, '.yml').split('_');
        content.title = `${content.title} - ${engine}, ${platform}`;

        return ({
          filename: filename.replace('workers/generic-worker/schemas', 'schemas/generic-worker'),
          content,
        });
      })),
    };
  },
});

tasks.push({
  title: 'Update generic-worker README',
  requires: ['target-generic-worker'],
  provides: ['generic-worker-readme'],
  run: async (requirements, utils) => {
    const binary = path.join(tempDir, 'generic-worker');
    // we have to build this binary, rather than just using `go run`, because otherwise `go run` spews
    // its own output into stdout
    await execCommand({
      command: ['go', 'build', '-o', binary, './workers/generic-worker'],
      utils,
      env: { GOOS: 'linux', GOARCH: 'amd64', ...process.env },
    });

    let gwHelpCommand;
    if (process.platform === 'linux') {
      gwHelpCommand = [binary, '--help'];
    } else {
      gwHelpCommand = ['docker', 'run', '--rm', '-q', '-v', `${tempDir}:/app`, '-w', '/app', 'alpine', './generic-worker', '--help'];
    }

    let gwHelp = await execCommand({
      dir: REPO_ROOT,
      command: gwHelpCommand,
      utils,
      keepAllOutput: true,
    });

    // replace the first line, which contains the engine and version, with a simpler string
    gwHelp = gwHelp.replace(/^generic-worker .*/, '$ generic-worker --help');

    // remove platform-specific defaults
    gwHelp = gwHelp.replace(/\[default \(varies by platform\): .*\]/, '[default varies by platform]');

    const ticks = '```';
    [
      path.join('workers', 'generic-worker', 'README.md'),
      path.join('ui', 'docs', 'reference', 'workers', 'generic-worker', 'usage.mdx'),
    ].forEach(async file => {
      await modifyRepoFile(
        file,
        async content => content
          .replace(
            /(<!-- HELP BEGIN -->)(?:.|\n)*(<!-- HELP END -->)/m,
            `$1\n${ticks}\n${gwHelp.trimRight()}\n${ticks}\n$2`));
    });
  },
});

const schemaMdx = (title, $id) => `---
title: ${title.replace(/^.* - /, 'Task Payload - ')}
order: 1000
---
import SchemaTable from '@taskcluster/ui/components/SchemaTable'

<SchemaTable schema="${$id}" />
`;

tasks.push({
  title: 'Update generic-worker payload formats',
  requires: ['generic-worker-schemas'],
  provides: ['target-gw-docs'],
  run: async (requirements, utils) => {
    const gwDocsDir = path.join('ui', 'docs', 'reference', 'workers', 'generic-worker');

    // begin by deleting all *-payload--schema.mdx files
    for (let file of glob.sync(`${gwDocsDir}/*-payload.mdx`, { cwd: REPO_ROOT })) {
      await rimraf(path.join(REPO_ROOT, file));
    }

    const schemaFiles = requirements['generic-worker-schemas'].map(({ filename, content }) => ({
      $id: content.$id,
      title: content.title,
      filename_base: path.basename(content.$id, '.json#').replace('_', '-') + '-payload',
    }));

    for (let { $id, title, filename_base } of schemaFiles) {
      await writeRepoFile(path.join(gwDocsDir, filename_base + '.mdx'), schemaMdx(title, $id));
    }

    const links = schemaFiles
      .map(({ title, filename_base }) => ` * [Generic worker payload -${title.split('-')[1]}](/docs/reference/workers/generic-worker/${filename_base})`)
      .join('\n');

    await modifyRepoFile(path.join(gwDocsDir, 'README.mdx'),
      content => content.replace(/(<!-- BEGIN PAYLOAD LINKS -->).*(<!-- END PAYLOAD LINKS -->)/ms, `$1\n${links}\n$2`));
  },
});
