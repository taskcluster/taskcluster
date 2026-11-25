import { useState } from 'react';
import { dump } from 'js-yaml';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import ContentCopyIcon from 'mdi-react/ContentCopyIcon';
import CheckIcon from 'mdi-react/CheckIcon';
import Code from '../Code';
import useCopyToClipboard from '../../utils/useCopyToClipboard';

type Syntax = 'yaml' | 'json';

function YamlJsonSwitch({
  value,
  onChange,
}: {
  value: Syntax;
  onChange: () => void;
}) {
  return (
    <Typography component="div">
      <Grid
        component="label"
        container
        spacing={1}
        sx={{
          alignItems: 'center',
        }}>
        <Grid>YAML</Grid>
        <Grid>
          <Switch
            checked={value === 'json'}
            onChange={onChange}
            name="yaml_json_switch"
          />
        </Grid>
        <Grid>JSON</Grid>
      </Grid>
    </Typography>
  );
}

export interface JsonDisplayProps {
  objectContent: object;
  syntax: Syntax;
  className?: string;
}

export default function JsonDisplay({
  objectContent,
  syntax,
  className,
}: JsonDisplayProps) {
  const [language, setLanguage] = useState(syntax);
  const { isCopy, copy } = useCopyToClipboard();
  const text =
    language === 'yaml'
      ? dump(objectContent)
      : JSON.stringify(objectContent, null, 2);

  return (
    <>
      <Grid container sx={{ alignItems: 'center' }}>
        <YamlJsonSwitch
          value={language}
          onChange={() => setLanguage(language === 'yaml' ? 'json' : 'yaml')}
        />
        <IconButton
          sx={{ ml: 1 }}
          title={isCopy ? 'Copied!' : 'Copy'}
          aria-label="copy to clipboard"
          onClick={() => copy(text)}>
          {isCopy ? <CheckIcon /> : <ContentCopyIcon />}
        </IconButton>
      </Grid>
      <Code language={language} className={className}>
        {text}
      </Code>
    </>
  );
}
