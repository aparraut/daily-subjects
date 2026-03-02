import {
  SUBJECTS,
  ACTIVE_SUBJECTS,
  formatDate,
  toISODateLocal,
  getProgressColor,
  calculateWeekNumber,
  getCustomWeekNumber,
  fetchWeekData,
  normalizeDate,
  upsertDailyScore,
  deleteDailyScore
} from "./data.js";
import {
  getUIRefs,
  initTheme,
  showAuth,
  showHome,
  showApp,
  updateRowTotal,
  isValidScoreInput
} from "./ui.js";
import { initAuth, refreshUIBySession } from "./auth.js";

const SUPABASE_URL = "https://sfippoqwuunkpipegzra.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmaXBwb3F3dXVua3BpcGVnenJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NDMyODcsImV4cCI6MjA3NzMxOTI4N30.p7iiJxu-sWNgpTRMWOSQDkf2poK4q6B1FSlt6XKv25E";
window.supabaseClient = window.supabaseClient || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabase = window.supabaseClient;

const refs = getUIRefs();
initTheme(refs.themeBtn);

let showAllSubjects = false;

function goToApp(){
  showApp(refs);
  refs.dateInput.valueAsDate = new Date();
  loadWeeklyTableAnimated(new Date());
}

async function loadWeeklyTable(baseDate){
  const { records, sunday, saturday } = await fetchWeekData(supabase, baseDate);
  const weekNumber = calculateWeekNumber(baseDate);
  refs.weekRangeEl.textContent = `Semana ${weekNumber}: ${formatDate(sunday)} - ${formatDate(saturday)}`;

  const visibleSubjects = showAllSubjects ? SUBJECTS : ACTIVE_SUBJECTS;
  const allSubjectsForGrouping = new Set([...SUBJECTS, ...ACTIVE_SUBJECTS]);
  const grouped = {};
  allSubjectsForGrouping.forEach(sub => { grouped[sub] = Array(7).fill(""); });

  records.forEach(r=>{
    const d = normalizeDate(new Date(r.study_date + "T00:00:00"));
    const dayIndex = d.getDay();
    if(!grouped[r.subject_name]) grouped[r.subject_name] = Array(7).fill("");
    grouped[r.subject_name][dayIndex] = r.score ?? "";
  });

  refs.tbody.innerHTML = "";
  visibleSubjects.forEach(sub=>{
    const row = document.createElement("tr");
    let total = 0;

    const subjectCell = document.createElement("td");
    const subjectBold = document.createElement("b");
    subjectBold.textContent = sub;
    subjectCell.appendChild(subjectBold);
    row.appendChild(subjectCell);

    for(let i=0;i<7;i++){
      const currentDate = new Date(sunday); currentDate.setDate(sunday.getDate()+i);
      const isoDate = toISODateLocal(currentDate);
      const value = (grouped[sub] ? grouped[sub][i] : "") || "";
      if(value) total += Number(value);

      const dayCell = document.createElement("td");
      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.max = "5";
      input.step = "1";
      input.placeholder = "-";
      input.dataset.subject = sub;
      input.dataset.date = isoDate;
      input.value = value;
      dayCell.appendChild(input);
      row.appendChild(dayCell);
    }

    const progress = Math.min((total/35)*100,100).toFixed(1);
    const color = getProgressColor(total);
    const totalCell = document.createElement("td");
    totalCell.className = "total-cell";
    totalCell.style.fontWeight = "800";
    totalCell.style.textAlign = "center";

    const totalValue = document.createElement("span");
    totalValue.className = "total-value";
    totalValue.textContent = total || "";
    totalCell.appendChild(totalValue);

    const progressContainer = document.createElement("div");
    progressContainer.className = "progress-container";
    const progressBar = document.createElement("div");
    progressBar.className = "progress-bar";
    progressBar.style.width = `${progress}%`;
    progressBar.style.background = color;
    progressContainer.appendChild(progressBar);
    totalCell.appendChild(progressContainer);

    row.appendChild(totalCell);
    if(total>=20) row.classList.add("highlight-green");
    refs.tbody.appendChild(row);
  });

  document.querySelectorAll("input[data-subject]").forEach(input=>{
    input.addEventListener("input", e => {
      isValidScoreInput(e.target);
      updateRowTotal(e.target.closest("tr"), getProgressColor);
    });
    input.addEventListener("blur", onBlurSave);
  });
}

async function onBlurSave(e) {
  const input = e.target;
  if(!isValidScoreInput(input)){
    input.reportValidity();
    return;
  }

  const subject = input.dataset.subject;
  const date = input.dataset.date;
  const rawScore = input.value.trim();
  const score = rawScore === "" ? null : Number(rawScore);

  input.disabled = true;
  try {
    const { data: { user }, error: getUserErr } = await supabase.auth.getUser();
    if (getUserErr) {
      console.error("[getUser] error:", getUserErr);
      alert("Error: Sesion invalida. Revisa consola.");
      return;
    }
    if (!user?.id) {
      alert("Inicia sesion para guardar.");
      return;
    }

    if (score === null) {
      const { error: deleteErr } = await deleteDailyScore(supabase, user.id, subject, date);
      if (deleteErr) {
        console.error("DELETE error:", deleteErr);
        alert("Error: No se pudo borrar: " + (deleteErr.message || "revisa consola"));
      }
      return;
    }

    if (!Number.isInteger(score) || score < 1 || score > 5) {
      alert("Error: El valor debe ser un entero entre 1 y 5.");
      input.value = "";
      updateRowTotal(input.closest("tr"), getProgressColor);
      return;
    }

    const payload = {
      user_id: user.id,
      subject_name: subject,
      study_date: date,
      score,
      custom_week_number: getCustomWeekNumber(date)
    };

    const { error: upsertErr } = await upsertDailyScore(supabase, payload);
    if (upsertErr) {
      console.error("UPSERT error:", upsertErr);
      alert("Error: No se pudo guardar: " + (upsertErr.message || "revisa consola"));
      return;
    }
  } finally {
    input.disabled = false;
  }
}

async function loadWeeklyTableAnimated(baseDate){
  const table = document.querySelector("#weeklyTable");
  table.style.opacity = 0;
  await loadWeeklyTable(baseDate);
  setTimeout(()=>{ table.style.transition="opacity .35s"; table.style.opacity=1; }, 30);
}

refs.prevBtn.addEventListener("click", ()=>{
  const current = new Date(refs.dateInput.value);
  current.setDate(current.getDate()-7);
  refs.dateInput.valueAsDate = current;
  loadWeeklyTableAnimated(current);
});

refs.nextBtn.addEventListener("click", ()=>{
  const current = new Date(refs.dateInput.value);
  current.setDate(current.getDate()+7);
  refs.dateInput.valueAsDate = current;
  loadWeeklyTableAnimated(current);
});

refs.dateInput.addEventListener("change", e => loadWeeklyTableAnimated(new Date(e.target.value)));

refs.toggleSubjectsBtn.addEventListener("click", ()=>{
  showAllSubjects = !showAllSubjects;
  refs.toggleSubjectsBtn.textContent = showAllSubjects ? "Ver solo activas (6)" : "Ver historico (12)";
  loadWeeklyTableAnimated(new Date(refs.dateInput.value));
});

initAuth({
  supabase,
  refs,
  showAuth,
  isAppVisible: () => refs.appContent.style.display === "block",
  goToApp
});

document.addEventListener("DOMContentLoaded", async ()=>{
  await refreshUIBySession(supabase, refs, showAuth, showHome);
});
