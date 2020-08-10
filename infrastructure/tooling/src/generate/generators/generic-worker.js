const path = require('path');
const util = require('util');
const rimraf = util.promisify(require('rimraf'));
const glob = require('glob');
const { REPO_ROOT, readRepoYAML, modifyRepoFile, writeRepoFile, execCommand } = require('../../utils');

exports.tasks = [];

exports.tasks.push({
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

exports.tasks.push({
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

const schemaMdx = (title, $id) => `---
title: ${title.replace(/^.* - /, 'Task Payload - ')}
order: 1000
---
import SchemaTable from 'taskcluster-ui/components/SchemaTable'

<SchemaTable schema="${$id}" />
`;

exports.tasks.push({
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
      .map(({ title, filename_base }) => ` * [${title}](/docs/reference/workers/generic-worker/${filename_base})`)
      .join('\n');

    await modifyRepoFile(path.join(gwDocsDir, 'README.mdx'),
      content => content.replace(/(<!-- BEGIN PAYLOAD LINKS -->).*(<!-- END PAYLOAD LINKS -->)/ms, `$1\n${links}\n$2`));
  },
});
