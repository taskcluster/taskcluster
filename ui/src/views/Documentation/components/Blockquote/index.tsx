import Box, { type BoxProps } from '@mui/material/Box';

export default function Blockquote(props: BoxProps<'blockquote'>) {
  return (
    <Box
      component="blockquote"
      sx={theme => ({
        borderLeft: `5px solid ${theme.palette.text.hint}`,
        py: 0.5,
        px: 3,
        my: 3,
        mx: 0,
      })}
      {...props}
    />
  );
}
