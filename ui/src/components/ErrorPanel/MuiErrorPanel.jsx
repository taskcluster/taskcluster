import React, { Component } from 'react';
import { bool, func, instanceOf, oneOfType, string } from 'prop-types';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import ExpansionPanel from '@material-ui/core/ExpansionPanel';
import ExpansionPanelDetails from '@material-ui/core/ExpansionPanelDetails';
import ExpansionPanelSummary from '@material-ui/core/ExpansionPanelSummary';
import IconButton from '@material-ui/core/IconButton';
import Paper from '@material-ui/core/Paper';
import ChevronDownIcon from 'mdi-react/ChevronDownIcon';
import CloseIcon from 'mdi-react/CloseIcon';
import ErrorBox from './ErrorBox';
import Markdown from '../Markdown';

@withStyles(
  theme => {
    const { warning } = theme.palette;

    return {
      panel: {
        marginBottom: 3 * theme.spacing(1),
      },
      paper: {
        padding: `0 ${2 * theme.spacing(1)}px`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      },
      // Make sure the markdown doesn't overflow the panel
      markdownContent: {
        minWidth: 0,
        overflow: 'auto',
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
        backgroundColor: warning.dark,
        borderColor: warning.light,
        '& svg': {
          fill: warning.contrastText,
        },
      },
      errorText: {
        color: theme.palette.error.contrastText,
      },
      warningText: {
        color: warning.contrastText,
      },
      disabled: {
        opacity: 1,
      },
      heading: {
        fontSize: theme.typography.pxToRem(15),
        fontWeight: theme.typography.fontWeightRegular,
      },
    };
  },
  { withTheme: true }
)
/**
 * Render an error in a panel. Will be expandable display stack traces
 * when in development
 *
 * _Note: [material-ui](https://material-ui.com/) is a peer-dependency_
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
    /**
     * If false, the error will show its stack trace in addition
     * to the error message. For security purposes,
     * it is recommended to disable stack traces in production. */
    disableStackTrace: bool,
  };

  static defaultProps = {
    warning: false,
    className: null,
    disableStackTrace: true,
    onClose: null,
  };

  render() {
    const {
      theme,
      classes,
      className,
      disableStackTrace,
      error,
      warning,
      onClose,
    } = this.props;
    const showStack = !disableStackTrace && error instanceof Error;
    const markdown = (
      <Markdown
        className={classNames(classes.markdownContent, {
          [classes.errorText]: !warning,
          [classes.warningText]: warning,
          [classes.pad]: !showStack,
        })}>
        {typeof error === 'string' ? error : error.message}
      </Markdown>
    );
    const iconColor = warning
      ? theme.palette.warning.contrastText
      : theme.palette.error.contrastText;

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
              <CloseIcon color={iconColor} />
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
          expandIcon={<ChevronDownIcon color={iconColor} />}>
          {markdown}
        </ExpansionPanelSummary>
        <ExpansionPanelDetails>
          <ErrorBox error={error} />
        </ExpansionPanelDetails>
      </ExpansionPanel>
    );
  }
}
