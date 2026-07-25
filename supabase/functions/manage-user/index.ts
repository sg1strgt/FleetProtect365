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
  fetch: withSupabase({ auth: ["publishable"] }, async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ ok: false, error: "Missing Supabase environment variables." }, 500);
    }

    const authorization = req.headers.get("Authorization") || "";
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return json({ ok: false, error: "Not authenticated." }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: callerProfile, error: profileError } = await admin
      .from("employee_profiles")
      .select("id, company_id, role, status")
      .eq("id", userData.user.id)
      .single();
    if (profileError || !callerProfile) return json({ ok: false, error: "Admin profile not found." }, 403);
    if (!["admin", "super_admin"].includes(callerProfile.role) || callerProfile.status !== "active") {
      return json({ ok: false, error: "Active Admin or Super Admin access required." }, 403);
    }

    const body = await req.json();
    const action = String(body.action || "");

    if (action === "create_user") {
      const displayName = String(body.displayName || "").trim();
      const fullName = String(body.fullName || "").trim();
      const employeeId = String(body.employeeId || "").trim();
      const phone = String(body.phone || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const role = String(body.role || "driver");
      const status = String(body.status || "active");

      if (!displayName || !fullName || !employeeId || !phone || !email || !password) {
        return json({ ok: false, error: "Complete all required fields." }, 400);
      }
      if (!["driver", "admin"].includes(role)) return json({ ok: false, error: "Invalid role." }, 400);
      if (!["active", "inactive", "suspended"].includes(status)) {
        return json({ ok: false, error: "Invalid status." }, 400);
      }
      if (!validPassword(password, employeeId)) {
        return json({ ok: false, error: "Temporary password does not meet policy." }, 400);
      }

      const { data: existingId } = await admin.from("employee_profiles").select("id")
        .eq("employee_id", employeeId).maybeSingle();
      if (existingId) return json({ ok: false, error: "Employee ID already exists." }, 409);
      const { data: existingEmail } = await admin.from("employee_profiles").select("id")
        .ilike("email", email).maybeSingle();
      if (existingEmail) return json({ ok: false, error: "Email already exists." }, 409);

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName, full_name: fullName, employee_id: employeeId },
      });
      if (createError || !created.user) {
        return json({ ok: false, error: createError?.message || "Auth user could not be created." }, 400);
      }

      const { error: insertError } = await admin.from("employee_profiles").insert({
        id: created.user.id,
        company_id: callerProfile.company_id,
        display_name: displayName,
        full_name: fullName,
        employee_id: employeeId,
        phone,
        email,
        role,
        status,
        title: role === "admin" ? "Admin" : "Driver",
        password_reset_required: true,
        failed_login_count: 0,
        drivers_license_number: body.driversLicenseNumber || null,
        drivers_license_state: body.driversLicenseState || null,
        drivers_license_expires: body.driversLicenseExpires || null,
        medical_card_expires: body.medicalCardExpires || null,
        created_by: callerProfile.id,
        updated_by: callerProfile.id,
      });
      if (insertError) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ ok: false, error: insertError.message }, 400);
      }

      await admin.from("employee_status_audit").insert({
        employee_profile_id: created.user.id,
        company_id: callerProfile.company_id,
        previous_status: null,
        new_status: status,
        reason: "User created",
        changed_by: callerProfile.id,
      });
      return json({ ok: true, userId: created.user.id });
    }

    const userId = String(body.userId || "");
    if (!userId) return json({ ok: false, error: "User ID is required." }, 400);
    const { data: target, error: targetError } = await admin.from("employee_profiles")
      .select("*").eq("id", userId).single();
    if (targetError || !target || target.company_id !== callerProfile.company_id) {
      return json({ ok: false, error: "User was not found in this company." }, 404);
    }
    if (target.role === "super_admin" && target.id !== callerProfile.id) {
      return json({ ok: false, error: "The Super Admin account is protected." }, 403);
    }

    if (action === "unlock_user") {
      const { error } = await admin.from("employee_profiles").update({
        failed_login_count: 0,
        updated_by: callerProfile.id,
        updated_at: new Date().toISOString(),
      }).eq("id", userId);
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "delete_user") {
      if (callerProfile.role !== "super_admin") {
        return json({ ok: false, error: "Only the Super Admin can delete users." }, 403);
      }
      if (target.role === "super_admin") {
        return json({ ok: false, error: "The Super Admin account cannot be deleted." }, 403);
      }
      const now = new Date().toISOString();
      const { error } = await admin.from("employee_profiles").update({
        status: "terminated",
        status_reason: String(body.reason || "Deleted from the admin portal"),
        deleted_at: now,
        updated_by: callerProfile.id,
        updated_at: now,
      }).eq("id", userId);
      if (error) return json({ ok: false, error: error.message }, 400);
      const { error: authError } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: "876000h",
      });
      if (authError) return json({ ok: false, error: authError.message }, 400);
      await admin.from("employee_status_audit").insert({
        employee_profile_id: userId,
        company_id: callerProfile.company_id,
        previous_status: target.status,
        new_status: "terminated",
        reason: String(body.reason || "Deleted from the admin portal"),
        changed_by: callerProfile.id,
      });
      return json({ ok: true });
    }

    if (action === "update_user") {
      const displayName = String(body.displayName || "").trim();
      const fullName = String(body.fullName || "").trim();
      const employeeId = String(body.employeeId || "").trim();
      const phone = String(body.phone || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const role = target.role === "super_admin" ? "super_admin" : String(body.role || target.role);
      const status = String(body.status || target.status);
      if (!displayName || !fullName || !employeeId || !phone || !email) {
        return json({ ok: false, error: "Complete all required fields." }, 400);
      }
      if (!["driver", "admin", "super_admin"].includes(role)) {
        return json({ ok: false, error: "Invalid role." }, 400);
      }
      if (!["active", "inactive", "suspended", "terminated"].includes(status)) {
        return json({ ok: false, error: "Invalid status." }, 400);
      }
      if (password && !validPassword(password, employeeId)) {
        return json({ ok: false, error: "Temporary password does not meet policy." }, 400);
      }

      const authUpdate: Record<string, unknown> = {
        email,
        user_metadata: { display_name: displayName, full_name: fullName, employee_id: employeeId },
      };
      if (password) authUpdate.password = password;
      if (status === "terminated") authUpdate.ban_duration = "876000h";
      if (target.status === "terminated" && status !== "terminated") authUpdate.ban_duration = "none";
      const { error: authError } = await admin.auth.admin.updateUserById(userId, authUpdate);
      if (authError) return json({ ok: false, error: authError.message }, 400);

      const updates: Record<string, unknown> = {
        display_name: displayName,
        full_name: fullName,
        employee_id: employeeId,
        phone,
        email,
        role,
        status,
        title: role === "super_admin" ? "Super Admin" : role === "admin" ? "Admin" : "Driver",
        drivers_license_number: body.driversLicenseNumber || null,
        drivers_license_state: body.driversLicenseState || null,
        drivers_license_expires: body.driversLicenseExpires || null,
        medical_card_expires: body.medicalCardExpires || null,
        updated_by: callerProfile.id,
        updated_at: new Date().toISOString(),
      };
      if (password) {
        updates.password_reset_required = Boolean(body.forcePasswordChange);
        updates.failed_login_count = 0;
      }
      const { error } = await admin.from("employee_profiles").update(updates).eq("id", userId);
      if (error) return json({ ok: false, error: error.message }, 400);
      if (target.status !== status) {
        await admin.from("employee_status_audit").insert({
          employee_profile_id: userId,
          company_id: callerProfile.company_id,
          previous_status: target.status,
          new_status: status,
          reason: "Status changed in user editor",
          changed_by: callerProfile.id,
        });
      }
      return json({ ok: true });
    }

    return json({ ok: false, error: "Unsupported action." }, 400);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Unexpected error." }, 500);
  }
  }),
};
