import React, { Component, Fragment } from 'react';
import { bool, func } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import TextField from '@material-ui/core/TextField';
import MenuItem from '@material-ui/core/MenuItem';
import ContentSaveIcon from 'mdi-react/ContentSaveIcon';
import DeleteIcon from 'mdi-react/DeleteIcon';
import { notificationAddress as address } from '../../utils/prop-types';
import SpeedDial from '../SpeedDial';
import SpeedDialAction from '../SpeedDialAction';
import Button from '../Button';

@withStyles(theme => ({
  fab: {
    ...theme.mixins.fab,
  },
  listItemButton: {
    ...theme.mixins.listItemButton,
  },
  saveIcon: {
    ...theme.mixins.successIcon,
  },
  deleteIcon: {
    ...theme.mixins.errorIcon,
  },
  disableIcon: {
    ...theme.mixins.warningIcon,
  },
  enableIcon: {
    ...theme.mixins.successIcon,
  },
  dropdown: {
    minWidth: 200,
    marginBottom: theme.spacing.double,
  },
}))

/** A form to view/add a notification address to the denylist */
export default class DenylistForm extends Component {
  static defaultProps = {
    isNewAddress: false,
    address: null,
    loading: false,
    onDeleteAddress: null,
  };

  static getDerivedStateFromProps({ isNewAddress, address }, state) {
    if (
      isNewAddress ||
      (state.notificationAddress && state.prevAddress === address)
    ) {
      return null;
    }

    return {
      notificationType: address.notificationType,
      notificationAddress: address.notificationAddress,
      prevAddress: address,
    };
  }

  static propTypes = {
    /** A GraphQL address response. Not needed when adding a new
    address  */
    address,
    /** Set to `true` when adding a new address. */
    isNewaddress: bool,
    /** Callback function fired when an address is created. */
    onAddAddress: func.isRequired,
    /** Callback function fired when an address is deleted. */
    onDeleteAddress: func,
    /** If true, form actions will be disabled. */
    loading: bool,
  };

  state = {
    notificationType: '',
    notificationAddress: '',
    // eslint-disable-next-line react/no-unused-state
    prevAddress: null,
  };

  handleDeleteAddress = () => {
    const { notificationType, notificationAddress } = this.state;

    this.props.onDeleteAddress(notificationType, notificationAddress);
  };

  handleInputChange = ({ target: { name, value } }) => {
    this.setState({ [name]: value });
  };

  handleAddAddress = () => {
    const { notificationType, notificationAddress } = this.state;

    this.props.onAddAddress({
      notificationType,
      notificationAddress,
    });
  };

  prettify = str =>
    // remove underscores and capitalize first alphabet
    str
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

  render() {
    const { address, classes, isNewAddress, loading } = this.props;
    const { notificationType, notificationAddress } = this.state;
    const notificationTypes = ['EMAIL', 'PULSE', 'IRC_USER', 'IRC_CHANNEL'];

    return (
      <Fragment>
        {isNewAddress && (
          <List>
            <ListItem>
              <TextField
                disabled={loading}
                className={classes.dropdown}
                select
                label="Notification Type"
                value={notificationType}
                onChange={this.handleInputChange}
                name="notificationType">
                {notificationTypes.map(type => (
                  <MenuItem key={type} value={type}>
                    {this.prettify(type)}
                  </MenuItem>
                ))}
              </TextField>
            </ListItem>
            <ListItem>
              <TextField
                label="Notification Address"
                name="notificationAddress"
                onChange={this.handleInputChange}
                fullWidth
                value={notificationAddress}
              />
            </ListItem>
          </List>
        )}
        {address && (
          <List>
            <ListItem>
              <ListItemText
                primary="Notification Type"
                secondary={this.prettify(notificationType)}
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Notification Address"
                secondary={notificationAddress}
              />
            </ListItem>
          </List>
        )}

        {isNewAddress ? (
          <Button
            spanProps={{ className: classes.fab }}
            tooltipProps={{ title: 'Add Address' }}
            requiresAuth
            disabled={loading}
            variant="round"
            onClick={this.handleAddAddress}
            classes={{ root: classes.saveIcon }}>
            <ContentSaveIcon />
          </Button>
        ) : (
          <SpeedDial>
            <SpeedDialAction
              requiresAuth
              tooltipOpen
              icon={<DeleteIcon />}
              onClick={this.handleDeleteAddress}
              className={classes.deleteIcon}
              tooltipTitle="Delete"
              ButtonProps={{ disabled: loading }}
            />
          </SpeedDial>
        )}
      </Fragment>
    );
  }
}
