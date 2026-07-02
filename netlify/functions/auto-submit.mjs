import { createClient } from "@supabase/supabase-js";
import sendSubmissionEmail from "./send-submission-email.mjs";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function todayISOAustralia() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function currentTimeAustralia() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Australia/Melbourne",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
}

export default async () => {
  try {
    const workDate = todayISOAustralia();
    const nowTime = currentTimeAustralia();

    const { data: businesses, error: businessError } = await supabase
      .from("businesses").select("*").eq("active", true);
    if (businessError) throw businessError;

    for (const business of businesses || []) {
      if (nowTime < String(business.auto_submit_time).slice(0, 5)) continue;

      const { data: shifts, error: shiftError } = await supabase
        .from("shifts").select("*")
        .eq("business_id", business.id).eq("work_date", workDate).is("submitted_at", null);
      if (shiftError) throw shiftError;

      for (const shift of shifts || []) {
        const submittedAt = new Date().toISOString();

        await supabase.from("shifts").update({ submitted_at: submittedAt }).eq("id", shift.id);
        await supabase.from("planned_jobs")
          .update({ submitted_at: submittedAt })
          .eq("business_id", business.id).eq("staff_id", shift.staff_id).eq("work_date", workDate)
          .is("submitted_at", null);

        await supabase.from("submissions").insert({
          business_id: business.id,
          staff_id: shift.staff_id,
          work_date: workDate,
          submitted_at: submittedAt
        });

        await sendSubmissionEmail(new Request("https://internal/send-submission-email", {
          method: "POST",
          body: JSON.stringify({ businessId: business.id, staffId: shift.staff_id, workDate })
        }));
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
};
