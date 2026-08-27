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
    document.getElementById('logoutBtn');

  if (logoutButton) {
    logoutButton.addEventListener(
      'click',
      logout
    );
  }

  // =========================
  // NOVO LANÇAMENTO
  // =========================

  document
    .querySelector('.fab')
    ?.addEventListener(
      'click',
      () => abrirPaginaLancamentos(true)
    );

  document
    .querySelector('.quick-card')
    ?.addEventListener(
      'click',
      () => abrirPaginaLancamentos(true)
    );

  // =========================
  // NAVEGAÇÃO INFERIOR
  // =========================

  const navButtons =
    document.querySelectorAll(
      '.bottom-nav button'
    );

  navButtons.forEach(
    (button, index) => {

      button.addEventListener(
        'click',
        () => {

          if (index === 0) {
            voltarInicio();
            return;
          }

          if (index === 1) {
            abrirPaginaLancamentos(false);
            return;
          }

         if (index === 2) {
  abrirPaginaObjetivos();
  return;
}

          if (index === 3) {
            alert(
              'A aba Relatórios será conectada na próxima etapa.'
            );
            return;
          }

          if (index === 4) {
            alert(
              'A aba Ajustes será conectada na próxima etapa.'
            );
          }

        }
      );

    }
  );

  // =========================
  // SELETOR DE ESPAÇO
  // =========================

  document
    .getElementById('scopeSelect')
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


/* =====================================================
   PÁGINA DE LANÇAMENTOS
   ===================================================== */

let lancamentosPage = null;


/* =====================================================
   ABRIR LANÇAMENTOS
   ===================================================== */

async function abrirPaginaLancamentos(
  abrirFormulario = false
) {

  criarPaginaLancamentos();

  document
    .querySelector('.app')
    ?.classList.add('hidden');

  document
    .querySelector('.bottom-nav')
    ?.classList.add('lancamentos-open');

  lancamentosPage.classList.remove(
    'hidden'
  );

  marcarNavAtiva(1);

  await atualizarListaLancamentosPage();

  if (abrirFormulario) {
    abrirFormularioLancamento();
  }
}


/* =====================================================
   VOLTAR PARA INÍCIO
   ===================================================== */

function voltarInicio() {

  if (lancamentosPage) {
    lancamentosPage.classList.add(
      'hidden'
    );
  }

  if (objetivosPage) {
    objetivosPage.classList.add(
      'hidden'
    );
  }

  document
    .querySelector('.app')
    ?.classList.remove('hidden');

  document
    .querySelector('.bottom-nav')
    ?.classList.remove(
      'lancamentos-open',
      'objetivos-open'
    );

  marcarNavAtiva(0);

  carregarDashboard();
}


/* =====================================================
   CRIA A PÁGINA
   ===================================================== */

function criarPaginaLancamentos() {

  if (lancamentosPage) {
    return;
  }

  lancamentosPage =
    document.createElement('div');

  lancamentosPage.id =
    'lancamentosPage';

  lancamentosPage.className =
    'finance-page hidden';

  lancamentosPage.innerHTML = `

    <header class="finance-page-header">

      <div>
        <p class="eyebrow">
          MEU FINANCEIRO
        </p>

        <h1>
          Lançamentos
        </h1>

        <p class="finance-page-subtitle">
          Controle suas receitas e despesas
        </p>
      </div>

      <button
        class="finance-back-btn"
        id="backLancamentosBtn"
        aria-label="Voltar"
      >
        ←
      </button>

    </header>


    <section class="launch-summary">

      <div>
        <small>
          Receitas
        </small>

        <strong
          id="launchReceitas"
          class="positive"
        >
          R$ 0,00
        </strong>
      </div>

      <div>
        <small>
          Despesas
        </small>

        <strong
          id="launchDespesas"
          class="negative"
        >
          R$ 0,00
        </strong>
      </div>

    </section>


    <section class="launch-actions">

      <button
        class="primary-action"
        id="novoLancamentoPageBtn"
      >
        <span>＋</span>
        Novo lançamento
      </button>

    </section>


    <section class="launch-filters">

      <div class="filter-row">

        <select id="filtroMesLancamentos">
          <option value="TODOS">
            Todos os meses
          </option>
        </select>

        <select id="filtroTipoLancamentos">
          <option value="">
            Todos os tipos
          </option>

          <option value="RECEITA">
            Receitas
          </option>

          <option value="DESPESA">
            Despesas
          </option>
        </select>

      </div>


      <div class="filter-row">

        <select id="filtroCategoriaLancamentos">
          <option value="">
            Todas as categorias
          </option>
        </select>

        <input
          id="buscaLancamentos"
          type="search"
          placeholder="Buscar lançamento..."
        >

      </div>

    </section>


    <section
      id="listaLancamentosPage"
      class="launch-list"
    ></section>


    <div
      id="modalLancamento"
      class="finance-modal hidden"
    ></div>

  `;

  document
    .getElementById('app')
    ?.appendChild(
      lancamentosPage
    );


  document
    .getElementById(
      'backLancamentosBtn'
    )
    ?.addEventListener(
      'click',
      voltarInicio
    );


  document
    .getElementById(
      'novoLancamentoPageBtn'
    )
    ?.addEventListener(
      'click',
      abrirFormularioLancamento
    );


  document
    .getElementById(
      'filtroMesLancamentos'
    )
    ?.addEventListener(
      'change',
      atualizarListaLancamentosPage
    );


  document
    .getElementById(
      'filtroTipoLancamentos'
    )
    ?.addEventListener(
      'change',
      () => {
        atualizarCategoriasFiltro();
        atualizarListaLancamentosPage();
      }
    );


  document
    .getElementById(
      'filtroCategoriaLancamentos'
    )
    ?.addEventListener(
      'change',
      atualizarListaLancamentosPage
    );


  document
    .getElementById(
      'buscaLancamentos'
    )
    ?.addEventListener(
      'input',
      atualizarListaLancamentosPage
    );


  preencherFiltroMeses();

  atualizarCategoriasFiltro();
}


