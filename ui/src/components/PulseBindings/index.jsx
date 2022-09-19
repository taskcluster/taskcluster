import React, { Component, Fragment } from 'react';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import { arrayOf, func, object, string } from 'prop-types';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Tooltip from '@material-ui/core/Tooltip';
import Autocomplete from '@material-ui/lab/Autocomplete';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
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
    marginRight: -theme.spacing(2),
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
              onInputChange={(event, newValue) =>
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
              onClick={onBindingAdd}>
              <PlusIcon />
            </IconButton>
          </Tooltip>
        </div>
        <List>
          {bindings.map(binding => (
            <ListItem
              className={classes.bindingListItem}
              key={`${binding.exchange}-${binding.pattern ||
                bindings.routingKeyPattern}`}>
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
                  onClick={() => onBindingRemove(binding)}>
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
