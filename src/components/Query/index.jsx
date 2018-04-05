import { Component } from 'react';
import { func } from 'prop-types';
import { withStyles } from 'material-ui/styles';
import Spinner from '../Spinner';
import ErrorPanel from '../ErrorPanel';

@withStyles({
  spinner: {
    textAlign: 'center',
  },
})
export default class Query extends Component {
  static propTypes = {
    children: func.isRequired,
  };

  render() {
    const { classes, children, loading, error } = this.props;

    if (loading) {
      return (
        <div className={classes.spinner}>
          <Spinner />
        </div>
      );
    } else if (error) {
      return <ErrorPanel error={error} />;
    }

    return children();
  }
}
