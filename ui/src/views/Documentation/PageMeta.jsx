import React, { Component, Fragment } from 'react';
import { join } from 'path';
import { func } from 'prop-types';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import Divider from '@material-ui/core/Divider';
import AnchorOrLink from '../../components/AnchorOrLink';
import PageNavigation from '../../components/PageNavigation';
import { docsPageInfo } from '../../utils/prop-types';
import removeReadmeFromPath from '../../utils/removeReadmeFromPath';
import { DOCS_PATH_PREFIX } from '../../utils/constants';

@withStyles(theme => ({
  divider: {
    margin: `${theme.spacing.triple}px 0`,
  },
  pageNavigation: {
    display: 'flex',
    justifyContent: 'space-between',
    bottom: theme.spacing.unit,
    left: theme.docsDrawerWidth + theme.spacing.triple,
    position: 'absolute',
    width: `calc(100% - ${theme.docsDrawerWidth}px - ${theme.spacing.unit *
      6}px)`,
    [theme.breakpoints.down('sm')]: {
      width: `calc(100% - ${theme.spacing.unit * 6}px)`,
      left: theme.spacing.triple,
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

  renderLinks = () => {
    const { data } = this.props.pageInfo;

    if (!data || !data.followup || !data.followup.links) {
      return null;
    }

    const items = Object.entries(data.followup.links);

    return (
      data.followup.links && (
        <ul>
          {items.map(([link, text]) => (
            <li key={text}>
              <AnchorOrLink href={removeReadmeFromPath(link)}>{text}</AnchorOrLink>
            </li>
          ))}
        </ul>
      )
    );
  };

  renderSubtext = () => {
    const { data } = this.props.pageInfo;

    if (!data || !data.followup || !data.followup.subtext) {
      return null;
    }

    return <span>{data.followup.subtext}</span>;
  };

  render() {
    const { classes, pageInfo } = this.props;
    const hasPreviousPage = pageInfo.prev && pageInfo.prev.path;
    const hasNextPage = pageInfo.next && pageInfo.next.path;

    return (
      <Fragment>
        {pageInfo.data && pageInfo.data.followup && (
          <Fragment>
            <Divider className={classes.divider} light />
            <h2>Next Steps</h2>
          </Fragment>
        )}
        {this.renderSubtext()}
        {this.renderLinks()}
        {pageInfo && (
          <footer
            className={classNames(classes.pageNavigation, {
              [classes.pageNavigationWithoutPrevious]: !hasPreviousPage,
            })}>
            {hasPreviousPage && (
              <PageNavigation
                to={removeReadmeFromPath(join(DOCS_PATH_PREFIX, pageInfo.prev.path))}
                variant="prev"
                aria-label="Previous Page">
                {pageInfo.prev.title}
              </PageNavigation>
            )}
            {hasNextPage && (
              <PageNavigation
                to={removeReadmeFromPath(join(DOCS_PATH_PREFIX, pageInfo.next.path))}
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
