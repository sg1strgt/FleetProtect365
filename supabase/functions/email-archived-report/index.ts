import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" }
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const authHeader = req.headers.get("Authorization") || "";
    if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !authHeader.startsWith("Bearer ")) {
      throw new Error("Archived-report email is not configured.");
    }
    const { reportId, recipientEmail } = await req.json();
    const email = String(recipientEmail || "").trim().toLowerCase();
    if (!reportId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "A valid report and recipient email are required." }, 400);
    }
    const client = createClient(supabaseUrl, serviceRoleKey);
    const { data: authData, error: authError } = await client.auth.getUser(authHeader.slice(7));
    if (authError || !authData.user) return json({ error: "Admin session is unavailable." }, 401);
    const { data: profile, error: profileError } = await client
      .from("employee_profiles").select("company_id,role,full_name")
      .eq("id", authData.user.id).single();
    if (profileError) throw profileError;
    if (!["admin", "super_admin"].includes(profile.role)) return json({ error: "Admin access is required." }, 403);
    const { data: report, error: reportError } = await client
      .from("end_shift_reports")
      .select("report_id,pdf_file_name,storage_path,report_date,company_id")
      .eq("report_id", reportId).single();
    if (reportError) throw reportError;
    if (profile.role !== "super_admin" && report.company_id !== profile.company_id) {
      return json({ error: "This report belongs to another company." }, 403);
    }
    if (!report.storage_path) throw new Error("The archived PDF is not available.");
    const { data: file, error: downloadError } = await client.storage
      .from("end-shift-reports").download(report.storage_path);
    if (downloadError) throw downloadError;
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    const fromEmail = Deno.env.get("REPORT_FROM_EMAIL") ||
      "Fleet Protect 365 <reports@fleetprotect365.com>";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: `${report.report_id} - Fleet Protect 365 Archived Report`,
        html: `<h2>Fleet Protect 365 Archived End-of-Shift Report</h2>
          <p><strong>Report ID:</strong> ${report.report_id}</p>
          <p><strong>Report date:</strong> ${report.report_date}</p>
          <p>This copy was sent by ${profile.full_name || "an administrator"}.</p>`,
        attachments: [{ filename: report.pdf_file_name, content: btoa(binary) }]
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.message || "The email provider rejected the message.");
    return json({ ok: true, email_id: result?.id || null, recipient: email });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
