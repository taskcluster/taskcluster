import { PureComponent } from 'react';
import { string } from 'prop-types';
import Helmet, { title } from 'react-helmet';

/**
 * Update the page's tab title to show a custom string, along with the
 * application name.
 */
export default class PageTitle extends PureComponent {
  static propTypes = {
    /**
     * Show a custom string before the application name.
     */
    children: string,
  };

  static defaultPros = {
    children: null,
  };

  render() {
    return (
      <Helmet>
        <title>
          {this.props.children
            ? `${this.props.children} - ${process.env.APPLICATION_NAME}`
            : process.env.APPLICATION_NAME}
        </title>
      </Helmet>
    );
  }
}