/* =====================================================
   FILTRO DE MESES
   ===================================================== */

function preencherFiltroMeses() {

  const select =
    document.getElementById(
      'filtroMesLancamentos'
    );

  if (!select) {
    return;
  }

  const meses = new Set();

  state.lancamentos.forEach(
    lancamento => {

      if (
        lancamento.data
      ) {

        meses.add(
          lancamento.data.substring(
            0,
            7
          )
        );

      }

    }
  );

  const ordenados =
    [...meses].sort(
      (a, b) =>
        b.localeCompare(a)
    );

  select.innerHTML = `
    <option value="TODOS">
      Todos os meses
    </option>
  `;

  ordenados.forEach(
    mes => {

      const [ano, numero] =
        mes.split('-');

      const data =
        new Date(
          Number(ano),
          Number(numero) - 1,
          1
        );

      const nome =
        data.toLocaleDateString(
          'pt-BR',
          {
            month: 'long',
            year: 'numeric'
          }
        );

      const option =
        document.createElement(
          'option'
        );

      option.value = mes;

      option.textContent =
        nome.charAt(0).toUpperCase() +
        nome.slice(1);

      select.appendChild(
        option
      );

    }
  );
}


/* =====================================================
   CATEGORIAS DO FILTRO
   ===================================================== */

function atualizarCategoriasFiltro() {

  const select =
    document.getElementById(
      'filtroCategoriaLancamentos'
    );

  if (!select) {
    return;
  }

  const tipo =
    document.getElementById(
      'filtroTipoLancamentos'
    )?.value || '';

  const categorias =
    state.categorias
      .filter(
        categoria =>
          !tipo ||
          categoria.tipo === tipo
      )
      .map(
        categoria =>
          categoria.nome
      )
      .sort();

  select.innerHTML = `
    <option value="">
      Todas as categorias
    </option>
  `;

  categorias.forEach(
    nome => {

      const option =
        document.createElement(
          'option'
        );

      option.value = nome;
      option.textContent = nome;

      select.appendChild(
        option
      );

    }
  );
}


/* =====================================================
   ATUALIZA LISTA
   ===================================================== */

async function atualizarListaLancamentosPage() {

  const lista =
    document.getElementById(
      'listaLancamentosPage'
    );

  if (!lista) {
    return;
  }

  lista.innerHTML = `
    <div class="launch-loading">
      Carregando lançamentos...
    </div>
  `;

  const mes =
    document.getElementById(
      'filtroMesLancamentos'
    )?.value || 'TODOS';

  const tipo =
    document.getElementById(
      'filtroTipoLancamentos'
    )?.value || '';

  const categoria =
    document.getElementById(
      'filtroCategoriaLancamentos'
    )?.value || '';

  const busca =
    (
      document.getElementById(
        'buscaLancamentos'
      )?.value || ''
    )
      .trim()
      .toLowerCase();


  const dados =
    await carregarLancamentos();


  let filtrados =
    dados.filter(
      item => {

        if (
          mes !== 'TODOS' &&
          !item.data.startsWith(
            mes
          )
        ) {
          return false;
        }

        if (
          tipo &&
          item.tipo !== tipo
        ) {
          return false;
        }

        if (
          categoria &&
          item.categoria !== categoria
        ) {
          return false;
        }

        if (busca) {

          const texto =
            (
              item.descricao +
              ' ' +
              item.categoria +
              ' ' +
              (item.conta || '')
            )
              .toLowerCase();

          if (
            !texto.includes(
              busca
            )
          ) {
            return false;
          }

        }

        return true;

      }
    );


  renderPaginaLancamentos(
    filtrados
  );
}


/* =====================================================
   RENDER DA LISTA
   ===================================================== */

