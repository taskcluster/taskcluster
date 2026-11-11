import React, { Component, Fragment } from 'react';
import classNames from 'classnames';
import withStyles from '@mui/styles/withStyles';
import { arrayOf, func, object, string } from 'prop-types';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import Autocomplete from '@mui/material/Autocomplete';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import PlusIcon from 'mdi-react/PlusIcon';
import DeleteIcon from 'mdi-react/DeleteIcon';
import TextField from '../TextField';

@withStyles(theme => ({
  iconButton: {
    '& svg': {
      fill: theme.palette.text.primary,
    },
  },
  plusIcon: {
    marginTop: theme.spacing(5),
  },
  deleteIcon: {
    marginRight: theme.spacing(-2),
  },
  inputWrapper: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inputList: {
    flex: 1,
    paddingRight: theme.spacing(2),
  },
  bindingListItem: {
    paddingTop: 0,
    paddingBottom: 0,
  },
}))
export default class PulseBindings extends Component {
  static propTypes = {
    pulseExchange: string.isRequired,
    pattern: string.isRequired,
    bindings: arrayOf(object).isRequired,
    onBindingAdd: func.isRequired,
    onBindingRemove: func.isRequired,
    onRoutingKeyPatternChange: func.isRequired,
    onPulseExchangeChange: func.isRequired,
    exchangesDictionary: arrayOf(string),
  };

  render() {
    const {
      pulseExchange,
      pattern,
      bindings,
      classes,
      onBindingAdd,
      onBindingRemove,
      onRoutingKeyPatternChange,
      onPulseExchangeChange,
      exchangesDictionary,
    } = this.props;
    const onKeyHandler = ev => {
      if (ev.key === 'Enter') {
        setTimeout(onBindingAdd, 1); // wait for onChange event to update value
        ev.preventDefault();
      }
    };

    return (
      <Fragment>
        <div className={classes.inputWrapper}>
          <div className={classes.inputList}>
            <Autocomplete
              freeSolo
              options={exchangesDictionary || []}
              inputValue={pulseExchange}
              onInputChange={(_event, newValue) =>
                onPulseExchangeChange({
                  target: {
                    name: 'pulseExchange',
                    value: newValue,
                  },
                })
              }
              renderInput={params => (
                <TextField
                  {...params}
                  required
                  label="Pulse Exchange"
                  name="pulseExchange"
                  placeholder="exchange/<username>/some-exchange-name"
                  onKeyPress={onKeyHandler}
                  fullWidth
                />
              )}
            />
            <TextField
              margin="normal"
              required
              label="Routing Key Pattern"
              placeholder="#.some-interesting-key.#"
              name="pattern"
              onChange={onRoutingKeyPatternChange}
              onKeyPress={onKeyHandler}
              fullWidth
              value={pattern}
            />
          </div>
          <Tooltip title="Add Binding">
            <IconButton
              className={classNames(classes.iconButton, classes.plusIcon)}
              onClick={onBindingAdd}
              size="large">
              <PlusIcon />
            </IconButton>
          </Tooltip>
        </div>
        <List>
          {bindings.map(binding => (
            <ListItem
              className={classes.bindingListItem}
              key={`${binding.exchange}-${
                binding.pattern || bindings.routingKeyPattern
              }`}>
              <ListItemText
                disableTypography
                primary={
                  <Typography variant="body1">
                    <code>{binding.exchange}</code> with{' '}
                    <code>{binding.pattern || binding.routingKeyPattern}</code>
                  </Typography>
                }
              />
              <Tooltip title="Delete Binding">
                <IconButton
                  className={classNames(classes.iconButton, classes.deleteIcon)}
                  name={binding}
                  onClick={() => onBindingRemove(binding)}
                  size="large">
                  <DeleteIcon />
                </IconButton>
              </Tooltip>
            </ListItem>
          ))}
        </List>
      </Fragment>
    );
  }
}
