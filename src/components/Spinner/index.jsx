import { PureComponent } from 'react';
import CircularProgress from 'material-ui/Progress/CircularProgress';

export default class Spinner extends PureComponent {
  render() {
    return <CircularProgress color="primary" />;
  }
}
