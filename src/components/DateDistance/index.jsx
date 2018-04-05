import { Component } from 'react';
import { distanceInWords, distanceInWordsToNow } from 'date-fns';
import { date } from '../../utils/prop-types';

export default class DateDistance extends Component {
  static propTypes = {
    from: date.isRequired,
    offset: date,
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
