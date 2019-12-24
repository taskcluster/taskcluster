import React, { useState } from 'react';
import classNames from 'classnames';
import { string, func, number } from 'prop-types';
import Tab from '@material-ui/core/Tab';
import Tabs from '@material-ui/core/Tabs';
import TextField from '@material-ui/core/TextField';
import { withStyles } from '@material-ui/core/styles';
import { fade } from '@material-ui/core/styles/colorManipulator';
import { ReactGhLikeDiff } from 'react-gh-like-diff';
import 'react-gh-like-diff/lib/diff2html.css';

const styles = withStyles(theme => {
  const borderColor =
    theme.palette.type === 'light'
      ? fade(theme.palette.common.black, 0.23)
      : fade(theme.palette.common.white, 0.23);

  return {
    tab: {
      flexGrow: 1,
      color: theme.palette.text.primary,
      width: '100%',
    },
    tabContent: {
      marginTop: theme.spacing(1),
      padding: theme.spacing(1),
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
});

/**
 * An input text field with a diff view feature.
 * Refer to `mozilla-frontend-infra/components` MarkdownTextArea components
 * ref: https://github.com/mozilla-frontend-infra/components/blob/master/src/components/MarkdownTextArea/index.jsx
 */
function DiffTextArea(props) {
  const { classes, onChange, rows, initialValue, ...rest } = props;
  const [tabIndex, setTabIndex] = useState(props.defaultTabIndex);
  const [value, setValue] = useState(props.value);
  const isViewDiff = tabIndex === 1;
  const isNotEqualText = initialValue !== value;
  const isControlled =
    'value' in props && props.value !== undefined && props.value !== null;

  function handleValueChange(event) {
    if (isControlled) {
      setValue(event.target.value);

      return onChange(event);
    }

    setValue(event.target.value);
  }

  function handleTabChange(event, value) {
    setTabIndex(value);
  }

  return (
    <div className={classNames(classes.tab)}>
      <Tabs value={tabIndex} onChange={handleTabChange}>
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
            onChange={handleValueChange}
            fullWidth
            multiline
            rows={rows}
            {...rest}
            value={value}
          />
        )}
        {isViewDiff && isNotEqualText && (
          <ReactGhLikeDiff past={initialValue} current={value} />
        )}
      </div>
    </div>
  );
}

DiffTextArea.propTypes = {
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

DiffTextArea.defaultProps = {
  onChange: null,
  value: undefined,
  placeholder: null,
  defaultTabIndex: 0,
  rows: 5,
};

export default styles(DiffTextArea);
