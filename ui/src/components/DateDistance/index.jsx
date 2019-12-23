import { Component } from 'react';
import { isDate, formatDistanceStrict, parseISO } from 'date-fns';
import { date } from '../../utils/prop-types';
import isDateWithin from '../../utils/isDateWithin';

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
    const now = new Date();
    const { from, offset } = this.props;
    const fromParsed = isDate(from) ? from : parseISO(from);
    const unit = isDateWithin(fromParsed, new Date(), 44, 120)
      ? 'minute'
      : undefined;
    const fromNow = formatDistanceStrict(fromParsed, now, {
      addSuffix: true,
      unit,
    });
    const offsetParsed = isDate(offset) ? offset : parseISO(offset);
    const offsetNow =
      offset && formatDistanceStrict(fromParsed, offsetParsed, { unit });

    return offsetNow ? `${fromNow} (${offsetNow} later)` : fromNow;
  }
}
