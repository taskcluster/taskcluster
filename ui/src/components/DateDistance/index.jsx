import { Component } from 'react';
import {
  isDate,
  formatDistance,
  formatDistanceStrict,
  parseISO,
} from 'date-fns';
import { date } from '../../utils/prop-types';

/**
 * Display a human-readable relative string between a date and now.
 * Optionally also show a relative distance between that date and an
 * additional offset date.
 */
export default class DateDistance extends Component {
  static defaultProps = {
    offset: null,
  };

  static propTypes = {
    /**
     * The origin date for which to render a relative string from now.
     */
    from: date.isRequired,
    /**
     * An optional date for which to also show a relative string between `from`
     * and `offset`.
     */
    offset: date,
  };

  render() {
    const { from, offset } = this.props;
    const fromNow = formatDistanceStrict(
      isDate(from) ? from : parseISO(from),
      new Date(),
      {
        addSuffix: true,
      }
    );
    const offsetNow =
      offset && formatDistance(isDate(from) ? from : parseISO(from), offset);

    return offsetNow ? `${fromNow} (${offsetNow} later)` : fromNow;
  }
}
