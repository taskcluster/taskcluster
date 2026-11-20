import Typography, { type TypographyProps } from '@mui/material/Typography';

export default function ListItem(props: TypographyProps<'li'>) {
  return <Typography component="li" sx={{ my: 0.5 }} {...props} />;
}
