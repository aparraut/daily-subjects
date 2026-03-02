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
  refs.btnSignIn.addEventListener("click", async ()=>{
    refs.authMsg.textContent = "";
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    if(!email || !password){ refs.authMsg.textContent = "Error: Ingresa email y contrasena"; return; }

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
  });

  refs.btnSignUp.addEventListener("click", async ()=>{
    refs.authMsg.textContent = "";
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({ email, password });
    console.log("[signUp]", { signUpData, signUpErr });
    refs.authMsg.textContent = signUpErr ? "Error: " + signUpErr.message : "Cuenta creada. Revisa tu correo si requiere confirmacion.";
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
    const email = document.getElementById("email").value.trim();
    if(!email){ refs.authMsg.textContent = "Error: Escribe tu email para enviar el enlace."; return; }
    const baseUrl = "https://aparraut.github.io/daily-subjects/";
    const { data: resetData, error: resetErr } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: baseUrl });
    console.log("[resetPasswordForEmail]", { resetData, resetErr });
    refs.authMsg.textContent = resetErr ? ("Error: " + resetErr.message) : "Te enviamos un enlace para resetear la contrasena.";
  });

  (async ()=>{
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if(params.get("type")==="recovery"){
      openRecoveryModal(refs);
      history.replaceState({}, document.title, window.location.pathname);
    }
  })();

  refs.recoveryCancel.addEventListener("click", ()=> closeRecoveryModal(refs));
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
