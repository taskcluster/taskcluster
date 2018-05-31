import { Component } from 'react';
import { object, string, func } from 'prop-types';
import { Controlled } from 'react-codemirror2';
import { withStyles } from '@material-ui/core/styles';
import 'codemirror/mode/xml/xml';
import 'codemirror/mode/yaml/yaml';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/addon/display/placeholder';
import 'codemirror/lib/codemirror.css';
import 'codemirror/addon/lint/lint.css';
import 'codemirror/theme/material.css';
import './yaml-lint';
import './styles.css';

@withStyles({
  root: {
    width: '100%',
  },
})
/** Render an editor */
export default class CodeEditor extends Component {
  static propTypes = {
    /** Callback function fired when the editor is changed. */
    onChange: func,
    /** The value of the editor. */
    value: string.isRequired,
    /** Code mirror options */
    options: object,
  };

  static defaultProps = {
    onChange: null,
    options: null,
  };

  handleTextUpdate = (editor, data, value) => {
    if (this.props.onChange) {
      this.props.onChange(value);
    }
  };

  render() {
    const { classes, value, onChange: _, ...options } = this.props;
    const opts = {
      mode: 'application/json',
      theme: 'material',
      indentWithTabs: false,
      gutters: ['CodeMirror-lint-markers'],
      lineNumbers: true,
      ...options,
    };

    return (
      <Controlled
        className={classes.root}
        options={opts}
        onBeforeChange={this.handleTextUpdate}
        value={value}
      />
    );
  }
}
