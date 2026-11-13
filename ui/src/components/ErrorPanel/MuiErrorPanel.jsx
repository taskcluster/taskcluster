import React, { Component } from 'react';
import { bool, func, instanceOf, oneOfType, string } from 'prop-types';
import classNames from 'classnames';
import withStyles from '../../utils/withStyles';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import CloseIcon from 'mdi-react/CloseIcon';
import Markdown from '../Markdown';

@withStyles(
  theme => {
    const { warning } = theme.palette;

    return {
      panel: {
        marginBottom: theme.spacing(3),
      },
      paper: {
        padding: `0 ${theme.spacing(2)}`,
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
    };
  },
  { withTheme: true }
)
/**
 * Render an error in a panel.
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
  };

  static defaultProps = {
    warning: false,
    className: null,
    onClose: null,
  };

  render() {
    const { theme, classes, className, error, warning, onClose } = this.props;
    const markdown = (
      <Markdown
        className={classNames(classes.markdownContent, classes.pad, {
          [classes.errorText]: !warning,
          [classes.warningText]: warning,
        })}>
        {typeof error === 'string' ? error : error.message}
      </Markdown>
    );
    const iconColor = warning
      ? theme.palette.warning.contrastText
      : theme.palette.error.contrastText;

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
          <IconButton onClick={onClose} size="large">
            <CloseIcon color={iconColor} />
          </IconButton>
        )}
      </Paper>
    );
  }
}
