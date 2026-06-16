import { Database } from "bun:sqlite";

const db = new Database(process.env.DB_PATH || "/data/datalores-dayz-tools.sqlite");

db.exec(`
  create table if not exists events (
    id integer primary key autoincrement,
    event text not null,
    tool text not null,
    ip text,
    user_agent text,
    referrer text,
    accept_language text,
    country text,
    path text,
    details text,
    created_at text not null default current_timestamp
  )
`);

const record = db.query(`
  insert into events (event, tool, ip, user_agent, referrer, accept_language, country, path, details)
  values ($event, $tool, $ip, $userAgent, $referrer, $acceptLanguage, $country, $path, $details)
`);

const countEvents = db.query("select count(*) as total from events where event = $event and tool = 'typesplitter'");

Bun.serve({
  port: 80,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/api/stats") {
      return json(stats());
    }

    if (url.pathname === "/api/view" && request.method === "POST") {
      await saveEvent(request, "view", url.pathname);
      return json(stats());
    }

    if (url.pathname === "/api/split" && request.method === "POST") {
      await saveEvent(request, "split", url.pathname);
      return json(stats());
    }

    return serveFile(url.pathname);
  },
});

async function saveEvent(request, event, path) {
  const details = await readJson(request);
  const headers = request.headers;

  record.run({
    $event: event,
    $tool: details.tool || "typesplitter",
    $ip: clientIp(headers),
    $userAgent: headers.get("user-agent") || "",
    $referrer: headers.get("referer") || "",
    $acceptLanguage: headers.get("accept-language") || "",
    $country: headers.get("cf-ipcountry") || "",
    $path: path,
    $details: JSON.stringify(details),
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function clientIp(headers) {
  return headers.get("cf-connecting-ip")
    || headers.get("x-real-ip")
    || headers.get("x-forwarded-for")?.split(",")[0].trim()
    || "";
}

function stats() {
  return {
    splits: countEvents.get({ $event: "split" }).total,
    views: countEvents.get({ $event: "view" }).total,
  };
}

function json(body) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

function serveFile(pathname) {
  if (pathname === "/" || pathname === "/typesplitter" || pathname === "/typesplitter/") {
    return new Response(Bun.file("index.html"));
  }

  if (pathname.startsWith("/src/") || pathname.startsWith("/reference/")) {
    const file = Bun.file(`.${pathname}`);
    return new Response(file);
  }

  return new Response("Not found", { status: 404 });
}
