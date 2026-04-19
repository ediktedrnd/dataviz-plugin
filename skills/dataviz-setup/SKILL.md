---
name: dataviz-setup
description: One-time setup — prompt the user for their Dataviz email/password and save them securely to ~/.config/dataviz/credentials.json. Run this when MCP calls fail with "No Dataviz credentials found" or when the user says "setup dataviz", "configure dataviz credentials", or similar.
---

# Dataviz Setup Skill

This skill configures the per-user credentials file that the Dataviz MCP server reads. It is the **only** supported way to install credentials.

**Credentials file path:** `~/.config/dataviz/credentials.json` (owner-read-only, 0600).

## When to run this skill

- User says anything like "setup dataviz", "configure dataviz", "install my dataviz credentials".
- An MCP tool call returns an error containing "No Dataviz credentials found" or "Dataviz login failed (401)".
- User is a new analyst going through first-time onboarding.

## Procedure

### Step 1 — Confirm the user has a Dataviz account

Ask the user if they already have a Dataviz account (email + password). If NOT, tell them:

> "You'll need a Dataviz account first. Please ask Asaf (admin of Dataviz) to provision one for you — he'll give you an email + temporary password. Come back here once you have those."

Stop the skill until they confirm they have credentials.

### Step 2 — Collect the email

Ask the user for their Dataviz email (usually their `@edikted.com` address). Put it in a variable `EMAIL` for the next step. Email is not sensitive, so it's fine to echo back.

### Step 3 — Collect the password via native macOS password dialog

**Important:** do NOT ask the user to type their password in the chat. The password must never enter the conversation transcript.

Run this exact bash command, substituting `<EMAIL>` with the email from Step 2:

```bash
mkdir -p ~/.config/dataviz && \
PASSWORD=$(osascript -e 'Tell application "System Events" to display dialog "Enter your Dataviz password:" default answer "" with hidden answer buttons {"Cancel","OK"} default button "OK"' -e 'text returned of result' 2>/dev/null) && \
[ -n "$PASSWORD" ] && \
python3 -c "import json,sys,os; open(os.path.expanduser('~/.config/dataviz/credentials.json'),'w').write(json.dumps({'url':'https://dataviz.edikted.tech','email':sys.argv[1],'password':sys.argv[2]}))" "<EMAIL>" "$PASSWORD" && \
chmod 600 ~/.config/dataviz/credentials.json && \
echo "OK: credentials saved to ~/.config/dataviz/credentials.json"
```

A native macOS dialog will pop up asking the user for their password. The password is captured in a shell variable, written via `python3 -c` (avoids shell quoting issues with special chars), and the file is locked to owner-read-only. The password never appears in the terminal or the Claude transcript.

**If the command outputs "OK: credentials saved...":** proceed to Step 4.

**If the command fails or outputs nothing:** the user cancelled, or the dialog didn't appear. Ask them to confirm they want to proceed and retry.

**Non-macOS users:** if `osascript` is not available, fall back to asking the user to run this command **in their own terminal** (NOT via Claude's bash) and come back when done:

```bash
mkdir -p ~/.config/dataviz && read -sp "Password: " p && echo && printf '{"url":"https://dataviz.edikted.tech","email":"<EMAIL>","password":"%s"}\n' "$p" > ~/.config/dataviz/credentials.json && chmod 600 ~/.config/dataviz/credentials.json && echo OK
```

### Step 4 — Verify the credentials work

Call the MCP tool `dataviz_list_sources` to verify the login works end-to-end.

- **On success:** tell the user "Setup complete — you can now use all `dataviz_*` tools. Try: _list the available tables_ or _list my dashboards_."
- **On 401 failure:** the password is wrong. Re-run Step 3.
- **On other errors:** surface the error to the user and suggest they check with Asaf.

### Step 5 — What to tell the user

After successful verification, say (briefly):

> "Setup complete. Credentials saved to `~/.config/dataviz/credentials.json` (locked to your user). You won't need to do this again unless your password changes."

## Security notes

- The credentials file must be `0600` (owner-only). The command above enforces this.
- The password is NOT written to Claude's transcript — it stays in the shell variable and goes straight to the file.
- If a user's password is rotated, just re-run this skill to overwrite.
- Never log, echo, or display the password anywhere.
- If a user says "forget my password" or "logout": delete `~/.config/dataviz/credentials.json` with `rm ~/.config/dataviz/credentials.json`.
