import React, { Component, Fragment } from 'react';
import { withApollo } from 'react-apollo';
import List from '@material-ui/core/List';
import { withStyles } from '@material-ui/core/styles';
import ListItem from '@material-ui/core/ListItem';
import DotsVerticalIcon from 'mdi-react/DotsVerticalIcon';
import { withAuth } from '../../utils/Auth';

@withAuth
@withApollo
@withStyles(theme => ({
  mainMenu: {
    position: 'absolute',
    right: '0',
  },
  verticalDotIcon: {
    fill: '#fff',
  },
  avatar: {
    backgroundColor: theme.palette.secondary.main,
  },
  mobileMenu: {
    [theme.breakpoints.up('sm')]: {
      padding: `${theme.spacing.unit / 2}px ${theme.spacing.double}px`,
    },
  },
  text: {
    color: '#fff',
    fontFamily: 'Roboto500',
  },
  icon: {
    fill: '#fff',
  },
}))
export default class MobileMenuList extends Component {
  render() {
    const { classes, onMenuClick } = this.props;

    return (
      <Fragment>
        <List component="nav" className={classes.mainMenu}>
          <ListItem
            className={classes.mobileMenu}
            button
            aria-haspopup="true"
            aria-controls="mobile-menu"
            aria-label="mobile menu"
            onClick={onMenuClick}>
            <DotsVerticalIcon className={classes.verticalDotIcon} />
          </ListItem>
        </List>
      </Fragment>
    );
  }
}
