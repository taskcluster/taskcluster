import { Component } from 'react';
import { string, node } from 'prop-types';

/** Scroll the window to the top when `scrollKey` changes. */
export default class ScrollToTop extends Component {
  static propTypes = {
    children: node,
    /* Restore scroll position when `scrollKey` changes. */
    scrollKey: string,
  };

  static defaultProps = {
    scrollKey: null,
    children: null,
  };

  componentDidUpdate(prevProps) {
    if (this.props.scrollKey !== prevProps.scrollKey) {
      window.scrollTo(0, 0);
    }
  }

  render() {
    return this.props.children;
  }
}
