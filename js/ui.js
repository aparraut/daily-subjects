export function getUIRefs(){
  return {
    authScreen: document.getElementById("authScreen"),
    homeScreen: document.getElementById("homeScreen"),
    appContent: document.getElementById("appContent"),
    btnSignIn: document.getElementById("btnSignIn"),
    btnSignUp: document.getElementById("btnSignUp"),
    btnLogout: document.getElementById("btnLogout"),
    linkReset: document.getElementById("linkReset"),
    authMsg: document.getElementById("authMsg"),
    enterButton: document.getElementById("enterButton"),
    weekRangeEl: document.getElementById("week_range"),
    dateInput: document.getElementById("week_date"),
    tbody: document.querySelector("#weeklyTable tbody"),
    prevBtn: document.getElementById("prev_week"),
    nextBtn: document.getElementById("next_week"),
    themeBtn: document.getElementById("toggleTheme"),
    toggleSubjectsBtn: document.getElementById("toggleSubjectsBtn")
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
