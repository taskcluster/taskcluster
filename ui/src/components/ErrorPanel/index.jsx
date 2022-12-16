import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import classNames from 'classnames';
import { bool, oneOfType, string, object } from 'prop-types';
import MuiErrorPanel from './MuiErrorPanel';
import { CONTENT_MAX_WIDTH } from '../../utils/constants';

@withStyles(theme => ({
  error: {
    '& svg': {
      fill: theme.palette.common.white,
    },
  },
  warning: {
    '& svg': {
      fill: theme.palette.common.black,
    },
  },
  fixed: {
    fontSize: theme.typography.body1.fontSize,
    position: 'fixed',
    zIndex: theme.zIndex.drawer - 1,
    width: '92%',
    maxWidth: CONTENT_MAX_WIDTH,
    overflow: 'auto',
    maxHeight: '85vh',
  },
  fixedDocs: {
    width: `calc(100% - ${2 * theme.docsDrawerWidth}px - ${2 *
      theme.spacing(3)}px)`,
    [theme.breakpoints.down('md')]: {
      width: `calc(100% - ${theme.docsDrawerWidth}px - ${theme.spacing(6)}px)`,
    },
    [theme.breakpoints.down('sm')]: {
      width: '92%',
    },
  },
}))
export default class ErrorPanel extends Component {
  static propTypes = {
    /** Error to display. */
    error: oneOfType([string, object]),
    /**
     * If true, the component will be fixed.
     * Meant to be used inside the main site.
     * Do not use this prop in the documentation portion of the site.
     * */
    fixed: bool,
    /**
     * If true, the component will be fixed.
     * Meant to be used inside the documentation site.
     * Do not use this prop in the main site.
     * */
    fixedDocs: bool,
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
    const {
      classes,
      className,
      fixed,
      fixedDocs,
      error: _,
      ...props
    } = this.props;
    const { error } = this.state;
    const hasWarning = Boolean(props.warning);
    const message = [];

    if (!error) {
      return null;
    }

    // handle GraphQLErrors as a special case
    if (error.graphQLErrors && error.graphQLErrors.length > 0) {
      const errors = error.graphQLErrors;

      // Log extensions for all errors received
      errors.forEach(err => {
        if (err?.extensions) {
          // eslint-disable-next-line no-console
          console.log('Error from web-server:', err.extensions);
        }
      });

      // construct a markdown summary of all of the errors (at most 3)
      if (errors.length > 1) {
        message.push(
          `${errors.length} errors occurred fetching data for this page:`
        );

        errors.slice(0, 3).forEach(err => {
          message.push(`* ${err.message}`);
        });

        if (errors.length > 3) {
          message.push('* (further errors hidden; see console)');
        }
      } else {
        message.push(errors[0].message);
      }
    } else if (error.networkError) {
      // special-case networkError as well, although note that this still shows
      // JSON errors when the response is not JSON, regardless of content-type.
      message.push(
        `Network Error (${error.networkError.statusCode ||
          'no status code'}): ${error.networkError}`
      );
    } else if (error.message) {
      message.push(error.message);
    } else {
      // error can be a JSON serialized object
      try {
        const obj = JSON.parse(error);

        if (obj?.body?.code) {
          message.push(`API Error: ${obj.body.code}`);
        }

        if (obj?.body?.message) {
          message.push(obj.body.message);
        }
      } catch {
        // ignore
      }

      if (!message.length) {
        message.push(error);
      }
    }

    return (
      <MuiErrorPanel
        className={classNames(className, {
          [classes.error]: !hasWarning,
          [classes.warning]: hasWarning,
          [classes.fixed]: fixed || fixedDocs,
          [classes.fixedDocs]: fixedDocs,
        })}
        error={message.join('\n')}
        onClose={this.handleErrorClose}
        {...props}
      />
    );
  }
}
