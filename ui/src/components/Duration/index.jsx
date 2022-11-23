import { Component } from 'react';
import { isDate, intervalToDuration, parseISO } from 'date-fns';
import { date } from '../../utils/prop-types';

/**
 * Display a time string (00h 00m 00s) relative string between a date and now.
 * Optionally also show a relative distance between that date and an
 * additional offset date.
 */
export default class Duration extends Component {
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

  state = {
    updates: 0,
  };

  componentDidMount() {
    if (!this.props.offset) {
      // make dynamic to show that something is still running
      this.interval = setInterval(() => this.tick(), 1000);
    }
  }

  componentDidUpdate() {
    if (this.props.offset && this.interval) {
      clearInterval(this.interval);
    }
  }

  componentWillUnmount() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  tick() {
    this.setState(state => ({
      updates: state.updates + 1,
    }));
  }

  render() {
    const { from, offset } = this.props;
    const start = isDate(from) ? from : parseISO(from);
    let end;

    if (offset) {
      end = isDate(offset) ? offset : parseISO(offset);
    } else {
      end = new Date();
    }

    const interval = intervalToDuration({ start, end });
    const pad = num => String(num).padStart(2, '0');
    const parts = [pad(interval.minutes), 'm ', pad(interval.seconds), 's '];

    if (interval.hours > 0) {
      parts.unshift(interval.hours, 'h ');
    }

    if (interval.days > 0) {
      parts.unshift(interval.days, 'd ');
    }

    if (interval.months > 0) {
      parts.unshift(interval.months, 'm ');
    }

    if (interval.years > 0) {
      parts.unshift(interval.years, 'y ');
    }

    return parts.join('');
  }
}
