export function getUIRefs(){
  return {
    authScreen: document.getElementById("authScreen"),
    authForm: document.getElementById("authForm"),
    homeScreen: document.getElementById("homeScreen"),
    appContent: document.getElementById("appContent"),
    emailInput: document.getElementById("email"),
    passwordInput: document.getElementById("password"),
    btnSignIn: document.getElementById("btnSignIn"),
    btnSignUp: document.getElementById("btnSignUp"),
    btnLogout: document.getElementById("btnLogout"),
    linkReset: document.getElementById("linkReset"),
    authMsg: document.getElementById("authMsg"),
    enterButton: document.getElementById("enterButton"),
    weekRangeEl: document.getElementById("week_range"),
    dateInput: document.getElementById("week_date"),
    activePlanText: document.getElementById("activePlanText"),
    tbody: document.querySelector("#weeklyTable tbody"),
    prevBtn: document.getElementById("prev_week"),
    nextBtn: document.getElementById("next_week"),
    themeBtn: document.getElementById("toggleTheme"),
    toggleSubjectsBtn: document.getElementById("toggleSubjectsBtn"),
    btnManageSubjects: document.getElementById("btnManageSubjects"),
    btnManagePlans: document.getElementById("btnManagePlans"),
    subjectsModal: document.getElementById("subjectsModal"),
    subjectsList: document.getElementById("subjectsList"),
    subjectNameInput: document.getElementById("subjectNameInput"),
    addSubjectBtn: document.getElementById("addSubjectBtn"),
    subjectsMsg: document.getElementById("subjectsMsg"),
    subjectsClose: document.getElementById("subjectsClose"),
    plansModal: document.getElementById("plansModal"),
    plansList: document.getElementById("plansList"),
    planNameInput: document.getElementById("planNameInput"),
    planStartInput: document.getElementById("planStartInput"),
    planEndInput: document.getElementById("planEndInput"),
    planSubjectsPicker: document.getElementById("planSubjectsPicker"),
    createPlanBtn: document.getElementById("createPlanBtn"),
    plansMsg: document.getElementById("plansMsg"),
    plansClose: document.getElementById("plansClose"),
    appNotice: document.getElementById("appNotice"),
    appNoticeText: document.getElementById("appNoticeText"),
    appNoticeClose: document.getElementById("appNoticeClose"),
    recoveryModal: document.getElementById("recoveryModal"),
    recoveryPassword: document.getElementById("recoveryPassword"),
    recoveryMsg: document.getElementById("recoveryMsg"),
    recoverySave: document.getElementById("recoverySave"),
    recoveryCancel: document.getElementById("recoveryCancel")
  };
}

export function initTheme(themeBtn){
  const savedTheme = localStorage.getItem("theme");
  const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.body.dataset.theme = savedTheme || preferredTheme;

  function syncThemeButton(){
    const isDark = document.body.dataset.theme === "dark";
    themeBtn.textContent = isDark ? "Light" : "Dark";
    themeBtn.title = isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro";
  }

  syncThemeButton();
  themeBtn.addEventListener("click", () => {
    document.body.dataset.theme = (document.body.dataset.theme === "dark") ? "light" : "dark";
    localStorage.setItem("theme", document.body.dataset.theme);
    syncThemeButton();
  });
}

export function showAuth(refs){
  refs.authScreen.style.display = "block";
  refs.homeScreen.style.display = "none";
  refs.appContent.style.display = "none";
  refs.btnLogout.style.display = "none";
}

export function showHome(refs){
  refs.authScreen.style.display = "none";
  refs.homeScreen.style.display = "block";
  refs.appContent.style.display = "none";
  refs.btnLogout.style.display = "inline-flex";
}

export function showApp(refs){
  refs.authScreen.style.display = "none";
  refs.homeScreen.style.display = "none";
  refs.appContent.style.display = "block";
  refs.btnLogout.style.display = "inline-flex";
}

export function updateRowTotal(row, getProgressColor){
  const inputs = row.querySelectorAll("input[type='number']");
  let total = 0;
  inputs.forEach(i=>{ if(i.value) total += Number(i.value); });
  const totalCell = row.querySelector(".total-cell");
  const totalValue = totalCell.querySelector(".total-value");
  totalValue.textContent = total || "";
  const bar = row.querySelector(".progress-bar");
  const progress = Math.min((total/35)*100,100);
  const color = getProgressColor(total);
  if(bar){ bar.style.width = `${progress}%`; bar.style.background = color; }
  if(total>=20) row.classList.add("highlight-green"); else row.classList.remove("highlight-green");
}

export function isValidScoreInput(input){
  if(!input.value){
    input.setCustomValidity("");
    return true;
  }
  const score = Number(input.value);
  const isValid = Number.isInteger(score) && score >= 1 && score <= 5;
  input.setCustomValidity(isValid ? "" : "Ingresa un entero de 1 a 5.");
  return isValid;
}

let noticeTimer = null;

export function initNotice(refs){
  refs.appNoticeClose.addEventListener("click", ()=> hideNotice(refs));
}

export function showNotice(refs, message, type = "info", timeoutMs = 4000){
  refs.appNotice.dataset.type = type;
  refs.appNoticeText.textContent = message;
  refs.appNotice.style.display = "flex";
  if(noticeTimer) clearTimeout(noticeTimer);
  if(timeoutMs > 0){
    noticeTimer = setTimeout(()=> hideNotice(refs), timeoutMs);
  }
}

export function hideNotice(refs){
  refs.appNotice.style.display = "none";
}

export function openRecoveryModal(refs){
  refs.recoveryModal.style.display = "flex";
  refs.recoveryMsg.textContent = "";
  refs.recoveryPassword.value = "";
  refs.recoveryPassword.focus();
}

export function closeRecoveryModal(refs){
  refs.recoveryModal.style.display = "none";
  refs.recoveryMsg.textContent = "";
}
