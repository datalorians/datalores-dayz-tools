import { Database } from "bun:sqlite";

const db = new Database(process.env.DB_PATH || "/data/datalores-dayz-tools.sqlite");
const maxEventBytes = 4096;
const visitorIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const files = new Map([
  ["/src/app.js", "src/app.js"],
  ["/src/styles.css", "src/styles.css"],
  ["/reference/sample-chernarusplus/dayzOffline.chernarusplus/cfgeconomycore.xml", "reference/sample-chernarusplus/dayzOffline.chernarusplus/cfgeconomycore.xml"],
  ["/reference/sample-chernarusplus/dayzOffline.chernarusplus/db/types.xml", "reference/sample-chernarusplus/dayzOffline.chernarusplus/db/types.xml"],
  ["/reference/sample-livonia/dayzOffline.enoch/cfgeconomycore.xml", "reference/sample-livonia/dayzOffline.enoch/cfgeconomycore.xml"],
  ["/reference/sample-livonia/dayzOffline.enoch/db/types.xml", "reference/sample-livonia/dayzOffline.enoch/db/types.xml"],
  ["/reference/sample-sakhal/dayzOffline.sakhal/cfgeconomycore.xml", "reference/sample-sakhal/dayzOffline.sakhal/cfgeconomycore.xml"],
  ["/reference/sample-sakhal/dayzOffline.sakhal/db/types.xml", "reference/sample-sakhal/dayzOffline.sakhal/db/types.xml"],
]);
const securityHeaders = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "same-origin",
  "x-content-type-options": "nosniff",
};
const recentEvents = new Map();

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

const generatedCount = db.query("select coalesce(sum(case when generated_count > 0 then generated_count else 0 end), 0) as total from events where event = 'split' and tool = 'typesplitter'");
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
      if (visitorId instanceof Response) return visitorId;
      return json(stats(), visitorId, request);
    }

    if (url.pathname === "/api/split" && request.method === "POST") {
      const visitorId = await saveEvent(request, "split", url.pathname);
      if (visitorId instanceof Response) return visitorId;
      return json(stats(), visitorId, request);
    }

    return serveFile(url.pathname);
  },
});

async function saveEvent(request, event, path) {
  let details;
  try {
    details = await readJson(request);
  } catch (response) {
    return response;
  }
  const headers = request.headers;
  const ip = clientIp(headers);
  const userAgent = headers.get("user-agent") || "";
  const cookieVisitorId = visitorCookie(headers);
  const visitorId = cookieVisitorId || crypto.randomUUID();
  const rateKey = `${event}:${ip || "unknown"}|${userAgent}`;

  if (!allowEvent(rateKey, event === "split" ? 2000 : 300000)) {
    return visitorId;
  }

  record.run({
    $event: event,
    $tool: "typesplitter",
    $ip: ip,
    $userAgent: userAgent,
    $referrer: headers.get("referer") || "",
    $acceptLanguage: headers.get("accept-language") || "",
    $country: headers.get("cf-ipcountry") || "",
    $visitorId: visitorId,
    $generatedCount: generatedFiles(details.generatedFiles),
    $path: path,
    $details: JSON.stringify(details),
  });

  return visitorId;
}

function allowEvent(key, windowMs) {
  const now = Date.now();
  const last = recentEvents.get(key) || 0;
  if (now - last < windowMs) return false;

  recentEvents.set(key, now);
  for (const [eventKey, timestamp] of recentEvents) {
    if (now - timestamp > 600000) recentEvents.delete(eventKey);
  }
  return true;
}

async function readJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxEventBytes) {
    throw new Response("Payload too large", { status: 413, headers: responseHeaders() });
  }

  const text = await request.text();
  if (text.length > maxEventBytes) {
    throw new Response("Payload too large", { status: 413, headers: responseHeaders() });
  }

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function generatedFiles(value) {
  const count = Number(value);
  return Number.isInteger(count) && count > 0 && count <= 200 ? count : 0;
}

function clientIp(headers) {
  return headers.get("cf-connecting-ip")
    || headers.get("x-real-ip")
    || headers.get("x-forwarded-for")?.split(",")[0].trim()
    || "";
}

function visitorCookie(headers) {
  const cookie = headers.get("cookie") || "";
  const visitorId = cookie.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("dtid="))
    ?.slice(5) || "";
  return visitorIdPattern.test(visitorId) ? visitorId : "";
}

function stats() {
  return {
    typesGenerated: generatedCount.get().total,
    visitors: visitorCount.get().total,
  };
}

function json(body, visitorId = "", request = null) {
  const headers = responseHeaders({ "content-type": "application/json" });
  if (visitorId) {
    const secure = request?.headers.get("x-forwarded-proto") === "https" ? "; Secure" : "";
    headers.set("set-cookie", `dtid=${visitorId}; Max-Age=31536000; Path=/; SameSite=Lax; HttpOnly${secure}`);
  }
  return new Response(JSON.stringify(body), { headers });
}

function serveFile(pathname) {
  if (pathname === "/" || pathname === "/typesplitter" || pathname === "/typesplitter/") {
    return new Response(Bun.file("index.html"), { headers: responseHeaders({ "content-type": "text/html; charset=utf-8" }) });
  }

  const file = files.get(pathname);
  if (file) {
    return new Response(Bun.file(file), { headers: responseHeaders(contentType(file)) });
  }

  return new Response("Not found", { status: 404, headers: responseHeaders({ "content-type": "text/plain; charset=utf-8" }) });
}

function responseHeaders(extra = {}) {
  return new Headers({ ...securityHeaders, ...extra });
}

function contentType(file) {
  if (file.endsWith(".js")) return { "content-type": "text/javascript; charset=utf-8" };
  if (file.endsWith(".css")) return { "content-type": "text/css; charset=utf-8" };
  if (file.endsWith(".xml")) return { "content-type": "application/xml; charset=utf-8" };
  return {};
}
