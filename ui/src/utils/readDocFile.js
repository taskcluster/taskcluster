import removeExtension from './removeExtension';

/**
 * Import the relevant documentation file given the file path.
 * path:
 *      If the file is under the references section of docs
 *      (i.e., generated via `yarn generate`),
 *      then  the file path should be of the form
 *      `reference/<reference-section>/<package-name>/<path>`
 *      where `<path>` is file path relative to the package name
 *      e.g., reference/integrations/github/docs/intro.mdx
 *
 *      If the file lives under /docs/static (static)
 *      then the file path should be relative to `docs/static`
 *      e.g., manual/design/apis/hawk/scopes.mdx
 */
export default path => {
  // Handle the getting started page
  const doc = path ? removeExtension(path) : 'README';
  // docPath is used for generated docs (outside /docs/static)
  // e.g., reference/platform/queue/docs/superseding ->
  // queue/docs/superseding
  const docPath = doc
    .split('/')
    .slice(2)
    .join('/');
  const localDocs = require.context('../../docs/static', true, /.*.md$/);
  const localDocsMatches = localDocs.keys().filter(key => key.includes(doc));

  if (!localDocsMatches.length) {
    const mdFile = import(/* webpackChunkName: 'Documentation.page' */ `../../docs/generated/${docPath}.mdxx`).catch(
      () =>
        import(/* webpackChunkName: 'Documentation.page' */ `../../docs/generated/${docPath}/README.mdx`)
    );

    return mdFile;
  }

  const mdFile = import(/* webpackChunkName: 'Documentation.page' */ `../../docs/static/${doc}.mdx`).catch(
    () =>
      import(/* webpackChunkName: 'Documentation.page' */ `../../docs/static/${doc}/README.mdx`)
  );

  return mdFile;
};
