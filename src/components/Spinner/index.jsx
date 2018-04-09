import { PureComponent } from 'react';
import { bool } from 'prop-types';
import { withStyles } from 'material-ui/styles';
import CircularProgress from 'material-ui/Progress/CircularProgress';

@withStyles({
  center: {
    textAlign: 'center',
  },
})
export default class Spinner extends PureComponent {
  static propTypes = {
    loading: bool,
  };

  static defaultProps = {
    loading: false,
  };

  render() {
    const { loading, classes, ...props } = this.props;
    const progress = <CircularProgress color="primary" {...props} />;

    return loading ? (
      <div className={classes.center}>{progress}</div>
    ) : (
      progress
    );
  }
}
