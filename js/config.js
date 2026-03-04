export const APP_CONFIG = {
  supabaseUrl: "https://sfippoqwuunkpipegzra.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmaXBwb3F3dXVua3BpcGVnenJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NDMyODcsImV4cCI6MjA3NzMxOTI4N30.p7iiJxu-sWNgpTRMWOSQDkf2poK4q6B1FSlt6XKv25E",
  debug: false
};

export function getResetRedirectUrl(){
  return `${window.location.origin}${window.location.pathname}`;
}

export function debugLog(...args){
  if(APP_CONFIG.debug){
    console.log(...args);
  }
}
