import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─────────────────────────────────────────────
//  Config
// ─────────────────────────────────────────────
const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY;
const BASE_URL = "https://app.ticketmaster.com/discovery/v2";

if (!TICKETMASTER_API_KEY) {
  console.error("❌  TICKETMASTER_API_KEY env var is required");
  process.exit(1);
}

// ─────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────
interface TMEvent {
  id: string;
  name: string;
  url: string;
  dates?: { start?: { localDate?: string; localTime?: string } };
  _embedded?: {
    venues?: Array<{
      name?: string;
      city?: { name?: string };
      state?: { name?: string };
      address?: { line1?: string };
    }>;
  };
  classifications?: Array<{
    segment?: { name?: string };
    genre?: { name?: string };
  }>;
  priceRanges?: Array<{ min?: number; max?: number; currency?: string }>;
  images?: Array<{ url?: string; ratio?: string }>;
  info?: string;
}

interface TMResponse {
  _embedded?: { events?: TMEvent[] };
  page?: { totalElements?: number; totalPages?: number };
}

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────
async function fetchTM(endpoint: string, params: Record<string, string>) {
  const url = new URL(`${BASE_URL}/${endpoint}.json`);
  url.searchParams.set("apikey", TICKETMASTER_API_KEY!);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Ticketmaster API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<TMResponse>;
}

