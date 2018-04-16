import { Component } from 'react';
import { bool, func, string } from 'prop-types';
import { withStyles } from 'material-ui/styles';
import { fade } from 'material-ui/styles/colorManipulator';
import FormControl from 'material-ui/Form/FormControl';
import MagnifyIcon from 'mdi-react/MagnifyIcon';

@withStyles(theme => ({
  root: {
    background: fade(theme.palette.primary.main, 0.5),
    borderRadius: 2,
    '&:hover': {
      background: fade(theme.palette.primary.main, 0.9),
    },
    '& $input': {
      transition: theme.transitions.create('width'),
      width: 180,
      '&:focus': {
        width: 300,
      },
    },
  },
  search: {
    width: theme.spacing.unit * 6,
    height: '100%',
    position: 'absolute',
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    '& svg': {
      fill: fade(theme.palette.common.white, 0.5),
    },
  },
  input: {
    font: 'inherit',
    paddingTop: theme.spacing.unit,
    paddingRight: theme.spacing.unit,
    paddingBottom: theme.spacing.unit,
    paddingLeft: theme.spacing.unit * 7,
    border: 0,
    display: 'block',
    verticalAlign: 'middle',
    whiteSpace: 'normal',
    background: 'none',
    margin: 0, // Reset for Safari
    color: fade(theme.palette.primary.contrastText, 0.5),
    width: '100%',
    '&:focus': {
      color: fade(theme.palette.primary.contrastText, 0.9),
      outline: 0,
    },
  },
}))
/**
 * An app-bar compatible controlled search field for entering task IDs.
 */
export default class TaskSearch extends Component {
  static propTypes = {
    /**
     * The search field value.
     */
    value: string.isRequired,
    /**
     * A function to execute when the search field value changes.
     */
    onChange: func.isRequired,
    /**
     * A function to execute when the search form has been submitted.
     */
    onSubmit: func.isRequired,
    /**
     * Set to `true` to enable spell-check on the search field.
     */
    spellCheck: bool,
  };

  static defaultProps = {
    spellCheck: false,
  };

  render() {
    const { classes, value, onChange, onSubmit, spellCheck } = this.props;

    return (
      <form onSubmit={onSubmit} className={classes.root}>
        <FormControl>
          <div className={classes.search}>
            <MagnifyIcon />
          </div>
          <input
            id="adornment-task-search"
            spellCheck={spellCheck}
            placeholder="Search"
            className={classes.input}
            type="text"
            value={value}
            onChange={onChange}
          />
        </FormControl>
      </form>
    );
  }
}
