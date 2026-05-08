---
name: canonic
description: Open a document in Canonic for human review, wait for the user to finish editing, then resume with their edited content and chosen next step.
---

## Usage

```
canonic <file-path> [--agent-name "My Agent"]
```

## What this does

1. Checks if Canonic is installed and running
2. Auto-launches Canonic if it's installed but not running (waits up to 15s)
3. Opens `<file-path>` in Canonic for human review (switches workspace if needed)
4. Waits for the user to finish editing and choose a next step
5. Returns the edited content and chosen prompt so you can continue

## Steps

### Step 1 — Read the lockfile

```bash
cat ~/.canonic/api.lock
```

The lockfile contains `{ "port": <number>, "token": "<32-char-hex>" }`.

**If the lockfile exists:** skip to Step 3.

**If no lockfile:** go to Step 2.

### Step 2 — Launch Canonic

Check if Canonic is installed:

```bash
# macOS
ls /Applications/Canonic.app 2>/dev/null && echo "installed" || echo "not installed"
```

**If installed:** launch it and wait for the lockfile:

```bash
# macOS
open -a Canonic

# Poll for lockfile (up to 15 seconds)
for i in $(seq 1 15); do
  sleep 1
  [ -f ~/.canonic/api.lock ] && break
  echo "Waiting for Canonic to start... ($i/15)"
done
```

Then re-read the lockfile: `cat ~/.canonic/api.lock`

If the lockfile still doesn't exist after 15 seconds, tell the user:
> "Canonic didn't start in time. Please open it manually and try again."
Then exit.

**If not installed:** ask the user:
> "Canonic isn't installed. Download it at https://github.com/Canonical-AI/canonic — install it, open it, then run this again."
Then exit.

### Step 3 — Verify the server is responding

```bash
curl -s http://127.0.0.1:<port>/ping
```

Expected: `{ "ok": true, "version": "..." }`

If this fails, the lockfile is stale. Delete it and go back to Step 2:

```bash
rm ~/.canonic/api.lock
```

### Step 4 — Start a callback listener

Start a one-shot HTTP listener to receive the user's response. Pick a random available port and listen for a single POST request.

Example (Python):

```python
import http.server, json, sys, threading

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers['Content-Length'])
        body = json.loads(self.rfile.read(length))
        print(json.dumps(body))
        self.send_response(200)
        self.end_headers()
        threading.Thread(target=self.server.shutdown).start()
    def log_message(self, *a): pass

srv = http.server.HTTPServer(('127.0.0.1', 0), Handler)
print(f"PORT={srv.server_address[1]}", file=sys.stderr)
srv.serve_forever()
```

Note the port it binds to — this is your `callbackUrl` port.

### Step 5 — Open the file in Canonic

```bash
curl -s -X POST http://127.0.0.1:<port>/session/start \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "file": "<relative-file-path>",
    "agentName": "Claude Code",
    "callbackUrl": "http://127.0.0.1:<callback-port>/done",
    "workspacePath": "<absolute-path-to-project-root>"
  }'
```

- `file` is relative to `workspacePath`
- `workspacePath` is the root of the project (where the user's workspace is)
- Canonic will switch to this workspace automatically and open the file

Expected response: `{ "ok": true, "sessionId": "<uuid>" }`

Canonic will raise its window automatically.

### Step 6 — Optionally add inline comments

While the user is reading, you can post comments anchored to specific text:

```bash
curl -s -X POST http://127.0.0.1:<port>/comments \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "<sessionId>",
    "file": "<relative-file-path>",
    "anchor": { "quotedText": "the exact text to anchor to" },
    "text": "Your comment here",
    "agentName": "Claude Code"
  }'
```

Comments appear as inline highlights in the editor and in the comments panel with an agent badge.

### Step 7 — Wait for the user's response

Wait for the callback listener (from Step 4) to receive a POST. The payload will be:

```json
{
  "sessionId": "<uuid>",
  "file": "<relative-file-path>",
  "content": "<full edited markdown content>",
  "prompt": "Implement this"
}
```

- `content` is the full document as the user left it
- `prompt` is the action they chose ("Implement this", "Research this", etc.)

**Timeout:** If no callback arrives within 30 minutes, treat it as cancelled and exit gracefully.

### Step 8 — Continue with the result

Write the returned `content` back to the file, then continue based on the `prompt`:

```bash
# Write the edited content back
cat > <file-path> << 'CANONIC_EOF'
<content>
CANONIC_EOF
```

Then act on the prompt. For example:
- `"Implement this"` → start implementing the spec
- `"Research this"` → do research and summarize
- `"Create a task list"` → break it into tasks

## Security notes

- The API server only accepts requests from `localhost`
- The `callbackUrl` must be a `localhost`/`127.0.0.1` address — Canonic rejects external URLs
- The token is regenerated each time Canonic launches