function formatEvent(event: TMEvent): string {
  const venue = event._embedded?.venues?.[0];
  const date = event.dates?.start?.localDate ?? "TBD";
  const time = event.dates?.start?.localTime ?? "";
  const location = venue
    ? `${venue.name ?? ""}, ${venue.city?.name ?? ""}, ${venue.state?.name ?? ""}`
    : "Location TBD";
  const category =
    event.classifications?.[0]?.segment?.name ?? "Uncategorized";
  const genre = event.classifications?.[0]?.genre?.name ?? "";
  const price = event.priceRanges?.[0]
    ? `$${event.priceRanges[0].min} – $${event.priceRanges[0].max} ${event.priceRanges[0].currency}`
    : "Price not listed";

  return [
    `🎟  ${event.name}`,
    `📅  ${date}${time ? " at " + time : ""}`,
    `📍  ${location}`,
    `🏷   ${category}${genre && genre !== "Undefined" ? " › " + genre : ""}`,
    `💵  ${price}`,
    `🔗  ${event.url}`,
    event.info ? `ℹ️   ${event.info.slice(0, 120)}…` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ─────────────────────────────────────────────
//  MCP Server
// ─────────────────────────────────────────────
const server = new McpServer({
  name: "local-events-finder",
  version: "1.0.0",
});

// ── Tool 1: Search Events ────────────────────
server.tool(
  "search_events",
  "Search for local events by city or keyword. Returns upcoming events with dates, venues, prices, and ticket links.",
  {
    city: z.string().describe("City name, e.g. 'New York' or 'Toronto'"),
    keyword: z
      .string()
      .optional()
      .describe("Optional keyword to filter events, e.g. 'jazz' or 'comedy'"),
    size: z
      .number()
      .min(1)
      .max(20)
      .default(5)
      .describe("Number of results to return (1–20, default 5)"),
  },
  async ({ city, keyword, size }) => {
    const data = await fetchTM("events", {
      city,
      keyword: keyword ?? "",
      size: String(size),
      sort: "date,asc",
    });

    const events = data._embedded?.events;
    if (!events?.length) {
      return {
        content: [
          {
            type: "text",
            text: `No upcoming events found in ${city}${keyword ? ` for "${keyword}"` : ""}.`,
          },
        ],
      };
    }

    const total = data.page?.totalElements ?? events.length;
    const header = `Found ${total} events in ${city}${keyword ? ` matching "${keyword}"` : ""}. Showing ${events.length}:\n\n`;
    const body = events.map(formatEvent).join("\n\n---\n\n");

    return { content: [{ type: "text", text: header + body }] };
  }
);

// ── Tool 2: Events by Category ───────────────
server.tool(
  "events_by_category",
  "Browse events in a city filtered by category such as Music, Sports, Arts, Family, or Comedy.",
  {
    city: z.string().describe("City name"),
    category: z
      .enum(["Music", "Sports", "Arts & Theatre", "Film", "Miscellaneous"])
      .describe("Event category to browse"),
    size: z.number().min(1).max(20).default(5),
  },
  async ({ city, category, size }) => {
    const segmentMap: Record<string, string> = {
      Music: "KZFzniwnSyZfZ7v7nJ",
      Sports: "KZFzniwnSyZfZ7v7nE",
      "Arts & Theatre": "KZFzniwnSyZfZ7v7na",
      Film: "KZFzniwnSyZfZ7v7nn",
      Miscellaneous: "KZFzniwnSyZfZ7v7n1",
    };

    const data = await fetchTM("events", {
      city,
      segmentId: segmentMap[category],
      size: String(size),
      sort: "date,asc",
    });

    const events = data._embedded?.events;
    if (!events?.length) {
      return {
        content: [
          {
            type: "text",
            text: `No ${category} events found in ${city} right now.`,
          },
        ],
      };
    }

    const header = `🎭 ${category} events in ${city} (showing ${events.length}):\n\n`;
    const body = events.map(formatEvent).join("\n\n---\n\n");

    return { content: [{ type: "text", text: header + body }] };
  }
);

// ── Tool 3: Event Details ────────────────────
server.tool(
  "get_event_details",
  "Get full details for a specific event using its Ticketmaster event ID.",
  {
    eventId: z.string().describe("Ticketmaster event ID"),
  },
  async ({ eventId }) => {
    const res = await fetch(
      `${BASE_URL}/events/${eventId}.json?apikey=${TICKETMASTER_API_KEY}`
    );
    if (!res.ok) throw new Error(`Event not found: ${eventId}`);

    const event = (await res.json()) as TMEvent;
    const venue = event._embedded?.venues?.[0];
    const image: string =
      event.images?.find((i) => i.ratio === "16_9")?.url ??
      event.images?.[0]?.url ??
      "";

    const details = [
      `# ${event.name}`,
      "",
      image ? `🖼  ${image}` : "",
      `📅  ${event.dates?.start?.localDate ?? "TBD"} ${event.dates?.start?.localTime ?? ""}`,
      venue?.address?.line1 ? `📍  ${venue.address.line1}` : "",
      venue
        ? `🏙   ${venue.name}, ${venue.city?.name}, ${venue.state?.name}`
        : "",
      "",
      event.priceRanges?.length
        ? `💵  Price: $${event.priceRanges[0].min ?? "?"} – $${event.priceRanges[0].max ?? "?"}`
        : "💵  Price not listed",
      `🎟   Tickets: ${event.url}`,
      "",
      event.info ? `ℹ️  ${event.info}` : "",
    ]
      .filter((l) => l !== undefined)
      .join("\n");

    return { content: [{ type: "text", text: details }] };
  }
);

// ── Tool 4: Weekend Events ───────────────────
server.tool(
  "weekend_events",
  "Find events happening this weekend in a given city.",
  {
    city: z.string().describe("City name"),
    size: z.number().min(1).max(20).default(8),
  },
  async ({ city, size }) => {
    // Compute this weekend's Friday–Sunday date range
    const now = new Date();
    const day = now.getDay(); // 0=Sun … 6=Sat
    const daysToFriday = day <= 5 ? 5 - day : 6; // next Friday
    const friday = new Date(now);
    friday.setDate(now.getDate() + daysToFriday);
    const sunday = new Date(friday);
    sunday.setDate(friday.getDate() + 2);

    const fmt = (d: Date) => d.toISOString().split("T")[0] + "T00:00:00Z";

    const data = await fetchTM("events", {
      city,
      startDateTime: fmt(friday),
      endDateTime: fmt(sunday),
      size: String(size),
      sort: "date,asc",
    });

    const events = data._embedded?.events;
    if (!events?.length) {
      return {
        content: [
          {
            type: "text",
            text: `No events found in ${city} this weekend (${friday.toDateString()} – ${sunday.toDateString()}).`,
          },
        ],
      };
    }

    const header = `🗓  Weekend events in ${city} (${friday.toDateString()} – ${sunday.toDateString()}):\n\n`;
    const body = events.map(formatEvent).join("\n\n---\n\n");

    return { content: [{ type: "text", text: header + body }] };
  }
);

// ─────────────────────────────────────────────
//  Start
// ─────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("✅  Local Events MCP server running");
