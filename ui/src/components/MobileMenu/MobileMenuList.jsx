import React, { Component, Fragment } from 'react';
import { withApollo } from 'react-apollo';
import List from '@material-ui/core/List';
import { withStyles } from '@material-ui/core/styles';
import ListItem from '@material-ui/core/ListItem';
import { withAuth } from '../../utils/Auth';
import DotsVerticalIcon from 'mdi-react/DotsVerticalIcon';
import { fade } from '@material-ui/core/styles/colorManipulator';
@withAuth
@withApollo
@withStyles(theme => ({
  active: {
    backgroundColor: theme.palette.secondary.dark,
    '&:hover': {
      backgroundColor: theme.palette.secondary.dark,
    },
    '& $text': {
      color: theme.palette.common.white,
    },
    '& $icon': {
      fill: fade(theme.palette.common.white, 0.9),
      '& svg': {
        fill: fade(theme.palette.common.white, 0.9),
      },
    },
  },
  mainMenu: {
    position: 'absolute',
    right: '16px',
  },
  verticalDotIcon: {
    fill: '#fff',
  },
  mobileMenu: {
    [theme.breakpoints.up('sm')]: {
      padding: '12px',
    },
    borderRadius: '50%',
  },
  text: {
    color: theme.palette.text.primary,
    fontFamily: 'Roboto500',
  },
  icon: {
    fill: theme.palette.text.primary,
  } 
}))
export default class MobileMenuList extends Component {
  render() {
    const {
      classes,
      onMenuClick,
    } = this.props;

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
