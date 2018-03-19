import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { withStyles } from 'material-ui/styles';
import Typography from 'material-ui/Typography';
import AppView from '../../components/AppView';

@hot(module)
@withStyles(theme => ({
  view: {
    paddingTop: theme.spacing.triple,
    paddingLeft: theme.spacing.triple,
  },
}))
export default class Documentation extends Component {
  render() {
    const { classes } = this.props;

    return (
      <AppView title="Documentation" className={classes.view}>
        <Typography variant="display1">Documentation</Typography>
      </AppView>
    );
  }
}
