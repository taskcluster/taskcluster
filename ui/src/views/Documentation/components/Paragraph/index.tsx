import Typography, { type TypographyProps } from '@mui/material/Typography';

export default function Paragraph(props: TypographyProps) {
  return <Typography sx={{ mb: 2 }} {...props} />;
}
