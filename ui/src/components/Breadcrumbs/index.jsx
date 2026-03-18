import MuiBreadcrumbs from '@material-ui/core/Breadcrumbs';
import Paper from '@material-ui/core/Paper';
import { withStyles } from '@material-ui/core/styles';
import classNames from 'classnames';
import NavigateNextIcon from 'mdi-react/NavigateNextIcon';
import { node, object } from 'prop-types';
import { omit } from 'ramda';
import { Component } from 'react';

@withStyles((theme) => ({
  paper: {
    padding: `${theme.spacing(2)}px ${theme.spacing(2)}px`,
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
      <Paper elevation={2} className={classNames(classes.paper, paperProps.className)} {...paperPropsRest}>
        <MuiBreadcrumbs separator={<NavigateNextIcon />} aria-label="Breadcrumb" {...props}>
          {children}
        </MuiBreadcrumbs>
      </Paper>
    );
  }
}
