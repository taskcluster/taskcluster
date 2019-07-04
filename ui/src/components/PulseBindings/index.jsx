import React, { Component, Fragment } from 'react';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import { arrayOf, func, object, string } from 'prop-types';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ListSubheader from '@material-ui/core/ListSubheader';
import Tooltip from '@material-ui/core/Tooltip';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import PlusIcon from 'mdi-react/PlusIcon';
import DeleteIcon from 'mdi-react/DeleteIcon';

@withStyles(theme => ({
  iconButton: {
    '& svg': {
      fill: theme.palette.text.primary,
    },
  },
  plusIcon: {
    marginTop: 80,
  },
  deleteIcon: {
    marginRight: -theme.spacing.double,
  },
  inputWrapper: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inputList: {
    flex: 1,
  },
  bindingListItem: {
    paddingTop: 0,
    paddingBottom: 0,
  },
  subheader: {
    fontSize: theme.typography.pxToRem(16),
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
    } = this.props;

    return (
      <Fragment>
        <div className={classes.inputWrapper}>
          <List
            className={classes.inputList}
            subheader={
              <ListSubheader className={classes.subheader}>
                Bindings
              </ListSubheader>
            }>
            <ListItem>
              <ListItemText
                primary={
                  <TextField
                    required
                    label="Pulse Exchange"
                    name="pulseExchange"
                    placeholder="exchange/<username>/some-exchange-name"
                    onChange={onPulseExchangeChange}
                    fullWidth
                    value={pulseExchange}
                  />
                }
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary={
                  <TextField
                    required
                    label="Routing Key Pattern"
                    placeholder="#.some-interesting-key.#"
                    name="pattern"
                    onChange={onRoutingKeyPatternChange}
                    fullWidth
                    value={pattern}
                  />
                }
              />
            </ListItem>
          </List>
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
                  <Typography variant="body2">
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
