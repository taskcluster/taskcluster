const path = require('path');
const fs = require('fs');
const { writeRepoJSON, REPO_ROOT } = require('../../utils');

const DOCS_DIR = path.join(REPO_ROOT, 'ui', 'docs');
const MD_PARSER = {
  HEADING: /^ {0,3}(#{1,6}) +([^\n]*?)(?: +#+)? *(?:\n+|$)/,
};

function walkSync (dir, filelist = []) {
  fs.readdirSync(dir).forEach(file => {

    filelist = fs.statSync(path.join(dir, file)).isDirectory()
      ? walkSync(path.join(dir, file), filelist)
      : filelist.concat(path.join(dir, file));

  });
  return filelist;
}

// Avoid having unnecessary changes shown when docs have not changed
function sort(a, b) {
  const first = Object.values(a).join('-');
  const second = Object.values(b).join('-');

  return first.localeCompare(second);
}

exports.tasks = [{
  title: 'Docs Search',
  requires: [],
  provides: ['docs-search'],
  run: (requirements, utils) => {
    const docsSearch = [];
    const files = walkSync(DOCS_DIR).filter(path => path.endsWith('.mdx'));
    const textFromHash = text => text.replace(/(^#{1,6}\s)/, '');

    files.forEach(file => {
      const pageHeaders = [];
      const content = fs.readFileSync(file, 'utf8');

      content.split('\n').forEach(line => {
        const match = MD_PARSER.HEADING.exec(line);

        if (match) {
          const [anchor, hashes] = match;
          const headerElement = `h${hashes.length}`;
          const entry = {
            path: file
              .replace(DOCS_DIR, '')
              .replace(path.extname(file), '')
              .replace('/README', ''),
            title: hashes.length === 1 ? textFromHash(anchor) : null,
            subtitle: hashes.length !== 1 ? textFromHash(anchor) : null,
            element: headerElement,
          };

          pageHeaders.push(entry);
        }
      });

      const h1Title = pageHeaders.find(header => header.element === 'h1');

      if (h1Title) {
        docsSearch.push(...pageHeaders.map(header => ({ ...header, title: h1Title.title })));
      } else {
        docsSearch.push(...pageHeaders);
      }
    });

    writeRepoJSON('generated/docs-search.json', docsSearch.sort(sort));
  },
}];
