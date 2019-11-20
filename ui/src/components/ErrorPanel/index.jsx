import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import classNames from 'classnames';
import { bool, oneOfType, string, object } from 'prop-types';
import MuiErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import { CONTENT_MAX_WIDTH } from '../../utils/constants';

@withStyles(theme => ({
  warning: {
    '& a': {
      color: theme.palette.secondary.dark,
    },
  },
  error: {
    '& svg': {
      fill: theme.palette.error.contrastText,
    },
  },
  link: {
    '& a': {
      ...theme.mixins.link,
    },
  },
  fixed: {
    fontSize: theme.typography.body1.fontSize,
    position: 'fixed',
    zIndex: theme.zIndex.drawer - 1,
    left: '50%',
    transform: 'translateX(-50%)',
    width: '92%',
    maxWidth: CONTENT_MAX_WIDTH,
    overflow: 'auto',
    maxHeight: '85vh',
  },
}))
export default class ErrorPanel extends Component {
  static propTypes = {
    /** Error to display. */
    error: oneOfType([string, object]),
    /** If true, the component will be fixed. */
    fixed: bool,
  };

  static defaultProps = {
    error: null,
    fixed: false,
  };

  state = {
    error: null,
    // eslint-disable-next-line react/no-unused-state
    previousError: null,
  };

  static getDerivedStateFromProps(props, state) {
    if (props.error !== state.previousError) {
      return {
        error: props.error,
        previousError: props.error,
      };
    }

    return null;
  }

  handleErrorClose = () => {
    const { onClose } = this.props;

    this.setState({ error: null });

    if (onClose) {
      onClose();
    }
  };

  render() {
    const { classes, className, fixed, error: _, ...props } = this.props;
    const { error } = this.state;
    const hasWarning = Boolean(props.warning);
    const errorMessage =
      error && error.graphQLErrors && error.graphQLErrors[0]
        ? error.graphQLErrors[0].message
        : error;

    return (
      error && (
        <MuiErrorPanel
          className={classNames(className, classes.link, {
            [classes.error]: !hasWarning,
            [classes.warning]: hasWarning,
            [classes.fixed]: fixed,
          })}
          error={errorMessage}
          onClose={this.handleErrorClose}
          {...props}
        />
      )
    );
  }
}
