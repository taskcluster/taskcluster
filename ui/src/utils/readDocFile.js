import removeExtension from './removeExtension';

/**
 * Import the relevant documentation file given the file path.  The file path
 * should be relative to `docs/static` e.g., manual/design/apis/hawk/scopes.md
 */
export default path => {
  // Handle the getting started page
  const doc = path ? removeExtension(path) : 'README';
  const mdFile = import(/* webpackChunkName: 'Documentation.page' */ `../../docs/${doc}.md`).catch(
    () =>
      import(/* webpackChunkName: 'Documentation.page' */ `../../docs/${doc}/README.md`)
  );

  return mdFile;
};
