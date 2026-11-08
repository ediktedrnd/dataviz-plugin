---
name: finance-setup
description: One-time setup for the Finance Dataviz plugin — save the user's Finance Dataviz email/password to ~/.config/dataviz/credentials.finance.json. Run when a dataviz-finance tool fails with "No Dataviz credentials found", "Dataviz login failed", or "This account uses Google sign-in", or when the user says "setup finance dataviz" or similar.
---

# Finance Dataviz Setup

The `dataviz-finance` plugin logs in to `https://dataviz.app.finance.edikted.dev` with an email + password stored in its own file, separate from the e-commerce Dataviz login:

- macOS / Linux: `~/.config/dataviz/credentials.finance.json`
- Windows: `%APPDATA%\dataviz\credentials.finance.json`

The password must never appear in the chat.

## Step 1 — Make sure the user has a Finance Dataviz password

Finance Dataviz accounts are created by signing in with Google, which leaves them without a password. Ask the user whether a Finance Dataviz admin has set a password for them. If not:

> "Open https://dataviz.app.finance.edikted.dev and sign in with Google once (this creates your account). Then ask a Finance Dataviz admin (Asaf) to give you the Creator role and set a password for you under Admin › Users. Come back once you have it."

Stop until they confirm.

## Step 2 — Collect the email

Ask for their Finance Dataviz email (their `@edikted.com` address).

## Step 3 — Save the credentials

**macOS** — run this, substituting `<EMAIL>`. A native password dialog collects the password so it never enters the transcript:

```bash
mkdir -p ~/.config/dataviz && \
PASSWORD=$(osascript -e 'Tell application "System Events" to display dialog "Enter your Finance Dataviz password:" default answer "" with hidden answer buttons {"Cancel","OK"} default button "OK"' -e 'text returned of result' 2>/dev/null) && \
[ -n "$PASSWORD" ] && \
python3 -c "import json,sys,os; p=os.path.expanduser('~/.config/dataviz/credentials.finance.json'); open(p,'w').write(json.dumps({'url':'https://dataviz.app.finance.edikted.dev','email':sys.argv[1],'password':sys.argv[2]})); os.chmod(p,0o600)" "<EMAIL>" "$PASSWORD" && \
echo "OK: credentials saved to ~/.config/dataviz/credentials.finance.json"
```

If it prints nothing, the user cancelled the dialog — confirm and retry.

**Windows / Linux** — ask the user to run this **in their own terminal** (not through Claude) and come back when it prints OK.

Linux:
```bash
mkdir -p ~/.config/dataviz && read -sp "Password: " p && echo && printf '{"url":"https://dataviz.app.finance.edikted.dev","email":"<EMAIL>","password":"%s"}\n' "$p" > ~/.config/dataviz/credentials.finance.json && chmod 600 ~/.config/dataviz/credentials.finance.json && echo OK
```

Windows (PowerShell):
```powershell
$p = Read-Host "Password" -AsSecureString; $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p)); New-Item -ItemType Directory -Force "$env:APPDATA\dataviz" | Out-Null; @{url='https://dataviz.app.finance.edikted.dev'; email='<EMAIL>'; password=$plain} | ConvertTo-Json | Set-Content -Encoding UTF8 "$env:APPDATA\dataviz\credentials.finance.json"; "OK"
```

## Step 4 — Verify

The MCP server reads the file on its first login, so restart Claude Code (or run `/mcp` → reconnect the dataviz-finance server), then call `dataviz_list_sources`. A list of sources means setup is done.

| Error | Fix |
|---|---|
| `No account found with this email` | Wrong email, or they never signed in with Google — back to Step 1 |
| `This account uses Google sign-in` | No password set yet — an admin sets one under Admin › Users |
| `Dataviz login failed (401)` | Wrong password — re-run Step 3. **5 wrong passwords lock the account**; an admin unlocks it under Admin › Users |
| `Account is locked` | Admin › Users › Unlock |
