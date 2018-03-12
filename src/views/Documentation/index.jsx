import { hot } from 'react-hot-loader';
import { Component } from 'react';
import Typography from 'material-ui/Typography';
import AppView from '../../components/AppView';

@hot(module)
export default class Documentation extends Component {
  render() {
    return (
      <AppView title="Documentation">
        <Typography variant="display1">Documentation</Typography>
      </AppView>
    );
  }
}
