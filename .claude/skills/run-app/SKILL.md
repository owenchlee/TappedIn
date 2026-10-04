---
name: run-app
description: Start TappedIn (local database + Next.js dev server) and open it in the user's Chrome. Use for /run, "run the app", "open it", or confirming a UI change in the real app.
---

# Run TappedIn

1. Run `npm run app` (Bash tool, foreground, timeout 300000). It does everything and only starts
   what's missing, so it's safe when things are already running:
   - starts the local database (`prisma dev`), clearing the stale lock a crash leaves behind
   - applies pending migrations
   - starts `next dev` detached (log: `%TEMP%\tappedin\dev.log`) and waits until pages respond
   - opens http://localhost:3000 in Chrome
2. If it prints `✗ ...`, read the message (and the dev log it names), fix the cause, and run it again.
   First run on a fresh database: `npm run db:seed` afterwards for sample data.
3. Tell the user it's open. Only drive the page yourself (claude-in-chrome tools: `tabs_context_mcp`,
   then `tabs_create_mcp` + `navigate`) when checking a change; then screenshot it and check
   `read_console_messages` for errors. A blank page is a failure.
4. Leave the database and dev server running. Add `--no-open` to skip opening Chrome.
