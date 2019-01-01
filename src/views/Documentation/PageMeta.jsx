import React, { Component, Fragment } from 'react';
import { func } from 'prop-types';
import classNames from 'classnames';
import { isEmpty } from 'ramda';
import { withStyles } from '@material-ui/core/styles';
import Divider from '@material-ui/core/Divider';
import ChevronRightIcon from 'mdi-react/ChevronRightIcon';
import ChevronLeftIcon from 'mdi-react/ChevronLeftIcon';
import AnchorOrLink from '../../components/Markdown/AnchorOrLink';
import Button from '../../components/Button';
import { docsPageInfo } from '../../utils/prop-types';

@withStyles(theme => ({
  divider: {
    margin: `${theme.spacing.triple}px 0`,
  },
  navigationButton: {
    ...theme.mixins.fabIcon,
  },
  pageNavigation: {
    display: 'flex',
    justifyContent: 'space-between',
    bottom: theme.spacing.unit,
    left: theme.docsDrawerWidth + theme.spacing.triple,
    position: 'fixed',
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
              <AnchorOrLink href={link}>{text}</AnchorOrLink>
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

  handlePreviousPage = () => {
    const { pageInfo, onPageChange } = this.props;

    onPageChange(pageInfo.prev.path);
  };

  handleNextPage = () => {
    const { pageInfo, onPageChange } = this.props;

    onPageChange(pageInfo.next.path);
  };

  render() {
    const { classes, pageInfo } = this.props;
    const hasPreviousPage = pageInfo.prev && !isEmpty(pageInfo.prev);
    const hasNextPage = pageInfo.next && !isEmpty(pageInfo.next);

    return (
      <Fragment>
        {pageInfo.data &&
          pageInfo.data.followup && (
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
              <Button
                onClick={this.handlePreviousPage}
                color="secondary"
                variant="extended"
                aria-label="Previous Page"
                className={classes.navigationButton}>
                <ChevronLeftIcon />
                {pageInfo.prev.title}
              </Button>
            )}
            {hasNextPage && (
              <Button
                onClick={this.handleNextPage}
                color="secondary"
                variant="extended"
                aria-label="Next Page"
                className={classes.navigationButton}>
                {pageInfo.next.title}
                <ChevronRightIcon />
              </Button>
            )}
          </footer>
        )}
      </Fragment>
    );
  }
}