function renderPaginaLancamentos(
  lancamentos
) {

  const lista =
    document.getElementById(
      'listaLancamentosPage'
    );

  if (!lista) {
    return;
  }


  const receitas =
    lancamentos
      .filter(
        item =>
          item.tipo ===
          'RECEITA'
      )
      .reduce(
        (total, item) =>
          total +
          Number(
            item.valor || 0
          ),
        0
      );


  const despesas =
    lancamentos
      .filter(
        item =>
          item.tipo ===
          'DESPESA'
      )
      .reduce(
        (total, item) =>
          total +
          Number(
            item.valor || 0
          ),
        0
      );


  const receitasEl =
    document.getElementById(
      'launchReceitas'
    );

  const despesasEl =
    document.getElementById(
      'launchDespesas'
    );

  if (receitasEl) {
    receitasEl.textContent =
      formatMoney(
        receitas
      );
  }

  if (despesasEl) {
    despesasEl.textContent =
      formatMoney(
        despesas
      );
  }


  if (!lancamentos.length) {

    lista.innerHTML = `
      <div class="launch-empty">
        <span>💸</span>

        <strong>
          Nenhum lançamento encontrado
        </strong>

        <small>
          Tente mudar os filtros ou registre um novo lançamento.
        </small>

        <button
          class="primary-action"
          onclick="abrirFormularioLancamento()"
        >
          Novo lançamento
        </button>
      </div>
    `;

    return;
  }


  lista.innerHTML =
    lancamentos
      .map(
        item => {

          const despesa =
            item.tipo ===
            'DESPESA';

          return `

            <article
              class="launch-item"
            >

              <div
                class="launch-icon"
              >
                ${iconeCategoria(
                  item.categoria
                )}
              </div>


              <div
                class="launch-info"
              >

                <strong>
                  ${escapeHtml(
                    item.descricao
                  )}
                </strong>

                <small>
                  ${formatDate(
                    item.data
                  )}
                  ·
                  ${escapeHtml(
                    item.categoria ||
                    'Outros'
                  )}
                  ${
                    item.conta
                      ? ' · ' +
                        escapeHtml(
                          item.conta
                        )
                      : ''
                  }
                </small>

                ${
                  item.parcelas > 1
                    ? `
                      <small>
                        Parcela
                        ${item.parcelaAtual}
                        /
                        ${item.parcelas}
                      </small>
                    `
                    : ''
                }

              </div>


              <div
                class="launch-value"
              >

                <strong
                  class="${
                    despesa
                      ? 'negative'
                      : 'positive'
                  }"
                >
                  ${
                    despesa
                      ? '− '
                      : '+ '
                  }${formatMoney(
                    item.valor
                  )}
                </strong>

                <button
                  class="delete-launch-btn"
                  data-id="${
                    escapeAttribute(
                      item.id
                    )
                  }"
                  aria-label="Excluir lançamento"
                >
                  🗑️
                </button>

              </div>

            </article>

          `;

        }
      )
      .join('');


  lista
    .querySelectorAll(
      '.delete-launch-btn'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            excluirLancamentoDaPagina(
              button.dataset.id
            );

          }
        );

      }
    );
}


/* =====================================================
   NOVO LANÇAMENTO
   ===================================================== */

function abrirFormularioLancamento() {

  const modal =
    document.getElementById(
      'modalLancamento'
    );

  if (!modal) {
    return;
  }


  const hoje =
    new Date()
      .toISOString()
      .split('T')[0];


  modal.innerHTML = `

    <div
      class="finance-modal-backdrop"
    ></div>

    <div
      class="finance-modal-card"
    >

      <header
        class="finance-modal-header"
      >

        <div>
          <p class="eyebrow">
            NOVO LANÇAMENTO
          </p>

          <h2>
            Registrar movimento
          </h2>
        </div>

        <button
          id="fecharModalLancamento"
          class="modal-close"
        >
          ×
        </button>

      </header>


      <form
        id="formLancamento"
      >

        <div
          class="type-toggle"
        >

          <button
            type="button"
            data-tipo="DESPESA"
            class="type-btn active"
          >
            − Despesa
          </button>

          <button
            type="button"
            data-tipo="RECEITA"
            class="type-btn"
          >
            + Receita
          </button>

        </div>


        <input
          type="hidden"
          id="lancamentoTipo"
          value="DESPESA"
        >


        <label>
          Descrição

          <input
            id="lancamentoDescricao"
            type="text"
            placeholder="Ex.: Mercado"
            required
          >

        </label>


        <div
          class="form-grid"
        >

          <label>
            Valor

            <input
              id="lancamentoValor"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0,00"
              required
            >

          </label>


          <label>
            Data

            <input
              id="lancamentoData"
              type="date"
              value="${hoje}"
              required
            >

          </label>

        </div>


        <div
          class="form-grid"
        >

          <label>
            Categoria

            <select
              id="lancamentoCategoria"
              required
            ></select>

          </label>


          <label>
            Conta

            <select
              id="lancamentoConta"
            >
              <option value="">
                Sem conta
              </option>
            </select>

          </label>

        </div>


        <div
          class="form-grid"
        >

          <label>
            Forma de pagamento

            <select
              id="lancamentoForma"
            >

              <option value="">
                Não informado
              </option>

              <option value="Pix">
                Pix
              </option>

              <option value="Débito">
                Débito
              </option>

              <option value="Crédito">
                Crédito
              </option>

              <option value="Dinheiro">
                Dinheiro
              </option>

              <option value="Transferência">
                Transferência
              </option>

            </select>

          </label>


          <label>
            Parcelas

            <input
              id="lancamentoParcelas"
              type="number"
              min="1"
              max="60"
              value="1"
            >

          </label>

        </div>


        <label>
          Observação

          <textarea
            id="lancamentoObservacao"
            rows="3"
            placeholder="Opcional"
          ></textarea>

        </label>


        <div
          id="lancamentoFormErro"
          class="form-error"
        ></div>


        <button
          type="submit"
          class="primary-action save-launch-btn"
        >
          Salvar lançamento
        </button>

      </form>

    </div>

  `;

  modal.classList.remove(
    'hidden'
  );


  preencherFormularioLancamento();


  document
    .getElementById(
      'fecharModalLancamento'
    )
    ?.addEventListener(
      'click',
      fecharModalLancamento
    );


  modal
    .querySelector(
      '.finance-modal-backdrop'
    )
    ?.addEventListener(
      'click',
      fecharModalLancamento
    );


  modal
    .querySelectorAll(
      '.type-btn'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            modal
              .querySelectorAll(
                '.type-btn'
              )
              .forEach(
                b =>
                  b.classList.remove(
                    'active'
                  )
              );

            button.classList.add(
              'active'
            );

            document
              .getElementById(
                'lancamentoTipo'
              )
              .value =
              button.dataset.tipo;

            preencherCategoriasFormulario();

          }
        );

      }
    );


  document
    .getElementById(
      'formLancamento'
    )
    ?.addEventListener(
      'submit',
      salvarLancamentoFormulario
    );
}


