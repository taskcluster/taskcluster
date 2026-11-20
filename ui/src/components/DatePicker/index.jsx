import { func, string } from 'prop-types';
import { format, isValid } from 'date-fns';
import TextField from '@mui/material/TextField';
import { mergeSlotProps } from '@mui/material/utils';
import { date } from '../../utils/prop-types';

const toDate = value => {
  const parsed = value ? new Date(value) : null;

  return isValid(parsed) ? parsed : null;
};

const toInputValue = value =>
  value ? format(value, "yyyy-MM-dd'T'HH:mm") : '';

/**
 * Display a native datetime picker
 */
export default function DatePicker({
  name,
  value,
  maxDate,
  onChange,
  slotProps,
  ...props
}) {
  const parsed = toDate(value);
  const handleChange = e => onChange(toDate(e.target.value));

  return (
    <>
      {name && (
        <input
          type="hidden"
          name={name}
          value={parsed ? parsed.toISOString() : ''}
        />
      )}
      <TextField
        type="datetime-local"
        value={toInputValue(parsed)}
        onChange={handleChange}
        {...props}
        slotProps={{
          ...slotProps,
          htmlInput: mergeSlotProps(slotProps?.htmlInput, {
            max: toInputValue(toDate(maxDate)) || undefined,
          }),
          inputLabel: mergeSlotProps(slotProps?.inputLabel, { shrink: true }),
        }}
      />
    </>
  );
}

DatePicker.propTypes = {
  name: string,
  value: date,
  maxDate: date,
  onChange: func.isRequired,
};
