import React, { Component } from 'react';
import { func } from 'prop-types';
import { DatePicker as MuiDatePicker } from 'material-ui-pickers';
import DateFnsUtils from 'material-ui-pickers/utils/date-fns-utils';
import MuiPickersUtilsProvider from 'material-ui-pickers/utils/MuiPickersUtilsProvider';
import ChevronRightIcon from 'mdi-react/ChevronRightIcon';
import CalendarIcon from 'mdi-react/CalendarIcon';
import ChevronLeftIcon from 'mdi-react/ChevronLeftIcon';
import { date } from '../../utils/prop-types';

/**
 * Display a date picker modal to select a date.
 */
export default class DatePicker extends Component {
  static defaultProps = {
    value: null,
  };

  static propTypes = {
    /** Picker value */
    value: date,
    /** Callback function fired when the calendar date is changed. */
    onChange: func.isRequired,
  };

  render() {
    const { value, onChange, ...props } = this.props;

    return (
      <MuiPickersUtilsProvider utils={DateFnsUtils}>
        <MuiDatePicker
          showTodayButton
          keyboard
          keyboardIcon={<CalendarIcon />}
          rightArrowIcon={<ChevronRightIcon />}
          leftArrowIcon={<ChevronLeftIcon />}
          value={value}
          onChange={onChange}
          {...props}
        />
      </MuiPickersUtilsProvider>
    );
  }
}