/* =====================================================
   CATEGORIAS DO FORMULÁRIO
   ===================================================== */

function preencherFormularioLancamento() {

  preencherCategoriasFormulario();

  const contaSelect =
    document.getElementById(
      'lancamentoConta'
    );

  if (!contaSelect) {
    return;
  }

  state.contas
    .forEach(
      conta => {

        const option =
          document.createElement(
            'option'
          );

        option.value =
          conta.nome;

        option.textContent =
          conta.banco
            ? `${conta.nome} · ${conta.banco}`
            : conta.nome;

        contaSelect.appendChild(
          option
        );

      }
    );
}


function preencherCategoriasFormulario() {

  const select =
    document.getElementById(
      'lancamentoCategoria'
    );

  if (!select) {
    return;
  }

  const tipo =
    document.getElementById(
      'lancamentoTipo'
    )?.value ||
    'DESPESA';

  const categorias =
    state.categorias
      .filter(
        categoria =>
          categoria.tipo ===
          tipo
      );

  select.innerHTML = '';

  categorias.forEach(
    categoria => {

      const option =
        document.createElement(
          'option'
        );

      option.value =
        categoria.nome;

      option.textContent =
        categoria.nome;

      select.appendChild(
        option
      );

    }
  );

}


/* =====================================================
   SALVAR
   ===================================================== */

async function salvarLancamentoFormulario(
  event
) {

  event.preventDefault();

  const erro =
    document.getElementById(
      'lancamentoFormErro'
    );

  const button =
    document.querySelector(
      '.save-launch-btn'
    );

  try {

    if (erro) {
      erro.textContent = '';
    }

    if (button) {
      button.disabled = true;
      button.textContent =
        'Salvando...';
    }


    const tipo =
      document.getElementById(
        'lancamentoTipo'
      ).value;

    const dados = {

      escopo:
        state.escopo,

      tipo:

        tipo,

      descricao:
        document.getElementById(
          'lancamentoDescricao'
        ).value.trim(),

      valor:
        Number(
          document.getElementById(
            'lancamentoValor'
          ).value
        ),

      data:
        document.getElementById(
          'lancamentoData'
        ).value,

      categoria:
        document.getElementById(
          'lancamentoCategoria'
        ).value,

      conta:
        document.getElementById(
          'lancamentoConta'
        ).value,

      formaPagamento:
        document.getElementById(
          'lancamentoForma'
        ).value,

      parcelas:
        Number(
          document.getElementById(
            'lancamentoParcelas'
          ).value || 1
        ),

      observacao:
        document.getElementById(
          'lancamentoObservacao'
        ).value.trim()

    };


    if (
      !dados.descricao
    ) {
      throw new Error(
        'Informe uma descrição.'
      );
    }

    if (
      !dados.valor ||
      dados.valor <= 0
    ) {
      throw new Error(
        'Informe um valor válido.'
      );
    }


    const action =
      dados.parcelas > 1
        ? 'salvarParcelamento'
        : 'salvarLancamento';


    await api(
      action,
      dados,
      'POST'
    );


    fecharModalLancamento();


    await carregarLancamentos();

    preencherFiltroMeses();

    await atualizarListaLancamentosPage();

    await carregarDashboard();

  } catch (error) {

    console.error(
      error
    );

    if (erro) {
      erro.textContent =
        error.message;
    }

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent =
        'Salvar lançamento';
    }

  }
}


/* =====================================================
   EXCLUIR
   ===================================================== */

async function excluirLancamentoDaPagina(
  id
) {

  const confirmado =
    window.confirm(
      'Excluir este lançamento?'
    );

  if (!confirmado) {
    return;
  }

  try {

    await api(
      'excluirLancamento',
      {
        id: id
      },
      'POST'
    );

    await carregarLancamentos();

    preencherFiltroMeses();

    await atualizarListaLancamentosPage();

    await carregarDashboard();

  } catch (error) {

    console.error(
      error
    );

    alert(
      error.message
    );

  }
}


/* =====================================================
   FECHAR MODAL
   ===================================================== */

function fecharModalLancamento() {

  document
    .getElementById(
      'modalLancamento'
    )
    ?.classList.add(
      'hidden'
    );

}


/* =====================================================
   NAV ATIVA
   ===================================================== */

function marcarNavAtiva(
  index
) {

  const buttons =
    document.querySelectorAll(
      '.bottom-nav button'
    );

  buttons.forEach(
    button =>
      button.classList.remove(
        'active'
      )
  );

  buttons[index]
    ?.classList.add(
      'active'
    );
}

