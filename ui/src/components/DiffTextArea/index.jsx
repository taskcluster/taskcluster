import React, { Component } from 'react';
import classNames from 'classnames';
import { string, func, number } from 'prop-types';
import Tab from '@material-ui/core/Tab';
import Tabs from '@material-ui/core/Tabs';
import TextField from '@material-ui/core/TextField';
import { withStyles } from '@material-ui/core/styles';
import { fade } from '@material-ui/core/styles/colorManipulator';
import { ReactGhLikeDiff } from 'react-gh-like-diff';
import 'react-gh-like-diff/lib/diff2html.css';

@withStyles(theme => {
  const borderColor =
    theme.palette.type === 'light'
      ? fade(theme.palette.common.black, 0.23)
      : fade(theme.palette.common.white, 0.23);

  return {
    tab: {
      flexGrow: 1,
      color: theme.palette.text.primary,
    },
    tabContent: {
      marginTop: theme.spacing.unit,
      padding: theme.spacing.unit,
    },
    diffContainer: {
      borderColor,
      borderWidth: 1,
      borderRadius: theme.shape.borderRadius,
      borderStyle: 'solid',
    },
    diffView: {
      color: theme.palette.type === 'dark' ? '#000' : 'black',
    },
  };
})
/**
 * An input text field with a diff view feature.
 * Refer to `mozilla-frontend-infra/components` MarkdownTextArea components
 * ref: https://github.com/mozilla-frontend-infra/components/blob/master/src/components/MarkdownTextArea/index.jsx
 */
export default class DiffTextArea extends Component {
  static propTypes = {
    /**
     * A function to handle changes to the diff text.
     * Required for a controlled component.
     */
    onChange: func,
    /**
     * The input value for the diff text.
     * Required for a controlled component.
     */
    value: string,
    /**
     * The initial value to compare with changed text
     */
    initialValue: string,
    /**
     * A placeholder value used for the diff text.
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

  static defaultProps = {
    onChange: null,
    value: undefined,
    placeholder: null,
    defaultTabIndex: 0,
    rows: 5,
  };

  constructor(props) {
    super(props);

    this.isControlled =
      'value' in props && props.value !== undefined && props.value !== null;
  }

  state = {
    tabIndex: this.props.defaultTabIndex,
    value: this.props.value,
  };

  handleValueChange = event => {
    const { onChange } = this.props;

    if (this.isControlled) {
      this.setState({ value: event.target.value });

      return onChange(event);
    }

    this.setState({ value: event.target.value });
  };

  handleTabChange = (event, value) => {
    this.setState({ tabIndex: value });
  };

  render() {
    const { classes, onChange, rows, initialValue, ...props } = this.props;
    const { tabIndex, value } = this.state;
    const isViewDiff = tabIndex === 1;

    return (
      <div className={classNames(classes.tab)}>
        <Tabs value={tabIndex} onChange={this.handleTabChange}>
          <Tab label="Scopes" />
          <Tab label="View Diff" />
        </Tabs>
        <div
          style={isViewDiff ? { minHeight: rows * 20 } : null}
          className={classNames(classes.tabContent, classes.diffView, {
            [classes.diffContainer]: isViewDiff,
          })}>
          {!isViewDiff && (
            <TextField
              onChange={this.handleValueChange}
              fullWidth
              multiline
              rows={rows}
              {...props}
              value={value}
            />
          )}
          {isViewDiff && (
            <ReactGhLikeDiff past={initialValue} current={value} />
          )}
        </div>
      </div>
    );
  }
}
