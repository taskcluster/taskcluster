import React, { Component } from 'react';
import Markdown from '@mozilla-frontend-infra/components/Markdown';
import ListItem from '@material-ui/core/ListItem';
import Tab from '@material-ui/core/Tab';
import Tabs from '@material-ui/core/Tabs';
import TextField from '@material-ui/core/TextField';

export default class Preview extends Component {
  state = {
    value: 0,
  };

  handleChange = (event, value) => {
    this.setState({ value });
  };

  render() {
    const { description, onDescriptionChange, placeholder } = this.props;
    const { value } = this.state;

    return (
      <div>
        <ListItem>
          <Tabs value={value} onChange={this.handleChange}>
            <Tab label="Description" />
            <Tab label="Preview" />
          </Tabs>
        </ListItem>
        <ListItem>
          {value === 0 && (
            <TextField
              name="description"
              placeholder={placeholder}
              onChange={onDescriptionChange}
              fullWidth
              multiline
              rows={10}
              value={description}
            />
          )}
          {value === 1 && <Markdown>{description}</Markdown>}
        </ListItem>
      </div>
    );
  }
}
