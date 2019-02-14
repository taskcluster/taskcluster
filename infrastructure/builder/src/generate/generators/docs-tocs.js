const fs = require('fs');
const md = require('md-directory');
const readDirectory = require('read-directory');
const { join } = require('path');
const { readJSONSync, writeJSON } = require('../util');
const removeExtension = require('../../../../../ui/src/utils/removeExtension');

const DOCS_LOCATIONS = {
  GENERATED: join('ui', 'docs', 'generated'),
  STATIC: join('ui', 'src', 'docs'),
};

const projectMetadata = {};
function readProjectMetadata(name) {
  if (!projectMetadata[name]) {
    projectMetadata[name] = readJSONSync(join(DOCS_LOCATIONS.GENERATED, name, 'metadata.json'));
  }

  return projectMetadata[name];
}

// Sort doc files by the order property
function sort(a, b) {
  const first = a.data.order;
  const second = b.data.order;

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

function readGeneratedDocs() {
  return fs
    .readdirSync(DOCS_LOCATIONS.GENERATED)
    .reduce((acc, projectName) => {
      const metadata = readProjectMetadata(projectName);
      // We use md.parseDirSync instead of readDirectory in order
      // to collect the front matter of the markdown file
      const mdFiles = md.parseDirSync(join(DOCS_LOCATIONS.GENERATED, projectName), {
        dirnames: true,
      });
      const jsonFiles = readDirectory.sync(
        join(DOCS_LOCATIONS.GENERATED, projectName),
        {
          filter: 'references/*.json',
          transform: content => ({
            content: JSON.parse(content),
            data: { inline: true },
          }),
        }
      );
      const files = { ...mdFiles, ...jsonFiles };

      // Rename key
      Object.keys(files).forEach(oldKey => {
        const path = `reference/${metadata.tier}/${projectName}/${oldKey}`;

        delete Object.assign(files, {
          [removeExtension(path)]: Object.assign(files[oldKey]),
        })[oldKey];
      });

      return Object.assign(acc, files);
    }, {});
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
                order: name === 'index' ? 0 : item.data.order || 1000,
              }),
              path: `${rootPath}${path.join('/')}`,
            };

            if (name === 'index') {
              ptr.data = child.data;
            } else {
              if (rootPath === 'reference/' && name === 'README') {
                ptr.data = child.data;
                ptr.path = `${rootPath}${path.join('/')}`;
              }

              ptr.children.push(child);
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
  provides: ['docs-toc'],
  run: async (requirements, utils) => {
    const generatedDocs = readGeneratedDocs();
    const staticDocs = md.parseDirSync(DOCS_LOCATIONS.STATIC, { dirnames: true });
    // generated + static docs
    const files = Object.assign(
      staticDocs,
      generatedDocs
    );
    const [gettingStarted, resources] = ['index', 'resources'].map(fileName =>
      Object.assign(files[fileName], {
        name: fileName,
        path: fileName,
        children: [],
        content: undefined,
        data: Object.assign(files[fileName].data, {
          order: files[fileName].data.order || 0,
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
