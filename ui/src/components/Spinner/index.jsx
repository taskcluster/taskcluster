import React, { PureComponent } from 'react';
import { bool, oneOf, string } from 'prop-types';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import CircularProgress from '@material-ui/core/CircularProgress';

@withStyles({
  center: {
    textAlign: 'center',
  },
})
/**
 * Render an indeterminate spinning indicator.
 */
export default class Spinner extends PureComponent {
  static propTypes = {
    /**
     * Set to `true` to render the spinner with its own
     * block-centered container.
     */
    loading: bool,
    /**
     * The color of the component.
     * It supports those theme colors that make sense for this component.
     */
    color: oneOf(['primary', 'secondary', 'inherit']),
    /** The CSS class name of the wrapper element */
    className: string,
  };

  static defaultProps = {
    loading: false,
    color: 'primary',
    className: null,
  };

  render() {
    const { color, loading, classes, className, ...props } = this.props;
    const progress = (
      <CircularProgress color={color} className={className} {...props} />
    );

    return loading ? (
      <div className={classNames(classes.center, className)}>{progress}</div>
    ) : (
      progress
    );
  }
}