/* =====================================================
   PÁGINA DE OBJETIVOS
   ===================================================== */

let objetivosPage = null;


/* =====================================================
   ABRIR OBJETIVOS
   ===================================================== */

async function abrirPaginaObjetivos() {

  criarPaginaObjetivos();

  document
    .querySelector('.app')
    ?.classList.add('hidden');

  document
    .querySelector('.bottom-nav')
    ?.classList.add('objetivos-open');

  objetivosPage.classList.remove('hidden');

  marcarNavAtiva(2);

  renderPaginaObjetivos();
}


/* =====================================================
   CRIAR PÁGINA
   ===================================================== */

function criarPaginaObjetivos() {

  if (objetivosPage) {
    return;
  }

  objetivosPage =
    document.createElement('div');

  objetivosPage.id =
    'objetivosPage';

  objetivosPage.className =
    'finance-page hidden';

  objetivosPage.innerHTML = `

    <header class="finance-page-header">

      <div>
        <p class="eyebrow">
          MEU FINANCEIRO
        </p>

        <h1>
          Objetivos
        </h1>

        <p class="finance-page-subtitle">
          Transforme seus planos em conquistas
        </p>
      </div>

      <button
        class="finance-back-btn"
        id="backObjetivosBtn"
        aria-label="Voltar"
      >
        ←
      </button>

    </header>


    <section class="objective-summary">

      <div class="objective-summary-icon">
        🎯
      </div>

      <div>
        <small>
          Seus objetivos
        </small>

        <strong id="objetivosResumo">
          0 objetivos
        </strong>
      </div>

    </section>


    <section class="objective-actions">

      <button
        class="primary-action"
        id="novoObjetivoBtn"
      >
        <span>＋</span>
        Novo objetivo
      </button>

    </section>


    <section
      id="listaObjetivosPage"
      class="objective-list"
    ></section>

  `;

  document
    .getElementById('app')
    ?.appendChild(
      objetivosPage
    );


  document
    .getElementById(
      'backObjetivosBtn'
    )
    ?.addEventListener(
      'click',
      voltarInicio
    );


  document
    .getElementById(
      'novoObjetivoBtn'
    )
    ?.addEventListener(
      'click',
      abrirFormularioObjetivo
    );
}


/* =====================================================
   RENDER OBJETIVOS
   ===================================================== */

function renderPaginaObjetivos() {

  const lista =
    document.getElementById(
      'listaObjetivosPage'
    );

  const resumo =
    document.getElementById(
      'objetivosResumo'
    );

  if (!lista) {
    return;
  }


  const objetivos =
    Array.isArray(
      state.objetivos
    )
      ? state.objetivos
      : [];


  if (resumo) {

    resumo.textContent =
      objetivos.length === 1
        ? '1 objetivo'
        : `${objetivos.length} objetivos`;
  }


  if (!objetivos.length) {

    lista.innerHTML = `

      <div class="launch-empty">

        <span>🎯</span>

        <strong>
          Nenhum objetivo encontrado
        </strong>

        <small>
          Crie seu primeiro objetivo financeiro.
        </small>

        <button
          class="primary-action"
          onclick="abrirFormularioObjetivo()"
        >
          Novo objetivo
        </button>

      </div>

    `;

    return;
  }


  lista.innerHTML =
    objetivos
      .map(
        objetivo => {

          const meta =
            Number(
              objetivo.meta || 0
            );

          const guardado =
            Number(
              objetivo.guardado ||
              objetivo.valorInicial ||
              0
            );


          const percentual =
            Math.max(
              0,
              Math.min(
                100,
                Number(
                  objetivo.percentual ||
                  (
                    meta > 0
                      ? (
                          guardado /
                          meta
                        ) *
                        100
                      : 0
                  )
                )
              )
            );


          const prioridade =
            objetivo.prioridade ||
            'Média';


          const prazo =
            objetivo.prazo
              ? formatDate(
                  objetivo.prazo
                )
              : 'Sem prazo';


          return `

            <article
              class="objective-card"
            >

              <div
                class="objective-card-top"
              >

                <div
                  class="objective-title"
                >

                  <span
                    class="objective-icon"
                  >
                    🎯
                  </span>

                  <div>

                    <strong>
                      ${escapeHtml(
                        objetivo.nome ||
                        'Objetivo'
                      )}
                    </strong>

                    <small>
                      Prioridade:
                      ${escapeHtml(
                        prioridade
                      )}
                    </small>

                  </div>

                </div>


                <b
                  class="objective-percent"
                >
                  ${Math.round(
                    percentual
                  )}%
                </b>

              </div>


              <div
                class="objective-progress"
              >

                <i
                  style="
                    width:${percentual}%
                  "
                ></i>

              </div>


              <div
                class="objective-values"
              >

                <span>
                  ${formatMoney(
                    guardado
                  )}
                </span>

                <span>
                  de
                  ${formatMoney(
                    meta
                  )}
                </span>

              </div>


              <div
                class="objective-footer"
              >

                <span>
                  📅 ${prazo}
                </span>

                <span>
                  ${percentual >= 100
                    ? '✓ Concluído'
                    : 'Em andamento'}
                </span>

              </div>

            </article>

          `;

        }
      )
      .join('');
}


