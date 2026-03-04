import {
  formatDate,
  toISODateLocal,
  getProgressColor,
  calculateWeekNumber,
  getCustomWeekNumber,
  fetchWeekData,
  normalizeDate,
  normalizeSubjectName,
  ensureDefaultSubjects,
  fetchUserSubjects,
  fetchPlans,
  getActivePlanForDate,
  createSubject,
  setSubjectArchived,
  createPlan,
  deletePlan,
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
let currentWeekDate = normalizeDate(new Date());
let subjects = [];
let plans = [];
let currentActivePlan = null;

function escapeHtml(text){
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function getAllSubjectNames(){
  return subjects.map(s => s.name);
}

function getActiveSubjectNames(){
  return subjects.filter(s => !s.is_archived).map(s => s.name);
}

function subjectNamesForWeek(baseDate, records){
  const recordsSubjects = (records || []).map(r => r.subject_name).filter(Boolean);
  currentActivePlan = getActivePlanForDate(plans, baseDate);
  let list = [];

  if(showAllSubjects){
    list = [...new Set([...getAllSubjectNames(), ...recordsSubjects])];
  }else if(currentActivePlan?.subjects?.length){
    list = [...new Set(currentActivePlan.subjects)];
  }else{
    list = [...new Set(getActiveSubjectNames())];
  }

  if(list.length === 0){
    list = [...new Set(recordsSubjects)];
  }
  return list.sort((a, b) => a.localeCompare(b, "es"));
}

function updateToggleSubjectsButton(baseDate){
  const plan = getActivePlanForDate(plans, baseDate);
  const baseCount = plan?.subjects?.length ? plan.subjects.length : getActiveSubjectNames().length;
  const allCount = getAllSubjectNames().length;
  refs.toggleSubjectsBtn.textContent = showAllSubjects
    ? `Ver solo vigentes (${baseCount})`
    : `Ver historico (${allCount})`;
}

function updateActivePlanLabel(baseDate){
  const plan = getActivePlanForDate(plans, baseDate);
  if(showAllSubjects){
    refs.activePlanText.textContent = "Mostrando historico completo de materias.";
    return;
  }
  if(plan){
    refs.activePlanText.textContent = `Plan activo: ${plan.name} (${formatDate(new Date(plan.start_date + "T00:00:00"))} - ${formatDate(new Date(plan.end_date + "T00:00:00"))})`;
  }else{
    refs.activePlanText.textContent = "Sin plan activo para esta fecha. Se muestran materias vigentes.";
  }
}

async function refreshUserConfigData(){
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if(userErr || !user?.id){
    return;
  }

  const { error: seedErr } = await ensureDefaultSubjects(supabase, user.id);
  if(seedErr){
    console.error("[ensureDefaultSubjects]", seedErr);
  }

  const [{ data: subjectsData, error: subjectsErr }, { data: plansData, error: plansErr }] = await Promise.all([
    fetchUserSubjects(supabase, user.id, true),
    fetchPlans(supabase, user.id)
  ]);

  if(subjectsErr){
    console.error("[fetchUserSubjects]", subjectsErr);
    showNotice(refs, "No se pudieron cargar las materias.", "error");
    subjects = [];
  }else{
    subjects = subjectsData || [];
  }

  if(plansErr){
    console.error("[fetchPlans]", plansErr);
    showNotice(refs, "No se pudieron cargar los planes.", "error");
    plans = [];
  }else{
    plans = plansData || [];
  }

  renderSubjectsList();
  renderPlanPicker();
  renderPlansList();
  updateToggleSubjectsButton(currentWeekDate);
  updateActivePlanLabel(currentWeekDate);
}

function openModal(modal){
  modal.style.display = "flex";
}

function closeModal(modal){
  modal.style.display = "none";
}

function renderSubjectsList(){
  if(subjects.length === 0){
    refs.subjectsList.innerHTML = `<p class="muted">No hay materias.</p>`;
    return;
  }
  refs.subjectsList.innerHTML = subjects.map(sub => `
    <div class="item-row ${sub.is_archived ? "is-archived" : ""}">
      <div class="subject-meta">
        <b>${escapeHtml(sub.name)}</b>
        <span class="chip">${sub.is_archived ? "Archivada" : "Activa"}</span>
      </div>
      <button type="button" data-subject-id="${sub.id}" data-subject-action="${sub.is_archived ? "restore" : "archive"}">
        ${sub.is_archived ? "Restaurar" : "Archivar"}
      </button>
    </div>
  `).join("");
}

function renderPlanPicker(){
  const selectable = subjects.filter(s => !s.is_archived);
  if(selectable.length === 0){
    refs.planSubjectsPicker.innerHTML = `<p class="muted">Crea o restaura materias activas para usarlas en planes.</p>`;
    return;
  }
  refs.planSubjectsPicker.innerHTML = selectable.map(sub => `
    <label class="picker-item">
      <input type="checkbox" value="${escapeHtml(sub.name)}">
      <span>${escapeHtml(sub.name)}</span>
    </label>
  `).join("");
}

function renderPlansList(){
  if(plans.length === 0){
    refs.plansList.innerHTML = `<p class="muted">No hay planes configurados.</p>`;
    return;
  }
  refs.plansList.innerHTML = plans.map(plan => `
    <article class="plan-card">
      <div class="plan-card-head">
        <div>
          <b>${escapeHtml(plan.name)}</b>
          <p class="muted">${formatDate(new Date(plan.start_date + "T00:00:00"))} - ${formatDate(new Date(plan.end_date + "T00:00:00"))}</p>
        </div>
        <button type="button" data-plan-id="${plan.id}" data-plan-action="delete">Eliminar</button>
      </div>
      <p>${(plan.subjects || []).map(name => `<span class="chip">${escapeHtml(name)}</span>`).join(" ") || "<span class='muted'>Sin materias</span>"}</p>
    </article>
  `).join("");
}

async function goToApp(){
  showApp(refs);
  currentWeekDate = normalizeDate(new Date());
  refs.dateInput.value = toISODateLocal(currentWeekDate);
  await refreshUserConfigData();
  await loadWeeklyTableAnimated(currentWeekDate);
}

async function loadWeeklyTable(baseDate, loadId){
  const { records, sunday, saturday } = await fetchWeekData(supabase, baseDate);
  if(loadId !== latestLoadId) return;

  const weekNumber = calculateWeekNumber(baseDate);
  refs.weekRangeEl.textContent = `Semana ${weekNumber}: ${formatDate(sunday)} - ${formatDate(saturday)}`;

  const visibleSubjects = subjectNamesForWeek(baseDate, records);
  updateToggleSubjectsButton(baseDate);
  updateActivePlanLabel(baseDate);
  const grouped = {};
  [...new Set([...visibleSubjects, ...records.map(r => r.subject_name)])].forEach(sub => {
    grouped[sub] = Array(7).fill("");
  });

  records.forEach(r => {
    const d = normalizeDate(new Date(r.study_date + "T00:00:00"));
    const dayIndex = d.getDay();
    if(!grouped[r.subject_name]) grouped[r.subject_name] = Array(7).fill("");
    grouped[r.subject_name][dayIndex] = r.score ?? "";
  });

  refs.tbody.innerHTML = "";
  visibleSubjects.forEach(sub => {
    const row = document.createElement("tr");
    let total = 0;

    const subjectCell = document.createElement("td");
    const subjectBold = document.createElement("b");
    subjectBold.textContent = sub;
    subjectCell.appendChild(subjectBold);
    row.appendChild(subjectCell);

    for(let i = 0; i < 7; i++){
      const currentDate = new Date(sunday);
      currentDate.setDate(sunday.getDate() + i);
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

    const progress = Math.min((total / 35) * 100, 100).toFixed(1);
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
    if(total >= 20) row.classList.add("highlight-green");
    refs.tbody.appendChild(row);
  });

  if(loadId !== latestLoadId) return;

  document.querySelectorAll("input[data-subject]").forEach(input => {
    input.addEventListener("input", e => {
      isValidScoreInput(e.target);
      updateRowTotal(e.target.closest("tr"), getProgressColor);
    });
    input.addEventListener("blur", onBlurSave);
  });
}

async function onBlurSave(e){
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
  try{
    const { data: { user }, error: getUserErr } = await supabase.auth.getUser();
    if(getUserErr){
      console.error("[getUser] error:", getUserErr);
      showNotice(refs, "Error: Sesion invalida. Revisa consola.", "error");
      markInputState(input, "is-save-error");
      return;
    }
    if(!user?.id){
      showNotice(refs, "Inicia sesion para guardar.", "error");
      markInputState(input, "is-save-error");
      return;
    }

    if(score === null){
      const { error: deleteErr } = await deleteDailyScore(supabase, user.id, subject, date);
      if(deleteErr){
        console.error("DELETE error:", deleteErr);
        showNotice(refs, "Error: No se pudo borrar: " + (deleteErr.message || "revisa consola"), "error");
        markInputState(input, "is-save-error");
        return;
      }
      markInputState(input, "is-save-ok");
      return;
    }

    if(!Number.isInteger(score) || score < 1 || score > 5){
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
    if(upsertErr){
      console.error("UPSERT error:", upsertErr);
      showNotice(refs, "Error: No se pudo guardar: " + (upsertErr.message || "revisa consola"), "error");
      markInputState(input, "is-save-error");
      return;
    }
    markInputState(input, "is-save-ok");
  }finally{
    input.disabled = false;
    setTimeout(() => {
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
    setTimeout(() => {
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

refs.prevBtn.addEventListener("click", () => {
  const current = refs.dateInput.value ? new Date(refs.dateInput.value) : new Date();
  current.setDate(current.getDate() - 7);
  currentWeekDate = normalizeDate(current);
  refs.dateInput.value = toISODateLocal(currentWeekDate);
  loadWeeklyTableAnimated(currentWeekDate);
});

refs.nextBtn.addEventListener("click", () => {
  const current = refs.dateInput.value ? new Date(refs.dateInput.value) : new Date();
  current.setDate(current.getDate() + 7);
  currentWeekDate = normalizeDate(current);
  refs.dateInput.value = toISODateLocal(currentWeekDate);
  loadWeeklyTableAnimated(currentWeekDate);
});

refs.dateInput.addEventListener("change", e => {
  currentWeekDate = normalizeDate(new Date(e.target.value));
  loadWeeklyTableAnimated(currentWeekDate);
});

refs.toggleSubjectsBtn.addEventListener("click", () => {
  showAllSubjects = !showAllSubjects;
  updateToggleSubjectsButton(currentWeekDate);
  loadWeeklyTableAnimated(currentWeekDate);
});

refs.btnManageSubjects.addEventListener("click", () => {
  refs.subjectsMsg.textContent = "";
  renderSubjectsList();
  openModal(refs.subjectsModal);
});

refs.subjectsClose.addEventListener("click", () => closeModal(refs.subjectsModal));
refs.subjectsModal.addEventListener("click", e => {
  if(e.target === refs.subjectsModal) closeModal(refs.subjectsModal);
});

refs.addSubjectBtn.addEventListener("click", async () => {
  const newName = normalizeSubjectName(refs.subjectNameInput.value);
  refs.subjectsMsg.textContent = "";
  if(!newName){
    refs.subjectsMsg.textContent = "Escribe un nombre de materia.";
    return;
  }

  if(subjects.some(s => s.name.toLowerCase() === newName.toLowerCase())){
    refs.subjectsMsg.textContent = "Esa materia ya existe.";
    return;
  }

  refs.addSubjectBtn.disabled = true;
  try{
    const { data: { user } } = await supabase.auth.getUser();
    if(!user?.id){
      refs.subjectsMsg.textContent = "Sesion invalida.";
      return;
    }
    const { error } = await createSubject(supabase, user.id, newName);
    if(error){
      refs.subjectsMsg.textContent = "No se pudo crear la materia: " + error.message;
      return;
    }
    refs.subjectNameInput.value = "";
    await refreshUserConfigData();
    await loadWeeklyTableAnimated(currentWeekDate);
    refs.subjectsMsg.textContent = "Materia creada.";
  }finally{
    refs.addSubjectBtn.disabled = false;
  }
});

refs.subjectsList.addEventListener("click", async e => {
  const button = e.target.closest("button[data-subject-id]");
  if(!button) return;
  const subjectId = button.dataset.subjectId;
  const action = button.dataset.subjectAction;
  const isArchived = action === "archive";
  button.disabled = true;
  refs.subjectsMsg.textContent = "";
  try{
    const { data: { user } } = await supabase.auth.getUser();
    if(!user?.id){
      refs.subjectsMsg.textContent = "Sesion invalida.";
      return;
    }
    const { error } = await setSubjectArchived(supabase, user.id, subjectId, isArchived);
    if(error){
      refs.subjectsMsg.textContent = "No se pudo actualizar: " + error.message;
      return;
    }
    await refreshUserConfigData();
    await loadWeeklyTableAnimated(currentWeekDate);
  }finally{
    button.disabled = false;
  }
});

refs.btnManagePlans.addEventListener("click", () => {
  refs.plansMsg.textContent = "";
  renderPlanPicker();
  renderPlansList();
  openModal(refs.plansModal);
});

refs.plansClose.addEventListener("click", () => closeModal(refs.plansModal));
refs.plansModal.addEventListener("click", e => {
  if(e.target === refs.plansModal) closeModal(refs.plansModal);
});

refs.createPlanBtn.addEventListener("click", async () => {
  refs.plansMsg.textContent = "";
  const name = normalizeSubjectName(refs.planNameInput.value);
  const startDate = refs.planStartInput.value;
  const endDate = refs.planEndInput.value;
  const selectedSubjects = Array.from(refs.planSubjectsPicker.querySelectorAll("input[type='checkbox']:checked"))
    .map(input => input.value);

  if(!name || !startDate || !endDate){
    refs.plansMsg.textContent = "Completa nombre, fecha inicio y fecha fin.";
    return;
  }
  if(endDate < startDate){
    refs.plansMsg.textContent = "La fecha fin no puede ser anterior al inicio.";
    return;
  }
  if(selectedSubjects.length === 0){
    refs.plansMsg.textContent = "Selecciona al menos una materia.";
    return;
  }

  const overlaps = plans.some(plan => !(endDate < plan.start_date || startDate > plan.end_date));
  if(overlaps){
    refs.plansMsg.textContent = "Ya existe un plan que se superpone en ese periodo.";
    return;
  }

  refs.createPlanBtn.disabled = true;
  try{
    const { data: { user } } = await supabase.auth.getUser();
    if(!user?.id){
      refs.plansMsg.textContent = "Sesion invalida.";
      return;
    }
    const { error } = await createPlan(supabase, {
      user_id: user.id,
      name,
      start_date: startDate,
      end_date: endDate,
      subjects: selectedSubjects
    });
    if(error){
      refs.plansMsg.textContent = "No se pudo guardar el plan: " + error.message;
      return;
    }
    refs.planNameInput.value = "";
    refs.planStartInput.value = "";
    refs.planEndInput.value = "";
    refs.planSubjectsPicker.querySelectorAll("input[type='checkbox']").forEach(input => { input.checked = false; });
    await refreshUserConfigData();
    await loadWeeklyTableAnimated(currentWeekDate);
    refs.plansMsg.textContent = "Plan guardado.";
  }finally{
    refs.createPlanBtn.disabled = false;
  }
});

refs.plansList.addEventListener("click", async e => {
  const button = e.target.closest("button[data-plan-id]");
  if(!button) return;
  const planId = button.dataset.planId;
  if(!window.confirm("Eliminar este plan?")) return;
  button.disabled = true;
  try{
    const { data: { user } } = await supabase.auth.getUser();
    if(!user?.id){
      refs.plansMsg.textContent = "Sesion invalida.";
      return;
    }
    const { error } = await deletePlan(supabase, user.id, planId);
    if(error){
      refs.plansMsg.textContent = "No se pudo eliminar el plan: " + error.message;
      return;
    }
    await refreshUserConfigData();
    await loadWeeklyTableAnimated(currentWeekDate);
  }finally{
    button.disabled = false;
  }
});

document.addEventListener("keydown", e => {
  if(e.key !== "Escape") return;
  if(refs.subjectsModal.style.display === "flex") closeModal(refs.subjectsModal);
  if(refs.plansModal.style.display === "flex") closeModal(refs.plansModal);
});

initAuth({
  supabase,
  refs,
  showAuth,
  isAppVisible: () => refs.appContent.style.display === "block",
  goToApp: () => { void goToApp(); },
  openRecoveryModal,
  closeRecoveryModal,
  showNotice
});

document.addEventListener("DOMContentLoaded", async () => {
  await refreshUIBySession(supabase, refs, showAuth, showHome);
});
