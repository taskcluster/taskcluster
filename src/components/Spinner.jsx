import { PureComponent } from 'react';
import { object } from 'prop-types';
import { withStyles } from 'material-ui/styles';

const styles = () => ({
  spinner: {
    textAlign: 'center',
    marginTop: '2rem'
  },
  line: {
    stroke: '#000',
    strokeWidth: 1.3
  },
  back: {
    fill: '#fff',
    stroke: '#000',
    strokeWidth: 2
  },
  dot: {
    fill: '#000',
    stroke: '#000',
    strokeWidth: 0.4
  },
  center: {
    fill: '#000',
    stroke: '#000',
    strokeWidth: 1.0
  },
  '@keyframes spin': {
    '0%': {
      transform: 'rotate(0deg)'
    },
    '100%': {
      transform: 'rotate(360deg)'
    }
  },
  spin: {
    animation: 'spin 3s infinite linear'
  }
});

// These are roughly in clockwise order starting from the northwest
class Spinner extends PureComponent {
  static propTypes = {
    classes: object.isRequired
  };

  render() {
    const { classes } = this.props;

    return (
      <div className={classes.spinner}>
        <svg height="48" width="48">
          <g transform="translate(24 24)">
            <g className={classes.spin}>
              <circle cx="0" cy="0" r="23" className={classes.back} />
              <line x1="0" y1="0" x2="-13" y2="-13" className={classes.line} />
              <circle cx="-13" cy="-13" r="2.5" className={classes.dot} />
              <line x1="0" y1="0" x2="-3" y2="-9" className={classes.line} />
              <circle cx="-3" cy="-9" r="2.5" className={classes.dot} />
              <line x1="0" y1="0" x2="3" y2="-17" className={classes.line} />
              <circle cx="3" cy="-17" r="2.5" className={classes.dot} />
              <line x1="0" y1="0" x2="8" y2="-9" className={classes.line} />
              <circle cx="8" cy="-9" r="2.5" className={classes.dot} />
              <line x1="0" y1="0" x2="16" y2="-7" className={classes.line} />
              <circle cx="16" cy="-7" r="2.5" className={classes.dot} />
              <line x1="0" y1="0" x2="13" y2="-1" className={classes.line} />
              <circle cx="13" cy="-1" r="2.5" className={classes.dot} />
              <line x1="0" y1="0" x2="15" y2="5" className={classes.line} />
              <circle cx="15" cy="5" r="2.5" className={classes.dot} />
              <line x1="0" y1="0" x2="8" y2="8" className={classes.line} />
              <circle cx="8" cy="8" r="2.5" className={classes.dot} />
              <line x1="0" y1="0" x2="7" y2="16" className={classes.line} />
              <circle cx="7" cy="16" r="2.5" className={classes.dot} />
              <line x1="0" y1="0" x2="-1" y2="14" className={classes.line} />
              <circle cx="-1" cy="14" r="2.5" className={classes.dot} />
              <line x1="0" y1="0" x2="-8" y2="15" className={classes.line} />
              <circle cx="-8" cy="15" r="2.5" className={classes.dot} />
              <line x1="0" y1="0" x2="-10" y2="7" className={classes.line} />
              <circle cx="-10" cy="7" r="2.5" className={classes.dot} />
              <line x1="0" y1="0" x2="-17" y2="3" className={classes.line} />
              <circle cx="-17" cy="3" r="2.5" className={classes.dot} />
              <line x1="0" y1="0" x2="-10" y2="-4" className={classes.line} />
              <circle cx="-10" cy="-4" r="2.5" className={classes.dot} />
              <circle cx="0" cy="0" r="4" className={classes.center} />
            </g>
          </g>
        </svg>
      </div>
    );
  }
}

export default withStyles(styles)(Spinner);
