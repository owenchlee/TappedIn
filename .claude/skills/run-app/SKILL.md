---
name: run-app
description: Launch the Coop Hub Next.js dev server and open it in the user's Chrome browser (via claude-in-chrome) to see and drive the app. Use for /run, "run the app", "open it", or confirming a UI change in the real app.
---

# Run Coop Hub in Chrome

1. **Check whether the dev server is already up** (don't start a second one):
   ```bash
   netstat -ano | grep -E ':3000 .*LISTEN'
   ```
2. **If not running**, start it in the background (Bash tool, `run_in_background: true`):
   ```bash
   npm run dev
   ```
   Then wait until `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000` returns 200.
   First run on a fresh DB: `npm run db:migrate` (and `npm run db:seed` for sample data).
3. **Open it in Chrome** using the claude-in-chrome tools — not a headless browser:
   - Load the tools in one call: `ToolSearch` with
     `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__read_console_messages`
   - Call `tabs_context_mcp`, then `tabs_create_mcp` for a new tab, then `navigate` it to
     `http://localhost:3000` (or the route the change touches, e.g. `/hackathons`).
   - If the Chrome extension isn't connected, fall back to `start chrome http://localhost:3000`
     (PowerShell) so the page still opens, and tell the user.
4. **Drive it**: take a screenshot (`computer` → screenshot) and look at it; click through the
   route the change touches; check `read_console_messages` for errors. A blank page is a failure.
5. Leave the dev server and tab running for the user unless asked to stop them.
