import { Component } from 'react';
import { instanceOf, oneOfType, string } from 'prop-types';
import { distanceInWords, distanceInWordsToNow } from 'date-fns';

export default class DateDistance extends Component {
  static propTypes = {
    from: oneOfType([string, instanceOf(Date)]).isRequired,
    offset: oneOfType([string, instanceOf(Date)]),
  };

  static defaultProps = {
    to: null,
  };

  render() {
    const { from, offset } = this.props;
    const fromNow = distanceInWordsToNow(from, { addSuffix: true });
    const offsetNow = offset && distanceInWords(offset, from);

    return offsetNow ? `${fromNow} (${offsetNow} later)` : fromNow;
  }
}
