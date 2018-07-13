import { Component } from 'react';
import { Link } from 'react-router-dom';
import isAbsolute from 'is-absolute-url';

export default class AnchorOrLink extends Component {
  render() {
    const { href, ...props } = this.props;

    /* eslint-disable jsx-a11y/anchor-has-content */
    return isAbsolute(href) ? (
      <a href={href} {...props} target="_blank" rel="noopener noreferrer" />
    ) : (
      <Link to={href} {...props} />
    );
  }
}
