import { Component } from 'react';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';

@withStyles(theme => ({
  spinner: {
    marginTop: theme.spacing.triple,
  },
}))
export default class Loading extends Component {
  render() {
    const { classes, ...props } = this.props;

    return <Spinner loading className={classes.spinner} {...props} />;
  }
}
