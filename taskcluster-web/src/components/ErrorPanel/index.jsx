import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import classNames from 'classnames';
import { oneOfType, string, object } from 'prop-types';
import MuiErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';

@withStyles(theme => ({
  warning: {
    '& a': {
      color: theme.palette.secondary.dark,
    },
  },
}))
export default class ErrorPanel extends Component {
  static propTypes = {
    /** Error to display. */
    error: oneOfType([string, object]),
  };

  static defaultProps = {
    error: null,
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
    const { classes, error: _, ...props } = this.props;
    const { error } = this.state;
    const errorMessage =
      error && error.graphQLErrors && error.graphQLErrors[0]
        ? error.graphQLErrors[0].message
        : error;

    return (
      error && (
        <MuiErrorPanel
          className={classNames({ [classes.warning]: Boolean(props.warning) })}
          error={errorMessage}
          onClose={this.handleErrorClose}
          {...props}
        />
      )
    );
  }
}
