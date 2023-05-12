import React, { Component, Fragment } from 'react';
import { func } from 'prop-types';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import PageNavigation from '../../components/PageNavigation';
import { docsPageInfo } from '../../utils/prop-types';
import removeReadmeFromPath from '../../utils/removeReadmeFromPath';
import { DOCS_PATH_PREFIX } from '../../utils/constants';

@withStyles(theme => ({
  divider: {
    margin: `${theme.spacing(3)}px 0`,
  },
  pageNavigation: {
    display: 'flex',
    justifyContent: 'space-between',
    bottom: theme.spacing(1),
    left: 0,
    right: 0,
    position: 'absolute',
    [theme.breakpoints.down('sm')]: {
      width: `calc(100% - ${theme.spacing(6)}px)`,
      left: theme.spacing(3),
    },
  },
  pageNavigationWithoutPrevious: {
    justifyContent: 'flex-end',
  },
}))
export default class PageMeta extends Component {
  static propTypes = {
    pageInfo: docsPageInfo,
    onPageChange: func,
  };

  static defaultProps = {
    onNextPage: null,
    onPreviousPage: null,
    pageInfo: null,
  };

  render() {
    const { classes, pageInfo } = this.props;
    const hasPreviousPage = pageInfo.prev && pageInfo.prev.path;
    const hasNextPage = pageInfo.next && pageInfo.next.path;

    return (
      <Fragment>
        {pageInfo && (
          <footer
            className={classNames(classes.pageNavigation, {
              [classes.pageNavigationWithoutPrevious]: !hasPreviousPage,
            })}>
            {hasPreviousPage && (
              <PageNavigation
                to={removeReadmeFromPath(
                  `${DOCS_PATH_PREFIX}/${pageInfo.prev.path}`,
                )}
                variant="prev"
                aria-label="Previous Page">
                {pageInfo.prev.title}
              </PageNavigation>
            )}
            {hasNextPage && (
              <PageNavigation
                to={removeReadmeFromPath(
                  `${DOCS_PATH_PREFIX}/${pageInfo.next.path}`,
                )}
                variant="next"
                aria-label="Next Page">
                {pageInfo.next.title}
              </PageNavigation>
            )}
          </footer>
        )}
      </Fragment>
    );
  }
}