/* =====================================================
   NOVO OBJETIVO
   ===================================================== */

function abrirFormularioObjetivo() {

  const existente =
    document.getElementById(
      'modalObjetivo'
    );

  if (existente) {
    existente.remove();
  }


  const hoje =
    new Date()
      .toISOString()
      .split('T')[0];


  const modal =
    document.createElement('div');

  modal.id =
    'modalObjetivo';

  modal.className =
    'finance-modal';


  modal.innerHTML = `

    <div
      class="finance-modal-backdrop"
      id="objetivoModalBackdrop"
    ></div>


    <div
      class="finance-modal-card"
    >

      <header
        class="finance-modal-header"
      >

        <div>

          <p class="eyebrow">
            NOVO OBJETIVO
          </p>

          <h2>
            Criar objetivo
          </h2>

        </div>


        <button
          class="modal-close"
          id="fecharModalObjetivo"
        >
          ×
        </button>

      </header>


      <form
        id="formObjetivo"
      >

        <label>

          Nome

          <input
            id="objetivoNome"
            type="text"
            placeholder="Ex.: Viagem"
            required
          >

        </label>


        <div
          class="form-grid"
        >

          <label>

            Meta

            <input
              id="objetivoMeta"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0,00"
              required
            >

          </label>


          <label>

            Valor inicial

            <input
              id="objetivoValorInicial"
              type="number"
              min="0"
              step="0.01"
              value="0"
            >

          </label>

        </div>


        <div
          class="form-grid"
        >

          <label>

            Prazo

            <input
              id="objetivoPrazo"
              type="date"
            >

          </label>


          <label>

            Prioridade

            <select
              id="objetivoPrioridade"
            >

              <option value="Baixa">
                Baixa
              </option>

              <option
                value="Média"
                selected
              >
                Média
              </option>

              <option value="Alta">
                Alta
              </option>

            </select>

          </label>

        </div>


        <label>

          Observação

          <textarea
            id="objetivoObservacao"
            rows="3"
            placeholder="Opcional"
          ></textarea>

        </label>


        <div
          id="objetivoFormErro"
          class="form-error"
        ></div>


        <button
          type="submit"
          class="primary-action"
        >
          Criar objetivo
        </button>

      </form>

    </div>

  `;


  document
    .getElementById('app')
    ?.appendChild(
      modal
    );


  document
    .getElementById(
      'fecharModalObjetivo'
    )
    ?.addEventListener(
      'click',
      fecharModalObjetivo
    );


  document
    .getElementById(
      'objetivoModalBackdrop'
    )
    ?.addEventListener(
      'click',
      fecharModalObjetivo
    );


  document
    .getElementById(
      'formObjetivo'
    )
    ?.addEventListener(
      'submit',
      salvarObjetivoFormulario
    );
}


/* =====================================================
   FECHAR MODAL
   ===================================================== */

function fecharModalObjetivo() {

  document
    .getElementById(
      'modalObjetivo'
    )
    ?.remove();
}


/* =====================================================
   SALVAR OBJETIVO
   ===================================================== */

async function salvarObjetivoFormulario(
  event
) {

  event.preventDefault();

  const erro =
    document.getElementById(
      'objetivoFormErro'
    );


  try {

    if (erro) {
      erro.textContent = '';
    }


    const dados = {

      escopo:
        state.escopo,

      nome:
        document
          .getElementById(
            'objetivoNome'
          )
          .value
          .trim(),

      meta:
        Number(
          document
            .getElementById(
              'objetivoMeta'
            )
            .value
        ),

      valorInicial:
        Number(
          document
            .getElementById(
              'objetivoValorInicial'
            )
            .value || 0
        ),

      prazo:
        document
          .getElementById(
            'objetivoPrazo'
          )
          .value,

      prioridade:
        document
          .getElementById(
            'objetivoPrioridade'
          )
          .value,

      observacao:
        document
          .getElementById(
            'objetivoObservacao'
          )
          .value
          .trim()

    };


    if (!dados.nome) {

      throw new Error(
        'Informe o nome do objetivo.'
      );

    }


    if (
      !dados.meta ||
      dados.meta <= 0
    ) {

      throw new Error(
        'Informe uma meta válida.'
      );

    }


    /*
     * IMPORTANTE:
     * Ainda não enviamos para a API.
     *
     * O próximo passo será conectar
     * esta função à ação do Apps Script
     * responsável por criar objetivos.
     */

    throw new Error(
      'A criação de objetivos será conectada ao servidor na próxima etapa.'
    );


  } catch (error) {

    console.error(
      error
    );

    if (erro) {

      erro.textContent =
        error.message;

    }

  }

}

/* =====================================================
   CORREÇÃO DEFINITIVA DA NAVEGAÇÃO ENTRE PÁGINAS
   COLE ESTE BLOCO NO FINAL DO APP.JS
   ===================================================== */


/* Garante que elementos com a classe hidden
   realmente fiquem escondidos. */
(function garantirHidden() {

  const style =
    document.createElement('style');

  style.id =
    'correcaoNavegacaoFinanceiro';

  style.textContent = `
    .hidden {
      display: none !important;
    }

    .finance-page.hidden {
      display: none !important;
    }

    .app.hidden {
      display: none !important;
    }
  `;

  if (
    !document.getElementById(
      'correcaoNavegacaoFinanceiro'
    )
  ) {

    document
      .head
      .appendChild(style);

  }

})();


