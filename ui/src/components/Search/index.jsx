import React, { PureComponent } from 'react';
import { object, func, string, bool } from 'prop-types';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import { fade } from '@material-ui/core/styles/colorManipulator';
import FormControl from '@material-ui/core/FormControl';
import MagnifyIcon from 'mdi-react/MagnifyIcon';
import { THEME } from '../../utils/constants';

@withStyles(theme => ({
  root: {
    background: fade(THEME.PRIMARY_DARK, 0.5),
    borderRadius: 2,
    '&:hover': {
      background: fade(THEME.PRIMARY_DARK, 0.9),
    },
    '& $input': {
      transition: theme.transitions.create('width'),
      width: 230,
      '&:focus': {
        width: 300,
      },
    },
  },
  formControl: {
    width: '100%',
  },
  search: {
    width: theme.spacing(6),
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
    fontSize: theme.typography.body1.fontSize,
    font: 'inherit',
    paddingTop: theme.spacing(1),
    paddingRight: theme.spacing(1),
    paddingBottom: theme.spacing(1),
    paddingLeft: theme.spacing(6),
    border: 0,
    display: 'block',
    verticalAlign: 'middle',
    whiteSpace: 'normal',
    background: 'none',
    margin: 0, // Reset for Safari
    color: fade(THEME.PRIMARY_TEXT_DARK, 0.5),
    width: '100%',
    '&:focus': {
      color: fade(THEME.PRIMARY_TEXT_DARK, 0.9),
      outline: 0,
    },
  },
}))
/**
 * An app-bar compatible controlled search field.
 */
export default class Search extends PureComponent {
  static defaultProps = {
    spellCheck: false,
    value: undefined,
    onChange: null,
    defaultValue: undefined,
    formProps: {},
  };

  static propTypes = {
    /**
     * A function to execute when the search form has been submitted.
     * The function will provided with the search value trimmed from any
     * leading/trailing whitespaces. */
    onSubmit: func.isRequired,
    /** Set to `true` to enable spell-check on the search field. */
    spellCheck: bool,
    /**
     * The input value, required for a controlled component.
     */
    value: string,
    /**
     * Callback fired when the value is changed.
     *
     * You can pull out the new value by accessing `event.target.value`.
     */
    onChange: func,
    /**
     * The default value of the `Input` element.
     *
     * To use it on a controlled input requires the `value` prop
     * to initially be set to null.
     * */
    defaultValue: string,
    /**
     * Properties applied to the form element.
     * */
    formProps: object,
  };

  constructor(props) {
    super(props);

    this.isControlled =
      'value' in props && props.value !== undefined && props.value !== null;
  }

  state = {
    value: '',
  };

  handleInputChange = e => {
    const { onChange } = this.props;

    if (this.isControlled) {
      return onChange(e);
    }

    this.setState({ value: e.target.value });
  };

  handleInputSubmit = e => {
    e.preventDefault();

    this.props.onSubmit(this.state.value.trim());
  };

  render() {
    const {
      classes,
      onSubmit,
      onChange,
      spellCheck,
      className,
      formProps,
      ...props
    } = this.props;
    const { value } = this.state;

    return (
      <form
        onSubmit={this.handleInputSubmit}
        {...formProps}
        className={classNames(classes.root, formProps.className)}>
        <FormControl className={classes.formControl}>
          <div className={classes.search}>
            <MagnifyIcon />
          </div>
          <input
            id="adornment-search"
            spellCheck={spellCheck}
            placeholder="Search"
            className={classNames(classes.input, className)}
            type="text"
            value={value}
            onChange={this.handleInputChange}
            {...props}
          />
        </FormControl>
      </form>
    );
  }
}
