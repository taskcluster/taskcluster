import { PureComponent } from 'react';
import { string } from 'prop-types';
import Helmet, { title } from 'react-helmet';

export default class PageTitle extends PureComponent {
  static propTypes = {
    children: string.isRequired
  };

  render() {
    return (
      <Helmet>
        <title>
          {this.props.children
            ? `${this.props.children} - ${process.env.APPLICATION_TITLE}`
            : process.env.APPLICATION_TITLE}
        </title>
      </Helmet>
    );
  }
}
