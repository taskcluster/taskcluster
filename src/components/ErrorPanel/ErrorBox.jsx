import { instanceOf } from 'prop-types';
import { RedBoxError } from 'redbox-react';
import ErrorStackParser from 'error-stack-parser';
import { withStyles } from 'material-ui/styles';
import CardContent from 'material-ui/Card/CardContent';

@withStyles({
  redbox: {
    width: '100%',
    color: 'white',
    zIndex: 2147483647,
    textAlign: 'left',
    fontSize: 16,
    lineHeight: 1.2,
    overflow: 'auto'
  },
  stack: {
    fontFamily: 'monospace'
  },
  frame: {
    marginTop: '1em'
  }
})
export default class ErrorBox extends RedBoxError {
  static propTypes = {
    error: instanceOf(Error).isRequired
  };

  render() {
    // The error is received as a property to initialize state.error, which may
    // be updated when it is mapped to the source map.
    const { classes } = this.props;
    const { error } = this.state;

    try {
      const frames = ErrorStackParser.parse(error);

      return (
        <CardContent className={classes.redbox}>
          <div className={classes.stack}>{this.renderFrames(frames)}</div>
        </CardContent>
      );
    } catch (err) {
      return (
        <CardContent className={classes.redbox}>
          <div className={classes.stack}>
            <div className={classes.frame}>
              <div>
                Failed to parse stack trace. Stack trace information
                unavailable.
              </div>
            </div>
          </div>
        </CardContent>
      );
    }
  }
}
