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
import SpeedDial from '../SpeedDial';
import SpeedDialAction from '../SpeedDialAction';
import { THEME } from '../../utils/constants';

const LINE_NUMBER_MATCH = /L(\d+)-?(\d+)?/;
const FOLLOW_STORAGE_KEY = 'follow-log';

@withRouter
@withStyles(theme => {
  const filterStyles = {
    borderRadius: 4,
    padding: '4px 8px',
    lineHeight: 1,
    '&.active': {
      ...theme.mixins.successIcon,
      fill: THEME.PRIMARY_TEXT_DARK,
    },
  };

  return {
    '@global': {
      'div.react-lazylog': {
        backgroundColor: theme.palette.background.default,
        fontFamily: 'Consolas, Monaco, Andale Mono, Ubuntu Mono, monospace',
        fontSize: 13,
        paddingTop: 4,
        paddingBottom: theme.spacing(1),
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
                height: theme.spacing(3),
                backgroundColor: theme.palette.grey['300'],
                color: theme.palette.common.black,
                borderColor: theme.palette.grey['300'],
              },
              '& > .react-lazylog-searchbar-filter': {
                ...filterStyles,
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
                height: theme.spacing(3),
              },
              '& > .react-lazylog-searchbar-filter': filterStyles,
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
      top: 8,
      right: 380,
    },
    followButtonFollowing: {
      ...theme.mixins.successIcon,
    },
    followLogIconFollowing: {
      fill: THEME.PRIMARY_TEXT_DARK,
    },
    fabIcon: {
      ...theme.mixins.fabIcon,
    },
    logSpeedDial: {
      ...theme.mixins.fab,
      ...theme.mixins.actionButton,
      bottom: theme.spacing(3),
    },
    logToolbarButton: {
      width: 31,
      height: 25,
      minWidth: 'unset',
      padding: '0 6px',
    },
    goToLineButton: {
      marginRight: theme.spacing(1),
    },
  };
})
/**
 * Render a lazy-loading log viewer.
 */
export default class Log extends Component {
  static defaultProps = {
    stream: false,
    actions: null,
    GoToLineButtonProps: null,
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
  };

  state = {
    lineNumber: null,
    follow: true,
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
    this.setState({ lineNumber, follow: null });
  };

  handleScroll = ({ scrollTop, scrollHeight, clientHeight }) => {
    if (
      this.state.follow &&
      scrollHeight - scrollTop !== clientHeight &&
      // LazyLog triggers `handleScroll` on initial load.
      // This will make sure it doesn't set follow to false on log load.
      scrollTop !== 0
    ) {
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
      ...props
    } = this.props;
    const highlight = this.getHighlightFromHash();
    const scrollToLine = this.getScrollToLine();
    const rawLogButton = (
      <SpeedDialAction
        tooltipOpen
        icon={<OpenInNewIcon size={20} />}
        tooltipTitle="Raw Log"
        FabProps={{
          component: 'a',
          href: url,
          target: '_blank',
          rel: 'noopener noreferrer',
        }}
      />
    );
    const FollowLogButtonRest = omit(['className'], FollowLogButtonProps);

    return (
      <ScrollFollow
        startFollowing={this.shouldStartFollowing()}
        render={({ follow }) => (
          <Fragment>
            <LazyLog
              enableSearch
              caseInsensitive
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
            <div className={classes.logActions}>
              <GoToLineButton
                onLineNumberChange={this.handleLineNumberChange}
                className={classNames(
                  classes.logToolbarButton,
                  classes.goToLineButton
                )}
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
                className={classNames(classes.logToolbarButton, {
                  [classes.followButtonFollowing]: follow && stream,
                })}
                color={follow && stream ? 'inherit' : 'secondary'}
                onClick={this.handleFollowClick}
                {...FollowLogButtonRest}>
                <ArrowDownBoldCircleOutlineIcon
                  className={classNames({
                    [classes.followLogIconFollowing]: follow && stream,
                  })}
                />
              </Button>
            </div>
            {actions}
            <SpeedDial className={classes.logSpeedDial}>
              {rawLogButton}
            </SpeedDial>
          </Fragment>
        )}
      />
    );
  }
}
