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
    visitor_id text,
    generated_count integer not null default 0,
    path text,
    details text,
    created_at text not null default current_timestamp
  )
`);

try {
  db.exec("alter table events add column visitor_id text");
} catch {
}

try {
  db.exec("alter table events add column generated_count integer not null default 0");
} catch {
}

const record = db.query(`
  insert into events (event, tool, ip, user_agent, referrer, accept_language, country, visitor_id, generated_count, path, details)
  values ($event, $tool, $ip, $userAgent, $referrer, $acceptLanguage, $country, $visitorId, $generatedCount, $path, $details)
`);

const generatedCount = db.query("select coalesce(sum(case when generated_count > 0 then generated_count else 1 end), 0) as total from events where event = 'split' and tool = 'typesplitter'");
const visitorCount = db.query(`
  select count(distinct coalesce(nullif(visitor_id, ''), coalesce(nullif(ip, ''), 'unknown') || '|' || user_agent)) as total
  from events
  where event = 'view' and tool = 'typesplitter'
`);

Bun.serve({
  port: 80,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/api/stats") {
      return json(stats());
    }

    if (url.pathname === "/api/view" && request.method === "POST") {
      const visitorId = await saveEvent(request, "view", url.pathname);
      return json(stats(), visitorId);
    }

    if (url.pathname === "/api/split" && request.method === "POST") {
      const visitorId = await saveEvent(request, "split", url.pathname);
      return json(stats(), visitorId);
    }

    return serveFile(url.pathname);
  },
});

async function saveEvent(request, event, path) {
  const details = await readJson(request);
  const headers = request.headers;
  const visitorId = visitorCookie(headers) || crypto.randomUUID();

  record.run({
    $event: event,
    $tool: details.tool || "typesplitter",
    $ip: clientIp(headers),
    $userAgent: headers.get("user-agent") || "",
    $referrer: headers.get("referer") || "",
    $acceptLanguage: headers.get("accept-language") || "",
    $country: headers.get("cf-ipcountry") || "",
    $visitorId: visitorId,
    $generatedCount: Number(details.generatedFiles || 0),
    $path: path,
    $details: JSON.stringify(details),
  });

  return visitorId;
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

function visitorCookie(headers) {
  const cookie = headers.get("cookie") || "";
  return cookie.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("dtid="))
    ?.slice(5) || "";
}

function stats() {
  return {
    typesGenerated: generatedCount.get().total,
    visitors: visitorCount.get().total,
  };
}

function json(body, visitorId = "") {
  const headers = new Headers({ "content-type": "application/json" });
  if (visitorId) {
    headers.set("set-cookie", `dtid=${visitorId}; Max-Age=31536000; Path=/; SameSite=Lax`);
  }
  return new Response(JSON.stringify(body), { headers });
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
