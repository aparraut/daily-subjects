export const TABLE = "daily_subjects";

export const SUBJECTS = [
  "Estudio Biblia","Estudio FilosofÃ­a","Estudio Idiomas","InformÃ¡tica",
  "MeditaciÃ³n","Escritura","Lectura","Ejercicios","ConexiÃ³n con Dios",
  "Crec. personal","AdmÃ³n. Casa","Mejora laboral"
];

export const ACTIVE_SUBJECTS = [
  "Estudio Biblia",
  "Estudio Idiomas",
  "InformÃ¡tica",
  "Lectura",
  "Ejercicios",
  "Bienestar personal"
];

export const WEEK1_ANCHOR = new Date(2025, 7, 3);

export function normalizeDate(date){ return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
export function startOfWeek(date){ const d = normalizeDate(date); const day = d.getDay(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()-day); }
export function formatDate(date){ return date.toLocaleDateString("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"}); }
export function toISODateLocal(d){ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,"0"); const day=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${day}`; }

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
