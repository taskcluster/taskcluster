import classNames from 'classnames';
import { string, func, number } from 'prop-types';
import React, { Component } from 'react';
import Markdown from '@mozilla-frontend-infra/components/Markdown';
import Tab from '@material-ui/core/Tab';
import Tabs from '@material-ui/core/Tabs';
import TextField from '@material-ui/core/TextField';
import { withStyles } from '@material-ui/core/styles';
import { fade } from '@material-ui/core/styles/colorManipulator';
import { THEME } from '../../utils/constants';

@withStyles(theme => {
  const borderColor =
    theme.palette.type === 'light'
      ? fade(THEME.BLACK, 0.23)
      : fade(THEME.WHITE, 0.23);

  return {
    tab: {
      flexGrow: 1,
    },
    tabContent: {
      marginTop: theme.spacing.unit,
      padding: theme.spacing.unit,
    },
    markdownContainer: {
      borderColor,
      borderWidth: 1,
      borderRadius: theme.shape.borderRadius,
      borderStyle: 'solid',
    },
  };
})

/**
 * An input text field with a markdown preview feature.
 */
export default class MarkdownTextArea extends Component {
  static defaultProps = {
    onChange: null,
    value: undefined,
    placeholder: null,
    defaultTabIndex: 0,
    rows: 5,
  };

  static propTypes = {
    /**
     * A function to handle changes to the markdown text.
     * Required for a controlled component.
     */
    onChange: func,
    /**
     * The input value for the markdown text.
     * Required for a controlled component.
     */
    value: string,
    /**
     * A placeholder value used for the markdown text.
     */
    placeholder: string,
    /**
     * An index number used to control which tab is selected as default.
     */
    defaultTabIndex: number,
    /**
     * A number used to control the amount of rows displayed for the input area.
     */
    rows: number,
  };

  constructor(props) {
    super(props);

    this.isControlled =
      'value' in props && props.value !== undefined && props.value !== null;
  }

  state = {
    tabIndex: this.props.defaultTabIndex,
    value: '',
  };

  handleValueChange = event => {
    const { onChange } = this.props;

    if (this.isControlled) {
      return onChange(event);
    }

    this.setState({ value: event.target.value });
  };

  handleTabChange = (event, value) => {
    this.setState({ tabIndex: value });
  };

  render() {
    const { placeholder, classes, onChange, rows, ...props } = this.props;
    const { tabIndex, value } = this.state;

    return (
      <div className={classNames(classes.tab)}>
        <Tabs value={tabIndex} onChange={this.handleTabChange}>
          <Tab label="Write" />
          <Tab label="Preview" />
        </Tabs>
        <div
          className={classNames(classes.tabContent, {
            [classes.markdownContainer]: tabIndex === 1,
          })}>
          {tabIndex === 0 && (
            <TextField
              name="Write"
              placeholder={placeholder}
              onChange={this.handleValueChange}
              fullWidth
              multiline
              rows={rows}
              value={props.value || value}
            />
          )}
          {tabIndex === 1 && <Markdown>{props.value || value}</Markdown>}
        </div>
      </div>
    );
  }
}
