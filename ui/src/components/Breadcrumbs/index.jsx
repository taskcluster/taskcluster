import React, { Component } from 'react';
import { node, object } from 'prop-types';
import classNames from 'classnames';
import { omit } from 'ramda';
import withStyles from '../../utils/withStyles';
import Paper from '@mui/material/Paper';
import MuiBreadcrumbs from '@mui/material/Breadcrumbs';
import NavigateNextIcon from 'mdi-react/NavigateNextIcon';

@withStyles(theme => ({
  paper: {
    padding: `${theme.spacing(2)} ${theme.spacing(2)}`,
  },
}))
export default class Breadcrumbs extends Component {
  static propTypes = {
    // Properties applied to the Paper component.
    paperProps: object,
    // The breadcrumb children.
    children: node.isRequired,
  };

  static defaultProps = {
    paperProps: {},
  };

  render() {
    const { classes, paperProps, children, ...props } = this.props;
    const paperPropsRest = omit(['className'], paperProps);

    return (
      <Paper
        elevation={2}
        className={classNames(classes.paper, paperProps.className)}
        {...paperPropsRest}>
        <MuiBreadcrumbs
          separator={<NavigateNextIcon />}
          aria-label="Breadcrumb"
          {...props}>
          {children}
        </MuiBreadcrumbs>
      </Paper>
    );
  }
}
