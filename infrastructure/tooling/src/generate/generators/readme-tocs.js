const path = require('path');
const {gitLsFiles, readRepoFile, writeRepoFile} = require('../../utils');

const IGNORE = [
  'infrastructure/docker-images/worker-ci/git/README.md',
];

exports.tasks = [{
  title: 'README TOCs',
  provides: ['target-readme-tocs'],
  run: async (requirements, utils) => {
    utils.status({message: 'gathering READMEs'});
    let readmes = (await gitLsFiles())
      .filter(file => file.endsWith('README.md'))
      // ignore generated output
      .filter(file => !file.startsWith('ui/docs/'))
      // some test directories have READMEs
      .filter(file => !file.match(/\/test\//))
      // ignore some other files
      .filter(file => !IGNORE.includes(file))
      .map(file => ({dir: path.dirname(file).replace(/^.$/, ''), children: []}));

    // read each README and extract titles where available
    const firstLine = /^# (.*)\n/;
    for (let readme of readmes) {
      readme.content = await readRepoFile(path.join(readme.dir, 'README.md'));
      const match = firstLine.exec(readme.content);
      if (match) {
        readme.title = match[1];
      }
    }

    // organize readmes into a hierarchy
    readmes.sort((a, b) => b.dir.length - a.dir.length);
    for (let readme of [...readmes]) {
      const remainder = [];
      for (let child of readmes) {
        if (child.dir.length > readme.dir.length &&
          (readme.dir === '' || child.dir.startsWith(`${readme.dir}/`))) {
          readme.children.push(child);
        } else {
          remainder.push(child);
        }
      }
      readmes = remainder;
    }

    // generate the lines of a table of contents for a particular README
    const tocLines = (lines, indent, dir, children) => {
      for (let child of children.sort(({dir: a}, {dir: b}) => a < b ? -1 : a > b ? 1 : 0)) {
        const relative = path.relative(dir, child.dir);
        const title = child.title || relative;
        lines.push(`${indent}* [${title}](${relative}#readme)`);
        tocLines(lines, `${indent}    `, dir, child.children);
      }
      return lines;
    };

    // recursively write out TOC's
    const rewrite = async ({content, dir, title, children}) => {
      const lines = tocLines([], '', dir, children);
      if (lines.length > 0) {
        utils.status({message: `rewriting ${path.join(dir, 'README.md')}`});
        const newContent = content.replace(
          /(<!-- TOC BEGIN -->)(?:.|\n)*(<!-- TOC END -->)/m,
          `$1\n${lines.join('\n')}\n$2`);
        if (content !== newContent) {
          await writeRepoFile(path.join(dir, 'README.md'), newContent);
        }
      }

      for (let child of children) {
        await rewrite(child);
      }
    };

    for (let readme of readmes) {
      await rewrite(readme);
    }
  },
}];
