import React, { Component, Fragment } from 'react';
import { arrayOf, bool, node, object, oneOfType, string } from 'prop-types';
import classNames from 'classnames';
import { withRouter } from 'react-router-dom';
import { LazyLog, ScrollFollow } from 'react-lazylog';
import storage from 'localforage';
import { omit } from 'ramda';
import { withStyles } from '@material-ui/core/styles';
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
      color: theme.palette.text.primary,
      '-webkit-font-smoothing': 'auto',
    },
    'div.react-lazylog-searchbar': {
      backgroundColor: theme.palette.background.default,
      fontFamily: 'Consolas, Monaco, Andale Mono, Ubuntu Mono, monospace',
      fontSize: 13,
      padding: 10,
      ...(theme.palette.type === 'light'
        ? {
            '& > .react-lazylog-searchbar-input': {
              height: theme.spacing.triple,
              backgroundColor: theme.palette.grey['300'],
              color: theme.palette.common.black,
              borderColor: theme.palette.grey['300'],
            },
            '& > .react-lazylog-searchbar-filter': {
              '&.active': {
                fill: theme.palette.text.active,
              },
              '&.inactive': {
                fill: theme.palette.text.disabled,
              },
            },
            '& > .react-lazylog-searchbar-matches': {
              '&.active': {
                color: theme.palette.text.active,
              },
              '&.inactive': {
                color: theme.palette.text.disabled,
              },
            },
          }
        : {
            '& > .react-lazylog-searchbar-input': {
              height: theme.spacing.triple,
            },
          }),
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
  logActions: {
    position: 'absolute',
    top: 6,
    right: 340,
  },
  followButtonFollowing: {
    ...theme.mixins.successIcon,
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
    const containerStyle = {
      width: 'auto',
      maxWidth: 'initial',
      overflow: 'initial',
    };
    const rawLogButton = (
      <Button
        spanProps={{ className: RawLogButtonClassName }}
        tooltipProps={{ title: 'Raw Log' }}
        component="a"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        variant="round"
        color="secondary"
        {...RawLogButtonPropsRest}>
        <OpenInNewIcon />
      </Button>
    );
    const FollowLogButtonRest = omit(['className'], FollowLogButtonProps);

    return (
      <ScrollFollow
        startFollowing={this.shouldStartFollowing()}
        render={({ follow }) => (
          <Fragment>
            <LazyLog
              enableSearch
              containerStyle={containerStyle}
              url={url}
              onScroll={this.handleScroll}
              stream={stream}
              selectableLines
              follow={follow}
              highlight={highlight}
              onHighlight={this.handleHighlight}
              scrollToLine={scrollToLine}
              scrollToAlignment="start"
              lineClassName={classes.line}
              highlightLineClassName={classes.highlight}
              loadingComponent={Loading}
              extraLines={5}
              {...props}
            />
            {rawLogButton}
            <div className={classes.logActions}>
              <GoToLineButton
                onLineNumberChange={this.handleLineNumberChange}
                {...GoToLineButtonProps}
              />
              <Button
                size="small"
                spanProps={{
                  className:
                    FollowLogButtonProps && FollowLogButtonProps.className,
                }}
                tooltipProps={{
                  title: follow && stream ? 'Unfollow Log' : 'Follow Log',
                }}
                className={classNames({
                  [classes.followButtonFollowing]: follow && stream,
                })}
                color={follow && stream ? 'inherit' : 'secondary'}
                onClick={this.handleFollowClick}
                {...FollowLogButtonRest}>
                <ArrowDownBoldCircleOutlineIcon size={20} />
              </Button>
            </div>
            {actions}
          </Fragment>
        )}
      />
    );
  }
}
