import Box, { type BoxProps } from '@mui/material/Box';

export default function List(props: BoxProps<'ul'>) {
  return <Box component="ul" sx={{ mb: 2 }} {...props} />;
}
