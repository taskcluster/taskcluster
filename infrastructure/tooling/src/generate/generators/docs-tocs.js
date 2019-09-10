const { promisify } = require('util');
const md = require('md-directory');
const { join } = require('path');
const { REPO_ROOT, writeRepoJSON } = require('../../utils');

const mdParseDir = promisify(md.parseDir);

/**
 * Generate a table-of-contents file containing a recursive data structure.  At
 * the top level is an object with property names corresponding to top-level
 * path components, and values having the structure
 * {
 *   name: ..     // Final URI component of this page
 *   path: ..     // URI path to this page
 *   data: {..}   // values from the markdown front-matter
 *   next: {      // information about the next page in the documentation
 *     path: ..   // URI path to the next page, if any
 *     title: ..  // title of that page
 *   },
 *   prev: {}     // information about the previous page, if any, like next
 *   up: {}       // information about the parent page, if any, like next
 *   children: [
 *     // further objects of the same structure
 *   ],
 * }
 *
 * Note that the top-level structure (with URI components as property names) is
 * not repeated
 */

const DOCS_DIR = join(REPO_ROOT, 'ui', 'docs');

// Sort doc files by the order property
function sort(a, b) {
  const first = a.data.order;
  const second = b.data.order;

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
  const nodes = {
    children: [],
    path: rootPath.replace(/\/$/, ''),
  };

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

          let child = ptr.children.find(child => child.name === name);

          if (!child) {
            child = {
              name,
              children: [],
              data: {
                // apply some defaults..
                title: name === 'README' ? undefined : name,
                order: 1000,
                ...item.data,
              },
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
  // The tutorial section relies on "Next Steps" instead of next/previous page
  if (rootPath !== 'tutorial/') {
    addNav(nodes, null);
  }

  return nodes;
}

exports.tasks = [{
  title: 'Docs TOCs',
  requires: [],
  provides: ['docs-toc'],
  run: async (requirements, utils) => {
    const filesWithExtensions = await mdParseDir(DOCS_DIR, { dirnames: true, filter: '**\/*.mdx' });
    // strip .md and .mdx extensions from those filenames..
    const files = Object.assign({},
      ...Object.entries(filesWithExtensions)
        .map(([filename, value]) => ({[filename.replace(/\.mdx?/, '')]: value})));
    const [gettingStarted, resources, people] = ['README', 'resources', 'people'].map(fileName => {
      return Object.assign(files[fileName], {
        name: fileName,
        path: fileName,
        children: [],
        content: undefined,
        data: Object.assign(files[fileName].data || {}, {
          order: files[fileName].data.order || 1000,
        }),
      })
    });
    const docsToc = {
      gettingStarted,
      manual: makeToc({ rootPath: 'manual/', files }),
      reference: makeToc({ rootPath: 'reference/', files }),
      tutorial: makeToc({ rootPath: 'tutorial/', files }),
      resources,
      people,
    };

    writeRepoJSON('generated/docs-table-of-contents.json', docsToc);
  },
}];
