import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import catchLinks from 'catch-links';
import { MDXProvider } from '@mdx-js/react';
import 'prismjs';
import 'prismjs/themes/prism.css';
import 'prism-themes/themes/prism-atom-dark.css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markup';
import Dashboard from '../../components/Dashboard';
import NotFound from '../../components/NotFound';
import DocSearch from '../../components/DocSearch';
import components from './components';
import ScrollToTop from '../../utils/ScrollToTop';
import { DOCS_PATH_PREFIX, DOCS_MENU_ITEMS } from '../../utils/constants';
import scrollToHash from '../../utils/scrollToHash';
import removeReadmeFromPath from '../../utils/removeReadmeFromPath';
import docsTableOfContents from '../../../../generated/docs-table-of-contents.json';
import docsSearchOptions from '../../../../generated/docs-search.json';
import ErrorPanel from '../../components/ErrorPanel';
import PageMeta from './PageMeta';

@withStyles(
  theme => ({
    documentation: {
      fontFamily: theme.typography.fontFamily,
      '& a': {
        ...theme.mixins.link,
      },
    },
  }),
  { withTheme: true }
)
export default class Documentation extends Component {
  state = {
    error: null,
    Page: null,
    pageInfo: null,
  };

  componentDidMount() {
    const { history, theme, location } = this.props;

    this.load();
    // setTimeout makes sure the DOM  of the component is in a ready state
    window.setTimeout(() => {
      // catchLinks allows us to control the scrolling to the hash when the
      // user clicks on '#' beside a header.
      catchLinks(document.querySelector('main'), href => {
        history.push(href);

        scrollToHash(theme.spacing(2));
      });

      // Handle initial scroll if necessary
      if (location.hash) {
        scrollToHash(theme.spacing(2));
      }
    }, 0);
  }

  componentDidUpdate(prevProps) {
    if (this.props.match.params.path !== prevProps.match.params.path) {
      this.load();
    }

    if (
      prevProps.location.hash !== this.props.location.hash &&
      this.props.location.hash
    ) {
      scrollToHash(this.props.theme.spacing(2));
    }
  }

  findChildFromRootNode(node) {
    const currentPath = window.location.pathname
      .replace(/\/$/, '')
      .replace(`${DOCS_PATH_PREFIX}/`, '');

    if (node.path && currentPath === removeReadmeFromPath(node.path)) {
      return node;
    }

    if (node.children) {
      for (let i = 0; i < node.children.length; i += 1) {
        const result = this.findChildFromRootNode(node.children[i]);

        if (result) {
          return result;
        }
      }
    }
  }

  getPageInfo() {
    const menuItem = DOCS_MENU_ITEMS.find(
      ({ path }) =>
        window.location.pathname !== DOCS_PATH_PREFIX &&
        path !== DOCS_PATH_PREFIX &&
        window.location.pathname.startsWith(path)
    );

    if (!menuItem) {
      return null;
    }

    const rootNode = docsTableOfContents[menuItem.label.toLowerCase()];

    return this.findChildFromRootNode(rootNode);
  }

  async readDocFile(path) {
    // Use import.meta.glob to statically import all MDX files
    // Vite requires this for dynamic imports to work in both dev and build modes
    const modules = import.meta.glob('../../../docs/**/*.mdx');

    // Try direct file path first (e.g., docs/changelog.mdx)
    let modulePath = `../../../docs/${path}.mdx`;

    if (modules[modulePath]) {
      return await modules[modulePath]();
    }

    // Try README path (e.g., docs/tutorial/README.mdx)
    modulePath = `../../../docs/${path}/README.mdx`;

    if (modules[modulePath]) {
      return await modules[modulePath]();
    }

    // If neither exists, throw MODULE_NOT_FOUND error
    const error = new Error(`Cannot find module '${path}'`);
    error.code = 'MODULE_NOT_FOUND';
    throw error;
  }

  async load() {
    try {
      const { params } = this.props.match;
      const pathname = params.path || 'README';
      const { default: Page } = await this.readDocFile(pathname);
      const pageInfo = this.getPageInfo();

      this.setState({ Page, pageInfo, error: null });
    } catch (error) {
      this.setState({ error });
    }
  }

  render() {
    const { classes, history } = this.props;
    const { error, Page, pageInfo } = this.state;

    return (
      <Dashboard
        className={classes.documentation}
        docs
        disableTitleFormatting
        title={
          pageInfo && pageInfo.data.title
            ? pageInfo.data.title
            : 'Documentation'
        }
        search={<DocSearch options={docsSearchOptions} />}>
        <ScrollToTop scrollKey={Page ? Page.toString() : null}>
          {error && error.code === 'MODULE_NOT_FOUND' && <NotFound isDocs />}
          {error && error.code !== 'MODULE_NOT_FOUND' && (
            <ErrorPanel fixedDocs error={error} />
          )}
          {!error && Page && (
            <MDXProvider components={components}>
              <Page />
            </MDXProvider>
          )}
          {pageInfo && <PageMeta pageInfo={pageInfo} history={history} />}
        </ScrollToTop>
      </Dashboard>
    );
  }
}
