import { hot } from 'react-hot-loader';
import { Component } from 'react';
import Typography from 'material-ui/Typography';
import AppView from '../../components/AppView';

@hot(module)
export default class Home extends Component {
  render() {
    return (
      <AppView elevated={false}>
        <Typography variant="display1">Home</Typography>
      </AppView>
    );
  }
}
