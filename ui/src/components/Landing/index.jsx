import React, { Component } from 'react';
import { node, string } from 'prop-types';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import PageTitle from '../PageTitle';
import Helmet from '../Helmet';
import ErrorPanel from '../ErrorPanel';

@withStyles(theme => ({
  root: {
    flexGrow: 1,
    minHeight: '100vh',
    zIndex: 1,
    overflow: 'hidden',
    position: 'relative',
    display: 'flex',
    width: '100%',
  },
  content: {
    flexGrow: 1,
    backgroundColor: theme.palette.background,
    paddingBottom: theme.spacing(12),
    overflowY: 'auto',
    minHeight: '100vh',
  },
}))
/**
 * Render the layout for plain/non-application-based views.
 */
export default class Landing extends Component {
  static defaultProps = {
    title: '',
  };

  static propTypes = {
    /**
     * The content to render within the main view body.
     */
    children: node.isRequired,
    /**
     * An optional title to display in the title bar.
     */
    title: string,
  };

  static getDerivedStateFromError(error) {
    return { error };
  }

  state = {
    error: null,
  };

  render() {
    const { classes, className, children, title, ...props } = this.props;
    const { error } = this.state;

    return (
      <div className={classes.root}>
        <Helmet />
        <PageTitle>{title}</PageTitle>
        <main className={classNames(classes.content, className)} {...props}>
          {error ? <ErrorPanel fixed error={error} /> : children}
        </main>
      </div>
    );
  }
}
