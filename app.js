const CLIENT_ID='499603195416-5blucsgjuuc22forettuomnu7o2s29cb.apps.googleusercontent.com';
const root=document.documentElement;
const savedTheme=localStorage.getItem('financeiro-theme');
if(savedTheme==='light') root.classList.add('light');

function parseJwt(token){
  try{
    const part=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    const json=decodeURIComponent(atob(part).split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    return JSON.parse(json);
  }catch(e){return null}
}

function handleCredentialResponse(response){
  const payload=parseJwt(response.credential);
  if(!payload){
    document.getElementById('loginStatus').textContent='Não foi possível ler a resposta do Google.';
    return;
  }
  // Nesta V3.1 o token fica apenas em memória. A validação no backend
  // e o acesso à planilha entram na próxima etapa.
  window.financeiroGoogleSession={
    sub:payload.sub,
    name:payload.name || payload.given_name || 'Usuário',
    email:payload.email || '',
    picture:payload.picture || '',
    credential:response.credential
  };
  showApp(window.financeiroGoogleSession);
}

function showApp(user){
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  const first=(user.name||'Usuário').split(' ')[0];
  document.getElementById('greeting').textContent=`Olá, ${first} 👋`;
  document.getElementById('signedUser').textContent=user.email;
}

function logout(){
  window.financeiroGoogleSession=null;
  document.getElementById('app').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  if(window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
}

window.onload=()=>{
  document.getElementById('themeBtn')?.addEventListener('click',()=>{
    root.classList.toggle('light');
    localStorage.setItem('financeiro-theme',root.classList.contains('light')?'light':'dark');
  });
  document.getElementById('logoutBtn')?.addEventListener('click',logout);
  const wait=()=>{
    if(!window.google?.accounts?.id){setTimeout(wait,150);return;}
    google.accounts.id.initialize({
      client_id:CLIENT_ID,
      callback:handleCredentialResponse,
      auto_select:false,
      ux_mode:'popup',
      context:'signin'
    });
    google.accounts.id.renderButton(document.getElementById('googleButton'),{
      theme:'filled_black',
      size:'large',
      shape:'pill',
      text:'continue_with',
      width:300
    });
  };
  wait();
};
