import { Component } from 'react';
import { bool, node, oneOf } from 'prop-types';
import classNames from 'classnames';
import { withStyles } from 'material-ui/styles';
import Button from 'material-ui/Button';

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
  },
  success: {
    backgroundColor: `${theme.palette.success[700]} !important`,
  },
  warning: {
    backgroundColor: `${theme.palette.warning[700]} !important`,
    color: theme.palette.common.black,
  },
  default: {
    backgroundColor: `${theme.palette.primary.light} !important`,
  },
  info: {
    backgroundColor: `${theme.palette.info[700]} !important`,
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
          [className]: true,
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
