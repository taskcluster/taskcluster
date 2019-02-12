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
 *      If the file lives under /src/docs (static)
 *      then the file path should be relative to `src/docs`
 *      e.g., manual/design/apis/hawk/scopes.md
 */
export default path => {
  // Handle the getting started page
  const doc = path ? removeExtension(path) : 'index';
  // docPath is used for docs outside /src/docs (generated docs)
  // e.g., reference/platform/queue/docs/superseding ->
  // queue/docs/superseding
  const docPath = doc
    .split('/')
    .slice(2)
    .join('/');
  const localDocs = require.context('../docs', true, /.*(.md|.json)$/);
  const localDocsMatches = localDocs.keys().filter(key => key.includes(doc));

  if (!localDocsMatches.length) {
    if (path.endsWith('.json')) {
      return {
        path: `/generated/docs/${docPath}.json`,
        loader: import(/* webpackChunkName: 'Documentation.JSON' */ `../../generated/docs/${docPath}.json`),
      };
    }

    const mdFile = import(/* webpackChunkName: 'Documentation.page' */ `../../generated/docs/${docPath}.md`).catch(
      () =>
        import(/* webpackChunkName: 'Documentation.page' */ `../../generated/docs/${docPath}/index.md`)
    );

    return {
      path: `/generated/docs/${docPath}.md`,
      loader: mdFile,
    };
  }

  const mdFile = import(/* webpackChunkName: 'Documentation.page' */ `../docs/${doc}.md`).catch(
    () =>
      import(/* webpackChunkName: 'Documentation.page' */ `../docs/${doc}/index.md`)
  );
  const generatedDocsKeys = require
    .context('../../generated/docs', true, /.*(.md|.json)$/)
    .keys();

  return {
    path: generatedDocsKeys.includes(`${docPath}.md`)
      ? `/src/docs/${doc}.md`
      : `/src/docs/${doc}/index.md`,
    loader: mdFile,
  };
};
