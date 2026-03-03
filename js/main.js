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
  initNotice,
  showAuth,
  showHome,
  showApp,
  updateRowTotal,
  isValidScoreInput,
  showNotice,
  openRecoveryModal,
  closeRecoveryModal
} from "./ui.js";
import { initAuth, refreshUIBySession } from "./auth.js";

const SUPABASE_URL = "https://sfippoqwuunkpipegzra.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmaXBwb3F3dXVua3BpcGVnenJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NDMyODcsImV4cCI6MjA3NzMxOTI4N30.p7iiJxu-sWNgpTRMWOSQDkf2poK4q6B1FSlt6XKv25E";
window.supabaseClient = window.supabaseClient || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabase = window.supabaseClient;

const refs = getUIRefs();
initTheme(refs.themeBtn);
initNotice(refs);

let showAllSubjects = false;
let latestLoadId = 0;

function goToApp(){
  showApp(refs);
  refs.dateInput.valueAsDate = new Date();
  loadWeeklyTableAnimated(new Date());
}

function setWeekLoading(isLoading){
  refs.prevBtn.disabled = isLoading;
  refs.nextBtn.disabled = isLoading;
  refs.dateInput.disabled = isLoading;
  refs.toggleSubjectsBtn.disabled = isLoading;
}

function markInputState(input, state){
  input.classList.remove("is-saving", "is-save-error", "is-save-ok");
  if(state) input.classList.add(state);
}

async function loadWeeklyTable(baseDate, loadId){
  const { records, sunday, saturday } = await fetchWeekData(supabase, baseDate);
  if(loadId !== latestLoadId) return;
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
  if(loadId !== latestLoadId) return;

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
    markInputState(input, "is-save-error");
    return;
  }

  const subject = input.dataset.subject;
  const date = input.dataset.date;
  const rawScore = input.value.trim();
  const score = rawScore === "" ? null : Number(rawScore);

  markInputState(input, "is-saving");
  input.disabled = true;
  try {
    const { data: { user }, error: getUserErr } = await supabase.auth.getUser();
    if (getUserErr) {
      console.error("[getUser] error:", getUserErr);
      showNotice(refs, "Error: Sesion invalida. Revisa consola.", "error");
      markInputState(input, "is-save-error");
      return;
    }
    if (!user?.id) {
      showNotice(refs, "Inicia sesion para guardar.", "error");
      markInputState(input, "is-save-error");
      return;
    }

    if (score === null) {
      const { error: deleteErr } = await deleteDailyScore(supabase, user.id, subject, date);
      if (deleteErr) {
        console.error("DELETE error:", deleteErr);
        showNotice(refs, "Error: No se pudo borrar: " + (deleteErr.message || "revisa consola"), "error");
        markInputState(input, "is-save-error");
        return;
      }
      markInputState(input, "is-save-ok");
      return;
    }

    if (!Number.isInteger(score) || score < 1 || score > 5) {
      showNotice(refs, "Error: El valor debe ser un entero entre 1 y 5.", "error");
      input.value = "";
      updateRowTotal(input.closest("tr"), getProgressColor);
      markInputState(input, "is-save-error");
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
      showNotice(refs, "Error: No se pudo guardar: " + (upsertErr.message || "revisa consola"), "error");
      markInputState(input, "is-save-error");
      return;
    }
    markInputState(input, "is-save-ok");
  } finally {
    input.disabled = false;
    setTimeout(()=>{
      if(input.isConnected) markInputState(input, null);
    }, 1200);
  }
}

async function loadWeeklyTableAnimated(baseDate){
  const table = document.querySelector("#weeklyTable");
  const loadId = ++latestLoadId;
  setWeekLoading(true);
  table.style.opacity = 0.45;
  try{
    await loadWeeklyTable(baseDate, loadId);
    if(loadId !== latestLoadId) return;
    setTimeout(()=>{
      table.style.transition = "opacity .35s";
      table.style.opacity = 1;
    }, 30);
  }catch(err){
    if(loadId === latestLoadId){
      console.error("[loadWeeklyTableAnimated] error", err);
      showNotice(refs, "Error cargando la semana. Intenta de nuevo.", "error");
    }
  }finally{
    if(loadId === latestLoadId) setWeekLoading(false);
  }
}

refs.prevBtn.addEventListener("click", ()=>{
  const current = refs.dateInput.value ? new Date(refs.dateInput.value) : new Date();
  current.setDate(current.getDate()-7);
  refs.dateInput.valueAsDate = current;
  loadWeeklyTableAnimated(current);
});

refs.nextBtn.addEventListener("click", ()=>{
  const current = refs.dateInput.value ? new Date(refs.dateInput.value) : new Date();
  current.setDate(current.getDate()+7);
  refs.dateInput.valueAsDate = current;
  loadWeeklyTableAnimated(current);
});

refs.dateInput.addEventListener("change", e => loadWeeklyTableAnimated(new Date(e.target.value)));

refs.toggleSubjectsBtn.addEventListener("click", ()=>{
  showAllSubjects = !showAllSubjects;
  refs.toggleSubjectsBtn.textContent = showAllSubjects ? "Ver solo activas (6)" : "Ver historico (12)";
  const selectedDate = refs.dateInput.value ? new Date(refs.dateInput.value) : new Date();
  loadWeeklyTableAnimated(selectedDate);
});

initAuth({
  supabase,
  refs,
  showAuth,
  isAppVisible: () => refs.appContent.style.display === "block",
  goToApp,
  openRecoveryModal,
  closeRecoveryModal,
  showNotice
});

document.addEventListener("DOMContentLoaded", async ()=>{
  await refreshUIBySession(supabase, refs, showAuth, showHome);
});
