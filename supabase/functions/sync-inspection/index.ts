import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const labels: Record<string, string[]> = {
  "53": ["Fifth wheel plate connected", "Landing gear raised", "Air, brake, and electrical lines connected"],
  container: ["Fifth wheel plate connected", "Landing gear raised", "Air, brake, and electrical lines connected"],
  pup: ["Fifth wheel plate connected", "Landing gear raised", "Air, brake, and electrical lines connected"],
  doubles: ["Fifth wheel plate connected to Trailer 1", "Trailer 1 landing gear raised", "Pintle hook connected and closed", "Safety chains connected", "Air, brake, and electrical lines connected", "Fifth wheel plate connected to Trailer 2", "Trailer 2 landing gear raised"]
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" }
});

function decodeDataUrl(value: string) {
  const match = value.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) throw new Error("A synchronized photo has an invalid format.");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return { mimeType: match[1], bytes };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = req.headers.get("Authorization") || "";
    if (!url || !serviceKey || !authHeader.startsWith("Bearer ")) return json({ error: "Synchronization is not configured." }, 401);
    const client = createClient(url, serviceKey);
    const { data: authData, error: authError } = await client.auth.getUser(authHeader.slice(7));
    if (authError || !authData.user) return json({ error: "Driver session is unavailable." }, 401);
    const { data: profile, error: profileError } = await client.from("employee_profiles").select("company_id").eq("id", authData.user.id).single();
    if (profileError || !profile) throw profileError || new Error("Driver profile was not found.");
    const { entry, photo_item: photoItem } = await req.json();
    if (!entry?.id || !entry?.submitted_at) return json({ error: "A complete submitted inspection is required." }, 400);

    if (photoItem) {
      if (!photoItem.key || !photoItem.photo?.data_url) return json({ ok: false, error: "A complete inspection photo is required." });
      const { data: existingPhoto, error: existingPhotoError } = await client.from("inspection_photos")
        .select("photo_key").eq("inspection_id", entry.id).eq("photo_key", photoItem.key).is("deleted_at", null).maybeSingle();
      if (existingPhotoError) throw existingPhotoError;
      if (existingPhoto) return json({ ok: true, inspection_id: entry.id, photo_key: photoItem.key, already_saved: true });

      const decoded = decodeDataUrl(photoItem.photo.data_url);
      const path = `${profile.company_id}/${authData.user.id}/${entry.id}/${photoItem.key}.jpg`;
      const { error: uploadError } = await client.storage.from("inspection-photos").upload(path, decoded.bytes, { contentType: decoded.mimeType, upsert: true });
      if (uploadError) throw uploadError;
      const { error: photoError } = await client.from("inspection_photos").insert({
        company_id: profile.company_id,
        inspection_id: entry.id,
        driver_id: authData.user.id,
        photo_key: photoItem.key,
        photo_label: photoItem.label,
        display_order: photoItem.order,
        is_required: photoItem.required,
        status: "uploaded",
        source: "upload",
        storage_path: path,
        original_file_name: photoItem.photo.name || `${photoItem.key}.jpg`,
        mime_type: decoded.mimeType,
        file_size_bytes: decoded.bytes.length,
        captured_at: entry.submitted_at,
        gps_status: "not_captured",
        created_by: authData.user.id,
        updated_by: authData.user.id,
        deleted_at: null
      });
      if (photoError && photoError.code !== "23505") throw photoError;
      return json({ ok: true, inspection_id: entry.id, photo_key: photoItem.key });
    }

    const equipmentType = ({ "53": "53_trailer", container: "container", pup: "single_pup", doubles: "doubles", bobtail: "bobtail" } as Record<string, string>)[entry.type] || "bobtail";
    const inspection = {
      id: entry.id,
      company_id: profile.company_id,
      driver_id: authData.user.id,
      equipment_type: equipmentType,
      status: entry.bypass ? "flagged" : "verified",
      truck_number: entry.truck || "NA",
      trailer_1_number: entry.trailer1 || "NA",
      chassis_id: entry.chassis || "NA",
      dolly_number: entry.dolly || "NA",
      trailer_2_number: entry.trailer2 || "NA",
      location_from: entry.from || "NA",
      location_to: entry.to || "NA",
      notes: entry.notes || "NA",
      started_at: entry.created_at || entry.submitted_at,
      submitted_at: entry.submitted_at,
      driver_certified: Boolean(entry.certified),
      has_bypass: Boolean(entry.bypass),
      gps_start_status: "not_captured",
      gps_submit_status: "not_captured",
      created_by: authData.user.id,
      updated_by: authData.user.id,
      template_snapshot: {
        bypass_reason: entry.bypass_reason || null,
        photo_count: Object.keys(entry.photos || {}).length,
        extra_photo_count: (entry.extra_photos || []).length,
        source: "driver-live-edge-sync"
      }
    };
    const { error: inspectionError } = await client.from("inspections").upsert(inspection, { onConflict: "id" });
    if (inspectionError) throw inspectionError;

    return json({ ok: true, inspection_id: entry.id, photo_count: 0 });
  } catch (error) {
    console.error("sync-inspection error:", error);
    const detail = error && typeof error === "object" ? JSON.stringify(error) : String(error);
    return json({ ok: false, error: error instanceof Error ? error.message : detail }, 200);
  }
});
