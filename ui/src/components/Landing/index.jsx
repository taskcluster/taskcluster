import React, { Component } from 'react';
import { node, string } from 'prop-types';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import { ErrorBoundary } from 'react-error-boundary';
import PageTitle from '../PageTitle';
import Helmet from '../Helmet';
import reportError from '../../utils/reportError';
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

  render() {
    const { classes, className, children, title, ...props } = this.props;

    return (
      <div className={classes.root}>
        <Helmet />
        <PageTitle>{title}</PageTitle>
        <main className={classNames(classes.content, className)} {...props}>
          <ErrorBoundary FallbackComponent={ErrorPanel} onError={reportError}>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    );
  }
}
