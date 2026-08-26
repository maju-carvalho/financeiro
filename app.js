const CLIENT_ID =
  '499603195416-5blucsgjuuc22forettuomnu7o2s29cb.apps.googleusercontent.com';

const API_URL =
  'https://meu-financeiro-api.ju-carvalho13.workers.dev';


const root = document.documentElement;

const savedTheme = localStorage.getItem('financeiro-theme');

if (savedTheme === 'light') {
  root.classList.add('light');
}


/**
 * ============================================================
 * GOOGLE LOGIN
 * ============================================================
 */

function parseJwt(token) {

  try {

    const part = token
      .split('.')[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const json = decodeURIComponent(
      atob(part)
        .split('')
        .map(c =>
          '%' +
          ('00' + c.charCodeAt(0).toString(16)).slice(-2)
        )
        .join('')
    );

    return JSON.parse(json);

  } catch (e) {

    return null;
  }
}


/**
 * Login Google realizado.
 */
async function handleCredentialResponse(response) {

  const payload = parseJwt(response.credential);

  if (!payload) {

    mostrarErroLogin(
      'Não foi possível ler a resposta do Google.'
    );

    return;
  }


  try {

    mostrarStatusLogin('Verificando sua conta...');


    /**
     * Envia o token para o Apps Script.
     *
     * O Apps Script valida o token diretamente
     * com o Google antes de liberar o acesso.
     */

    const url =
      API_URL +
      '?action=usuario&token=' +
      encodeURIComponent(response.credential);


    const resposta = await fetch(url);

    if (!resposta.ok) {
      throw new Error(
        'Não foi possível conectar ao servidor financeiro.'
      );
    }


    const dados = await resposta.json();


    if (!dados.ok) {
      throw new Error(
        dados.erro || 'Não foi possível validar sua conta.'
      );
    }


    /**
     * Sessão validada pelo backend.
     */

    window.financeiroGoogleSession = {

      sub: payload.sub,

      name:
        dados.usuario.googleNome ||
        dados.usuario.nome ||
        payload.name ||
        payload.given_name ||
        'Usuário',

      email: dados.usuario.email,

      picture:
        dados.usuario.foto ||
        payload.picture ||
        '',

      credential: response.credential,

      usuario: dados.usuario
    };


    showApp(window.financeiroGoogleSession);


  } catch (erro) {

    console.error(erro);

    mostrarErroLogin(
      erro.message ||
      'Não foi possível realizar o login.'
    );
  }
}


/**
 * ============================================================
 * INTERFACE
 * ============================================================
 */

function mostrarStatusLogin(mensagem) {

  const el = document.getElementById('loginStatus');

  if (el) {
    el.textContent = mensagem;
  }
}


function mostrarErroLogin(mensagem) {

  const el = document.getElementById('loginStatus');

  if (el) {
    el.textContent = mensagem;
  }

  console.error(mensagem);
}


/**
 * Mostra o aplicativo.
 */
function showApp(user) {

  document
    .getElementById('loginScreen')
    .classList.add('hidden');

  document
    .getElementById('app')
    .classList.remove('hidden');


  const first =
    (user.name || 'Usuário')
      .split(' ')[0];


  const greeting =
    document.getElementById('greeting');

  if (greeting) {
    greeting.textContent =
      `Olá, ${first} 👋`;
  }


  const signedUser =
    document.getElementById('signedUser');

  if (signedUser) {
    signedUser.textContent =
      user.email;
  }


  /**
   * Deixamos disponível para as próximas etapas.
   */

  console.log(
    'Usuário autenticado:',
    user.usuario
  );
}


/**
 * ============================================================
 * LOGOUT
 * ============================================================
 */

function logout() {

  window.financeiroGoogleSession = null;


  document
    .getElementById('app')
    .classList.add('hidden');

  document
    .getElementById('loginScreen')
    .classList.remove('hidden');


  if (window.google?.accounts?.id) {

    google.accounts.id.disableAutoSelect();
  }
}


/**
 * ============================================================
 * INICIALIZAÇÃO
 * ============================================================
 */

window.onload = () => {


  /**
   * Tema
   */

  document
    .getElementById('themeBtn')
    ?.addEventListener('click', () => {

      root.classList.toggle('light');

      localStorage.setItem(
        'financeiro-theme',
        root.classList.contains('light')
          ? 'light'
          : 'dark'
      );

    });


  /**
   * Logout
   */

  document
    .getElementById('logoutBtn')
    ?.addEventListener(
      'click',
      logout
    );


  /**
   * Google Identity Services
   */

  const wait = () => {

    if (!window.google?.accounts?.id) {

      setTimeout(wait, 150);

      return;
    }


    google.accounts.id.initialize({

      client_id: CLIENT_ID,

      callback:
        handleCredentialResponse,

      auto_select: false,

      ux_mode: 'popup',

      context: 'signin'

    });


    google.accounts.id.renderButton(

      document.getElementById(
        'googleButton'
      ),

      {

        theme: 'filled_black',

        size: 'large',

        shape: 'pill',

        text: 'continue_with',

        width: 300

      }

    );

  };


  wait();

};
