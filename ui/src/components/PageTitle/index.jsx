import React, { PureComponent } from 'react';
import { string } from 'prop-types';
import Helmet, { title } from 'react-helmet';

/**
 * Update the page's tab title to show a custom string, along with the
 * application name.
 */
export default class PageTitle extends PureComponent {
  static defaultProps = {
    children: null,
  };

  static propTypes = {
    /**
     * Show a custom string before the application name.
     */
    children: string,
  };

  render() {
    return (
      <Helmet>
        <title>
          {this.props.children
            ? `${this.props.children} - ${window.env.APPLICATION_NAME}`
            : window.env.APPLICATION_NAME}
        </title>
      </Helmet>
    );
  }
}
