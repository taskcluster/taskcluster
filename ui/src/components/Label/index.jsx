import React, { Component } from 'react';
import { bool, node, oneOf, string } from 'prop-types';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';

@withStyles(theme => ({
  dense: {
    minHeight: 20,
    padding: '4px 10px 3px',
  },
  mini: {
    fontSize: '0.7em',
    padding: '3px 8px 2px',
  },
  disabled: {
    color: 'white',
  },
  error: {
    backgroundColor: `${theme.palette.error.dark} !important`,
    color: `${theme.palette.error.contrastText} !important`,
  },
  success: {
    backgroundColor: `${theme.palette.success.dark} !important`,
    color: `${theme.palette.success.contrastText} !important`,
  },
  warning: {
    backgroundColor: `${theme.palette.warning.dark} !important`,
    color: `${theme.palette.warning.contrastText} !important`,
  },
  default: {
    backgroundColor: `${theme.palette.grey[700]} !important`,
    color: `${theme.palette.getContrastText(
      theme.palette.grey[700]
    )} !important`,
  },
  info: {
    backgroundColor: `${theme.palette.info[700]} !important`,
    color: `${theme.palette.info.contrastText} !important`,
  },
}))
/**
 * A label color-coded based on a given status.
 *
 * _Note: [material-ui](https://material-ui.com/) is a peer-dependency_
 */
export default class Label extends Component {
  static propTypes = {
    /**
     * Content to render within the label.
     */
    children: node.isRequired,
    /**
     * An intent-driven color indicator.
     */
    status: oneOf(['error', 'success', 'warning', 'default', 'info'])
      .isRequired,
    /**
     * Show label using dense styling.
     */
    mini: bool,
    /** The CSS class name of the wrapper element */
    className: string,
  };

  static defaultProps = {
    mini: false,
    className: null,
  };

  render() {
    const { children, className, classes, mini, status, ...props } = this.props;

    return (
      <Button
        size="small"
        disabled
        className={classNames(className, {
          [classes.mini]: mini,
        })}
        classes={{
          sizeSmall: classes.dense,
          disabled: classNames(classes[status], classes.disabled),
        }}
        {...props}>
        {children}
      </Button>
    );
  }
}
