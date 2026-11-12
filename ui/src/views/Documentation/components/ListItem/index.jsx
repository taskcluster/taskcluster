import React from 'react';
import ListItemText from '@mui/material/ListItemText';

export default function ListItem({ children, ...props }) {
  return (
    <li {...props}>
      <ListItemText>{children}</ListItemText>
    </li>
  );
}
