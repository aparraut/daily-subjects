export const TABLE = "daily_subjects";
export const SUBJECTS_TABLE = "user_subjects";
export const PLANS_TABLE = "subject_plans";
export const PLAN_ITEMS_TABLE = "subject_plan_items";

export const SUBJECTS = [
  "Estudio Biblia","Estudio Filosofia","Estudio Idiomas","Informatica",
  "Meditacion","Escritura","Lectura","Ejercicios","Conexion con Dios",
  "Crec. personal","Admon. Casa","Mejora laboral"
];

export const ACTIVE_SUBJECTS = [
  "Estudio Biblia",
  "Estudio Idiomas",
  "Informatica",
  "Lectura",
  "Ejercicios",
  "Bienestar personal"
];
export const DEFAULT_SUBJECTS = Array.from(new Set([...ACTIVE_SUBJECTS, ...SUBJECTS]));

export const WEEK1_ANCHOR = new Date(2025, 7, 3);

export function normalizeDate(date){ return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
export function startOfWeek(date){ const d = normalizeDate(date); const day = d.getDay(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()-day); }
export function formatDate(date){ return date.toLocaleDateString("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"}); }
export function toISODateLocal(d){ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,"0"); const day=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${day}`; }
export function normalizeSubjectName(name){ return (name || "").trim().replace(/\s+/g, " "); }

export function getProgressColor(total){ if(total<15) return "#e53e3e"; if(total<20) return "#ecc94b"; return "#38a169"; }

export function calculateWeekNumber(baseDate){
  const anchorSunday = startOfWeek(WEEK1_ANCHOR);
  const currentSunday = startOfWeek(baseDate);
  const diffDays = Math.floor((currentSunday - anchorSunday)/(1000*60*60*24));
  return Math.floor(diffDays/7)+1;
}

export function getCustomWeekNumber(dateStr){
  const d = new Date(dateStr + "T00:00:00");
  const anchorSunday = startOfWeek(WEEK1_ANCHOR);
  const currentSunday = startOfWeek(d);
  const diffDays = Math.floor((currentSunday - anchorSunday)/(1000*60*60*24));
  return Math.floor(diffDays/7)+1;
}

export async function fetchWeekData(supabase, baseDate){
  const sunday = startOfWeek(baseDate);
  const saturday = new Date(sunday); saturday.setDate(sunday.getDate()+6);

  const { data:{ user } } = await supabase.auth.getUser();
  if(!user){ return { records:[], sunday, saturday }; }

  const { data, error: selectErr } = await supabase
    .from(TABLE)
    .select("*")
    .eq("user_id", user.id)
    .gte("study_date", toISODateLocal(sunday))
    .lte("study_date", toISODateLocal(saturday));

  if(selectErr){
    console.error("Supabase select error:", selectErr);
    return { records:[], sunday, saturday };
  }
  return { records: data||[], sunday, saturday };
}

export async function fetchScoresInRange(supabase, userId, fromDate, toDate){
  return supabase
    .from(TABLE)
    .select("subject_name,study_date,score")
    .eq("user_id", userId)
    .gte("study_date", fromDate)
    .lte("study_date", toDate)
    .order("study_date", { ascending: true });
}

export async function fetchUserSubjects(supabase, userId, includeArchived = true){
  let query = supabase
    .from(SUBJECTS_TABLE)
    .select("id,name,is_archived,archived_at,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if(!includeArchived){
    query = query.eq("is_archived", false);
  }
  return query;
}

export async function ensureDefaultSubjects(supabase, userId){
  const { data: existing, error: existingErr } = await fetchUserSubjects(supabase, userId, true);
  if(existingErr){
    return { error: existingErr };
  }
  if((existing || []).length > 0){
    return { error: null };
  }

  const rows = DEFAULT_SUBJECTS.map((name, idx) => ({
    user_id: userId,
    name,
    is_archived: false,
    display_order: idx
  }));
  const { error } = await supabase.from(SUBJECTS_TABLE).insert(rows);
  return { error: error || null };
}

export async function createSubject(supabase, userId, name){
  return supabase
    .from(SUBJECTS_TABLE)
    .insert({ user_id: userId, name: normalizeSubjectName(name), is_archived: false })
    .select("id,name,is_archived,archived_at,created_at")
    .single();
}

export async function setSubjectArchived(supabase, userId, subjectId, isArchived){
  return supabase
    .from(SUBJECTS_TABLE)
    .update({
      is_archived: !!isArchived,
      archived_at: isArchived ? new Date().toISOString() : null
    })
    .eq("id", subjectId)
    .eq("user_id", userId);
}

export async function fetchPlans(supabase, userId){
  const { data: plans, error: plansErr } = await supabase
    .from(PLANS_TABLE)
    .select("id,user_id,name,start_date,end_date,created_at")
    .eq("user_id", userId)
    .order("start_date", { ascending: true });
  if(plansErr){
    return { data: [], error: plansErr };
  }

  const planIds = (plans || []).map(p => p.id);
  if(planIds.length === 0){
    return { data: [], error: null };
  }

  const { data: items, error: itemsErr } = await supabase
    .from(PLAN_ITEMS_TABLE)
    .select("plan_id,subject_id,subject_name,subject_name_snapshot")
    .in("plan_id", planIds);
  if(itemsErr){
    return { data: [], error: itemsErr };
  }

  const byPlan = {};
  (items || []).forEach(it => {
    byPlan[it.plan_id] = byPlan[it.plan_id] || [];
    const displayName = it.subject_name_snapshot || it.subject_name;
    if(displayName){
      byPlan[it.plan_id].push(displayName);
    }
  });

  const merged = (plans || []).map(plan => ({
    ...plan,
    subjects: (byPlan[plan.id] || []).sort((a, b) => a.localeCompare(b, "es"))
  }));
  return { data: merged, error: null };
}

export function getActivePlanForDate(plans, date){
  const iso = toISODateLocal(normalizeDate(date));
  const matches = (plans || []).filter(plan => plan.start_date <= iso && plan.end_date >= iso);
  if(matches.length === 0) return null;
  matches.sort((a, b) => {
    if(a.start_date === b.start_date){
      return (b.created_at || "").localeCompare(a.created_at || "");
    }
    return b.start_date.localeCompare(a.start_date);
  });
  return matches[0];
}

export async function createPlan(supabase, payload){
  const { data, error } = await supabase.rpc("create_subject_plan", {
    p_name: payload.name,
    p_start_date: payload.start_date,
    p_end_date: payload.end_date,
    p_subject_ids: payload.subject_ids || []
  });
  if(error){
    return { data: null, error };
  }
  const plan = Array.isArray(data) ? data[0] : data;
  return { data: plan || null, error: null };
}

export async function deletePlan(supabase, userId, planId){
  return supabase
    .from(PLANS_TABLE)
    .delete()
    .eq("id", planId)
    .eq("user_id", userId);
}

export async function upsertDailyScore(supabase, payload){
  return supabase
    .from(TABLE)
    .upsert(payload, { onConflict: "user_id,subject_name,study_date" });
}

export async function deleteDailyScore(supabase, userId, subject, date){
  return supabase
    .from(TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("subject_name", subject)
    .eq("study_date", date);
}
