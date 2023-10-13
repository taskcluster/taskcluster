import fs from 'fs';
import path from 'path';

const __dirname = new URL('.', import.meta.url).pathname;

const loadGraphql = (filename) => fs.readFileSync(path.join(__dirname, filename), 'utf8');

const graphqls = [
  // read Root.graphql first
  loadGraphql('Root.graphql'),
];

fs.readdirSync(__dirname).forEach(file => {
  if (file === 'Root.graphql' || !file.endsWith('.graphql')) {
    return;
  }
  graphqls.push(loadGraphql(file));
});

export default graphqls.join('\n');
