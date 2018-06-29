import { Component } from 'react';
import { bool, func, instanceOf, oneOfType, string } from 'prop-types';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import { lighten } from '@material-ui/core/styles/colorManipulator';
import ExpansionPanel from '@material-ui/core/ExpansionPanel';
import ExpansionPanelDetails from '@material-ui/core/ExpansionPanelDetails';
import ExpansionPanelSummary from '@material-ui/core/ExpansionPanelSummary';
import IconButton from '@material-ui/core/IconButton';
import Paper from '@material-ui/core/Paper';
import ChevronDownIcon from 'mdi-react/ChevronDownIcon';
import CloseIcon from 'mdi-react/CloseIcon';
import ErrorBox from './ErrorBox';
import Markdown from '../Markdown';

@withStyles(theme => ({
  panel: {
    marginBottom: theme.spacing.triple,
  },
  paper: {
    padding: `0 ${theme.spacing.double}px`,
    display: 'flex',
    justifyContent: 'space-between',
  },
  pad: {
    paddingTop: 9,
    paddingBottom: 9,
  },
  error: {
    backgroundColor: theme.palette.error.dark,
    borderColor: theme.palette.error.light,
  },
  warning: {
    backgroundColor: theme.palette.warning.dark,
    borderColor: theme.palette.warning.light,
    '& svg': {
      fill: theme.palette.warning.contrastText,
    },
  },
  errorText: {
    color: theme.palette.error.contrastText,
  },
  warningText: {
    color: theme.palette.warning.contrastText,
    '& code': {
      color: lighten(theme.palette.warning.contrastText, 0.2),
      fontWeight: 'bold',
    },
  },
  disabled: {
    opacity: 1,
  },
  heading: {
    fontSize: theme.typography.pxToRem(15),
    fontWeight: theme.typography.fontWeightRegular,
  },
}))
/**
 * Render an error in a panel. Will be expandable display stack traces
 * when in development
 */
export default class ErrorPanel extends Component {
  static propTypes = {
    /** Error to display */
    error: oneOfType([string, instanceOf(Error)]).isRequired,
    /**
     * Render the panel with a warning palette instead of the
     * harsher error palette.
     */
    warning: bool,
    /** Execute a function to make the panel controlled-closeable. */
    onClose: func,
    /** The CSS class name of the wrapper element */
    className: string,
  };

  static defaultProps = {
    warning: false,
    className: null,
  };

  render() {
    const { classes, className, error, warning, onClose } = this.props;
    const showStack =
      process.env.NODE_ENV === 'development' && error instanceof Error;
    const markdown = (
      <Markdown
        className={classNames({
          [classes.errorText]: !warning,
          [classes.warningText]: warning,
          [classes.pad]: !showStack,
        })}>
        {typeof error === 'string' ? error : error.message}
      </Markdown>
    );

    if (!showStack) {
      return (
        <Paper
          className={classNames(
            classes.panel,
            classes.paper,
            {
              [classes.error]: !warning,
              [classes.warning]: warning,
            },
            className
          )}>
          {markdown}
          {onClose && (
            <IconButton onClick={onClose}>
              <CloseIcon />
            </IconButton>
          )}
        </Paper>
      );
    }

    return (
      <ExpansionPanel
        className={classNames(
          classes.panel,
          {
            [classes.error]: !warning,
            [classes.warning]: warning,
          },
          className
        )}
        disabled={!showStack}>
        <ExpansionPanelSummary
          classes={{ disabled: classes.disabled }}
          expandIcon={<ChevronDownIcon />}>
          {markdown}
        </ExpansionPanelSummary>
        <ExpansionPanelDetails>
          <ErrorBox error={error} />
        </ExpansionPanelDetails>
      </ExpansionPanel>
    );
  }
}
