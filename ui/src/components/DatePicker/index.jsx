import React, { Component } from 'react';
import { func } from 'prop-types';
import classNames from 'classnames';
import { DatePicker as MuiDatePicker } from 'material-ui-pickers';
import { withStyles } from '@material-ui/core/styles';
import DateFnsUtils from 'material-ui-pickers/utils/date-fns-utils';
import MuiPickersUtilsProvider from 'material-ui-pickers/utils/MuiPickersUtilsProvider';
import ChevronRightIcon from 'mdi-react/ChevronRightIcon';
import CalendarIcon from 'mdi-react/CalendarIcon';
import ChevronLeftIcon from 'mdi-react/ChevronLeftIcon';
import { date } from '../../utils/prop-types';

@withStyles({
  datePicker: {
    '& > div': {
      alignItems: 'center',
    },
    color: 'black',
  },
})
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
    const { classes, className, value, onChange, ...props } = this.props;

    return (
      <MuiPickersUtilsProvider utils={DateFnsUtils}>
        <MuiDatePicker
          className={classNames(classes.datePicker, className)}
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