/* =====================================================
   ABRIR LANÇAMENTOS
   ===================================================== */

async function abrirPaginaLancamentos(
  abrirFormulario = false
) {

  criarPaginaLancamentos();


  /* Esconde a página de objetivos */
  if (objetivosPage) {

    objetivosPage
      .classList
      .add('hidden');

  }


  /* Esconde a página inicial */
  document
    .querySelector('.app')
    ?.classList
    .add('hidden');


  /* Mostra somente lançamentos */
  if (lancamentosPage) {

    lancamentosPage
      .classList
      .remove('hidden');

  }


  /* Ajusta a navegação */
  document
    .querySelector('.bottom-nav')
    ?.classList
    .remove(
      'objetivos-open'
    );

  document
    .querySelector('.bottom-nav')
    ?.classList
    .add(
      'lancamentos-open'
    );


  marcarNavAtiva(1);


  await atualizarListaLancamentosPage();


  if (abrirFormulario) {

    abrirFormularioLancamento();

  }

}


/* =====================================================
   ABRIR OBJETIVOS
   ===================================================== */

async function abrirPaginaObjetivos() {

  criarPaginaObjetivos();


  /* Esconde completamente lançamentos */
  if (lancamentosPage) {

    lancamentosPage
      .classList
      .add('hidden');

  }


  /* Esconde a página inicial */
  document
    .querySelector('.app')
    ?.classList
    .add('hidden');


  /* Mostra somente objetivos */
  if (objetivosPage) {

    objetivosPage
      .classList
      .remove('hidden');

  }


  /* Ajusta a navegação */
  document
    .querySelector('.bottom-nav')
    ?.classList
    .remove(
      'lancamentos-open'
    );

  document
    .querySelector('.bottom-nav')
    ?.classList
    .add(
      'objetivos-open'
    );


  marcarNavAtiva(2);


  renderPaginaObjetivos();

}


/* =====================================================
   VOLTAR PARA O INÍCIO
   ===================================================== */

function voltarInicio() {


  /* Esconde lançamentos */
  if (lancamentosPage) {

    lancamentosPage
      .classList
      .add('hidden');

  }


  /* Esconde objetivos */
  if (objetivosPage) {

    objetivosPage
      .classList
      .add('hidden');

  }


  /* Mostra a página inicial */
  document
    .querySelector('.app')
    ?.classList
    .remove('hidden');


  /* Limpa as classes de navegação */
  document
    .querySelector('.bottom-nav')
    ?.classList
    .remove(
      'lancamentos-open',
      'objetivos-open'
    );


  marcarNavAtiva(0);


  carregarDashboard();

}


/* =====================================================
   CORREÇÃO DOS BOTÕES DA NAVEGAÇÃO
   ===================================================== */

function configurarNavegacaoFinanceiro() {

  const buttons =
    document.querySelectorAll(
      '.bottom-nav button'
    );


  buttons.forEach(
    (button, index) => {

      /* Remove listeners antigos
         clonando o botão */

      const novoBotao =
        button.cloneNode(true);


      button
        .parentNode
        ?.replaceChild(
          novoBotao,
          button
        );


      novoBotao.addEventListener(
        'click',
        () => {


          /* INÍCIO */

          if (index === 0) {

            voltarInicio();

            return;

          }


          /* LANÇAMENTOS */

          if (index === 1) {

            abrirPaginaLancamentos(false);

            return;

          }


          /* OBJETIVOS */

          if (index === 2) {

            abrirPaginaObjetivos();

            return;

          }


          /* RELATÓRIOS */

          if (index === 3) {

            alert(
              'A aba Relatórios será conectada na próxima etapa.'
            );

            return;

          }


          /* AJUSTES */

          if (index === 4) {

            alert(
              'A aba Ajustes será conectada na próxima etapa.'
            );

          }

        }
      );

    }
  );

}


/* Configura novamente a navegação
   depois que a página terminar de carregar */

window.addEventListener(
  'load',
  () => {

    setTimeout(
      configurarNavegacaoFinanceiro,
      300
    );

  }
);

/* =====================================================
   CACHE DE LANÇAMENTOS - CORREÇÃO
   COLE TODO ESTE BLOCO NO FINAL DO APP.JS
   ===================================================== */


/* -----------------------------------------------------
   CONTROLE DO CACHE
   ----------------------------------------------------- */

state.lancamentosCarregados = false;

state.lancamentosCarregando = null;


/* -----------------------------------------------------
   NOVA FUNÇÃO DE CARREGAMENTO
   ----------------------------------------------------- */

