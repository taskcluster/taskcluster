import { PureComponent } from 'react';
import { bool } from 'prop-types';
import classNames from 'classnames';
import { withStyles } from 'material-ui/styles';
import CircularProgress from 'material-ui/Progress/CircularProgress';

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
  };

  static defaultProps = {
    loading: false,
  };

  render() {
    const { loading, classes, className, ...props } = this.props;
    const progress = (
      <CircularProgress color="primary" className={className} {...props} />
    );

    return loading ? (
      <div className={classNames(classes.center, className)}>{progress}</div>
    ) : (
      progress
    );
  }
}
