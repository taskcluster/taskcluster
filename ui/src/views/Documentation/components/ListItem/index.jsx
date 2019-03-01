import React from 'react';
import ListItemText from '@material-ui/core/ListItemText';

export default function ListItem({ children, ...props }) {
  return (
    <li {...props}>
      <ListItemText>{children}</ListItemText>
    </li>
  );
}
