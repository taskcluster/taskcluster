import Autocomplete, { autocompleteClasses } from '@mui/material/Autocomplete';
import ListSubheader from '@mui/material/ListSubheader';
import { alpha } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { capitalCase } from 'change-case';
import MagnifyIcon from 'mdi-react/MagnifyIcon';
import { useMemo, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { THEME } from '../../utils/constants';
import Link from '../../utils/Link';

export interface DocSearchOption {
  id: string;
  /** Path of the page relative to `/docs` */
  path: string;
  title: string | null;
  subtitle: string | null;
}

function linkFromOption(option: DocSearchOption) {
  return `/docs${option.path}#${option.id}`;
}

function labelFromOption(option: DocSearchOption) {
  return option.subtitle ?? option.title ?? '';
}

function groupLabelFromOption(option: DocSearchOption) {
  const section = capitalCase(option.path.split('/').at(-2) ?? '');

  return [section, option.title].filter(Boolean).join(' / ');
}

/**
 * An app-bar compatible search field for docs.
 */
export default function DocSearch({ options }: { options: DocSearchOption[] }) {
  const history = useHistory();
  const [inputValue, setInputValue] = useState('');
  const groupLabels = useMemo(
    () =>
      new Map(
        options.map(option => [option.path, groupLabelFromOption(option)])
      ),
    [options]
  );

  return (
    <Autocomplete
      options={options}
      onChange={(event, option) => {
        // Mouse selection is handled by the option's link
        if (option && event.type === 'keydown') {
          history.push(linkFromOption(option));
        }
      }}
      value={null}
      inputValue={inputValue}
      onInputChange={(_, value, reason) => {
        if (reason === 'input') {
          setInputValue(value);
        }
      }}
      getOptionLabel={labelFromOption}
      getOptionKey={linkFromOption}
      groupBy={option => option.path}
      sx={theme => ({
        width: 300,
        background: alpha(THEME.PRIMARY_DARK, 0.5),
        '&:hover': {
          background: alpha(THEME.PRIMARY_DARK, 0.9),
        },
        '& .MuiInput-underline:before': {
          borderBottom: 'unset !important',
        },
        '& .MuiSvgIcon-root': {
          fill: theme.palette.common.white,
        },
        '& .mdi-icon': {
          fill: alpha(theme.palette.common.white, 0.5),
          marginRight: 1,
          height: 35,
        },
        [`& .${autocompleteClasses.inputRoot}`]: {
          paddingLeft: 2,
          paddingRight: 1,
          color: alpha(THEME.PRIMARY_TEXT_DARK, 0.5),
          '&.Mui-focused': {
            color: alpha(THEME.PRIMARY_TEXT_DARK, 0.9),
          },
        },
      })}
      renderGroup={({ key, group, children }) => (
        <li key={key}>
          <ListSubheader
            component="div"
            sx={{ top: -8, backgroundColor: 'background.paper' }}>
            {groupLabels.get(group)}
          </ListSubheader>
          <ul style={{ padding: 0 }}>{children}</ul>
        </li>
      )}
      renderOption={({ key, ...props }, option) => (
        <li key={key} {...props} style={{ padding: 0 }}>
          <Link
            to={linkFromOption(option)}
            style={{
              flex: 1,
              alignSelf: 'stretch',
              display: 'flex',
              alignItems: 'center',
              padding: '6px 16px 6px 24px',
            }}>
            <Typography color="textSecondary" variant="body2">
              {labelFromOption(option)}
            </Typography>
          </Link>
        </li>
      )}
      renderInput={params => (
        <TextField
          {...params}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              startAdornment: <MagnifyIcon />,
            },
          }}
          placeholder="Search Documentation"
          fullWidth
        />
      )}
    />
  );
}
