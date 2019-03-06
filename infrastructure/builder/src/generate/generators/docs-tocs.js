const { promisify } = require('util');
const fs = require('fs');
const md = require('md-directory');
const { join } = require('path');
const { removeExtension, readJSON, writeJSON } = require('../util');

const mdParseDir = promisify(md.parseDir);
const readdir = promisify(fs.readdir);

const DOCS_LOCATIONS = {
  GENERATED: join('ui', 'docs', 'generated'),
  STATIC: join('ui', 'docs', 'static'),
};

// Sort doc files by the order property
function sort(a, b) {
  const first = a.data.menuIndex || a.data.order;
  const second = b.data.menuIndex || b.data.order;

  // Ensure the sort returns the same list when there are files with the same `order` value.
  // Otherwise we might have a different ordering of the TOC.
  if (first === second) {
    return JSON.stringify(a).localeCompare(JSON.stringify(b));
  }

  if (typeof first !== 'number') {
    return 1;
  }

  if (typeof second !== 'number') {
    return -1;
  }

  return first - second;
}

function sortChildren(children) {
  // recursively sort child nodes
  if (children && children.length) {
    children.map(child => sortChildren(child.children));
  }

  children.sort(sort);
}

async function readGeneratedDocs() {
  const projects = (await readdir(DOCS_LOCATIONS.GENERATED, { withFileTypes: true }))
    .filter(dirent => dirent.isDirectory())
    .map(({ name }) => name);

  const generatedDocs = {};
  const projectMetadata = {};

  async function readProjectMetadata(name) {
    if (!projectMetadata[name]) {
      projectMetadata[name] = await readJSON(join(DOCS_LOCATIONS.GENERATED, name, 'metadata.json'));
    }

    return projectMetadata[name];
  }

  for (const projectName of projects) {
    const [metadata, mdFiles] = await Promise.all([
      readProjectMetadata(projectName),
      mdParseDir(join(DOCS_LOCATIONS.GENERATED, projectName), {
        dirnames: true,
      }),
    ]);

    // Rename keys to include the section, tier and service name
    // e.g., docs/intro -> reference/integrations/github/docs/intro
    Object.keys(mdFiles).forEach(oldKey => {
      let path = `reference/${metadata.tier}/${projectName}/${oldKey}`;

      if(oldKey === "references/events" || oldKey === "references/api"){
        path = `reference/${metadata.tier}/${projectName}/v1/${oldKey}`;
      }
      delete Object.assign(mdFiles, {
        [removeExtension(path)]: Object.assign(mdFiles[oldKey]),
      })[oldKey];
    });

    Object.assign(generatedDocs, mdFiles);
  }

  return generatedDocs;
}

let prevNode = null;
// Traverse the nodes in order, setting `up`, `next`, and `prev` links
function addNav(node, parentNode) {
  if (parentNode && parentNode.path) {
    node.up = {
      path: parentNode.path,
      title: (parentNode.data && parentNode.data.title) || parentNode.name,
    };
  }

  if (prevNode && prevNode.path) {
    node.prev = {
      path: prevNode.path,
      title: (prevNode.data && prevNode.data.title) || prevNode.name,
    };

    prevNode.next = {
      path: node.path,
      title: (node.data && node.data.title) || node.name,
    };
  }

  prevNode = node;
  parentNode = node;

  node.children.forEach(child => addNav(child, parentNode));
}

function makeToc({ files, rootPath }) {
  const nodes = { children: [] };

  Object.keys(files)
    .filter(path => path.startsWith(rootPath))
    .map(path => ({ path, data: files[path].data }))
    .forEach(item => {
      let ptr = nodes;
      const path = [];

      item.path
        .replace(rootPath, '')
        .split('/')
        .forEach((name, idx) => {
          path.push(name);

          // for reference docs, ignore 'references' and 'docs'
          // at the 3th position in the filename; these are just
          // left out of the hierarchy as in
          // `mv reference/taskcluster-foo/docs/* reference/taskcluster/foo`
          if (
            rootPath === 'reference/' &&
            idx === 2 &&
            (name === 'references' || name === 'docs')
          ) {
            return;
          }

          let child = ptr.children.find(child => child.name === name);

          if (!child) {
            child = {
              name,
              children: [],
              data: Object.assign(item.data, {
                order: item.data.menuIndex || item.data.order || 1000,
              }),
              path: `${rootPath}${path.join('/')}`,
            };

            if (rootPath !== 'reference/' && name === 'README') {
              ptr.data = child.data;
            } else {
              if (rootPath === 'reference/' && name === 'README') {
                ptr.data = child.data;
                ptr.path = `${rootPath}${path.join('/')}`;
              }

              if (ptr.path !== child.path) {
                ptr.children.push(child);
              }
            }
          }

          ptr = child;
        });
    });

  sortChildren(nodes.children);
  addNav(nodes, null);

  return nodes;
}

exports.tasks = [{
  title: 'Docs TOCs',
  requires: ['target-references'],
  provides: ['docs-toc'],
  run: async (requirements, utils) => {
    const [generatedDocs, staticDocs] = await Promise.all([
      readGeneratedDocs(),
      await mdParseDir(DOCS_LOCATIONS.STATIC, { dirnames: true }),
    ]);
    // generated + static docs
    const files = Object.assign(
      staticDocs,
      generatedDocs
    );
    const [gettingStarted, resources] = ['README', 'resources'].map(fileName =>
      Object.assign(files[fileName], {
        name: fileName,
        path: fileName,
        children: [],
        content: undefined,
        data: Object.assign(files[fileName].data, {
          order: files[fileName].data.menuIndex || files[fileName].data.order || 1000,
        }),
      })
    );
    const docsToc = {
      gettingStarted,
      manual: makeToc({ rootPath: 'manual/', files }),
      reference: makeToc({ rootPath: 'reference/', files }),
      tutorial: makeToc({ rootPath: 'tutorial/', files }),
      resources,
    };

    writeJSON('ui/src/autogenerated/docs-table-of-contents.json', docsToc);
  },
}];
