import { describe, it, expect } from 'vitest';
import { substituteSiteSpecific } from './siteSpecific';

describe('substituteSiteSpecific', () => {
  const variables = {
    root_url: 'https://tc.example.com',
    notify_email_sender: 'noreply@example.com',
  };

  it('replaces known placeholders with their value', () => {
    expect(substituteSiteSpecific('root URL is %root_url%', variables)).toBe(
      'root URL is https://tc.example.com'
    );
  });

  it('replaces every occurrence', () => {
    expect(substituteSiteSpecific('%root_url%/a %root_url%/b', variables)).toBe(
      'https://tc.example.com/a https://tc.example.com/b'
    );
  });

  it('yields an empty string for a known but unset variable', () => {
    expect(
      substituteSiteSpecific('bot: %notify_slack_bot_name%', variables)
    ).toBe('bot: ');
  });

  it('throws for an unknown variable', () => {
    expect(() => substituteSiteSpecific('%not_a_var%', variables)).toThrow(
      /No such site-specific variable not_a_var/
    );
  });
});
