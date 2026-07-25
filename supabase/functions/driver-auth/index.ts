import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withSupabase } from "jsr:@supabase/server@^1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validPassword(password: string, employeeId: string) {
  return password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password) &&
    /^[A-Za-z0-9]+$/.test(password) &&
    !password.toLowerCase().includes(employeeId.toLowerCase());
}

export default {
  fetch: withSupabase({ auth: ["publishable", "user"] }, async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !anonKey || !serviceRoleKey) {
        return json({ ok: false, error: "Missing Supabase environment variables." }, 500);
      }

      const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const body = await req.json();
      const action = String(body.action || "");

      if (action === "login") {
        const employeeId = String(body.employeeId || "").trim();
        const password = String(body.password || "");
        if (!employeeId || !password) {
          return json({ ok: false, error: "Employee ID and password are required." }, 400);
        }

        const { data: profile, error: profileError } = await admin
          .from("employee_profiles")
          .select("id, full_name, display_name, employee_id, email, phone, role, status, password_reset_required, failed_login_count, deleted_at")
          .eq("employee_id", employeeId)
          .maybeSingle();
        if (profileError || !profile || profile.deleted_at) {
          return json({ ok: false, error: "Employee ID or password is incorrect." });
        }
        if (profile.status !== "active") {
          return json({ ok: false, error: "This account is not active. Contact an administrator." });
        }

        const failed = Number(profile.failed_login_count || 0);
        if (failed >= 5) {
          return json({ ok: false, error: "This account is locked. Contact an administrator." });
        }

        const authClient = createClient(supabaseUrl, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: signIn, error: signInError } = await authClient.auth.signInWithPassword({
          email: profile.email,
          password,
        });
        if (signInError || !signIn.session) {
          const nextFailed = failed + 1;
          await admin.from("employee_profiles").update({
            failed_login_count: nextFailed,
            updated_at: new Date().toISOString(),
          }).eq("id", profile.id);
          const message = nextFailed >= 5
            ? "This account is now locked. Contact an administrator."
            : `Employee ID or password is incorrect. ${5 - nextFailed} attempt${5 - nextFailed === 1 ? "" : "s"} remaining.`;
          return json({ ok: false, error: message });
        }

        await admin.from("employee_profiles").update({
          failed_login_count: 0,
          updated_at: new Date().toISOString(),
        }).eq("id", profile.id);

        return json({
          ok: true,
          accessToken: signIn.session.access_token,
          refreshToken: signIn.session.refresh_token,
          mustChangePassword: Boolean(profile.password_reset_required),
          profile: {
            id: profile.id,
            full_name: profile.full_name,
            display_name: profile.display_name,
            employee_id: profile.employee_id,
            email: profile.email,
            phone: profile.phone,
            role: profile.role,
            status: profile.status,
          },
        });
      }

      if (action === "change_password") {
        const authorization = req.headers.get("Authorization") || "";
        const token = authorization.replace(/^Bearer\s+/i, "");
        const { data: authData, error: authError } = await admin.auth.getUser(token);
        if (authError || !authData.user) {
          return json({ ok: false, error: "Your login expired. Please log in again." });
        }

        const { data: profile, error: profileError } = await admin
          .from("employee_profiles")
          .select("id, employee_id, status")
          .eq("id", authData.user.id)
          .single();
        if (profileError || !profile || profile.status !== "active") {
          return json({ ok: false, error: "An active driver account is required." });
        }

        const password = String(body.password || "");
        if (!validPassword(password, profile.employee_id)) {
          return json({
            ok: false,
            error: "Password must use at least 8 letters and numbers, including one capital and one number, with no special characters or Employee ID.",
          });
        }

        const { error: updateAuthError } = await admin.auth.admin.updateUserById(profile.id, {
          password,
        });
        if (updateAuthError) return json({ ok: false, error: updateAuthError.message });

        const { error: updateProfileError } = await admin.from("employee_profiles").update({
          password_reset_required: false,
          failed_login_count: 0,
          updated_at: new Date().toISOString(),
        }).eq("id", profile.id);
        if (updateProfileError) return json({ ok: false, error: updateProfileError.message });

        return json({ ok: true });
      }

      return json({ ok: false, error: "Unsupported action." }, 400);
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : "Unexpected error." }, 500);
    }
  }),
};
