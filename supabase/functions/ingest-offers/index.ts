import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = { "Content-Type": "application/json" };
const blocked = /\b(alcohol|beer|wine|liquor|spirits|cannabis|marijuana|tobacco|cigarette|vape|vaping|nicotine|casino|sportsbook|betting|lottery|firearm|ammunition|weapon|knife|pepper spray|prescription drug)\b/i;

function cleanText(value: unknown, max = 4000): string {
  return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
function safeHttps(value: string): URL | null {
  try { const u = new URL(value); return u.protocol === "https:" ? u : null; } catch { return null; }
}
function hostAllowed(url: URL): boolean {
  const allow = (Deno.env.get("SOURCE_HOST_ALLOWLIST") || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  return allow.length > 0 && allow.some(host => url.hostname === host || url.hostname.endsWith("." + host));
}
function robotsAllows(robots: string, path: string): boolean {
  let active = false;
  const rules: string[] = [];
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (key === "user-agent") active = value === "*" || /dealradar/i.test(value);
    else if (active && key === "disallow" && value) rules.push(value);
  }
  return !rules.some(rule => path.startsWith(rule));
}
async function canFetchPage(url: URL): Promise<boolean> {
  try {
    const robotsUrl = new URL("/robots.txt", url.origin);
    const res = await fetch(robotsUrl, { headers: { "User-Agent": "DealRadarBot/1.0 (offer-indexer; contact: admin@dealradar.example)" } });
    if (!res.ok) return res.status === 404 || res.status === 410;
    return robotsAllows(await res.text(), url.pathname);
  } catch { return false; }
}
function getTag(doc: Document, names: string[]): string {
  for (const name of names) {
    const node = doc.querySelector(name);
    const value = node?.getAttribute("content") || node?.textContent || "";
    if (value.trim()) return cleanText(value);
  }
  return "";
}
function parseFeed(xml: string): Array<Record<string, string>> {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.querySelector("parsererror")) return [];
  return [...doc.querySelectorAll("item, entry")].map(node => ({
    title: cleanText(node.querySelector("title")?.textContent, 250),
    url: cleanText(node.querySelector("link[ href ]")?.getAttribute("href") || node.querySelector("link")?.textContent, 1000),
    text: cleanText(node.querySelector("description, summary, content, encoded")?.textContent, 4000),
    published_at: cleanText(node.querySelector("pubDate, published, updated")?.textContent, 100),
    expires_at: cleanText(node.querySelector("expiration, expires, validThrough")?.textContent, 100)
  })).filter(x => x.title && x.url);
}
function parseMerchantPage(html: string, pageUrl: string): Array<Record<string, string>> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const items: Array<Record<string, string>> = [];
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent || "null");
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      const walk = (value: any) => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) { value.forEach(walk); return; }
        const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
        if (types.some((t: string) => ["Offer", "AggregateOffer"].includes(t))) {
          items.push({
            title: cleanText(value.name || value.itemOffered?.name || "Merchant promotion", 250),
            url: cleanText(value.url || pageUrl, 1000),
            text: cleanText(value.description || "", 4000),
            published_at: cleanText(value.validFrom || "", 100),
            expires_at: cleanText(value.validThrough || "", 100),
            discount_percent: cleanText(value.discount || "", 20)
          });
        }
        Object.values(value).forEach(walk);
      };
      nodes.forEach(walk);
    } catch { /* Ignore malformed JSON-LD. */ }
  }
  if (!items.length) {
    const title = getTag(doc, ['meta[property="og:title"]', "title"]);
    const text = getTag(doc, ['meta[property="og:description"]', 'meta[name="description"]']);
    if (title && text) items.push({ title, url: pageUrl, text });
  }
  return items;
}
function parseDate(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function parseDiscount(value: string): number | null {
  const match = String(value || "").match(/(\d{1,3}(?:\.\d{1,2})?)\s*%/);
  if (!match) return null;
  const n = Number(match[1]);
  return n > 0 && n <= 100 ? n : null;
}
function normalize(item: Record<string, string>, source: any, sourceType: string) {
  const title = cleanText(item.title || item.name, 250);
  const description = cleanText(item.text || item.description, 4000);
  const url = safeHttps(item.url || source.feed_url || source.source_url);
  if (!title || !url || blocked.test(title + " " + description)) return null;
  if (!hostAllowed(url)) return null;
  const validFrom = parseDate(item.published_at || item.valid_from || "");
  const expiresAt = parseDate(item.expires_at || item.valid_through || "");
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return null;
  const pct = parseDiscount(item.discount_percent || "") ?? parseDiscount(title + " " + description);
  return {
    source_id: source.id,
    title,
    business: cleanText(item.merchant_name || source.merchant_name, 250),
    description,
    category: source.category || "Other",
    discount_percent: pct,
    latitude: source.latitude,
    longitude: source.longitude,
    city: source.city,
    country_code: source.country_code,
    source_url: url.toString(),
    source_type: sourceType,
    verification_status: "source_checked",
    status: "pending_review",
    valid_from: validFrom,
    expires_at: expiresAt,
    raw_excerpt: description.slice(0, 1000)
  };
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const expected = Deno.env.get("DEALRADAR_INGEST_SECRET") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
  if (!supabaseUrl || !serviceKey) return Response.json({ error: "Missing Supabase server configuration" }, { status: 500, headers: corsHeaders });
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const suppliedSecret = req.headers.get("x-dealradar-ingest-secret") || "";
  let authorized = Boolean(expected && suppliedSecret === expected);
  if (!authorized && suppliedSecret) {
    const { data, error } = await supabase.rpc("verify_dealradar_ingest_secret", { candidate: suppliedSecret });
    authorized = !error && data === true;
  }
  if (!authorized) return new Response("Unauthorized", { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* default action */ }
  if (body.action === "expire") {
    const { data, error } = await supabase.rpc("expire_dealradar_offers");
    if (error) return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
    return Response.json({ expired: data }, { headers: corsHeaders });
  }
  const { data: sources, error } = await supabase.from("dealradar_sources")
    .select("*").eq("enabled", true).eq("authorized", true);
  if (error) return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  let imported = 0, skipped = 0, failed = 0;
  for (const source of (sources || [])) {
    try {
      if (!source.permission_reference || !safeHttps(source.terms_url)) { skipped++; continue; }
      const target = source.source_type === "authorized_api"
        ? safeHttps(Deno.env.get("AUTHORIZED_SOCIAL_API_URL") || "")
        : safeHttps(source.feed_url || source.source_url);
      if (!target || !hostAllowed(target)) { skipped++; continue; }
      let candidates: Array<Record<string, string>> = [];
      if (source.source_type === "authorized_api") {
        const token = Deno.env.get("AUTHORIZED_SOCIAL_API_TOKEN") || "";
        if (!token) { skipped++; continue; }
        const response = await fetch(target, { headers: { "Authorization": "Bearer " + token, "Accept": "application/json" } });
        if (!response.ok) throw new Error("Authorized API returned " + response.status);
        const json = await response.json();
        candidates = Array.isArray(json.items) ? json.items : [];
      } else {
        if (!await canFetchPage(target)) { skipped++; continue; }
        const response = await fetch(target, { headers: { "User-Agent": "DealRadarBot/1.0 (offer-indexer; contact: admin@dealradar.example)", "Accept": "application/rss+xml, application/atom+xml, application/xml, text/html;q=0.9" } });
        if (!response.ok) throw new Error("Source returned " + response.status);
        const text = await response.text();
        candidates = source.source_type === "merchant_page"
          ? parseMerchantPage(text, target.toString())
          : parseFeed(text);
      }
      for (const candidate of candidates) {
        const row = normalize(candidate, source, source.source_type === "authorized_api" ? "authorized_social" : "merchant_website");
        if (!row) { skipped++; continue; }
        const { error: insertError } = await supabase.from("offers").upsert(row, { onConflict: "source_url", ignoreDuplicates: true });
        if (insertError) throw insertError;
        imported++;
      }
      await supabase.from("dealradar_sources").update({ last_fetched_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("id", source.id);
    } catch (e) {
      failed++;
      await supabase.from("dealradar_sources").update({ last_error: cleanText((e as Error).message, 500), updated_at: new Date().toISOString() }).eq("id", source.id);
    }
  }
  const { data: expired } = await supabase.rpc("expire_dealradar_offers");
  return Response.json({ sources: sources?.length || 0, imported, skipped, failed, expired: expired || 0 }, { headers: corsHeaders });
});
