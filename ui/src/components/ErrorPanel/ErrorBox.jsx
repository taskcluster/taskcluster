import CardContent from '@material-ui/core/CardContent';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import ErrorStackParser from 'error-stack-parser';
import { instanceOf } from 'prop-types';
import { RedBoxError } from 'redbox-react';

@withStyles({
  redbox: {
    width: '100%',
    color: 'white',
    textAlign: 'left',
    lineHeight: 1.2,
    overflow: 'auto',
  },
})
export default class ErrorBox extends RedBoxError {
  static propTypes = {
    error: instanceOf(Error).isRequired,
  };

  render() {
    // The error is received as a property to initialize state.error, which may
    // be updated when it is mapped to the source map.
    const { classes } = this.props;
    const { error } = this.state;

    try {
      const frames = ErrorStackParser.parse(error);

      return (
        <CardContent>
          <Typography className={classes.redbox}>{this.renderFrames(frames)}</Typography>
        </CardContent>
      );
    } catch (_err) {
      return (
        <CardContent>
          <Typography className={classes.redbox}>
            Failed to parse stack trace. Stack trace information unavailable.
          </Typography>
        </CardContent>
      );
    }
  }
}
