import React, { Component, Fragment } from 'react';
import { arrayOf, bool, node, object, oneOfType, string } from 'prop-types';
import classNames from 'classnames';
import { withRouter } from 'react-router-dom';
import { LazyLog, ScrollFollow } from 'react-lazylog';
import storage from 'localforage';
import { withStyles } from '@material-ui/core/styles';
import Tooltip from '@material-ui/core/Tooltip';
import ArrowDownBoldCircleOutlineIcon from 'mdi-react/ArrowDownBoldCircleOutlineIcon';
import OpenInNewIcon from 'mdi-react/OpenInNewIcon';
import GoToLineButton from './GoToLineButton';
import Loading from './Loading';
import Button from '../Button';

const LINE_NUMBER_MATCH = /L(\d+)-?(\d+)?/;
const FOLLOW_STORAGE_KEY = 'follow-log';

@withRouter
@withStyles(theme => ({
  '@global': {
    'div.react-lazylog': {
      backgroundColor: theme.palette.background.default,
      fontFamily: 'Consolas, Monaco, Andale Mono, Ubuntu Mono, monospace',
      fontSize: 13,
      paddingTop: 4,
      paddingBottom: theme.spacing.unit,
      color: theme.palette.text.secondary,
      '-webkit-font-smoothing': 'auto',
    },
  },
  highlight: {
    backgroundColor: `${theme.palette.action.selected} !important`,
  },
  line: {
    '& > a': {
      transition: theme.transitions.create('color'),
      color: theme.palette.text.inactive,
    },
    '&:hover > a': {
      color: `${theme.palette.text.primary} !important`,
    },
    '&$highlight > a': {
      color: theme.palette.text.primary,
    },
    '&:hover': {
      backgroundColor: `${theme.palette.action.hover} !important`,
    },
  },
  followButtonFollowing: {
    backgroundColor: theme.palette.success.main,
    '&:hover': {
      backgroundColor: theme.palette.success.dark,
    },
  },
  fabIcon: {
    ...theme.mixins.fabIcon,
  },
}))
/**
 * Render a lazy-loading log viewer.
 */
export default class Log extends Component {
  static defaultProps = {
    stream: false,
    actions: null,
    GoToLineButtonProps: null,
    RawLogButtonProps: null,
    FollowLogButtonProps: null,
  };

  static propTypes = {
    /**
     * The remote URL for which to lazily render log text.
     */
    url: string.isRequired,
    /**
     * Specify `true` if the `url` is returning a partial progressive text
     * stream. Specify `false` if the `url` is a complete file.
     */
    stream: bool,
    /**
     * Render additional buttons in the actions area.
     */
    actions: oneOfType([node, arrayOf(node)]),
    /**
     * Specify props for the "Go to line" floating action button.
     */
    GoToLineButtonProps: object,
    /**
     * Specify props for the "Follow log" floating action button.
     */
    FollowLogButtonProps: object,
    /**
     * Specify props for the "Raw log" floating action button.
     */
    RawLogButtonProps: object,
  };

  state = {
    lineNumber: null,
    follow: null,
  };

  getHighlightFromHash() {
    const hasHighlight = LINE_NUMBER_MATCH.exec(this.props.location.hash);
    const start = hasHighlight && +hasHighlight[1];
    const end = hasHighlight && +hasHighlight[2];

    return end ? [start, end] : start;
  }

  getScrollToLine() {
    if (typeof this.state.follow === 'boolean') {
      return null;
    }

    if (this.state.lineNumber) {
      return this.state.lineNumber;
    }

    const highlight = this.getHighlightFromHash();

    if (highlight) {
      return Array.isArray(highlight) ? highlight[0] : highlight;
    }
  }

  handleFollowClick = () => {
    const follow = !this.state.follow;

    storage.setItem(FOLLOW_STORAGE_KEY, follow);
    this.setState({ follow });
  };

  handleHighlight = range => {
    if (this.highlightRange && this.highlightRange.equals(range)) {
      return;
    }

    const first = range.first();
    const last = range.last();

    if (!first) {
      this.props.history.replace({ hash: '' });
    } else if (first === last) {
      this.props.history.replace({ hash: `#L${first}` });
    } else {
      this.props.history.replace({ hash: `#L${first}-${last}` });
    }

    this.highlightRange = range;
  };

  handleLineNumberChange = lineNumber => {
    this.setState({ lineNumber });
  };

  handleScroll = ({ scrollTop, scrollHeight, clientHeight }) => {
    if (this.state.follow && scrollHeight - scrollTop !== clientHeight) {
      this.setState({ follow: false });
    }
  };

  shouldStartFollowing() {
    if (!this.props.stream) {
      return false;
    }

    if (typeof this.state.follow === 'boolean') {
      return this.state.follow;
    }

    if (this.getScrollToLine()) {
      return false;
    }

    const pref = storage.getItem(FOLLOW_STORAGE_KEY);

    if (typeof pref === 'boolean') {
      return pref;
    }

    return false;
  }

  render() {
    const {
      url,
      stream,
      classes,
      actions,
      GoToLineButtonProps,
      FollowLogButtonProps,
      RawLogButtonProps: {
        className: RawLogButtonClassName,
        ...RawLogButtonPropsRest
      },
      ...props
    } = this.props;
    const highlight = this.getHighlightFromHash();
    const scrollToLine = this.getScrollToLine();
    const rawLogButton = (
      <Tooltip placement="left" title="Raw log">
        <Button
          component="a"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          variant="round"
          mini
          color="secondary"
          className={classNames(classes.fabIcon, RawLogButtonClassName)}
          {...RawLogButtonPropsRest}>
          <OpenInNewIcon />
        </Button>
      </Tooltip>
    );

    if (!stream) {
      return (
        <Fragment>
          <LazyLog
            url={url}
            selectableLines
            highlight={highlight}
            onHighlight={this.handleHighlight}
            scrollToLine={scrollToLine}
            scrollToAlignment="start"
            lineClassName={classes.line}
            highlightLineClassName={classes.highlight}
            loadingComponent={Loading}
            extraLines={1}
            {...props}
          />
          {rawLogButton}
          <GoToLineButton
            onLineNumberChange={this.handleLineNumberChange}
            {...GoToLineButtonProps}
          />
          {actions}
        </Fragment>
      );
    }

    return (
      <ScrollFollow
        startFollowing={this.shouldStartFollowing()}
        render={({ follow }) => (
          <Fragment>
            <LazyLog
              url={url}
              onScroll={this.handleScroll}
              stream
              selectableLines
              follow={follow}
              highlight={highlight}
              onHighlight={this.handleHighlight}
              scrollToLine={scrollToLine}
              scrollToAlignment="start"
              lineClassName={classes.line}
              highlightLineClassName={classes.highlight}
              loadingComponent={Loading}
              extraLines={1}
              {...props}
            />
            {rawLogButton}
            <GoToLineButton
              onLineNumberChange={this.handleLineNumberChange}
              {...GoToLineButtonProps}
            />
            <Tooltip
              placement="bottom"
              title={follow ? 'Unfollow log' : 'Follow log'}>
              <Button
                variant="round"
                mini
                color={follow ? 'inherit' : 'secondary'}
                onClick={this.handleFollowClick}
                {...FollowLogButtonProps}
                className={classNames(
                  {
                    [classes.followButtonFollowing]: follow,
                  },
                  FollowLogButtonProps && FollowLogButtonProps.className
                )}>
                <ArrowDownBoldCircleOutlineIcon />
              </Button>
            </Tooltip>
            {actions}
          </Fragment>
        )}
      />
    );
  }
}
