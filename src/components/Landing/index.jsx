import { Component } from 'react';
import { node, string } from 'prop-types';
import classNames from 'classnames';
import { withStyles } from 'material-ui/styles';
import PageTitle from '../PageTitle';
import ErrorPanel from '../ErrorPanel';

@withStyles(theme => ({
  root: {
    flexGrow: 1,
    minHeight: '100vh',
    zIndex: 1,
    overflow: 'hidden',
    position: 'relative',
    display: 'flex',
    width: '100vw',
  },
  content: {
    flexGrow: 1,
    backgroundColor: theme.palette.background,
    paddingBottom: theme.spacing.unit * 12,
    overflowY: 'auto',
    minHeight: '100vh',
  },
}))
export default class Dashboard extends Component {
  static propTypes = {
    children: node.isRequired,
    title: string,
  };

  static defaultProps = {
    title: '',
  };

  state = {
    error: null,
  };

  componentDidCatch(error) {
    this.setState({ error });
  }

  render() {
    const { classes, className, children, title, ...props } = this.props;
    const { error } = this.state;

    return (
      <div className={classes.root}>
        <PageTitle>{title}</PageTitle>
        <main className={classNames(classes.content, className)} {...props}>
          {error ? <ErrorPanel error={error} /> : children}
        </main>
      </div>
    );
  }
}
