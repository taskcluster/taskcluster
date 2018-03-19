import { Component } from 'react';
import { instanceOf, oneOfType, string } from 'prop-types';
import { withStyles } from 'material-ui/styles';
import Typography from 'material-ui/Typography';
import ExpansionPanel, {
  ExpansionPanelSummary,
  ExpansionPanelDetails,
} from 'material-ui/ExpansionPanel';
import ChevronDownIcon from 'mdi-react/ChevronDownIcon';
import ErrorBox from './ErrorBox';

@withStyles(theme => ({
  panel: {
    color: theme.palette.error.contrastText,
    backgroundColor: theme.palette.error.main,
    borderColor: theme.palette.error.light,
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
  };

  render() {
    const { classes, error } = this.props;
    const showStack =
      process.env.NODE_ENV === 'development' && error instanceof Error;

    return (
      <ExpansionPanel className={classes.panel} disabled={!showStack}>
        <ExpansionPanelSummary
          classes={{ disabled: classes.disabled }}
          expandIcon={showStack ? <ChevronDownIcon /> : null}>
          <Typography className={classes.heading}>
            {typeof error === 'string' ? error : error.message}
          </Typography>
        </ExpansionPanelSummary>
        {showStack && (
          <ExpansionPanelDetails>
            <ErrorBox error={error} />
          </ExpansionPanelDetails>
        )}
      </ExpansionPanel>
    );
  }
}