async function carregarLancamentos(
  filtros = {},
  forcarAtualizacao = false
) {

  /*
   * Se os lançamentos já foram carregados
   * nesta sessão e não precisamos atualizar,
   * devolvemos os dados guardados na memória.
   */
  if (
    state.lancamentosCarregados &&
    !forcarAtualizacao &&
    Object.keys(filtros).length === 0
  ) {

    return state.lancamentos;

  }


  /*
   * Evita fazer duas requisições ao mesmo tempo.
   *
   * Se uma requisição já estiver acontecendo,
   * aguardamos ela terminar.
   */
  if (
    state.lancamentosCarregando &&
    !forcarAtualizacao
  ) {

    return state.lancamentosCarregando;

  }


  const buscarDados = async () => {

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


      /*
       * Garante que temos sempre um array.
       */
      const lista =
        Array.isArray(data)
          ? data
          : [];


      /*
       * Só atualizamos o cache principal
       * quando a busca foi feita sem filtros.
       */
      if (
        Object.keys(filtros).length === 0
      ) {

        state.lancamentos =
          lista;

        state.lancamentosCarregados =
          true;

      }


      return lista;

    } catch (error) {

      console.error(
        'Lançamentos:',
        error
      );

      mostrarErro(
        error.message
      );

      return [];

    } finally {

      state.lancamentosCarregando =
        null;

    }

  };


  state.lancamentosCarregando =
    buscarDados();


  return state.lancamentosCarregando;

}


/* -----------------------------------------------------
   ATUALIZA A LISTA USANDO O CACHE
   ----------------------------------------------------- */

async function atualizarListaLancamentosPage() {

  const lista =
    document.getElementById(
      'listaLancamentosPage'
    );


  if (!lista) {
    return;
  }


  /*
   * Só mostra carregamento e busca os dados
   * se eles ainda não foram carregados.
   */
  if (!state.lancamentosCarregados) {

    lista.innerHTML = `
      <div class="launch-loading">
        Carregando lançamentos...
      </div>
    `;

    await carregarLancamentos();

  }


  /*
   * Agora usamos sempre os dados guardados
   * na memória.
   */
  let dados =
    Array.isArray(
      state.lancamentos
    )
      ? [...state.lancamentos]
      : [];


  const mes =
    document.getElementById(
      'filtroMesLancamentos'
    )?.value ||
    'TODOS';


  const tipo =
    document.getElementById(
      'filtroTipoLancamentos'
    )?.value ||
    '';


  const categoria =
    document.getElementById(
      'filtroCategoriaLancamentos'
    )?.value ||
    '';


  const busca =
    (
      document.getElementById(
        'buscaLancamentos'
      )?.value ||
      ''
    )
      .trim()
      .toLowerCase();


  /* -------------------------------
     FILTRO DE MÊS
     ------------------------------- */

  if (
    mes !== 'TODOS'
  ) {

    dados =
      dados.filter(
        item =>
          String(
            item.data || ''
          ).startsWith(
            mes
          )
      );

  }


  /* -------------------------------
     FILTRO DE TIPO
     ------------------------------- */

  if (tipo) {

    dados =
      dados.filter(
        item =>
          item.tipo === tipo
      );

  }


  /* -------------------------------
     FILTRO DE CATEGORIA
     ------------------------------- */

  if (categoria) {

    dados =
      dados.filter(
        item =>
          item.categoria ===
          categoria
      );

  }


  /* -------------------------------
     BUSCA
     ------------------------------- */

  if (busca) {

    dados =
      dados.filter(
        item => {

          const texto =
            [
              item.descricao,
              item.categoria,
              item.conta
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();


          return texto.includes(
            busca
          );

        }
      );

  }


  /*
   * Renderiza sem fazer nova requisição.
   */
  renderPaginaLancamentos(
    dados
  );

}


/* -----------------------------------------------------
   ABRIR LANÇAMENTOS
   ----------------------------------------------------- */

async function abrirPaginaLancamentos(
  abrirFormulario = false
) {

  criarPaginaLancamentos();


  /*
   * Esconde Objetivos.
   */
  if (objetivosPage) {

    objetivosPage
      .classList
      .add('hidden');

  }


  /*
   * Esconde a página inicial.
   */
  document
    .querySelector('.app')
    ?.classList
    .add('hidden');


  /*
   * Mostra Lançamentos.
   */
  if (lancamentosPage) {

    lancamentosPage
      .classList
      .remove('hidden');

  }


  /*
   * Ajusta a navegação.
   */
  document
    .querySelector('.bottom-nav')
    ?.classList
    .remove('objetivos-open');


  document
    .querySelector('.bottom-nav')
    ?.classList
    .add('lancamentos-open');


  marcarNavAtiva(1);


  /*
   * Aqui está a principal mudança:
   *
   * Se já carregou uma vez,
   * apenas mostra os dados imediatamente.
   *
   * Não faz nova chamada à API.
   */
  await atualizarListaLancamentosPage();


  if (abrirFormulario) {

    abrirFormularioLancamento();

  }

}


/* -----------------------------------------------------
   INVALIDAR CACHE QUANDO NECESSÁRIO
   ----------------------------------------------------- */

function invalidarCacheLancamentos() {

  state.lancamentos = [];

  state.lancamentosCarregados =
    false;

  state.lancamentosCarregando =
    null;

}


/* -----------------------------------------------------
   TROCA DE ESCOPO
   ----------------------------------------------------- */

async function trocarEscopo(
  escopo
) {

  if (!escopo) {
    return;
  }


  /*
   * Se o usuário mudou de escopo,
   * os lançamentos antigos não podem
   * continuar no cache.
   */
  state.escopo =
    escopo;


  invalidarCacheLancamentos();


  await carregarDashboard();


  /*
   * Carrega os lançamentos do novo escopo
   * uma única vez.
   */
  await carregarLancamentos(
    {},
    true
  );

}
