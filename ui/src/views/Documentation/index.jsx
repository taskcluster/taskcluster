import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import { lowerCase } from 'change-case';
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
import components from './components';
import ScrollToTop from '../../utils/ScrollToTop';
import { DOCS_PATH_PREFIX, DOCS_MENU_ITEMS } from '../../utils/constants';
import scrollToHash from '../../utils/scrollToHash';
import removeReadmeFromPath from '../../utils/removeReadmeFromPath';
import docsTableOfContents from '../../../../generated/docs-table-of-contents';
import ErrorPanel from '../../components/ErrorPanel';
import PageMeta from './PageMeta';

@hot(module)
@withStyles(
  theme => ({
    documentation: {
      fontFamily: theme.typography.fontFamily,
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
    this.load();

    window.addEventListener('load', this.handleDomLoad);
  }

  componentWillUnmount() {
    window.removeEventListener('load', this.handleDomLoad);
  }

  handleDomLoad = () => {
    const { theme, history } = this.props;

    // Clicking a link from markdown opens a new page.
    // We need to make sure react-router is still used for local routes.
    // Note: The callback will only be triggered for relative links
    catchLinks(document.querySelector('main'), href => {
      history.push(href);

      scrollToHash(theme.spacing.double);
    });

    // Handle initial scroll if necessary
    if (this.props.history.location.hash) {
      scrollToHash(theme.spacing.double);
    }
  };

  componentDidUpdate(prevProps) {
    if (this.props.match.params.path === prevProps.match.params.path) {
      return;
    }

    this.load();
  }

  findChildFromRootNode(node) {
    const currentPath = window.location.pathname.replace(
      `${DOCS_PATH_PREFIX}/`,
      ''
    );

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

    const rootNode = docsTableOfContents[lowerCase(menuItem.label)];

    return this.findChildFromRootNode(rootNode);
  }

  async readDocFile(path) {
    try {
      return await import(/* webpackMode: 'eager' */ `../../../docs/${path}.mdx`);
    } catch (err) {
      if (err.code !== 'MODULE_NOT_FOUND') {
        throw err;
      }

      return import(/* webpackMode: 'eager' */ `../../../docs/${path}/README.mdx`);
    }
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
        title={
          pageInfo && pageInfo.data.title
            ? pageInfo.data.title
            : 'Documentation'
        }>
        <ScrollToTop scrollKey={Page ? Page.toString() : null}>
          {error && error.code === 'MODULE_NOT_FOUND' && <NotFound isDocs />}
          {error && error.code !== 'MODULE_NOT_FOUND' && (
            <ErrorPanel fixed error={error} />
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
