import React, { useMemo, useState } from 'react';
import classNames from 'classnames';
import { bool, string, func, number } from 'prop-types';
import Tab from '@material-ui/core/Tab';
import Tabs from '@material-ui/core/Tabs';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import {
  alpha,
  darken,
  lighten,
  useTheme,
  withStyles,
} from '@material-ui/core/styles';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';

const diffStyles = theme => {
  const makeVariables = ({ tone, textColor, line, word, gutter }) => ({
    diffViewerBackground: theme.palette.background.paper,
    diffViewerColor: textColor,
    addedBackground: tone(theme.palette.success.main, line),
    addedColor: textColor,
    removedBackground: tone(theme.palette.error.main, line),
    removedColor: textColor,
    wordAddedBackground: tone(theme.palette.success.main, word),
    wordRemovedBackground: tone(theme.palette.error.main, word),
    addedGutterBackground: tone(theme.palette.success.main, gutter),
    removedGutterBackground: tone(theme.palette.error.main, gutter),
    gutterBackground: theme.palette.background.default,
    gutterBackgroundDark: theme.palette.background.default,
    gutterColor: theme.palette.text.secondary,
    addedGutterColor: textColor,
    removedGutterColor: textColor,
    emptyLineBackground: theme.palette.action.hover,
  });

  return {
    variables: {
      light: makeVariables({
        tone: lighten,
        textColor: theme.palette.common.black,
        line: 0.7,
        word: 0.4,
        gutter: 0.55,
      }),
      dark: makeVariables({
        tone: darken,
        textColor: theme.palette.common.white,
        line: 0.5,
        word: 0.32,
        gutter: 0.4,
      }),
    },
    diffContainer: { minWidth: 'unset' },
  };
};

const styles = withStyles(theme => {
  const borderColor =
    theme.palette.type === 'light'
      ? alpha(theme.palette.common.black, 0.23)
      : alpha(theme.palette.common.white, 0.23);

  return {
    tab: {
      flexGrow: 1,
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
  };
});

/**
 * An input text field with a diff view feature.
 * Refer to the MarkdownTextArea component
 */
function DiffTextArea(props) {
  const {
    classes,
    onChange,
    rows,
    initialValue,
    sort,
    defaultTabIndex,
    ...rest
  } = props;
  const theme = useTheme();
  const diffViewerStyles = useMemo(() => diffStyles(theme), [theme]);
  const [tabIndex, setTabIndex] = useState(defaultTabIndex);
  const [value, setValue] = useState(props.value);
  const isViewDiff = tabIndex === 1;
  const isControlled =
    'value' in props && props.value !== undefined && props.value !== null;
  const isSorted =
    'sort' in props && props.sort !== undefined && props.sort !== null;
  const pastValue = isSorted
    ? initialValue.split('\n').sort().join('\n')
    : initialValue;
  const currentValue = isSorted ? value.split('\n').sort().join('\n') : value;
  const isNotEqualText = pastValue !== currentValue;

  function handleValueChange(event) {
    if (isControlled) {
      setValue(event.target.value);

      return onChange(event);
    }

    setValue(event.target.value);
  }

  function handleTabChange(_event, value) {
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
        className={classNames(classes.tabContent, {
          [classes.diffContainer]: isViewDiff,
        })}>
        {!isViewDiff && (
          <TextField
            color="secondary"
            onChange={handleValueChange}
            fullWidth
            multiline
            rows={rows}
            {...rest}
            value={value}
          />
        )}
        {isViewDiff && isNotEqualText && (
          <ReactDiffViewer
            oldValue={pastValue}
            newValue={currentValue}
            splitView
            hideSummary
            compareMethod={DiffMethod.WORDS}
            useDarkTheme={theme.palette.type === 'dark'}
            styles={diffViewerStyles}
          />
        )}
        {isViewDiff && !isNotEqualText && (
          <Typography>Nothing has changed yet</Typography>
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
  /**
   * If true, the content will be sorted prior to computing the diff.
   */
  sort: bool,
};

DiffTextArea.defaultProps = {
  sort: false,
  onChange: null,
  value: undefined,
  placeholder: null,
  defaultTabIndex: 0,
  rows: 5,
};

export default styles(DiffTextArea);
