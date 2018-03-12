import { hot } from 'react-hot-loader';
import { Component } from 'react';
import Typography from 'material-ui/Typography';
import AppView from '../../components/AppView';

@hot(module)
export default class NotFound extends Component {
  render() {
    return (
      <AppView>
        <Typography variant="display1">Not Found</Typography>
      </AppView>
    );
  }
}
