const CLIENT_ID =
  '499603195416-5blucsgjuuc22forettuomnu7o2s29cb.apps.googleusercontent.com';

const API_URL =
  'https://meu-financeiro-api.ju-carvalho13.workers.dev';

const root =
  document.documentElement;

const savedTheme =
  localStorage.getItem(
    'financeiro-theme'
  );

if (savedTheme === 'light') {
  root.classList.add('light');
}


/* =====================================================
   ESTADO DO APP
   ===================================================== */

const state = {

  user: null,

  token: null,

  initialData: null,

  dashboard: null,

  escopo: null,

  lancamentos: [],

  objetivos: [],

  contas: [],

  categorias: [],

  recorrentes: []
};


/* =====================================================
   GOOGLE LOGIN
   ===================================================== */

function parseJwt(token) {

  try {

    const part =
      token
        .split('.')[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const json =
      decodeURIComponent(
        atob(part)
          .split('')
          .map(
            c =>
              '%' +
              (
                '00' +
                c
                  .charCodeAt(0)
                  .toString(16)
              ).slice(-2)
          )
          .join('')
      );

    return JSON.parse(json);

  } catch (e) {

    return null;
  }
}


function handleCredentialResponse(
  response
) {

  const payload =
    parseJwt(
      response.credential
    );

  if (!payload) {

    document
      .getElementById(
        'loginStatus'
      )
      .textContent =
      'Não foi possível ler a resposta do Google.';

    return;
  }

  state.token =
    response.credential;

  state.user = {

    sub:
      payload.sub,

    name:
      payload.name ||
      payload.given_name ||
      'Usuário',

    email:
      payload.email ||
      '',

    picture:
      payload.picture ||
      '',

    credential:
      response.credential
  };

  localStorage.setItem(
    'financeiro-google-token',
    response.credential
  );

  showApp(
    state.user
  );

  carregarAplicacao();
}


/* =====================================================
   API
   ===================================================== */

async function api(
  action,
  params = {},
  method = 'GET'
) {

  const url =
    new URL(API_URL);

  url.searchParams.set(
    'action',
    action
  );

  if (method === 'GET') {

    Object.entries(
      params || {}
    ).forEach(
      ([key, value]) => {

        if (
          value !== undefined &&
          value !== null &&
          value !== ''
        ) {

          url.searchParams.set(
            key,
            value
          );
        }
      }
    );
  }

  const options = {

    method: method,

    headers: {

      'Content-Type':
        'application/json',

      'Authorization':
        `Bearer ${state.token}`
    }
  };

  if (method !== 'GET') {

    options.body =
      JSON.stringify({
        ...params,
        action
      });
  }

  const response =
    await fetch(
      url.toString(),
      options
    );

  const text =
    await response.text();

  let data;

  try {

    data =
      JSON.parse(text);

  } catch (e) {

    throw new Error(
      'A API retornou uma resposta inválida.'
    );
  }

  if (
    !response.ok ||
    data.ok === false
  ) {

    throw new Error(
      data.erro ||
      'Erro ao comunicar com o servidor.'
    );
  }

  return data;
}


/* =====================================================
   CARREGAMENTO INICIAL
   ===================================================== */

async function carregarAplicacao() {

  try {

    mostrarCarregando(
      true
    );

    const data =
      await api(
        'getInitialData'
      );

    state.initialData =
      data;

    state.user =
      data.usuario;

    state.categorias =
      data.categorias ||
      [];

    state.contas =
      data.contas ||
      [];

    state.objetivos =
      data.objetivos ||
      [];

    state.recorrentes =
      data.recorrentes ||
      [];

    /*
     * Por padrão começa no espaço pessoal.
     */

    state.escopo =
      state.user.nome;

    atualizarInterfaceUsuario();

    await carregarDashboard();

    carregarLancamentos();

  } catch (error) {

    console.error(
      error
    );

    mostrarErro(
      error.message
    );

    /*
     * Se o token estiver inválido,
     * voltamos ao login.
     */

    if (
      error.message
        .toLowerCase()
        .includes('identificar')
    ) {

      logout();
    }

  } finally {

    mostrarCarregando(
      false
    );
  }
}


/* =====================================================
   DASHBOARD
   ===================================================== */

async function carregarDashboard() {

  if (!state.escopo) {
    return;
  }

  try {

    const data =
      await api(
        'obterDashboard',
        {
          escopo:
            state.escopo
        }
      );

    state.dashboard =
      data;

    renderDashboard(
      data
    );

  } catch (error) {

    console.error(
      'Dashboard:',
      error
    );

    mostrarErro(
      error.message
    );
  }
}


function renderDashboard(
  data
) {

  /*
   * Saldo
   */

  const saldo =
    Number(
      data.resultado || 0
    );

  const receitas =
    Number(
      data.receitas || 0
    );

  const despesas =
    Number(
      data.despesas || 0
    );

  const saldoElement =
    document.querySelector(
      '.balance-card strong'
    );

  if (saldoElement) {

    saldoElement.textContent =
      formatMoney(
        saldo
      );
  }

  const balanceSpans =
    document.querySelectorAll(
      '.balance-row span'
    );

  if (
    balanceSpans.length >= 2
  ) {

    balanceSpans[0]
      .innerHTML =
      `Receitas <b>${formatMoney(receitas)}</b>`;

    balanceSpans[1]
      .innerHTML =
      `Despesas <b>${formatMoney(despesas)}</b>`;
  }


  /*
   * Objetivos
   */

  state.objetivos =
    data.objetivos ||
    [];

  renderObjetivos(
    state.objetivos
  );


  /*
   * Últimos lançamentos
   */

  renderUltimosLancamentos(
    data.maiores ||
    []
  );
}


function renderObjetivos(
  objetivos
) {

  const container =
    document.querySelector(
      '.goal-list'
    );

  if (!container) {
    return;
  }

  if (!objetivos.length) {

    container.innerHTML = `
      <div class="empty-state">
        <span>🎯</span>
        <b>Nenhum objetivo ainda</b>
        <small>Crie seu primeiro objetivo financeiro.</small>
      </div>
    `;

    return;
  }

  container.innerHTML =
    objetivos
      .slice(0, 5)
      .map(
        objetivo => {

          const percentual =
            Math.max(
              0,
              Math.min(
                100,
                Number(
                  objetivo.percentual ||
                  0
                )
              )
            );

          return `
            <article class="goal">

              <div class="goal-top">
                <span>
                  🎯 ${escapeHtml(
                    objetivo.nome
                  )}
                </span>

                <b>
                  ${Math.round(
                    percentual
                  )}%
                </b>
              </div>

              <div class="progress">
                <i style="width:${percentual}%"></i>
              </div>

              <small>
                ${formatMoney(
                  objetivo.guardado
                )}
                de
                ${formatMoney(
                  objetivo.meta
                )}
              </small>

            </article>
          `;
        }
      )
      .join('');
}


function renderUltimosLancamentos(
  lancamentos
) {

  const container =
    document.querySelector(
      '.transactions'
    );

  if (!container) {
    return;
  }

  if (!lancamentos.length) {

    container.innerHTML = `
      <div class="empty-state">
        <span>💸</span>
        <b>Nenhum lançamento</b>
        <small>Seus lançamentos aparecerão aqui.</small>
      </div>
    `;

    return;
  }

  container.innerHTML =
    lancamentos
      .slice(0, 5)
      .map(
        item => {

          const negativo =
            item.tipo ===
            'DESPESA';

          const valor =
            formatMoney(
              item.valor
            );

          const sinal =
            negativo
              ? '− '
              : '+ ';

          return `
            <div class="transaction">

              <span class="tx-icon">
                ${iconeCategoria(
                  item.categoria
                )}
              </span>

              <div>

                <b>
                  ${escapeHtml(
                    item.descricao
                  )}
                </b>

                <small>
                  ${formatDate(
                    item.data
                  )}
                  ·
                  ${escapeHtml(
                    item.conta ||
                    'Sem conta'
                  )}
                </small>

              </div>

              <strong
                class="${
                  negativo
                    ? 'negative'
                    : 'positive'
                }"
              >
                ${sinal}${valor}
              </strong>

            </div>
          `;
        }
      )
      .join('');
}


/* =====================================================
   LANÇAMENTOS
   ===================================================== */

async function carregarLancamentos(
  filtros = {}
) {

  try {

    const data =
      await api(
        'listarLancamentos',
        {
          ...filtros,
          escopo:
            state.escopo
        }
      );

    state.lancamentos =
      data;

    return data;

  } catch (error) {

    console.error(
      'Lançamentos:',
      error
    );

    mostrarErro(
      error.message
    );

    return [];
  }
}


/* =====================================================
   USUÁRIO / ESCOPO
   ===================================================== */

function atualizarInterfaceUsuario() {

  if (!state.user) {
    return;
  }

  const first =
    (
      state.user.nome ||
      state.user.name ||
      'Usuário'
    )
    .split(' ')[0];

  const greeting =
    document.getElementById(
      'greeting'
    );

  if (greeting) {

    greeting.textContent =
      `Olá, ${first} 👋`;
  }

  const signed =
    document.getElementById(
      'signedUser'
    );

  if (signed) {

    signed.textContent =
      state.user.email ||
      '';
  }

  /*
   * Tenta atualizar o seletor
   * de espaço, caso a interface
   * já possua um.
   */

  atualizarSeletorEscopo();
}


function atualizarSeletorEscopo() {

  /*
   * A interface atual ainda não possui
   * o seletor definitivo.
   *
   * Quando adicionarmos o componente,
   * esta função já estará pronta para
   * receber os espaços.
   */

  const seletor =
    document.getElementById(
      'scopeSelect'
    );

  if (!seletor) {
    return;
  }

  const escopos =
    state.initialData?.escopos ||
    [];

  seletor.innerHTML =
    escopos
      .map(
        escopo => `
          <option
            value="${escapeAttribute(
              escopo.nome
            )}"
          >
            ${escapeHtml(
              escopo.nome
            )}
          </option>
        `
      )
      .join('');

  seletor.value =
    state.escopo;
}


async function trocarEscopo(
  escopo
) {

  if (!escopo) {
    return;
  }

  state.escopo =
    escopo;

  await carregarDashboard();

  await carregarLancamentos();
}


/* =====================================================
   TEMA
   ===================================================== */

function configurarTema() {

  const button =
    document.getElementById(
      'themeBtn'
    );

  if (!button) {
    return;
  }

  button.addEventListener(
    'click',
    () => {

      root.classList.toggle(
        'light'
      );

      localStorage.setItem(
        'financeiro-theme',
        root.classList.contains(
          'light'
        )
          ? 'light'
          : 'dark'
      );
    }
  );
}


/* =====================================================
   LOGOUT
   ===================================================== */

function logout() {

  state.user = null;

  state.token = null;

  state.initialData = null;

  state.dashboard = null;

  state.escopo = null;

  localStorage.removeItem(
    'financeiro-google-token'
  );

  document
    .getElementById(
      'app'
    )
    ?.classList.add(
      'hidden'
    );

  document
    .getElementById(
      'loginScreen'
    )
    ?.classList.remove(
      'hidden'
    );

  if (
    window.google?.accounts?.id
  ) {

    google.accounts.id.disableAutoSelect();
  }
}


/* =====================================================
   MOSTRAR APP
   ===================================================== */

function showApp(
  user
) {

  document
    .getElementById(
      'loginScreen'
    )
    ?.classList.add(
      'hidden'
    );

  document
    .getElementById(
      'app'
    )
    ?.classList.remove(
      'hidden'
    );

  atualizarInterfaceUsuario();
}


/* =====================================================
   GOOGLE INITIALIZATION
   ===================================================== */

function inicializarGoogle() {

  if (
    !window.google?.accounts?.id
  ) {

    setTimeout(
      inicializarGoogle,
      150
    );

    return;
  }

  google.accounts.id.initialize({

    client_id:
      CLIENT_ID,

    callback:
      handleCredentialResponse,

    auto_select:
      false,

    ux_mode:
      'popup',

    context:
      'signin'
  });

  const button =
    document.getElementById(
      'googleButton'
    );

  if (button) {

    google.accounts.id.renderButton(
      button,
      {

        theme:
          'filled_black',

        size:
          'large',

        shape:
          'pill',

        text:
          'continue_with',

        width:
          300
      }
    );
  }
}


/* =====================================================
   AUTO LOGIN DA SESSÃO
   ===================================================== */

async function restaurarSessao() {

  const token =
    localStorage.getItem(
      'financeiro-google-token'
    );

  if (!token) {
    return;
  }

  const payload =
    parseJwt(
      token
    );

  if (!payload) {

    localStorage.removeItem(
      'financeiro-google-token'
    );

    return;
  }

  /*
   * Não usamos o token apenas como
   * "login visual".
   *
   * A API também vai validar o token.
   */

  state.token =
    token;

  state.user = {

    sub:
      payload.sub,

    name:
      payload.name ||
      payload.given_name ||
      'Usuário',

    email:
      payload.email ||
      '',

    picture:
      payload.picture ||
      '',

    credential:
      token
  };

  showApp(
    state.user
  );

  try {

    await carregarAplicacao();

  } catch (error) {

    console.error(
      error
    );

    logout();
  }
}


/* =====================================================
   UTILITÁRIOS
   ===================================================== */

function formatMoney(
  value
) {

  return Number(
    value || 0
  ).toLocaleString(
    'pt-BR',
    {
      style:
        'currency',

      currency:
        'BRL'
    }
  );
}


function formatDate(
  value
) {

  if (!value) {
    return '';
  }

  const parts =
    String(value)
      .split('-');

  if (
    parts.length === 3
  ) {

    return (
      parts[2] +
      '/' +
      parts[1]
    );
  }

  return value;
}


function iconeCategoria(
  categoria
) {

  const mapa = {

    'Alimentação':
      '🍔',

    'Mercado':
      '🛒',

    'Moradia':
      '🏠',

    'Educação':
      '📚',

    'Transporte':
      '🚗',

    'Saúde':
      '💊',

    'Lazer':
      '🎮',

    'Assinaturas':
      '🔄',

    'Compras':
      '🛍️',

    'Contas':
      '🧾',

    'Salário':
      '💰',

    'Renda extra':
      '💵'
  };

  return (
    mapa[categoria] ||
    '💸'
  );
}


function escapeHtml(
  value
) {

  return String(
    value ?? ''
  )
    .replace(
      /&/g,
      '&amp;'
    )
    .replace(
      /</g,
      '&lt;'
    )
    .replace(
      />/g,
      '&gt;'
    )
    .replace(
      /"/g,
      '&quot;'
    )
    .replace(
      /'/g,
      '&#039;'
    );
}


function escapeAttribute(
  value
) {

  return escapeHtml(
    value
  );
}


function mostrarCarregando(
  ativo
) {

  document.body
    .classList.toggle(
      'loading',
      ativo
    );
}


function mostrarErro(
  mensagem
) {

  console.error(
    mensagem
  );

  const status =
    document.getElementById(
      'loginStatus'
    );

  if (
    status &&
    !state.user
  ) {

    status.textContent =
      mensagem;
  }
}


/* =====================================================
   EVENTOS
   ===================================================== */

function configurarEventos() {

  configurarTema();

  const logoutButton =
    document.getElementById(
      'logoutBtn'
    );

  if (logoutButton) {

    logoutButton.addEventListener(
      'click',
      logout
    );
  }


  /*
   * FAB
   */

  document
    .querySelector('.fab')
    ?.addEventListener(
      'click',
      () => {

        console.log(
          'Novo lançamento'
        );

        /*
         * A tela de lançamento será
         * conectada na próxima etapa.
         */
      }
    );


  /*
   * Atalho novo lançamento
   */

  document
    .querySelector(
      '.quick-card'
    )
    ?.addEventListener(
      'click',
      () => {

        console.log(
          'Novo lançamento'
        );
      }
    );


  /*
   * Se existir seletor de espaço.
   */

  document
    .getElementById(
      'scopeSelect'
    )
    ?.addEventListener(
      'change',
      event => {

        trocarEscopo(
          event.target.value
        );
      }
    );
}


/* =====================================================
   INICIALIZAÇÃO
   ===================================================== */

window.addEventListener(
  'load',
  () => {

    configurarEventos();

    inicializarGoogle();

    /*
     * Primeiro tenta restaurar
     * uma sessão já existente.
     */

    restaurarSessao();
  }
);
