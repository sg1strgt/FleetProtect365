import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const safe = (value: unknown, max = 200) => String(value ?? "").replace(/[<>]/g, "").slice(0, max);

const handleRequest = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let stage = "configuration";
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const authHeader = req.headers.get("Authorization") || "";
    if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !authHeader.startsWith("Bearer ")) {
      throw new Error("Record-report email is not configured.");
    }
    stage = "request";
    const body = await req.json();
    const reportType = body.reportType === "callout" ? "callout" : body.reportType === "timeoff" ? "timeoff" : "";
    const pdfBase64 = String(body.pdfBase64 || "");
    if (!reportType || !body.recipientId || !pdfBase64 || pdfBase64.length > 12_000_000) {
      return json({ error: "A valid report, PDF, and recipient are required." }, 400);
    }
    const client = createClient(supabaseUrl, serviceRoleKey);
    stage = "admin authorization";
    const { data: authData, error: authError } = await client.auth.getUser(authHeader.slice(7));
    if (authError || !authData.user) return json({ error: "Admin session is unavailable." }, 401);
    const { data: profile, error: profileError } = await client.from("employee_profiles")
      .select("company_id,role,full_name").eq("id", authData.user.id).single();
    if (profileError) throw profileError;
    if (!["admin", "super_admin"].includes(profile.role)) return json({ error: "Admin access is required." }, 403);
    stage = "recipient lookup";
    const { data: recipient, error: recipientError } = await client.from("report_recipients")
      .select("id,company_id,display_name,email,active,deleted_at")
      .eq("id", body.recipientId).eq("company_id", profile.company_id).single();
    if (recipientError) throw recipientError;
    if (!recipient.active || recipient.deleted_at) return json({ error: "The selected recipient is inactive." }, 400);
    const title = reportType === "callout" ? "Call Out Record Report" : "Requested Time Off Report";
    const fileName = safe(body.fileName, 180) || `FleetProtect365_${reportType}_report.pdf`;
    const fromEmail = Deno.env.get("REPORT_FROM_EMAIL") || Deno.env.get("RESEND_FROM_EMAIL") ||
      "Fleet Protect 365 <reports@fleetprotect365.com>";
    stage = "email delivery";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipient.email],
        subject: `Fleet Protect 365 - ${title}`,
        html: `<h2>Fleet Protect 365</h2><h3>${title}</h3>
          <p><strong>Employee:</strong> ${safe(body.driverName) || "All employees"}</p>
          <p><strong>Date range:</strong> ${safe(body.dateFrom) || "All"} through ${safe(body.dateTo) || "All"}</p>
          <p><strong>Records:</strong> ${Number(body.recordCount || 0)}</p>
          <p>This PDF was sent by ${safe(profile.full_name) || "an administrator"}.</p>`,
        attachments: [{ filename: fileName, content: pdfBase64 }],
      }),
    });
    const responseText = await response.text();
    let result: Record<string, unknown> = {};
    try { result = responseText ? JSON.parse(responseText) : {}; } catch { result = { message: responseText }; }
    if (!response.ok) throw new Error(String(result?.message || result?.error || "The email provider rejected the message."));
    return json({ ok: true, recipient: recipient.email, email_id: result?.id || null });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : String(error), stage }, 500);
  }
};

export default { fetch: handleRequest };
