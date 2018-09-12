import { Component } from 'react';
import { bool, node, oneOf, string } from 'prop-types';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';
import palette from '../../utils/palette';

@withStyles(theme => ({
  dense: {
    minHeight: 20,
    padding: '4px 10px 3px',
  },
  mini: {
    fontSize: '0.7rem',
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
    backgroundColor: `${palette.success.dark} !important`,
    color: `${palette.success.contrastText} !important`,
  },
  warning: {
    backgroundColor: `${palette.warning.dark} !important`,
    color: `${palette.warning.contrastText} !important`,
  },
  default: {
    backgroundColor: `${theme.palette.grey[700]} !important`,
    color: `${theme.palette.getContrastText(
      theme.palette.grey[700]
    )} !important`,
  },
  info: {
    backgroundColor: `${palette.info[700]} !important`,
    color: `${palette.info.contrastText} !important`,
  },
}))
/**
 * A label color-coded based on a given status.
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
  };

  render() {
    const { children, className, classes, mini, status, ...props } = this.props;

    return (
      <Button
        size="small"
        disabled
        className={classNames({
          [classes.mini]: mini,
          className,
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
