# 🎟 Local Events Finder — MCP Server

An MCP server that connects Claude to the **Ticketmaster API**, letting users discover local events by city, category, keyword, or weekend — all from a natural conversation.

---

## Tools Exposed

| Tool | Description |
|---|---|
| `search_events` | Search events in any city by keyword |
| `events_by_category` | Browse Music, Sports, Arts, Film, or Misc |
| `get_event_details` | Full details for a specific event ID |
| `weekend_events` | Events happening this Friday–Sunday |

---

## Example Prompts (once connected to Claude)

- *"Find jazz events in Chicago this weekend"*
- *"What sports events are happening in Toronto?"*
- *"Show me 10 upcoming events in New York"*
- *"Get details for event ID Z698xZC2Z17avvl"*

---

## Setup

### 1. Get a Ticketmaster API Key (free)
Sign up at [developer.ticketmaster.com](https://developer.ticketmaster.com) → Create App → copy your **Consumer Key**.

### 2. Clone & Install
```bash
git clone https://github.com/yourusername/local-events-mcp
cd local-events-mcp
npm install
```

### 3. Build
```bash
npm run build
```

### 4. Connect to Claude Desktop
Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "local-events": {
      "command": "node",
      "args": ["/absolute/path/to/local-events-mcp/dist/index.js"],
      "env": {
        "TICKETMASTER_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

Then restart Claude Desktop and start asking about events!

---

## Publishing to Claude Connectors Directory

1. Deploy this server to a public HTTPS URL (e.g. Railway, Render, Fly.io)
2. Add OAuth 2.0 authentication
3. Switch transport from `stdio` to `Streamable HTTP`
4. Submit at: [claude.com/docs/connectors/building/submission](https://claude.com/docs/connectors/building/submission)

---

## Privacy Policy

This server does not store any user data. All queries are passed directly to the Ticketmaster Discovery API. No personal information is collected or retained.

---

## License

MIT
