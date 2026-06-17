import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const escapeXml = (s: string | null | undefined): string => {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

const cdata = (s: string | null | undefined): string => {
  if (!s) return "<![CDATA[]]>";
  // Close any nested CDATA terminators safely
  const safe = String(s).replace(/]]>/g, "]]]]><![CDATA[>");
  return `<![CDATA[${safe}]]>`;
};

const buildDescription = (
  description: string | null,
  responsibilities: string[] | null,
  qualifications: string[] | null,
): string => {
  const parts: string[] = [];
  if (description && description.trim()) {
    parts.push(`<p>${description.replace(/\n/g, "<br/>")}</p>`);
  }
  if (responsibilities && responsibilities.length) {
    parts.push("<h3>Responsibilities</h3><ul>");
    for (const r of responsibilities) parts.push(`<li>${r}</li>`);
    parts.push("</ul>");
  }
  if (qualifications && qualifications.length) {
    parts.push("<h3>Qualifications</h3><ul>");
    for (const q of qualifications) parts.push(`<li>${q}</li>`);
    parts.push("</ul>");
  }
  return parts.join("");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: jobs, error } = await admin
      .from("jobs")
      .select("id, title, department, rate, apply_url, description, region, qualifications, responsibilities, created_at, updated_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const SITE = "https://outstahub.com";
    const PUB_DATE = new Date().toUTCString();

    const jobNodes = (jobs || []).map((j) => {
      const url = `${SITE}/job/${j.id}`;
      const desc = buildDescription(j.description, j.responsibilities as string[] | null, j.qualifications as string[] | null);
      const city = (j.region && j.region !== "all") ? j.region : "Remote";
      return `    <job>
      <title>${cdata(j.title)}</title>
      <date>${escapeXml(new Date(j.created_at).toUTCString())}</date>
      <referencenumber>${escapeXml(j.id)}</referencenumber>
      <url>${cdata(url)}</url>
      <company>${cdata("OutSta")}</company>
      <city>${cdata(city)}</city>
      <state>${cdata("")}</state>
      <country>${cdata("Philippines")}</country>
      <postalcode>${cdata("")}</postalcode>
      <description>${cdata(desc)}</description>
      <salary>${cdata(j.rate || "")}</salary>
      <education>${cdata("")}</education>
      <jobtype>${cdata("fulltime")}</jobtype>
      <category>${cdata(j.department || "General")}</category>
      <experience>${cdata("")}</experience>
      <remotetype>${cdata("Fully Remote")}</remotetype>
    </job>`;
    }).join("\n");

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<source>
  <publisher>OutSta</publisher>
  <publisherurl>${SITE}</publisherurl>
  <lastBuildDate>${PUB_DATE}</lastBuildDate>
${jobNodes}
</source>`;

    return new Response(xml, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    console.error("indeed-feed error", e);
    return new Response(`<?xml version="1.0"?><error>${(e as Error).message}</error>`, {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/xml" },
    });
  }
});
