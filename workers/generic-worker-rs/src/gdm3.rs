//! GDM3 (Gnome Desktop Manager 3) auto-login configuration.
//!
//! Provides functions for parsing and modifying the GDM3 custom.conf INI file
//! to enable automatic desktop login, and for determining the interactively
//! logged-in user.

use anyhow::{bail, Result};
use regex::Regex;

/// Parse the GDM3 custom.conf file contents and return an updated version
/// with automatic desktop login enabled for the given username.
///
/// This removes any existing `AutomaticLogin` and `AutomaticLoginEnable`
/// settings from the `[daemon]` section and replaces them with the correct
/// values for the specified user.
pub fn set_auto_login(username: &str, source: &[u8]) -> Vec<u8> {
    let automatic_login = Regex::new(r"^\s*AutomaticLogin\s*=").unwrap();
    let automatic_login_enable = Regex::new(r"^\s*AutomaticLoginEnable\s*=").unwrap();

    let mut new_lines_added = false;
    let mut output_lines: Vec<String> = Vec::new();

    ini_file_line_handler(source, |section: &str, line: &str| {
        match section {
            "daemon" => {
                if automatic_login.is_match(line) {
                    // discard any lines that set AutomaticLogin
                } else if automatic_login_enable.is_match(line) {
                    // discard any lines that set AutomaticLoginEnable
                } else {
                    // retain all other lines
                    output_lines.push(line.to_string());
                }
                if !new_lines_added {
                    // We've just entered [daemon] section, so set autologin settings
                    // immediately, and flag that we've done it, so we only add this once.
                    output_lines.push("# Set by generic-worker".to_string());
                    output_lines.push("AutomaticLoginEnable = true".to_string());
                    output_lines.push(format!("AutomaticLogin = {}", username));
                    output_lines.push(String::new());
                    new_lines_added = true;
                }
            }
            _ => {
                // retain all lines of all other sections
                output_lines.push(line.to_string());
            }
        }
    });

    output_lines.join("\n").into_bytes()
}

/// Split the INI file contents into lines separated by '\n', tracking which
/// INI section each line is in, and call the callback for each line with
/// the section name and the raw line.
fn ini_file_line_handler<F>(data: &[u8], mut callback: F)
where
    F: FnMut(&str, &str),
{
    let text = String::from_utf8_lossy(data);
    let mut section = String::new();
    for line in text.split('\n') {
        let trimmed = line.trim();
        if trimmed.len() > 1 && trimmed.starts_with('[') && trimmed.ends_with(']') {
            section = trimmed[1..trimmed.len() - 1].to_string();
        }
        callback(&section, line);
    }
}

/// Determine the interactively logged-in user.
///
/// On non-FreeBSD systems, runs `w | grep gnome-session | cut -f1 -d' '`
/// to find the interactive user.
///
/// On FreeBSD, reads from `current-task-user.json`.
#[cfg(not(target_os = "freebsd"))]
pub fn interactive_username() -> Result<String> {
    let output = crate::host::output(
        "/usr/bin/env",
        &[
            "bash",
            "-c",
            "PROCPS_USERLEN=20 /usr/bin/w | /bin/grep gnome-[s]ession | /usr/bin/cut -f1 -d' '",
        ],
    )?;

    let lines: Vec<&str> = output.split('\n').collect();
    if lines.len() != 2 || !lines[1].is_empty() {
        bail!(
            "number of gnome session users is not exactly one - not sure which user is interactively logged on: {:?}",
            lines
        );
    }
    Ok(lines[0].to_string())
}

/// Determine the interactively logged-in user on FreeBSD.
///
/// Reads from `current-task-user.json` as a workaround until gnome desktop
/// is running in real FreeBSD worker pools.
#[cfg(target_os = "freebsd")]
pub fn interactive_username() -> Result<String> {
    use std::collections::HashMap;
    use std::fs::File;
    use std::io::BufReader;

    let file = File::open("current-task-user.json")?;
    let reader = BufReader::new(file);
    let user: HashMap<String, String> = serde_json::from_reader(reader)?;
    user.get("name")
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("no 'name' field in current-task-user.json"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_set_auto_login_basic() {
        let input = b"[daemon]\nSomeOther = value\n\n[security]\nAllowRoot = true\n";
        let result = set_auto_login("testuser", input);
        let output = String::from_utf8(result).unwrap();
        assert!(output.contains("AutomaticLoginEnable = true"));
        assert!(output.contains("AutomaticLogin = testuser"));
        assert!(output.contains("# Set by generic-worker"));
    }

    #[test]
    fn test_set_auto_login_replaces_existing() {
        let input =
            b"[daemon]\nAutomaticLogin = olduser\nAutomaticLoginEnable = false\nOther = val\n";
        let result = set_auto_login("newuser", input);
        let output = String::from_utf8(result).unwrap();
        assert!(output.contains("AutomaticLogin = newuser"));
        assert!(output.contains("AutomaticLoginEnable = true"));
        assert!(!output.contains("olduser"));
        assert!(!output.contains("false"));
        assert!(output.contains("Other = val"));
    }
}
