import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import classNames from 'classnames';
import { bool, oneOfType, string, object } from 'prop-types';
import MuiErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
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
    const errorMessage =
      error && error.graphQLErrors && error.graphQLErrors[0]
        ? error.graphQLErrors[0].message
        : error;

    return (
      error && (
        <MuiErrorPanel
          className={classNames(className, {
            [classes.error]: !hasWarning,
            [classes.warning]: hasWarning,
            [classes.fixed]: fixed || fixedDocs,
            [classes.fixedDocs]: fixedDocs,
          })}
          error={errorMessage}
          onClose={this.handleErrorClose}
          {...props}
        />
      )
    );
  }
}
