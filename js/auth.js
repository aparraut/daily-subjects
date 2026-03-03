export async function refreshUIBySession(supabase, refs, showAuth, showHome){
  const { data:{ session }, error: sessionErr } = await supabase.auth.getSession();
  console.log("[auth.getSession]", { session, sessionErr });
  if(session?.user) showHome(refs); else showAuth(refs);
}

export function initAuth({
  supabase,
  refs,
  showAuth,
  isAppVisible,
  goToApp,
  openRecoveryModal,
  closeRecoveryModal,
  showNotice
}){
  function hasValidEmail(){
    const ok = refs.emailInput.checkValidity();
    if(!ok){
      refs.authMsg.textContent = "Error: Ingresa un email valido.";
      refs.emailInput.reportValidity();
    }
    return ok;
  }

  async function handleSignIn(){
    refs.authMsg.textContent = "";
    const email = refs.emailInput.value.trim();
    const password = refs.passwordInput.value;
    if(!email || !password){ refs.authMsg.textContent = "Error: Ingresa email y contrasena"; return; }
    if(!hasValidEmail()) return;

    refs.btnSignIn.disabled = true;
    refs.btnSignIn.textContent = "Entrando...";
    try{
      const { data: signInData, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
      console.log("[signInWithPassword]", { signInData, authErr });
      if(authErr){
        const msg = (authErr.message||"").toLowerCase();
        refs.authMsg.textContent =
          msg.includes("invalid login credentials") ? "Error: Credenciales invalidas." :
          msg.includes("email not confirmed")       ? "Error: Debes confirmar tu email." :
          "Error: " + authErr.message;
        return;
      }
      const { data:{ session } } = await supabase.auth.getSession();
      if(session?.user){ refs.authMsg.textContent = "Sesion iniciada"; goToApp(); }
      else { refs.authMsg.textContent = "Error: No se pudo abrir la sesion."; }
    }catch(e){
      console.error("[signIn] exception:", e);
      refs.authMsg.textContent = "Error de red o CORS. Revisa la consola.";
    }finally{
      refs.btnSignIn.disabled = false;
      refs.btnSignIn.textContent = "Entrar";
    }
  }

  refs.authForm.addEventListener("submit", async (e)=>{
    e.preventDefault();
    await handleSignIn();
  });

  refs.btnSignUp.addEventListener("click", async ()=>{
    refs.authMsg.textContent = "";
    const email = refs.emailInput.value.trim();
    const password = refs.passwordInput.value;
    if(!email || !password){ refs.authMsg.textContent = "Error: Ingresa email y contrasena"; return; }
    if(!hasValidEmail()) return;
    if(password.length < 6){ refs.authMsg.textContent = "Error: La contrasena debe tener al menos 6 caracteres."; return; }

    refs.btnSignUp.disabled = true;
    try{
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({ email, password });
      console.log("[signUp]", { signUpData, signUpErr });
      refs.authMsg.textContent = signUpErr ? "Error: " + signUpErr.message : "Cuenta creada. Revisa tu correo si requiere confirmacion.";
    }finally{
      refs.btnSignUp.disabled = false;
    }
  });

  refs.btnLogout.addEventListener("click", async ()=>{
    try{ await supabase.auth.signOut(); }
    finally{
      if(refs.tbody) refs.tbody.innerHTML = "";
      showAuth(refs);
    }
  });

  refs.linkReset.addEventListener("click", async (e)=>{
    e.preventDefault();
    const email = refs.emailInput.value.trim();
    if(!email){ refs.authMsg.textContent = "Error: Escribe tu email para enviar el enlace."; return; }
    if(!hasValidEmail()) return;
    const baseUrl = "https://aparraut.github.io/daily-subjects/";
    refs.linkReset.classList.add("is-disabled");
    refs.linkReset.setAttribute("aria-disabled", "true");
    try{
      const { data: resetData, error: resetErr } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: baseUrl });
      console.log("[resetPasswordForEmail]", { resetData, resetErr });
      refs.authMsg.textContent = resetErr ? ("Error: " + resetErr.message) : "Te enviamos un enlace para resetear la contrasena.";
    }finally{
      refs.linkReset.classList.remove("is-disabled");
      refs.linkReset.removeAttribute("aria-disabled");
    }
  });

  (async ()=>{
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if(params.get("type")==="recovery"){
      openRecoveryModal(refs);
      history.replaceState({}, document.title, window.location.pathname);
    }
  })();

  refs.recoveryCancel.addEventListener("click", ()=> closeRecoveryModal(refs));
  refs.recoveryModal.addEventListener("click", (e)=>{
    if(e.target === refs.recoveryModal) closeRecoveryModal(refs);
  });
  document.addEventListener("keydown", (e)=>{
    if(e.key === "Escape" && refs.recoveryModal.style.display === "flex"){
      closeRecoveryModal(refs);
    }
  });
  refs.recoverySave.addEventListener("click", async ()=>{
    const nueva = refs.recoveryPassword.value.trim();
    if(nueva.length < 6){
      refs.recoveryMsg.textContent = "Error: Minimo 6 caracteres.";
      return;
    }
    refs.recoverySave.disabled = true;
    try{
      const { error: updateErr } = await supabase.auth.updateUser({ password: nueva });
      if(updateErr){
        refs.recoveryMsg.textContent = "Error: " + updateErr.message;
        return;
      }
      closeRecoveryModal(refs);
      showNotice(refs, "Contrasena actualizada. Inicia sesion nuevamente.", "success");
    }finally{
      refs.recoverySave.disabled = false;
    }
  });

  supabase.auth.onAuthStateChange((event, session)=>{
    console.log("[onAuthStateChange]", event, session?.user?.id);
    if(session?.user){
      refs.btnLogout.style.display = "inline-flex";
      if(!isAppVisible()) goToApp();
    }else{
      refs.btnLogout.style.display = "none";
      showAuth(refs);
    }
  });

  refs.enterButton.addEventListener("click", ()=>{ goToApp(); });
}
