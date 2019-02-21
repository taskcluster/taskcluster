import removeExtension from './removeExtension';

/**
 * Import the relevant documentation file given the file path.
 * path:
 *      If the file is under the references section of docs
 *      (i.e., generated via `yarn generate`),
 *      then  the file path should be of the form
 *      `reference/<reference-section>/<package-name>/<path>`
 *      where `<path>` is file path relative to the package name
 *      e.g., reference/integrations/github/docs/intro.md
 *
 *      If the file lives under /docs/static (static)
 *      then the file path should be relative to `docs/static`
 *      e.g., manual/design/apis/hawk/scopes.md
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
    const mdFile = import(/* webpackChunkName: 'Documentation.page' */ `../../docs/generated/${docPath}.md`).catch(
      () =>
        import(/* webpackChunkName: 'Documentation.page' */ `../../docs/generated/${docPath}/README.md`)
    );

    return {
      path: `/ui/docs/generated/${docPath}.md`,
      loader: mdFile,
    };
  }

  const mdFile = import(/* webpackChunkName: 'Documentation.page' */ `../../docs/static/${doc}.md`).catch(
    () =>
      import(/* webpackChunkName: 'Documentation.page' */ `../../docs/static/${doc}/README.md`)
  );
  const generatedDocsKeys = require
    .context('../../docs/generated', true, /.*.md$/)
    .keys();

  return {
    path: generatedDocsKeys.includes(`${docPath}.md`)
      ? `/docs/static/${doc}.md`
      : `/docs/static/${doc}/README.md`,
    loader: mdFile,
  };
};
