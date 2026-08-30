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

  formasPagamento: [],

  recorrentes: [],

  cadastrosGerenciamento: null,

  /*
   * Cache mantido durante a sessão.
   */
  lancamentosCarregados: false,

  lancamentosCarregando: null,

  dashboardCarregado: false,

  lancamentosAba:
    'movimentacoes',

  recorrenciasGeradas:
    {}

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

    method:
      method,

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


  let envelope;


  try {

    envelope =
      JSON.parse(
        text
      );

  } catch (e) {

    throw new Error(
      'A API retornou uma resposta inválida.'
    );

  }


  if (
    !response.ok ||
    envelope.ok === false
  ) {

    throw new Error(
      envelope.erro ||
      'Erro ao comunicar com o servidor.'
    );

  }


  /*
   * O Apps Script agora devolve:
   *
   * {
   *   ok: true,
   *   data: ...
   * }
   *
   * O restante do frontend trabalha diretamente
   * com o conteúdo de data.
   */
  if (
    Object.prototype.hasOwnProperty.call(
      envelope,
      'data'
    )
  ) {

    return envelope.data;

  }


  /*
   * Compatibilidade com qualquer resposta antiga
   * que já venha sem o envelope "data".
   */
  return envelope;

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

    state.formasPagamento =
      data.formasPagamento ||
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

    atualizarPermissaoVisual();

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
      (
        data.saldoDisponivel ??
        data.resultado ??
        0
      )
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
    document.getElementById(
      'dashboardSaldo'
    );

  if (saldoElement) {

    saldoElement.textContent =
      formatMoney(
        saldo
      );

    aplicarPrivacidadeSaldo();
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
    data.ultimos ||
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
        <small>
          Crie seu primeiro objetivo financeiro.
        </small>
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

            <article
              class="goal"
            >

              <div
                class="goal-top"
              >

                <span>
                  ${iconeObjetivo(
                    objetivo.nome
                  )}

                  ${escapeHtml(
                    objetivo.nome
                  )}
                </span>


                <b>
                  ${Math.round(
                    percentual
                  )}%
                </b>

              </div>


              <div
                class="progress"
              >

                <i
                  style="
                    width:${percentual}%
                  "
                ></i>

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
  filtros = {},
  forcarAtualizacao = false
) {

  const possuiFiltros =
    Object.keys(
      filtros || {}
    ).length > 0;


  /*
   * Cache:
   * se já temos todos os lançamentos nesta sessão,
   * não consultamos o servidor novamente.
   */
  if (
    state.lancamentosCarregados &&
    !forcarAtualizacao &&
    !possuiFiltros
  ) {

    return state.lancamentos;

  }


  /*
   * Se uma consulta já estiver em andamento,
   * reutilizamos a mesma Promise.
   */
  if (
    state.lancamentosCarregando &&
    !forcarAtualizacao
  ) {

    return state.lancamentosCarregando;

  }


  const buscar =
    async () => {

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


        const lista =
          Array.isArray(data)
            ? data
            : [];


        if (!possuiFiltros) {

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
    buscar();


  return state.lancamentosCarregando;

}


/* =====================================================
   USUÁRIO / ESCOPO
   ===================================================== */


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



function nivelEscopoAtual() {

  const escopos =
    state.initialData?.escopos ||
    [];

  const atual =
    escopos.find(
      item =>
        String(
          item.nome
        ) ===
        String(
          state.escopo
        )
    );

  if (atual?.nivel) {
    return String(
      atual.nivel
    ).toUpperCase();
  }

  if (
    state.escopo ===
      state.user?.nome ||
    state.escopo ===
      'CASAL'
  ) {
    return 'EDITAR';
  }

  return '';
}


function podeEditarEscopoAtual() {

  return (
    nivelEscopoAtual() ===
    'EDITAR'
  );
}


function exigirEdicaoNoFrontend() {

  if (
    podeEditarEscopoAtual()
  ) {
    return true;
  }

  window.alert(
    'Este espaço está disponível somente para visualização.'
  );

  return false;
}


function atualizarPermissaoVisual() {

  document.body
    .classList
    .toggle(
      'scope-readonly',
      !podeEditarEscopoAtual()
    );

  const select =
    document.getElementById(
      'settingsScopeSelect'
    );

  if (select) {
    select.dataset.nivel =
      nivelEscopoAtual();
  }
}


async function carregarCadastrosDoEscopo(
  incluirInativas = false
) {

  if (!state.escopo) {
    return null;
  }

  const dados =
    await api(
      'obterCadastros',
      {
        escopo:
          state.escopo,

        incluirInativas:
          incluirInativas
            ? 'true'
            : 'false'
      }
    );

  if (!incluirInativas) {

    state.contas =
      dados.contas ||
      [];

    state.categorias =
      dados.categorias ||
      [];

    state.formasPagamento =
      dados.formasPagamento ||
      [];

  }

  return dados;
}


async function trocarEscopo(
  escopo
) {

  if (!escopo) {
    return;
  }


  state.escopo =
    escopo;


  /*
   * Mudou o espaço: o cache antigo não serve.
   */
  state.lancamentos =
    [];

  state.lancamentosCarregados =
    false;

  state.lancamentosCarregando =
    null;


  state.dashboard =
    null;

  state.dashboardCarregado =
    false;


  await carregarCadastrosDoEscopo(
    false
  );

  state.recorrentes =
    await api(
      'listarRecorrentes',
      {
        escopo:
          state.escopo
      }
    );

  state.recorrenciasGeradas =
    {};

  atualizarPermissaoVisual();


  await Promise.all([
    carregarDashboard(true),
    carregarLancamentos({}, true)
  ]);


  if (
    objetivosPage &&
    !objetivosPage.classList.contains(
      'hidden'
    )
  ) {

    await carregarObjetivos();

    renderPaginaObjetivos();

  }


  if (
    lancamentosPage &&
    !lancamentosPage.classList.contains(
      'hidden'
    )
  ) {

    preencherFiltroMeses();

    atualizarCategoriasFiltro();

    await atualizarListaLancamentosPage();

  }

}

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

  const status =
    document.getElementById(
      'loginStatus'
    );


  const button =
    document.getElementById(
      'googleButton'
    );


  if (!button) {

    console.error(
      'Elemento #googleButton não foi encontrado.'
    );

    return;

  }


  if (
    !window.google?.accounts?.id
  ) {

    if (status) {

      status.textContent =
        'Carregando login do Google...';

    }


    setTimeout(
      inicializarGoogle,
      250
    );


    return;

  }


  try {

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


    button.innerHTML =
      '';


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


    if (status) {

      status.textContent =
        '';

    }


  } catch (error) {

    console.error(
      'Erro ao inicializar Google:',
      error
    );


    if (status) {

      status.textContent =
        'Não foi possível carregar o login do Google. Tente atualizar a página.';

    }

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

  const cadastrada =
    state.categorias
      .find(
        item =>
          String(
            item.nome || ''
          ) ===
          String(
            categoria || ''
          )
      );

  if (
    cadastrada?.icone
  ) {
    return cadastrada.icone;
  }

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
   PRIVACIDADE DO SALDO
   ===================================================== */

const SALDO_PRIVACIDADE_KEY =
  'financeiro-saldo-oculto';


function saldoEstaOculto() {

  const salvo =
    localStorage.getItem(
      SALDO_PRIVACIDADE_KEY
    );

  /*
   * Por padrão o saldo começa oculto.
   */
  if (salvo === null) {
    return true;
  }

  return salvo === 'true';
}


function aplicarPrivacidadeSaldo() {

  const saldo =
    document.getElementById(
      'dashboardSaldo'
    );

  const card =
    document.querySelector(
      '.balance-card'
    );

  const button =
    document.getElementById(
      'toggleBalancePrivacy'
    );

  const icon =
    document.getElementById(
      'balanceEyeIcon'
    );

  if (
    !saldo ||
    !card ||
    !button
  ) {
    return;
  }

  const oculto =
    saldoEstaOculto();

  card.classList.toggle(
    'balance-hidden',
    oculto
  );

  if (oculto) {

    if (
      saldo.textContent !==
      '••••••'
    ) {

      saldo.dataset.valorReal =
        saldo.textContent;
    }

    saldo.textContent =
      '••••••';

    button.setAttribute(
      'aria-label',
      'Mostrar saldo'
    );

    button.title =
      'Mostrar saldo';

    if (icon) {
      icon.textContent =
        '👁️';
    }

    return;
  }

  if (
    saldo.textContent ===
      '••••••' &&
    saldo.dataset.valorReal
  ) {

    saldo.textContent =
      saldo.dataset.valorReal;
  }

  button.setAttribute(
    'aria-label',
    'Ocultar saldo'
  );

  button.title =
    'Ocultar saldo';

  if (icon) {
    icon.textContent =
      '🙈';
  }
}


function alternarPrivacidadeSaldo() {

  localStorage.setItem(
    SALDO_PRIVACIDADE_KEY,
    String(
      !saldoEstaOculto()
    )
  );

  aplicarPrivacidadeSaldo();
}


function configurarPrivacidadeSaldo() {

  document
    .getElementById(
      'toggleBalancePrivacy'
    )
    ?.addEventListener(
      'click',
      alternarPrivacidadeSaldo
    );

  aplicarPrivacidadeSaldo();
}


/* =====================================================
   EVENTOS
   ===================================================== */

function configurarEventos() {

  configurarTema();

  configurarPrivacidadeSaldo();


  document
    .getElementById(
      'logoutBtn'
    )
    ?.addEventListener(
      'click',
      logout
    );


  document
    .querySelector('.fab')
    ?.addEventListener(
      'click',
      () =>
        abrirPaginaLancamentos(
          true
        )
    );


  document
    .getElementById(
      'quickNovoLancamento'
    )
    ?.addEventListener(
      'click',
      () =>
        abrirPaginaLancamentos(
          true
        )
    );


  document
    .getElementById(
      'quickRecorrentes'
    )
    ?.addEventListener(
      'click',
      () =>
        abrirPaginaLancamentos(
          false,
          true
        )
    );


  document
    .getElementById(
      'verTodosObjetivosBtn'
    )
    ?.addEventListener(
      'click',
      () =>
        abrirPaginaObjetivos()
    );


  document
    .getElementById(
      'verTodosLancamentosBtn'
    )
    ?.addEventListener(
      'click',
      () =>
        abrirPaginaLancamentos(
          false
        )
    );


  /*
   * Navegação inferior.
   */
  document
    .querySelectorAll(
      '.bottom-nav button'
    )
    .forEach(
      (button, index) => {

        button.addEventListener(
          'click',
          () => {

            if (
              index === 0
            ) {

              voltarInicio();

              return;

            }


            if (
              index === 1
            ) {

              abrirPaginaLancamentos(
                false
              );

              return;

            }


            if (
              index === 2
            ) {

              abrirPaginaObjetivos();

              return;

            }


            if (
              index === 3
            ) {

              abrirPaginaRelatorios();

              return;

            }


            if (
              index === 4
            ) {

              abrirPaginaAjustes();

            }

          }
        );

      }
    );


  document
    .getElementById(
      'scopeSelect'
    )
    ?.addEventListener(
      'change',
      event =>
        trocarEscopo(
          event.target.value
        )
    );

}


/* =====================================================
   INICIALIZAÇÃO
   ===================================================== */

let appInicializado = false;


function iniciarAplicacao() {

  if (appInicializado) {
    return;
  }


  appInicializado =
    true;


  configurarEventos();


  inicializarGoogle();


  restaurarSessao();

}


if (
  document.readyState ===
  'loading'
) {

  document.addEventListener(
    'DOMContentLoaded',
    iniciarAplicacao,
    {
      once: true
    }
  );

} else {

  iniciarAplicacao();

}


/* =====================================================
   PÁGINA DE LANÇAMENTOS
   ===================================================== */

let lancamentosPage = null;


/* =====================================================
   NAVEGAÇÃO ENTRE TELAS
   ===================================================== */

function ocultarPaginasInternas() {

  [
    'lancamentosPage',
    'objetivosPage',
    'relatoriosPage',
    'ajustesPage'
  ].forEach(
    id =>
      document
        .getElementById(id)
        ?.classList
        .add('hidden')
  );
}


function marcarNavAtiva(index) {

  const botoes =
    document.querySelectorAll(
      '.bottom-nav button'
    );

  botoes.forEach(
    (button, buttonIndex) => {

      button.classList.toggle(
        'active',
        buttonIndex === index
      );

    }
  );
}


function prepararPaginaInterna(index) {

  ocultarPaginasInternas();

  document
    .querySelector('.app')
    ?.classList
    .add('hidden');

  document
    .querySelector('.bottom-nav')
    ?.classList
    .remove(
      'lancamentos-open',
      'objetivos-open'
    );

  marcarNavAtiva(index);

  window.scrollTo({
    top: 0,
    left: 0,
    behavior: 'auto'
  });
}


/* =====================================================
   ABRIR LANÇAMENTOS
   ===================================================== */

async function abrirPaginaLancamentos(
  abrirFormulario = false,
  abrirRecorrente = false
) {

  criarPaginaLancamentos();

  prepararPaginaInterna(1);

  lancamentosPage
    .classList
    .remove('hidden');

  /*
   * Só consulta a API na primeira carga.
   * Nas próximas trocas de aba, usa o cache.
   */
  await atualizarListaLancamentosPage();

  if (abrirFormulario) {
    abrirFormularioLancamento();
  }

  if (abrirRecorrente) {
    abrirFormularioRecorrente();
  }
}


/* =====================================================
   VOLTAR PARA INÍCIO
   ===================================================== */

function voltarInicio() {

  ocultarPaginasInternas();

  document
    .querySelector('.app')
    ?.classList
    .remove('hidden');

  document
    .querySelector('.bottom-nav')
    ?.classList
    .remove(
      'lancamentos-open',
      'objetivos-open'
    );

  marcarNavAtiva(0);

  window.scrollTo({
    top: 0,
    left: 0,
    behavior: 'auto'
  });

  if (state.dashboard) {
    renderDashboard(
      state.dashboard
    );
  }
}


/* =====================================================
   CRIA A PÁGINA
   ===================================================== */

function criarPaginaLancamentos() {

  if (lancamentosPage) {
    return;
  }


  lancamentosPage =
    document.createElement(
      'div'
    );


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
        type="button"
      >
        ←
      </button>

    </header>


    <section class="launch-summary">

      <div>
        <small>Receitas</small>

        <strong
          id="launchReceitas"
          class="positive"
        >
          R$ 0,00
        </strong>

      </div>


      <div>
        <small>Despesas</small>

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
        type="button"
      >
        <span>＋</span>
        Novo lançamento
      </button>


      <button
        class="secondary-action"
        id="novoRecorrentePageBtn"
        type="button"
      >
        🔄 Dívida recorrente
      </button>

    </section>


    <section class="launch-filters">

      <div class="filter-row">

        <select
          id="filtroMesLancamentos"
        >

          <option value="TODOS">
            Todos os meses
          </option>

        </select>


        <select
          id="filtroTipoLancamentos"
        >

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

        <select
          id="filtroCategoriaLancamentos"
        >

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
      () =>
        abrirFormularioLancamento()
    );


  document
    .getElementById(
      'novoRecorrentePageBtn'
    )
    ?.addEventListener(
      'click',
      abrirFormularioRecorrente
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


  const valorAtual =
    select.value;


  const meses =
    new Set();


  state.lancamentos
    .forEach(
      lancamento => {

        if (
          lancamento.data
        ) {

          meses.add(
            String(
              lancamento.data
            ).substring(
              0,
              7
            )
          );

        }

      }
    );


  const ordenados =
    [
      ...meses
    ]
      .sort(
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
            month:
              'long',

            year:
              'numeric'
          }
        );


      const option =
        document.createElement(
          'option'
        );


      option.value =
        mes;


      option.textContent =
        nome.charAt(0).toUpperCase() +
        nome.slice(1);


      select.appendChild(
        option
      );

    }
  );


  if (
    valorAtual &&
    [
      'TODOS',
      ...ordenados
    ].includes(
      valorAtual
    )
  ) {

    select.value =
      valorAtual;

  }

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
    )?.value ||
    '';


  const valorAtual =
    select.value;


  const categorias =
    state.categorias
      .filter(
        categoria =>
          !tipo ||
          categoria.tipo ===
          tipo
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

      option.value =
        nome;

      option.textContent =
        nome;

      select.appendChild(
        option
      );

    }
  );


  if (
    categorias.includes(
      valorAtual
    )
  ) {

    select.value =
      valorAtual;

  }

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


  /*
   * Só mostra "Carregando..." na primeira consulta.
   */
  if (!state.lancamentosCarregados) {

    lista.innerHTML = `
      <div class="launch-loading">
        Carregando lançamentos...
      </div>
    `;

    await carregarLancamentos();

  }


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


  let filtrados =
    [
      ...state.lancamentos
    ];


  if (
    mes !== 'TODOS'
  ) {

    filtrados =
      filtrados.filter(
        item =>
          String(
            item.data ||
            ''
          ).startsWith(
            mes
          )
      );

  }


  if (tipo) {

    filtrados =
      filtrados.filter(
        item =>
          item.tipo ===
          tipo
      );

  }


  if (categoria) {

    filtrados =
      filtrados.filter(
        item =>
          item.categoria ===
          categoria
      );

  }


  if (busca) {

    filtrados =
      filtrados.filter(
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
          type="button"
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


          const parcelas =
            Number(
              item.parcelas ||
              1
            );


          const parcelaAtual =
            Number(
              item.parcelaAtual ||
              1
            );


          const parcelamento =
            parcelas > 1
              ? `Parcela ${parcelaAtual}/${parcelas}`
              : '';


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
                    item.descricao ||
                    'Sem descrição'
                  )}
                </strong>


                <small>
                  ${formatDate(
                    item.data
                  )}

                  ${
                    item.categoria
                      ? ' · ' +
                        escapeHtml(
                          item.categoria
                        )
                      : ''
                  }

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
                  parcelamento
                    ? `
                      <small
                        class="launch-meta"
                      >
                        ${parcelamento}
                      </small>
                    `
                    : ''
                }


                ${
                  item.recorrenteId
                    ? `
                      <small
                        class="launch-recurring-tag"
                      >
                        🔄 Recorrente
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

              </div>


              <div
                class="launch-actions-icons"
              >

                <button
                  type="button"
                  class="launch-icon-btn"
                  data-action="edit"
                  data-id="${
                    escapeAttribute(
                      item.id
                    )
                  }"
                  title="Editar lançamento"
                  aria-label="Editar lançamento"
                >
                  ✏️
                </button>


                <button
                  type="button"
                  class="launch-icon-btn danger"
                  data-action="delete"
                  data-id="${
                    escapeAttribute(
                      item.id
                    )
                  }"
                  title="Excluir lançamento"
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
      '[data-action="edit"]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () =>
            abrirFormularioLancamento(
              button.dataset.id
            )
        );

      }
    );


  lista
    .querySelectorAll(
      '[data-action="delete"]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () =>
            excluirLancamentoDaPagina(
              button.dataset.id
            )
        );

      }
    );

}


/* =====================================================
   FORMULÁRIO DE LANÇAMENTO
   ===================================================== */

function abrirFormularioLancamentoBaseV4(
  id = null
) {

  if (
    !exigirEdicaoNoFrontend()
  ) {
    return;
  }

  const modal =
    document.getElementById(
      'modalLancamento'
    );


  if (!modal) {
    return;
  }


  const existente =
    id
      ? state.lancamentos.find(
          item =>
            String(item.id) ===
            String(id)
        )
      : null;


  const hoje =
    new Date()
      .toISOString()
      .split('T')[0];


  const dataInicial =
    existente?.data ||
    hoje;


  const isEdicao =
    Boolean(
      existente
    );


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
            ${
              isEdicao
                ? 'EDITAR LANÇAMENTO'
                : 'NOVO LANÇAMENTO'
            }
          </p>


          <h2>
            ${
              isEdicao
                ? 'Editar movimento'
                : 'Registrar movimento'
            }
          </h2>

        </div>


        <button
          id="fecharModalLancamento"
          class="modal-close"
          type="button"
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
            class="type-btn ${
              (
                existente?.tipo ||
                'DESPESA'
              ) ===
              'DESPESA'
                ? 'active'
                : ''
            }"
          >
            − Despesa
          </button>


          <button
            type="button"
            data-tipo="RECEITA"
            class="type-btn ${
              existente?.tipo ===
              'RECEITA'
                ? 'active'
                : ''
            }"
          >
            + Receita
          </button>

        </div>


        <input
          type="hidden"
          id="lancamentoTipo"
          value="${
            existente?.tipo ||
            'DESPESA'
          }"
        >


        <label>
          Descrição

          <input
            id="lancamentoDescricao"
            type="text"
            placeholder="Ex.: Faculdade"
            value="${
              escapeAttribute(
                existente?.descricao ||
                ''
              )
            }"
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
              value="${
                existente?.valor ??
                ''
              }"
              required
            >
          </label>


          <label>
            Vencimento / previsão

            <input
              id="lancamentoData"
              type="date"
              value="${dataInicial}"
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

            </select>

          </label>


          <label>

            Parcelamento

            <input
              id="lancamentoParcelas"
              type="number"
              min="1"
              max="60"
              value="${
                existente?.parcelas ||
                1
              }"
            >


            <small class="field-hint">
              Compra parcelada em várias vezes.
            </small>

          </label>

        </div>


        ${
          !isEdicao
            ? `

              <label
                class="recurrence-toggle"
              >

                <input
                  id="lancamentoRecorrente"
                  type="checkbox"
                >


                <span>

                  <strong>
                    🔄 É uma dívida recorrente mensal?
                  </strong>


                  <small>
                    Ex.: faculdade, aluguel,
                    internet ou assinatura.
                  </small>

                </span>

              </label>


              <div
                id="recurrenceFields"
                class="recurrence-fields hidden"
              >

                <div
                  class="form-grid"
                >

                  <label>

                    Vencimento

                    <input
                      id="recorrenciaDia"
                      type="number"
                      min="1"
                      max="31"
                      value="${
                        Number(
                          String(
                            dataInicial
                          ).slice(
                            8,
                            10
                          )
                        ) ||
                        1
                      }"
                    >


                    <small class="field-hint">
                      Dia de cada mês.
                    </small>

                  </label>


                  <label>

                    Repetir até

                    <input
                      id="recorrenciaFim"
                      type="date"
                    >


                    <small class="field-hint">
                      Deixe vazio para manter ativa.
                    </small>

                  </label>

                </div>

              </div>

            `
            : ''
        }


        <label>

          Observação

          <textarea
            id="lancamentoObservacao"
            rows="3"
            placeholder="Opcional"
          >${
            escapeHtml(
              existente?.observacao ||
              ''
            )
          }</textarea>

        </label>


        <div
          id="lancamentoFormErro"
          class="form-error"
        ></div>


        <button
          type="submit"
          class="primary-action save-launch-btn"
        >
          ${
            isEdicao
              ? 'Salvar alterações'
              : 'Salvar lançamento'
          }
        </button>

      </form>

    </div>

  `;


  modal.classList.remove(
    'hidden'
  );


  preencherFormularioLancamento(
    existente
  );


  modal
    .querySelector(
      '#fecharModalLancamento'
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
                item =>
                  item.classList.remove(
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
      'lancamentoRecorrente'
    )
    ?.addEventListener(
      'change',
      event => {

        document
          .getElementById(
            'recurrenceFields'
          )
          ?.classList.toggle(
            'hidden',
            !event.target.checked
          );

      }
    );


  modal
    .querySelector(
      '#formLancamento'
    )
    ?.addEventListener(
      'submit',
      event =>
        salvarLancamentoFormulario(
          event,
          id
        )
    );

}


/* =====================================================
   PREENCHER FORMULÁRIO
   ===================================================== */

function preencherFormularioLancamento(
  existente = null
) {

  preencherCategoriasFormulario(
    existente?.categoria ||
    ''
  );


  const contaSelect =
    document.getElementById(
      'lancamentoConta'
    );


  if (
    contaSelect
  ) {

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


          if (
            existente?.conta ===
            conta.nome
          ) {

            option.selected =
              true;

          }


          contaSelect.appendChild(
            option
          );

        }
      );


    if (
      existente?.conta &&
      !state.contas.some(
        conta =>
          conta.nome ===
          existente.conta
      )
    ) {

      const antiga =
        document.createElement(
          'option'
        );

      antiga.value =
        existente.conta;

      antiga.textContent =
        `${existente.conta} · inativa`;

      antiga.selected =
        true;

      contaSelect.appendChild(
        antiga
      );

    }

  }


  const forma =
    document.getElementById(
      'lancamentoForma'
    );


  if (forma) {

    state.formasPagamento
      .forEach(
        item => {

          const option =
            document.createElement(
              'option'
            );

          option.value =
            item.nome;

          option.textContent =
            item.nome;

          forma.appendChild(
            option
          );

        }
      );

    if (
      existente?.formaPagamento &&
      !state.formasPagamento.some(
        item =>
          item.nome ===
          existente.formaPagamento
      )
    ) {

      const antiga =
        document.createElement(
          'option'
        );

      antiga.value =
        existente.formaPagamento;

      antiga.textContent =
        `${existente.formaPagamento} · inativa`;

      forma.appendChild(
        antiga
      );

    }


    if (existente) {

      forma.value =
        existente.formaPagamento ||
        '';

    }

  }

}


/* =====================================================
   CATEGORIAS DO FORMULÁRIO
   ===================================================== */

function preencherCategoriasFormulario(
  categoriaSelecionada = ''
) {

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


  select.innerHTML =
    '';


  categorias
    .forEach(
      categoria => {

        const option =
          document.createElement(
            'option'
          );


        option.value =
          categoria.nome;


        option.textContent =
          `${categoria.icone || ''} ${categoria.nome}`.trim();


        if (
          categoria.nome ===
          categoriaSelecionada
        ) {

          option.selected =
            true;

        }


        select.appendChild(
          option
        );

      }
    );


  if (
    categoriaSelecionada &&
    !categorias.some(
      categoria =>
        categoria.nome ===
        categoriaSelecionada
    )
  ) {

    const antiga =
      document.createElement(
        'option'
      );

    antiga.value =
      categoriaSelecionada;

    antiga.textContent =
      `${categoriaSelecionada} · inativa`;

    antiga.selected =
      true;

    select.appendChild(
      antiga
    );

  }

}


/* =====================================================
   SALVAR LANÇAMENTO
   ===================================================== */

async function salvarLancamentoFormulario(
  event,
  id = null
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

      button.disabled =
        true;


      button.textContent =
        id
          ? 'Salvando alterações...'
          : 'Salvando...';

    }


    const dados = {

      id:
        id || undefined,

      escopo:
        state.escopo,

      tipo:
        document
          .getElementById(
            'lancamentoTipo'
          )
          .value,

      descricao:
        document
          .getElementById(
            'lancamentoDescricao'
          )
          .value
          .trim(),

      valor:
        Number(
          document
            .getElementById(
              'lancamentoValor'
            )
            .value
        ),

      data:
        document
          .getElementById(
            'lancamentoData'
          )
          .value,

      categoria:
        document
          .getElementById(
            'lancamentoCategoria'
          )
          .value,

      conta:
        document
          .getElementById(
            'lancamentoConta'
          )
          .value,

      formaPagamento:
        document
          .getElementById(
            'lancamentoForma'
          )
          .value,

      parcelas:
        Number(
          document
            .getElementById(
              'lancamentoParcelas'
            )
            .value ||
          1
        ),

      observacao:
        document
          .getElementById(
            'lancamentoObservacao'
          )
          .value
          .trim()

    };


    if (!dados.descricao) {

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


    const recorrente =
      !id &&
      Boolean(
        document
          .getElementById(
            'lancamentoRecorrente'
          )
          ?.checked
      );


    if (recorrente) {

      if (
        dados.tipo !==
        'DESPESA'
      ) {

        throw new Error(
          'Dívidas recorrentes devem ser despesas.'
        );

      }


      if (
        dados.parcelas >
        1
      ) {

        throw new Error(
          'Para uma dívida recorrente, deixe o parcelamento em 1.'
        );

      }


      const dia =
        Math.max(
          1,
          Math.min(
            31,
            Number(
              document
                .getElementById(
                  'recorrenciaDia'
                )
                .value ||
              1
            )
          )
        );


      const dataFim =
        document
          .getElementById(
            'recorrenciaFim'
          )
          ?.value ||
        '';


      await api(
        'salvarRecorrente',
        {

          escopo:
            state.escopo,

          descricao:
            dados.descricao,

          tipo:
            dados.tipo,

          categoria:
            dados.categoria,

          valor:
            dados.valor,

          dia:
            dia,

          conta:
            dados.conta,

          formaPagamento:
            dados.formaPagamento,

          cartao:
            '',

          parcelas:
            1,

          dataInicio:
            dados.data,

          dataFim:
            dataFim,

          ativo:
            true,

          observacao:
            dados.observacao

        },
        'POST'
      );


      const agora =
        new Date();


      await api(
        'gerarRecorrentesDoMes',
        {

          ano:
            agora.getFullYear(),

          mes:
            agora.getMonth() + 1,

          escopo:
            state.escopo

        },
        'POST'
      );


    } else {

      const action =
        !id &&
        dados.parcelas >
        1
          ? 'salvarParcelamento'
          : 'salvarLancamento';


      await api(
        action,
        dados,
        'POST'
      );

    }


    fecharModalLancamento();


    /*
     * Houve alteração.
     * Invalidamos e reconstruímos o cache.
     */
    state.lancamentos =
      [];

    state.lancamentosCarregados =
      false;

    state.lancamentosCarregando =
      null;


    await carregarLancamentos(
      {},
      true
    );


    preencherFiltroMeses();

    atualizarCategoriasFiltro();


    await atualizarListaLancamentosPage();


    state.dashboard =
      null;

    state.dashboardCarregado =
      false;


    await carregarDashboard(
      true
    );


  } catch (error) {

    console.error(
      'Salvar lançamento:',
      error
    );


    if (erro) {

      erro.textContent =
        error.message ||
        'Não foi possível salvar o lançamento.';

    }

  } finally {

    if (button) {

      button.disabled =
        false;


      button.textContent =
        id
          ? 'Salvar alterações'
          : 'Salvar lançamento';

    }

  }

}


/* =====================================================
   EXCLUIR LANÇAMENTO
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
        id:
          id
      },
      'POST'
    );


    state.lancamentos =
      [];

    state.lancamentosCarregados =
      false;

    state.lancamentosCarregando =
      null;


    await carregarLancamentos(
      {},
      true
    );


    preencherFiltroMeses();

    atualizarCategoriasFiltro();


    await atualizarListaLancamentosPage();


    state.dashboard =
      null;

    state.dashboardCarregado =
      false;


    await carregarDashboard(
      true
    );


  } catch (error) {

    console.error(
      'Excluir lançamento:',
      error
    );


    alert(
      error.message ||
      'Não foi possível excluir o lançamento.'
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
    ?.classList
    .add('hidden');

}


/* =====================================================
   DÍVIDA RECORRENTE
   ===================================================== */

function abrirFormularioRecorrenteBaseV4() {

  if (
    !exigirEdicaoNoFrontend()
  ) {
    return;
  }

  const existente =
    document.getElementById(
      'modalRecorrente'
    );


  if (existente) {
    existente.remove();
  }


  const hoje =
    new Date()
      .toISOString()
      .split('T')[0];


  const modal =
    document.createElement(
      'div'
    );


  modal.id =
    'modalRecorrente';


  modal.className =
    'finance-modal';


  modal.innerHTML = `

    <div
      class="finance-modal-backdrop"
      id="recorrenteBackdrop"
    ></div>


    <div
      class="finance-modal-card"
    >

      <header
        class="finance-modal-header"
      >

        <div>

          <p class="eyebrow">
            DÍVIDA RECORRENTE
          </p>

          <h2>
            Cadastrar conta mensal
          </h2>

        </div>


        <button
          class="modal-close"
          id="fecharModalRecorrente"
          type="button"
        >
          ×
        </button>

      </header>


      <form
        id="formRecorrente"
      >

        <label>
          Descrição

          <input
            id="recDescricao"
            type="text"
            placeholder="Ex.: Faculdade"
            required
          >
        </label>


        <div
          class="form-grid"
        >

          <label>
            Valor mensal

            <input
              id="recValor"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0,00"
              required
            >
          </label>


          <label>
            Vencimento

            <input
              id="recDia"
              type="number"
              min="1"
              max="31"
              value="10"
              required
            >

            <small class="field-hint">
              Dia de cada mês.
            </small>

          </label>

        </div>


        <div
          class="form-grid"
        >

          <label>
            Data de início

            <input
              id="recInicio"
              type="date"
              value="${hoje}"
              required
            >
          </label>


          <label>
            Repetir até

            <input
              id="recFim"
              type="date"
            >

            <small class="field-hint">
              Deixe vazio para manter ativa.
            </small>

          </label>

        </div>


        <div
          class="form-grid"
        >

          <label>
            Categoria

            <select
              id="recCategoria"
              required
            ></select>

          </label>


          <label>
            Conta

            <select
              id="recConta"
            >

              <option value="">
                Sem conta
              </option>

            </select>

          </label>

        </div>


        <label>
          Forma de pagamento

          <select
            id="recForma"
          >

            <option value="">
              Não informado
            </option>

          </select>

        </label>


        <label>
          Observação

          <textarea
            id="recObservacao"
            rows="3"
            placeholder="Opcional"
          ></textarea>
        </label>


        <div
          id="recFormErro"
          class="form-error"
        ></div>


        <button
          type="submit"
          class="primary-action"
        >
          Salvar dívida recorrente
        </button>

      </form>

    </div>

  `;


  document
    .getElementById(
      'app'
    )
    ?.appendChild(
      modal
    );


  const catSelect =
    document.getElementById(
      'recCategoria'
    );


  state.categorias
    .filter(
      categoria =>
        categoria.tipo ===
        'DESPESA'
    )
    .forEach(
      categoria => {

        const option =
          document.createElement(
            'option'
          );

        option.value =
          categoria.nome;

        option.textContent =
          categoria.nome;

        catSelect
          ?.appendChild(
            option
          );

      }
    );


  const contaSelect =
    document.getElementById(
      'recConta'
    );


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

        contaSelect
          ?.appendChild(
            option
          );

      }
    );



  const formaSelect =
    document.getElementById(
      'recForma'
    );


  state.formasPagamento
    .forEach(
      item => {

        const option =
          document.createElement(
            'option'
          );

        option.value =
          item.nome;

        option.textContent =
          item.nome;

        formaSelect
          ?.appendChild(
            option
          );

      }
    );


  document
    .getElementById(
      'fecharModalRecorrente'
    )
    ?.addEventListener(
      'click',
      () =>
        modal.remove()
    );


  document
    .getElementById(
      'recorrenteBackdrop'
    )
    ?.addEventListener(
      'click',
      () =>
        modal.remove()
    );


  document
    .getElementById(
      'formRecorrente'
    )
    ?.addEventListener(
      'submit',
      salvarRecorrenteFormulario
    );

}


/* =====================================================
   SALVAR RECORRENTE
   ===================================================== */

async function salvarRecorrenteFormulario(
  event
) {

  event.preventDefault();


  const erro =
    document.getElementById(
      'recFormErro'
    );


  const button =
    document
      .getElementById(
        'formRecorrente'
      )
      ?.querySelector(
        'button[type="submit"]'
      );


  try {

    if (erro) {
      erro.textContent = '';
    }


    if (button) {

      button.disabled =
        true;

      button.textContent =
        'Salvando...';

    }


    const dataInicio =
      document.getElementById(
        'recInicio'
      ).value;


    const dataFim =
      document.getElementById(
        'recFim'
      ).value;


    const dia =
      Number(
        document.getElementById(
          'recDia'
        ).value
      );


    if (
      dia < 1 ||
      dia > 31
    ) {

      throw new Error(
        'Informe um vencimento entre 1 e 31.'
      );

    }


    if (
      dataFim &&
      dataInicio &&
      dataFim < dataInicio
    ) {

      throw new Error(
        'A data final precisa ser posterior ao início.'
      );

    }


    const dados = {

      escopo:
        state.escopo,

      descricao:
        document.getElementById(
          'recDescricao'
        ).value.trim(),

      tipo:
        'DESPESA',

      categoria:
        document.getElementById(
          'recCategoria'
        ).value,

      valor:
        Number(
          document.getElementById(
            'recValor'
          ).value
        ),

      dia:
        dia,

      conta:
        document.getElementById(
          'recConta'
        ).value,

      formaPagamento:
        document.getElementById(
          'recForma'
        )?.value ||
        '',

      cartao:
        '',

      parcelas:
        1,

      dataInicio:
        dataInicio,

      dataFim:
        dataFim,

      ativo:
        true,

      observacao:
        document.getElementById(
          'recObservacao'
        ).value.trim()

    };


    if (!dados.descricao) {

      throw new Error(
        'Informe a descrição.'
      );

    }


    if (
      !dados.valor ||
      dados.valor <= 0
    ) {

      throw new Error(
        'Informe um valor mensal válido.'
      );

    }


    await api(
      'salvarRecorrente',
      dados,
      'POST'
    );


    /*
     * Gera a ocorrência deste mês, se aplicável.
     * O backend evita duplicação.
     */
    const agora =
      new Date();


    await api(
      'gerarRecorrentesDoMes',
      {

        ano:
          agora.getFullYear(),

        mes:
          agora.getMonth() + 1,

        escopo:
          state.escopo

      },
      'POST'
    );


    modal.remove();


    state.recorrentes =
      await api(
        'listarRecorrentes',
        {
          escopo:
            state.escopo
        }
      );


    state.lancamentos =
      [];

    state.lancamentosCarregados =
      false;

    state.lancamentosCarregando =
      null;


    await carregarLancamentos(
      {},
      true
    );


    preencherFiltroMeses();

    atualizarCategoriasFiltro();

    await atualizarListaLancamentosPage();


    state.dashboard =
      null;

    state.dashboardCarregado =
      false;


    await carregarDashboard(
      true
    );


  } catch (error) {

    console.error(
      'Salvar recorrente:',
      error
    );


    if (erro) {

      erro.textContent =
        error.message ||
        'Não foi possível salvar a dívida recorrente.';

    }

  } finally {

    if (button) {

      button.disabled =
        false;

      button.textContent =
        'Salvar dívida recorrente';

    }

  }

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

  prepararPaginaInterna(2);

  objetivosPage
    .classList
    .remove('hidden');

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
    document.createElement(
      'div'
    );


  objetivosPage.id =
    'objetivosPage';


  objetivosPage.className =
    'finance-page hidden';


  objetivosPage.innerHTML = `

    <header
      class="finance-page-header"
    >

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
        type="button"
      >
        ←
      </button>

    </header>


    <section
      class="objective-summary"
    >

      <div
        class="objective-summary-icon"
      >
        🎯
      </div>


      <div>

        <small>
          Seus objetivos
        </small>

        <strong
          id="objetivosResumo"
        >
          0 objetivos
        </strong>

      </div>

    </section>


    <section
      class="objective-actions"
    >

      <button
        class="primary-action"
        id="novoObjetivoBtn"
        type="button"
      >
        ＋ Novo objetivo
      </button>

    </section>


    <section
      id="listaObjetivosPage"
      class="objective-list"
    ></section>

  `;


  document
    .getElementById(
      'app'
    )
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
      () =>
        abrirFormularioObjetivo()
    );

}


/* =====================================================
   OBJETIVOS
   ===================================================== */

async function carregarObjetivos() {

  const data =
    await api(
      'listarObjetivos',
      {
        escopo:
          state.escopo
      }
    );


  state.objetivos =
    Array.isArray(data)
      ? data
      : [];


  return state.objetivos;

}


/* =====================================================
   ÍCONE DO OBJETIVO
   ===================================================== */

function iconeObjetivo(
  nome
) {

  const texto =
    String(
      nome || ''
    )
      .toLowerCase();


  if (
    texto.includes('carro') ||
    texto.includes('moto') ||
    texto.includes('veículo')
  ) {
    return '🚗';
  }


  if (
    texto.includes('iphone') ||
    texto.includes('celular') ||
    texto.includes('telefone') ||
    texto.includes('smartphone')
  ) {
    return '📱';
  }


  if (
    texto.includes('casa') ||
    texto.includes('apartamento') ||
    texto.includes('imóvel')
  ) {
    return '🏠';
  }


  if (
    texto.includes('viagem') ||
    texto.includes('férias')
  ) {
    return '✈️';
  }


  if (
    texto.includes('faculdade') ||
    texto.includes('curso') ||
    texto.includes('estudo')
  ) {
    return '🎓';
  }


  if (
    texto.includes('reserva') ||
    texto.includes('emergência')
  ) {
    return '🛟';
  }


  return '🎯';

}


/* =====================================================
   RENDER DOS OBJETIVOS
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

      <div
        class="launch-empty"
      >

        <span>
          🎯
        </span>

        <strong>
          Nenhum objetivo encontrado
        </strong>

        <small>
          Crie seu primeiro objetivo financeiro.
        </small>


        <button
          class="primary-action"
          type="button"
          onclick="abrirFormularioObjetivo()"
        >
          ＋ Novo objetivo
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
              objetivo.meta ||
              0
            );


          const guardado =
            Number(
              objetivo.guardado ??
              objetivo.valorInicial ??
              0
            );


          const falta =
            Math.max(
              meta -
              guardado,
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


          const concluido =
            percentual >= 100;


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
                    ${iconeObjetivo(
                      objetivo.nome
                    )}
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
                        objetivo.prioridade ||
                        'Média'
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

                <strong>
                  ${formatMoney(
                    guardado
                  )}
                </strong>


                <span>
                  de
                  ${formatMoney(
                    meta
                  )}
                </span>

              </div>


              <div
                class="objective-detail"
              >

                <span>
                  Falta:
                  <b>
                    ${formatMoney(
                      falta
                    )}
                  </b>
                </span>


                <span>
                  📅 ${
                    objetivo.prazo
                      ? formatDate(
                          objetivo.prazo
                        )
                      : 'Sem prazo'
                  }
                </span>

              </div>


              <div
                class="objective-status-row"
              >

                <span
                  class="${
                    concluido
                      ? 'objective-complete'
                      : 'objective-active'
                  }"
                >
                  ${
                    concluido
                      ? '✓ Concluído'
                      : '● Em andamento'
                  }
                </span>

              </div>


              <div
                class="objective-actions-row"
              >

                ${
                  !concluido
                    ? `
                      <button
                        type="button"
                        class="objective-secondary-btn"
                        data-action="aporte"
                        data-id="${
                          escapeAttribute(
                            objetivo.id
                          )
                        }"
                      >
                        💰 Adicionar dinheiro
                      </button>
                    `
                    : ''
                }


                <button
                  type="button"
                  class="objective-icon-btn"
                  data-action="editar"
                  data-id="${
                    escapeAttribute(
                      objetivo.id
                    )
                  }"
                  aria-label="Editar objetivo"
                  title="Editar objetivo"
                >
                  ✏️
                </button>


                <button
                  type="button"
                  class="objective-icon-btn danger"
                  data-action="excluir"
                  data-id="${
                    escapeAttribute(
                      objetivo.id
                    )
                  }"
                  aria-label="Excluir objetivo"
                  title="Excluir objetivo"
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
      '[data-action="aporte"]'
    )
    .forEach(
      button =>
        button.addEventListener(
          'click',
          () =>
            abrirModalAporte(
              button.dataset.id
            )
        )
    );


  lista
    .querySelectorAll(
      '[data-action="editar"]'
    )
    .forEach(
      button =>
        button.addEventListener(
          'click',
          () =>
            abrirFormularioObjetivo(
              button.dataset.id
            )
        )
    );


  lista
    .querySelectorAll(
      '[data-action="excluir"]'
    )
    .forEach(
      button =>
        button.addEventListener(
          'click',
          () =>
            excluirObjetivoDaPagina(
              button.dataset.id
            )
        )
    );

}


/* =====================================================
   FORMULÁRIO DE OBJETIVO
   ===================================================== */

function abrirFormularioObjetivo(
  id = null
) {

  if (
    !exigirEdicaoNoFrontend()
  ) {
    return;
  }

  const existente =
    id
      ? state.objetivos.find(
          item =>
            String(item.id) ===
            String(id)
        )
      : null;


  document
    .getElementById(
      'modalObjetivo'
    )
    ?.remove();


  const modal =
    document.createElement(
      'div'
    );


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
            ${
              existente
                ? 'EDITAR OBJETIVO'
                : 'NOVO OBJETIVO'
            }
          </p>


          <h2>
            ${
              existente
                ? 'Editar objetivo'
                : 'Criar objetivo'
            }
          </h2>

        </div>


        <button
          class="modal-close"
          id="fecharModalObjetivo"
          type="button"
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
            value="${
              escapeAttribute(
                existente?.nome ||
                ''
              )
            }"
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
              value="${
                existente?.meta ??
                ''
              }"
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
              value="${
                existente?.valorInicial ??
                0
              }"
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
              value="${
                existente?.prazo ||
                ''
              }"
            >
          </label>


          <label>
            Prioridade

            <select
              id="objetivoPrioridade"
            >

              <option
                value="Baixa"
                ${
                  existente?.prioridade ===
                  'Baixa'
                    ? 'selected'
                    : ''
                }
              >
                Baixa
              </option>


              <option
                value="Média"
                ${
                  !existente ||
                  existente?.prioridade ===
                  'Média'
                    ? 'selected'
                    : ''
                }
              >
                Média
              </option>


              <option
                value="Alta"
                ${
                  existente?.prioridade ===
                  'Alta'
                    ? 'selected'
                    : ''
                }
              >
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
          >${
            escapeHtml(
              existente?.observacao ||
              ''
            )
          }</textarea>

        </label>


        <div
          id="objetivoFormErro"
          class="form-error"
        ></div>


        <button
          type="submit"
          class="primary-action"
        >
          ${
            existente
              ? 'Salvar alterações'
              : 'Criar objetivo'
          }
        </button>

      </form>

    </div>

  `;


  document
    .getElementById(
      'app'
    )
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
      event =>
        salvarObjetivoFormulario(
          event,
          id
        )
    );

}


/* =====================================================
   SALVAR OBJETIVO
   ===================================================== */

async function salvarObjetivoFormulario(
  event,
  id = null
) {

  event.preventDefault();


  const erro =
    document.getElementById(
      'objetivoFormErro'
    );


  const button =
    document
      .getElementById(
        'formObjetivo'
      )
      ?.querySelector(
        'button[type="submit"]'
      );


  try {

    if (erro) {
      erro.textContent = '';
    }


    if (button) {

      button.disabled =
        true;

      button.textContent =
        id
          ? 'Salvando alterações...'
          : 'Criando...';

    }


    const existente =
      id
        ? state.objetivos.find(
            item =>
              String(item.id) ===
              String(id)
          )
        : null;


    const dados = {

      id:
        id || undefined,

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
            .value ||
          0
        ),

      dataCriacao:
        existente?.dataCriacao ||
        undefined,

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
          .trim(),

      ativo:
        true

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
        'Informe uma meta maior que zero.'
      );

    }


    await api(
      'salvarObjetivo',
      dados,
      'POST'
    );


    fecharModalObjetivo();


    await carregarObjetivos();


    state.dashboard =
      null;

    state.dashboardCarregado =
      false;


    renderPaginaObjetivos();


    await carregarDashboard(
      true
    );


  } catch (error) {

    console.error(
      'Salvar objetivo:',
      error
    );


    if (erro) {

      erro.textContent =
        error.message ||
        'Não foi possível salvar o objetivo.';

    }

  } finally {

    if (button) {

      button.disabled =
        false;

      button.textContent =
        id
          ? 'Salvar alterações'
          : 'Criar objetivo';

    }

  }

}


/* =====================================================
   APORTES
   ===================================================== */

function abrirModalAporte(
  objetivoId
) {

  const objetivo =
    state.objetivos.find(
      item =>
        String(item.id) ===
        String(objetivoId)
    );


  if (!objetivo) {

    alert(
      'Objetivo não encontrado.'
    );

    return;

  }


  document
    .getElementById(
      'modalAporte'
    )
    ?.remove();


  const modal =
    document.createElement(
      'div'
    );


  modal.id =
    'modalAporte';


  modal.className =
    'finance-modal';


  modal.innerHTML = `

    <div
      class="finance-modal-backdrop"
      id="aporteBackdrop"
    ></div>


    <div
      class="finance-modal-card"
    >

      <header
        class="finance-modal-header"
      >

        <div>

          <p class="eyebrow">
            ${escapeHtml(
              objetivo.nome
            )}
          </p>

          <h2>
            Adicionar dinheiro
          </h2>

        </div>


        <button
          class="modal-close"
          id="fecharModalAporte"
          type="button"
        >
          ×
        </button>

      </header>


      <form
        id="formAporte"
      >

        <label>
          Valor

          <input
            id="aporteValor"
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
            id="aporteData"
            type="date"
            value="${
              new Date()
                .toISOString()
                .split('T')[0]
            }"
            required
          >
        </label>


        <label>
          Observação

          <textarea
            id="aporteObservacao"
            rows="3"
            placeholder="Opcional"
          ></textarea>
        </label>


        <div
          id="aporteErro"
          class="form-error"
        ></div>


        <button
          type="submit"
          class="primary-action"
        >
          Adicionar dinheiro
        </button>

      </form>

    </div>

  `;


  document
    .getElementById(
      'app'
    )
    ?.appendChild(
      modal
    );


  document
    .getElementById(
      'fecharModalAporte'
    )
    ?.addEventListener(
      'click',
      () =>
        modal.remove()
    );


  document
    .getElementById(
      'aporteBackdrop'
    )
    ?.addEventListener(
      'click',
      () =>
        modal.remove()
    );


  document
    .getElementById(
      'formAporte'
    )
    ?.addEventListener(
      'submit',
      event =>
        salvarAporte(
          event,
          objetivoId
        )
    );

}


async function salvarAporte(
  event,
  objetivoId
) {

  event.preventDefault();


  const erro =
    document.getElementById(
      'aporteErro'
    );


  const button =
    document
      .getElementById(
        'formAporte'
      )
      ?.querySelector(
        'button[type="submit"]'
      );


  try {

    if (erro) {
      erro.textContent = '';
    }


    if (button) {

      button.disabled =
        true;

      button.textContent =
        'Salvando...';

    }


    const valor =
      Number(
        document
          .getElementById(
            'aporteValor'
          )
          .value
      );


    if (
      !valor ||
      valor <= 0
    ) {

      throw new Error(
        'Informe um valor maior que zero.'
      );

    }


    await api(
      'adicionarAporte',
      {

        objetivoId:
          objetivoId,

        valor:
          valor,

        data:
          document
            .getElementById(
              'aporteData'
            )
            .value,

        observacao:
          document
            .getElementById(
              'aporteObservacao'
            )
            .value
            .trim()

      },
      'POST'
    );


    document
      .getElementById(
        'modalAporte'
      )
      ?.remove();


    await carregarObjetivos();


    state.dashboard =
      null;

    state.dashboardCarregado =
      false;


    renderPaginaObjetivos();


    await carregarDashboard(
      true
    );


  } catch (error) {

    console.error(
      'Aporte:',
      error
    );


    if (erro) {

      erro.textContent =
        error.message ||
        'Não foi possível adicionar o aporte.';

    }

  } finally {

    if (button) {

      button.disabled =
        false;

      button.textContent =
        'Adicionar dinheiro';

    }

  }

}


/* =====================================================
   EXCLUIR OBJETIVO
   ===================================================== */

async function excluirObjetivoDaPagina(
  id
) {

  const objetivo =
    state.objetivos.find(
      item =>
        String(item.id) ===
        String(id)
    );


  const confirmado =
    window.confirm(
      `Excluir "${objetivo?.nome || 'este objetivo'}"?\n\nEssa ação não pode ser desfeita.`
    );


  if (!confirmado) {
    return;
  }


  try {

    await api(
      'excluirObjetivo',
      {
        id:
          id
      },
      'POST'
    );


    await carregarObjetivos();


    state.dashboard =
      null;

    state.dashboardCarregado =
      false;


    renderPaginaObjetivos();


    await carregarDashboard(
      true
    );


  } catch (error) {

    console.error(
      'Excluir objetivo:',
      error
    );


    alert(
      error.message ||
      'Não foi possível excluir o objetivo.'
    );

  }

}


/* =====================================================
   FECHAR MODAL DE OBJETIVO
   ===================================================== */

function fecharModalObjetivo() {

  document
    .getElementById(
      'modalObjetivo'
    )
    ?.remove();

}


/* =====================================================
   FECHAR MODAL DE APORTE
   ===================================================== */

function fecharModalAporte() {

  document
    .getElementById(
      'modalAporte'
    )
    ?.remove();

}


/* =====================================================
   PÁGINA DE RELATÓRIOS
   ===================================================== */

let relatoriosPage = null;


/* -----------------------------------------------------
   ABRIR RELATÓRIOS
   ----------------------------------------------------- */

async function abrirPaginaRelatorios() {

  criarPaginaRelatorios();

  prepararPaginaInterna(3);

  relatoriosPage
    .classList
    .remove('hidden');


  /*
   * Não fazemos uma consulta específica de relatório
   * ao backend nesta primeira versão.
   *
   * Usamos o histórico de lançamentos que já está
   * em memória. Se ainda não estiver carregado,
   * carregamos uma única vez.
   */
  if (
    !state.lancamentosCarregados
  ) {

    const lista =
      document.getElementById(
        'relatoriosConteudo'
      );


    if (lista) {

      lista.innerHTML = `
        <div class="launch-loading">
          Preparando relatório...
        </div>
      `;

    }


    await carregarLancamentos();

  }


  renderPaginaRelatorios();

}


/* -----------------------------------------------------
   CRIAR PÁGINA
   ----------------------------------------------------- */

function criarPaginaRelatorios() {

  if (relatoriosPage) {
    return;
  }


  relatoriosPage =
    document.createElement(
      'div'
    );


  relatoriosPage.id =
    'relatoriosPage';


  relatoriosPage.className =
    'finance-page hidden';


  relatoriosPage.innerHTML = `

    <header
      class="finance-page-header"
    >

      <div>

        <p class="eyebrow">
          MEU FINANCEIRO
        </p>

        <h1>
          Relatórios
        </h1>

        <p class="finance-page-subtitle">
          Entenda para onde está indo seu dinheiro
        </p>

      </div>


      <button
        class="finance-back-btn"
        id="backRelatoriosBtn"
        type="button"
        aria-label="Voltar"
      >
        ←
      </button>

    </header>


    <section
      class="report-filters"
    >

      <div
        class="report-filter-row"
      >

        <label>

          Período

          <select
            id="relatorioPeriodo"
          >

            <option value="MES">
              Este mês
            </option>

            <option value="TRIMESTRE">
              Últimos 3 meses
            </option>

            <option value="ANO">
              Este ano
            </option>

            <option value="TUDO">
              Todo o histórico
            </option>

          </select>

        </label>


        <button
          id="atualizarRelatorioBtn"
          class="report-refresh-btn"
          type="button"
        >
          ↻ Atualizar
        </button>

      </div>

    </section>


    <section
      id="relatorioCards"
      class="report-summary-grid"
    ></section>


    <section
      class="report-section-card"
    >

      <div
        class="report-section-title"
      >

        <div>

          <p>
            Despesas por categoria
          </p>

          <small>
            Onde seu dinheiro está sendo gasto
          </small>

        </div>

      </div>


      <div
        id="relatorioCategorias"
        class="report-bars"
      ></div>

    </section>


    <section
      class="report-section-card"
    >

      <div
        class="report-section-title"
      >

        <div>

          <p>
            Formas de pagamento
          </p>

          <small>
            Como suas despesas foram pagas
          </small>

        </div>

      </div>


      <div
        id="relatorioFormas"
        class="report-bars"
      ></div>

    </section>


    <section
      class="report-section-card"
    >

      <div
        class="report-section-title"
      >

        <div>

          <p>
            Maiores despesas
          </p>

          <small>
            As despesas de maior valor no período
          </small>

        </div>

      </div>


      <div
        id="relatorioMaiores"
        class="report-big-list"
      ></div>

    </section>


    <div
      id="relatoriosConteudo"
      class="hidden"
    ></div>

  `;


  document
    .getElementById(
      'app'
    )
    ?.appendChild(
      relatoriosPage
    );


  document
    .getElementById(
      'backRelatoriosBtn'
    )
    ?.addEventListener(
      'click',
      voltarInicio
    );


  document
    .getElementById(
      'atualizarRelatorioBtn'
    )
    ?.addEventListener(
      'click',
      renderPaginaRelatorios
    );


  document
    .getElementById(
      'relatorioPeriodo'
    )
    ?.addEventListener(
      'change',
      renderPaginaRelatorios
    );

}


/* -----------------------------------------------------
   PERÍODO
   ----------------------------------------------------- */

function obterIntervaloRelatorio() {

  const periodo =
    document.getElementById(
      'relatorioPeriodo'
    )?.value ||
    'MES';


  const hoje =
    new Date();


  let inicio;


  if (
    periodo ===
    'TRIMESTRE'
  ) {

    inicio =
      new Date(
        hoje.getFullYear(),
        hoje.getMonth() - 2,
        1
      );

  } else if (
    periodo ===
    'ANO'
  ) {

    inicio =
      new Date(
        hoje.getFullYear(),
        0,
        1
      );

  } else if (
    periodo ===
    'TUDO'
  ) {

    return {
      inicio:
        null,

      fim:
        null
    };

  } else {

    inicio =
      new Date(
        hoje.getFullYear(),
        hoje.getMonth(),
        1
      );

  }


  const fim =
    new Date(
      hoje.getFullYear(),
      hoje.getMonth() + 1,
      0,
      23,
      59,
      59
    );


  return {
    inicio,
    fim
  };

}


/* -----------------------------------------------------
   CONVERTER DATA
   ----------------------------------------------------- */

function dataLancamentoRelatorio(
  valor
) {

  if (!valor) {
    return null;
  }


  const partes =
    String(
      valor
    ).split('-');


  if (
    partes.length !== 3
  ) {
    return null;
  }


  const data =
    new Date(
      Number(partes[0]),
      Number(partes[1]) - 1,
      Number(partes[2])
    );


  return Number.isNaN(
    data.getTime()
  )
    ? null
    : data;

}


/* -----------------------------------------------------
   RENDER
   ----------------------------------------------------- */

function renderPaginaRelatorios() {

  if (!relatoriosPage) {
    return;
  }


  const intervalo =
    obterIntervaloRelatorio();


  let lancamentos =
    Array.isArray(
      state.lancamentos
    )
      ? [
          ...state.lancamentos
        ].filter(
          item =>
            item.status ===
            'REALIZADO'
        )
      : [];


  if (
    intervalo.inicio &&
    intervalo.fim
  ) {

    lancamentos =
      lancamentos.filter(
        item => {

          const data =
            dataLancamentoRelatorio(
              item.dataRealizacao ||
              item.data
            );


          if (!data) {
            return false;
          }


          return (
            data >=
            intervalo.inicio &&
            data <=
            intervalo.fim
          );

        }
      );

  }


  const receitas =
    lancamentos
      .filter(
        item =>
          item.tipo ===
          'RECEITA'
      );


  const despesas =
    lancamentos
      .filter(
        item =>
          item.tipo ===
          'DESPESA'
      );


  const totalReceitas =
    receitas.reduce(
      (
        total,
        item
      ) =>
        total +
        Number(
          item.valor || 0
        ),
      0
    );


  const totalDespesas =
    despesas.reduce(
      (
        total,
        item
      ) =>
        total +
        Number(
          item.valor || 0
        ),
      0
    );


  const resultado =
    totalReceitas -
    totalDespesas;


  const maiorDespesa =
    despesas.length
      ? Math.max(
          ...despesas.map(
            item =>
              Number(
                item.valor || 0
              )
          )
        )
      : 0;


  /*
   * Cards principais
   */
  const cards =
    document.getElementById(
      'relatorioCards'
    );


  if (cards) {

    cards.innerHTML = `

      <article
        class="report-summary-card"
      >

        <span
          class="report-summary-icon"
        >
          💰
        </span>


        <small>
          Receitas
        </small>


        <strong
          class="positive"
        >
          ${formatMoney(
            totalReceitas
          )}
        </strong>

      </article>


      <article
        class="report-summary-card"
      >

        <span
          class="report-summary-icon"
        >
          💸
        </span>


        <small>
          Despesas
        </small>


        <strong
          class="negative"
        >
          ${formatMoney(
            totalDespesas
          )}
        </strong>

      </article>


      <article
        class="report-summary-card"
      >

        <span
          class="report-summary-icon"
        >
          📊
        </span>


        <small>
          Resultado
        </small>


        <strong
          class="${
            resultado >= 0
              ? 'positive'
              : 'negative'
          }"
        >
          ${formatMoney(
            resultado
          )}
        </strong>

      </article>


      <article
        class="report-summary-card"
      >

        <span
          class="report-summary-icon"
        >
          🧾
        </span>


        <small>
          Lançamentos
        </small>


        <strong>
          ${lancamentos.length}
        </strong>

      </article>

    `;

  }


  /*
   * Categorias
   */
  const categorias =
    {};


  despesas.forEach(
    item => {

      const categoria =
        item.categoria ||
        'Outros';


      categorias[categoria] =
        (
          categorias[categoria] ||
          0
        ) +
        Number(
          item.valor || 0
        );

    }
  );


  const categoriasOrdenadas =
    Object.entries(
      categorias
    )
      .sort(
        (a, b) =>
          b[1] -
          a[1]
      );


  renderBarrasRelatorio(
    'relatorioCategorias',
    categoriasOrdenadas,
    totalDespesas
  );


  /*
   * Formas de pagamento
   */
  const formas =
    {};


  despesas.forEach(
    item => {

      const forma =
        item.formaPagamento ||
        'Não informado';


      formas[forma] =
        (
          formas[forma] ||
          0
        ) +
        Number(
          item.valor || 0
        );

    }
  );


  renderBarrasRelatorio(
    'relatorioFormas',
    Object.entries(
      formas
    ).sort(
      (a, b) =>
        b[1] -
        a[1]
    ),
    totalDespesas
  );


  /*
   * Maiores despesas
   */
  const maiores =
    despesas
      .sort(
        (a, b) =>
          Number(
            b.valor || 0
          ) -
          Number(
            a.valor || 0
          )
      )
      .slice(
        0,
        10
      );


  const maioresContainer =
    document.getElementById(
      'relatorioMaiores'
    );


  if (
    maioresContainer
  ) {

    if (!maiores.length) {

      maioresContainer.innerHTML = `
        <div class="report-empty">
          Nenhuma despesa no período selecionado.
        </div>
      `;

    } else {

      maioresContainer.innerHTML =
        maiores
          .map(
            item => `

              <div
                class="report-big-item"
              >

                <span
                  class="report-big-icon"
                >
                  ${iconeCategoria(
                    item.categoria
                  )}
                </span>


                <div
                  class="report-big-info"
                >

                  <strong>
                    ${escapeHtml(
                      item.descricao ||
                      'Sem descrição'
                    )}
                  </strong>


                  <small>
                    ${escapeHtml(
                      item.categoria ||
                      'Outros'
                    )}
                    ·
                    ${formatDate(
                      item.data
                    )}
                  </small>

                </div>


                <strong
                  class="negative"
                >
                  − ${formatMoney(
                    item.valor
                  )}
                </strong>

              </div>

            `
          )
          .join('');

    }

  }

}


/* -----------------------------------------------------
   BARRAS
   ----------------------------------------------------- */

function renderBarrasRelatorio(
  elementoId,
  entradas,
  total
) {

  const container =
    document.getElementById(
      elementoId
    );


  if (!container) {
    return;
  }


  if (!entradas.length) {

    container.innerHTML = `
      <div class="report-empty">
        Nenhum dado no período selecionado.
      </div>
    `;

    return;

  }


  container.innerHTML =
    entradas
      .slice(
        0,
        8
      )
      .map(
        ([nome, valor]) => {

          const percentual =
            total > 0
              ? (
                  Number(valor) /
                  total
                ) *
                100
              : 0;


          return `

            <div
              class="report-bar-item"
            >

              <div
                class="report-bar-label"
              >

                <span>
                  ${escapeHtml(
                    nome
                  )}
                </span>


                <strong>
                  ${formatMoney(
                    valor
                  )}
                </strong>

              </div>


              <div
                class="report-bar-track"
              >

                <i
                  style="
                    width:${percentual}%
                  "
                ></i>

              </div>


              <small>
                ${percentual.toFixed(1)}%
              </small>

            </div>

          `;

        }
      )
      .join('');

}


/* =====================================================
   PÁGINA DE AJUSTES
   ===================================================== */

let ajustesPage = null;


/* -----------------------------------------------------
   ABRIR AJUSTES
   ----------------------------------------------------- */

async function abrirPaginaAjustes() {

  criarPaginaAjustes();

  prepararPaginaInterna(4);

  ajustesPage
    .classList
    .remove('hidden');

  preencherPaginaAjustes();

  await carregarDadosAjustes();

}


/* -----------------------------------------------------
   CRIAR
   ----------------------------------------------------- */

function criarPaginaAjustes() {

  if (ajustesPage) {
    return;
  }


  ajustesPage =
    document.createElement(
      'div'
    );


  ajustesPage.id =
    'ajustesPage';


  ajustesPage.className =
    'finance-page hidden';


  ajustesPage.innerHTML = `

    <header
      class="finance-page-header"
    >

      <div>

        <p class="eyebrow">
          MEU FINANCEIRO
        </p>

        <h1>
          Ajustes
        </h1>

        <p class="finance-page-subtitle">
          Personalize seu financeiro e sua privacidade
        </p>

      </div>


      <button
        class="finance-back-btn"
        id="backAjustesBtn"
        type="button"
        aria-label="Voltar"
      >
        ←
      </button>

    </header>


    <section
      class="settings-card settings-profile-card"
    >

      <div
        class="settings-card-icon"
      >
        👤
      </div>


      <div
        class="settings-card-content"
      >

        <span
          class="settings-label"
        >
          Minha conta
        </span>


        <strong
          id="settingsUserName"
        >
          —
        </strong>


        <small
          id="settingsUserEmail"
        >
          —
        </small>

      </div>

    </section>


    <section
      class="settings-card settings-row-card"
    >

      <div
        class="settings-leading"
      >

        <span
          class="settings-card-icon"
        >
          🎨
        </span>


        <div>

          <strong>
            Aparência
          </strong>

          <small>
            Escolha como o aplicativo aparece
          </small>

        </div>

      </div>


      <div
        class="settings-theme-toggle"
        role="group"
        aria-label="Tema"
      >

        <button
          type="button"
          data-theme="dark"
          id="settingsThemeDark"
        >
          🌙
          Escuro
        </button>


        <button
          type="button"
          data-theme="light"
          id="settingsThemeLight"
        >
          ☀️
          Claro
        </button>

      </div>

    </section>


    <section
      class="settings-card"
    >

      <div
        class="settings-leading"
      >

        <span
          class="settings-card-icon"
        >
          🗂️
        </span>


        <div>

          <strong>
            Espaço financeiro
          </strong>

          <small>
            Igor, Maju ou o financeiro do casal
          </small>

        </div>

      </div>


      <label
        class="settings-field"
      >

        <span>
          Espaço atual
        </span>


        <select
          id="settingsScopeSelect"
        ></select>

      </label>


      <div
        id="settingsScopeAccess"
        class="settings-access-note"
      ></div>

    </section>


    <section
      class="settings-card"
      id="settingsPrivacyCard"
    >

      <div
        class="settings-leading"
      >

        <span
          class="settings-card-icon"
        >
          🔐
        </span>


        <div>

          <strong>
            Privacidade do meu financeiro
          </strong>

          <small>
            Você decide o que a outra pessoa pode fazer no seu espaço pessoal
          </small>

        </div>

      </div>


      <div
        id="settingsPrivacyContent"
        class="settings-dynamic-content"
      >

        <div class="settings-loading">
          Carregando privacidade...
        </div>

      </div>

    </section>


    <section
      class="settings-card"
    >

      <div
        class="settings-leading"
      >

        <span
          class="settings-card-icon"
        >
          🧩
        </span>


        <div>

          <strong>
            Cadastros financeiros
          </strong>

          <small>
            Personalize contas, categorias e formas de pagamento do espaço atual
          </small>

        </div>

      </div>


      <div
        class="settings-manager-list"
      >

        <button
          type="button"
          class="settings-manager-item"
          data-cadastro="contas"
        >

          <span class="settings-manager-icon">
            🏦
          </span>

          <span class="settings-manager-copy">
            <b>Contas</b>
            <small id="settingsContasResumo">
              Carregando...
            </small>
          </span>

          <span class="settings-manager-arrow">
            ›
          </span>

        </button>


        <button
          type="button"
          class="settings-manager-item"
          data-cadastro="categorias"
        >

          <span class="settings-manager-icon">
            🏷️
          </span>

          <span class="settings-manager-copy">
            <b>Categorias</b>
            <small id="settingsCategoriasResumo">
              Carregando...
            </small>
          </span>

          <span class="settings-manager-arrow">
            ›
          </span>

        </button>


        <button
          type="button"
          class="settings-manager-item"
          data-cadastro="formas"
        >

          <span class="settings-manager-icon">
            💳
          </span>

          <span class="settings-manager-copy">
            <b>Formas de pagamento</b>
            <small id="settingsFormasResumo">
              Carregando...
            </small>
          </span>

          <span class="settings-manager-arrow">
            ›
          </span>

        </button>

      </div>

    </section>


    <section
      class="settings-card"
    >

      <div
        class="settings-leading"
      >

        <span
          class="settings-card-icon"
        >
          ℹ️
        </span>


        <div>

          <strong>
            Sobre o aplicativo
          </strong>

          <small>
            Meu Financeiro · versão 5
          </small>

        </div>

      </div>


      <div
        class="settings-about"
      >

        <span>
          Seus dados continuam vinculados à sua planilha e as permissões são validadas pela API.
        </span>

      </div>

    </section>


    <button
      class="settings-logout"
      id="settingsLogoutBtn"
      type="button"
    >
      🚪 Sair da conta
    </button>

  `;


  document
    .getElementById(
      'app'
    )
    ?.appendChild(
      ajustesPage
    );


  document
    .getElementById(
      'backAjustesBtn'
    )
    ?.addEventListener(
      'click',
      voltarInicio
    );


  document
    .getElementById(
      'settingsThemeDark'
    )
    ?.addEventListener(
      'click',
      () =>
        aplicarTemaAjustes(
          'dark'
        )
    );


  document
    .getElementById(
      'settingsThemeLight'
    )
    ?.addEventListener(
      'click',
      () =>
        aplicarTemaAjustes(
          'light'
        )
    );


  document
    .getElementById(
      'settingsScopeSelect'
    )
    ?.addEventListener(
      'change',
      async event => {

        await trocarEscopo(
          event.target.value
        );

        preencherPaginaAjustes();

        await carregarDadosAjustes();

      }
    );


  ajustesPage
    .querySelectorAll(
      '[data-cadastro]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () =>
            abrirGerenciadorCadastro(
              button.dataset.cadastro
            )
        );

      }
    );


  document
    .getElementById(
      'settingsLogoutBtn'
    )
    ?.addEventListener(
      'click',
      logout
    );

}


/* -----------------------------------------------------
   PREENCHER
   ----------------------------------------------------- */

function preencherPaginaAjustes() {

  const name =
    document.getElementById(
      'settingsUserName'
    );


  const email =
    document.getElementById(
      'settingsUserEmail'
    );


  if (name) {

    name.textContent =
      state.user?.nome ||
      state.user?.name ||
      'Usuário';

  }


  if (email) {

    email.textContent =
      state.user?.email ||
      '';

  }


  const select =
    document.getElementById(
      'settingsScopeSelect'
    );


  if (select) {

    const escopos =
      Array.isArray(
        state.initialData?.escopos
      )
        ? state.initialData.escopos
        : [];


    select.innerHTML =
      escopos
        .map(
          escopo => {

            const nome =
              String(
                escopo.nome || ''
              );

            let rotulo =
              nome;

            if (
              nome === 'CASAL'
            ) {
              rotulo =
                '❤️ Casal';
            } else if (
              nome ===
              state.user?.nome
            ) {
              rotulo =
                '👤 Meu financeiro';
            } else {
              rotulo =
                `👤 ${nome}`;
            }

            if (
              String(
                escopo.nivel || ''
              ).toUpperCase() ===
              'VISUALIZAR'
            ) {
              rotulo +=
                ' · somente leitura';
            }

            return `
              <option
                value="${
                  escapeAttribute(
                    nome
                  )
                }"
              >
                ${
                  escapeHtml(
                    rotulo
                  )
                }
              </option>
            `;

          }
        )
        .join('');


    if (
      state.escopo
    ) {

      select.value =
        state.escopo;

    }

  }


  const access =
    document.getElementById(
      'settingsScopeAccess'
    );


  if (access) {

    const nivel =
      nivelEscopoAtual();

    const nome =
      state.escopo === 'CASAL'
        ? 'Casal'
        : state.escopo;

    access.innerHTML =
      nivel === 'EDITAR'
        ? `
          <span class="access-pill access-edit">
            ✓ Você pode visualizar e editar ${escapeHtml(nome || '')}
          </span>
        `
        : `
          <span class="access-pill access-view">
            👁 Você pode somente visualizar ${escapeHtml(nome || '')}
          </span>
        `;

  }


  atualizarBotoesTemaAjustes();

  atualizarPermissaoVisual();

}


/* -----------------------------------------------------
   DADOS DINÂMICOS
   ----------------------------------------------------- */

async function carregarDadosAjustes() {

  if (!ajustesPage) {
    return;
  }

  try {

    const [
      compartilhamento,
      cadastros
    ] =
      await Promise.all([
        api(
          'obterMeuCompartilhamento'
        ),
        carregarCadastrosDoEscopo(
          true
        )
      ]);


    if (
      state.initialData
    ) {
      state.initialData.compartilhamento =
        compartilhamento;
    }


    state.cadastrosGerenciamento =
      cadastros;


    renderPrivacidadeAjustes(
      compartilhamento
    );


    renderResumoCadastrosAjustes(
      cadastros
    );

  } catch (error) {

    console.error(
      'Ajustes:',
      error
    );

    const privacy =
      document.getElementById(
        'settingsPrivacyContent'
      );

    if (privacy) {

      privacy.innerHTML = `
        <div class="form-error">
          ${
            escapeHtml(
              error.message ||
              'Não foi possível carregar os ajustes.'
            )
          }
        </div>
      `;

    }

  }

}


/* -----------------------------------------------------
   PRIVACIDADE
   ----------------------------------------------------- */

function descricaoNivelCompartilhamento(
  nivel
) {

  const n =
    String(
      nivel || 'NENHUM'
    ).toUpperCase();

  if (n === 'EDITAR') {
    return 'visualizar e editar';
  }

  if (n === 'VISUALIZAR') {
    return 'somente visualizar';
  }

  return 'sem acesso';
}


function renderPrivacidadeAjustes(
  compartilhamento
) {

  const container =
    document.getElementById(
      'settingsPrivacyContent'
    );


  if (!container) {
    return;
  }


  const c =
    compartilhamento?.conjuge;


  if (!c) {

    container.innerHTML = `
      <div class="settings-empty-note">
        Cadastre os dois usuários ativos na aba “Usuários” para configurar a privacidade.
      </div>
    `;

    return;
  }


  const nivel =
    String(
      compartilhamento.nivelConcedido ||
      compartilhamento.nivel ||
      'NENHUM'
    ).toUpperCase();


  const recebido =
    String(
      compartilhamento.nivelRecebido ||
      'NENHUM'
    ).toUpperCase();


  container.innerHTML = `

    <label
      class="settings-field"
    >

      <span>
        O que ${escapeHtml(c.nome || 'a outra pessoa')} pode fazer no meu financeiro pessoal?
      </span>


      <select
        id="settingsShareLevel"
      >

        <option
          value="NENHUM"
          ${
            nivel === 'NENHUM'
              ? 'selected'
              : ''
          }
        >
          🔒 Privado
        </option>

        <option
          value="VISUALIZAR"
          ${
            nivel === 'VISUALIZAR'
              ? 'selected'
              : ''
          }
        >
          👁 Somente visualizar
        </option>

        <option
          value="EDITAR"
          ${
            nivel === 'EDITAR'
              ? 'selected'
              : ''
          }
        >
          ✏️ Visualizar e editar
        </option>

      </select>

    </label>


    <button
      type="button"
      class="settings-save-btn"
      id="settingsSavePrivacy"
    >
      Salvar privacidade
    </button>


    <div
      class="settings-received-access"
    >
      <b>
        Acesso que ${escapeHtml(c.nome || 'a outra pessoa')} concedeu a você
      </b>

      <span>
        ${escapeHtml(
          descricaoNivelCompartilhamento(
            recebido
          )
        )}
      </span>
    </div>

  `;


  document
    .getElementById(
      'settingsSavePrivacy'
    )
    ?.addEventListener(
      'click',
      () =>
        salvarPrivacidadeAjustes(
          c.email
        )
    );

}


async function salvarPrivacidadeAjustes(
  email
) {

  const select =
    document.getElementById(
      'settingsShareLevel'
    );


  if (!select) {
    return;
  }


  const button =
    document.getElementById(
      'settingsSavePrivacy'
    );


  try {

    if (button) {

      button.disabled =
        true;

      button.textContent =
        'Salvando...';

    }


    await api(
      'salvarCompartilhamento',
      {
        conjugeEmail:
          email,

        nivel:
          select.value
      },
      'POST'
    );


    const atualizado =
      await api(
        'obterMeuCompartilhamento'
      );


    if (
      state.initialData
    ) {
      state.initialData.compartilhamento =
        atualizado;
    }


    renderPrivacidadeAjustes(
      atualizado
    );

  } catch (error) {

    window.alert(
      error.message ||
      'Não foi possível salvar a privacidade.'
    );

  } finally {

    if (
      button &&
      document.body.contains(
        button
      )
    ) {

      button.disabled =
        false;

      button.textContent =
        'Salvar privacidade';

    }

  }

}


/* -----------------------------------------------------
   RESUMO DOS CADASTROS
   ----------------------------------------------------- */

function renderResumoCadastrosAjustes(
  cadastros
) {

  if (!cadastros) {
    return;
  }


  const resumo = (
    id,
    lista
  ) => {

    const element =
      document.getElementById(
        id
      );


    if (!element) {
      return;
    }


    const todos =
      Array.isArray(lista)
        ? lista
        : [];


    const ativos =
      todos.filter(
        item =>
          item.ativa !== false
      ).length;


    element.textContent =
      `${ativos} ativo${
        ativos === 1
          ? ''
          : 's'
      } · ${
        cadastros.podeEditar
          ? 'toque para gerenciar'
          : 'somente visualização'
      }`;

  };


  resumo(
    'settingsContasResumo',
    cadastros.contas
  );


  resumo(
    'settingsCategoriasResumo',
    cadastros.categorias
  );


  resumo(
    'settingsFormasResumo',
    cadastros.formasPagamento
  );

}


/* -----------------------------------------------------
   GERENCIADOR DE CADASTROS
   ----------------------------------------------------- */

function tituloCadastro(
  tipo
) {

  if (tipo === 'contas') {
    return 'Contas';
  }

  if (tipo === 'categorias') {
    return 'Categorias';
  }

  return 'Formas de pagamento';
}


function iconeCadastro(
  tipo
) {

  if (tipo === 'contas') {
    return '🏦';
  }

  if (tipo === 'categorias') {
    return '🏷️';
  }

  return '💳';
}


function listaCadastroAtual(
  tipo
) {

  const c =
    state.cadastrosGerenciamento ||
    {};

  if (tipo === 'contas') {
    return c.contas || [];
  }

  if (tipo === 'categorias') {
    return c.categorias || [];
  }

  return c.formasPagamento || [];
}


function garantirModalCadastroAjustes() {

  let modal =
    document.getElementById(
      'modalCadastroAjustes'
    );


  if (modal) {
    return modal;
  }


  modal =
    document.createElement(
      'div'
    );


  modal.id =
    'modalCadastroAjustes';


  modal.className =
    'finance-modal hidden';


  document
    .getElementById(
      'app'
    )
    ?.appendChild(
      modal
    );


  return modal;
}


async function abrirGerenciadorCadastro(
  tipo
) {

  const modal =
    garantirModalCadastroAjustes();


  try {

    state.cadastrosGerenciamento =
      await carregarCadastrosDoEscopo(
        true
      );

  } catch (error) {

    window.alert(
      error.message ||
      'Não foi possível carregar os cadastros.'
    );

    return;
  }


  const lista =
    listaCadastroAtual(
      tipo
    );


  const podeEditar =
    Boolean(
      state.cadastrosGerenciamento
        ?.podeEditar
    );


  modal.innerHTML = `

    <div
      class="finance-modal-backdrop"
      data-close-cadastro
    ></div>


    <div
      class="finance-modal-card settings-manager-modal"
    >

      <header
        class="finance-modal-header"
      >

        <div>

          <p class="eyebrow">
            ${
              escapeHtml(
                state.escopo === 'CASAL'
                  ? 'ESPAÇO CASAL'
                  : state.escopo
              )
            }
          </p>

          <h2>
            ${iconeCadastro(tipo)}
            ${escapeHtml(
              tituloCadastro(tipo)
            )}
          </h2>

        </div>


        <button
          type="button"
          class="modal-close"
          data-close-cadastro
        >
          ×
        </button>

      </header>


      ${
        podeEditar
          ? `
            <button
              type="button"
              class="settings-add-btn"
              id="settingsAddCadastro"
            >
              ＋ Adicionar
            </button>
          `
          : `
            <div class="settings-readonly-banner">
              👁 Você pode consultar este cadastro, mas não pode alterá-lo.
            </div>
          `
      }


      <div
        class="settings-cadastro-list"
      >

        ${
          lista.length
            ? lista
                .map(
                  item => {

                    let titulo =
                      item.nome ||
                      'Sem nome';

                    let detalhe =
                      '';

                    if (
                      tipo === 'contas'
                    ) {
                      detalhe =
                        [
                          item.banco,
                          item.tipo
                        ]
                          .filter(Boolean)
                          .join(' · ');
                    }

                    if (
                      tipo === 'categorias'
                    ) {
                      titulo =
                        `${item.icone || '🏷️'} ${titulo}`;

                      detalhe =
                        item.tipo === 'RECEITA'
                          ? 'Receita'
                          : 'Despesa';
                    }

                    return `
                      <div
                        class="settings-cadastro-item ${
                          item.ativa === false
                            ? 'inactive'
                            : ''
                        }"
                      >

                        <div
                          class="settings-cadastro-info"
                        >
                          <b>
                            ${escapeHtml(
                              titulo
                            )}
                          </b>

                          <small>
                            ${
                              escapeHtml(
                                detalhe ||
                                (
                                  item.ativa === false
                                    ? 'Inativo'
                                    : 'Ativo'
                                )
                              )
                            }
                          </small>
                        </div>


                        <div
                          class="settings-cadastro-actions"
                        >

                          <span
                            class="settings-status ${
                              item.ativa === false
                                ? 'off'
                                : 'on'
                            }"
                          >
                            ${
                              item.ativa === false
                                ? 'Inativo'
                                : 'Ativo'
                            }
                          </span>


                          ${
                            podeEditar
                              ? `
                                <button
                                  type="button"
                                  class="settings-mini-btn"
                                  data-edit-cadastro="${
                                    escapeAttribute(
                                      item.id
                                    )
                                  }"
                                >
                                  ✏️
                                </button>

                                <button
                                  type="button"
                                  class="settings-mini-btn ${
                                    item.ativa === false
                                      ? ''
                                      : 'danger'
                                  }"
                                  data-toggle-cadastro="${
                                    escapeAttribute(
                                      item.id
                                    )
                                  }"
                                >
                                  ${
                                    item.ativa === false
                                      ? '↩'
                                      : '⏸'
                                  }
                                </button>
                              `
                              : ''
                          }

                        </div>

                      </div>
                    `;

                  }
                )
                .join('')
            : `
              <div class="launch-empty">
                <span>${iconeCadastro(tipo)}</span>
                <strong>Nenhum cadastro ainda</strong>
                <small>Adicione o primeiro item deste espaço.</small>
              </div>
            `
        }

      </div>

    </div>

  `;


  modal
    .classList
    .remove('hidden');


  modal
    .querySelectorAll(
      '[data-close-cadastro]'
    )
    .forEach(
      el => {

        el.addEventListener(
          'click',
          fecharModalCadastroAjustes
        );

      }
    );


  document
    .getElementById(
      'settingsAddCadastro'
    )
    ?.addEventListener(
      'click',
      () =>
        abrirFormularioCadastroAjustes(
          tipo
        )
    );


  modal
    .querySelectorAll(
      '[data-edit-cadastro]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () =>
            abrirFormularioCadastroAjustes(
              tipo,
              button.dataset.editCadastro
            )
        );

      }
    );


  modal
    .querySelectorAll(
      '[data-toggle-cadastro]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () =>
            alternarCadastroAjustes(
              tipo,
              button.dataset.toggleCadastro
            )
        );

      }
    );

}


function fecharModalCadastroAjustes() {

  document
    .getElementById(
      'modalCadastroAjustes'
    )
    ?.classList
    .add('hidden');

}


/* -----------------------------------------------------
   FORMULÁRIO DE CADASTRO
   ----------------------------------------------------- */

function abrirFormularioCadastroAjustes(
  tipo,
  id = null
) {

  if (
    !state.cadastrosGerenciamento
      ?.podeEditar
  ) {

    window.alert(
      'Você não tem permissão para editar este espaço.'
    );

    return;
  }


  const modal =
    garantirModalCadastroAjustes();


  const item =
    id
      ? listaCadastroAtual(
          tipo
        ).find(
          x =>
            String(x.id) ===
            String(id)
        )
      : null;


  let campos =
    '';


  if (
    tipo === 'contas'
  ) {

    campos = `

      <label>
        Nome da conta

        <input
          id="cadastroNome"
          type="text"
          placeholder="Ex.: Nubank"
          value="${
            escapeAttribute(
              item?.nome ||
              ''
            )
          }"
          required
        >
      </label>


      <div class="form-grid">

        <label>
          Banco / instituição

          <input
            id="cadastroBanco"
            type="text"
            placeholder="Ex.: Nubank, Itaú, Mercado Pago"
            value="${
              escapeAttribute(
                item?.banco ||
                ''
              )
            }"
          >
        </label>


        <label>
          Tipo

          <select
            id="cadastroTipo"
          >
            ${
              [
                'CONTA',
                'CARTEIRA',
                'DINHEIRO',
                'POUPANÇA',
                'INVESTIMENTO'
              ]
                .map(
                  value => `
                    <option
                      value="${value}"
                      ${
                        String(
                          item?.tipo ||
                          'CONTA'
                        ) === value
                          ? 'selected'
                          : ''
                      }
                    >
                      ${value}
                    </option>
                  `
                )
                .join('')
            }
          </select>
        </label>

      </div>


      <label>
        Saldo inicial

        <input
          id="cadastroSaldo"
          type="number"
          step="0.01"
          value="${
            Number(
              item?.saldoInicial ||
              0
            )
          }"
        >

        <small class="field-hint">
          Use apenas como referência inicial da conta.
        </small>
      </label>

    `;

  }


  if (
    tipo === 'categorias'
  ) {

    campos = `

      <div class="form-grid">

        <label>
          Nome

          <input
            id="cadastroNome"
            type="text"
            placeholder="Ex.: Pets"
            value="${
              escapeAttribute(
                item?.nome ||
                ''
              )
            }"
            required
          >
        </label>


        <label>
          Ícone / emoji

          <input
            id="cadastroIcone"
            type="text"
            maxlength="8"
            placeholder="Ex.: 🐱"
            value="${
              escapeAttribute(
                item?.icone ||
                ''
              )
            }"
          >
        </label>

      </div>


      <label>
        Tipo

        <select
          id="cadastroTipo"
        >
          <option
            value="DESPESA"
            ${
              String(
                item?.tipo ||
                'DESPESA'
              ) === 'DESPESA'
                ? 'selected'
                : ''
            }
          >
            Despesa
          </option>

          <option
            value="RECEITA"
            ${
              String(
                item?.tipo ||
                ''
              ) === 'RECEITA'
                ? 'selected'
                : ''
            }
          >
            Receita
          </option>
        </select>
      </label>

    `;

  }


  if (
    tipo === 'formas'
  ) {

    campos = `

      <label>
        Nome da forma de pagamento

        <input
          id="cadastroNome"
          type="text"
          placeholder="Ex.: Débito automático"
          value="${
            escapeAttribute(
              item?.nome ||
              ''
            )
          }"
          required
        >
      </label>

    `;

  }


  modal.innerHTML = `

    <div
      class="finance-modal-backdrop"
      data-close-cadastro
    ></div>


    <div
      class="finance-modal-card"
    >

      <header
        class="finance-modal-header"
      >

        <div>

          <p class="eyebrow">
            ${
              item
                ? 'EDITAR'
                : 'NOVO CADASTRO'
            }
          </p>

          <h2>
            ${iconeCadastro(tipo)}
            ${
              item
                ? 'Editar'
                : 'Adicionar'
            }
            ${escapeHtml(
              tituloCadastro(tipo)
                .toLowerCase()
            )}
          </h2>

        </div>


        <button
          type="button"
          class="modal-close"
          data-close-cadastro
        >
          ×
        </button>

      </header>


      <form
        id="formCadastroAjustes"
      >

        ${campos}


        <div
          id="cadastroAjustesErro"
          class="form-error"
        ></div>


        <div
          class="settings-form-actions"
        >

          <button
            type="button"
            class="settings-cancel-btn"
            id="cadastroVoltarLista"
          >
            Voltar
          </button>


          <button
            type="submit"
            class="settings-save-btn"
          >
            Salvar
          </button>

        </div>

      </form>

    </div>

  `;


  modal
    .classList
    .remove('hidden');


  modal
    .querySelectorAll(
      '[data-close-cadastro]'
    )
    .forEach(
      el =>
        el.addEventListener(
          'click',
          fecharModalCadastroAjustes
        )
    );


  document
    .getElementById(
      'cadastroVoltarLista'
    )
    ?.addEventListener(
      'click',
      () =>
        abrirGerenciadorCadastro(
          tipo
        )
    );


  document
    .getElementById(
      'formCadastroAjustes'
    )
    ?.addEventListener(
      'submit',
      event =>
        salvarCadastroAjustes(
          event,
          tipo,
          item
        )
    );

}


async function salvarCadastroAjustes(
  event,
  tipo,
  item
) {

  event.preventDefault();


  const erro =
    document.getElementById(
      'cadastroAjustesErro'
    );


  const button =
    event.currentTarget
      ?.querySelector(
        'button[type="submit"]'
      );


  try {

    if (erro) {
      erro.textContent = '';
    }


    if (button) {

      button.disabled =
        true;

      button.textContent =
        'Salvando...';

    }


    const nome =
      document.getElementById(
        'cadastroNome'
      )?.value
        ?.trim() ||
      '';


    if (!nome) {
      throw new Error(
        'Informe um nome.'
      );
    }


    let action =
      '';

    let dados = {

      id:
        item?.id ||
        '',

      nome:

        nome,

      escopo:
        state.escopo,

      ativa:
        item
          ? item.ativa !== false
          : true

    };


    if (
      tipo === 'contas'
    ) {

      action =
        'salvarConta';

      dados = {
        ...dados,

        banco:
          document.getElementById(
            'cadastroBanco'
          )?.value
            ?.trim() ||
          'Outros',

        tipo:
          document.getElementById(
            'cadastroTipo'
          )?.value ||
          'CONTA',

        saldoInicial:
          Number(
            document.getElementById(
              'cadastroSaldo'
            )?.value ||
            0
          )
      };

    }


    if (
      tipo === 'categorias'
    ) {

      action =
        'salvarCategoria';

      dados = {
        ...dados,

        tipo:
          document.getElementById(
            'cadastroTipo'
          )?.value ||
          'DESPESA',

        icone:
          document.getElementById(
            'cadastroIcone'
          )?.value
            ?.trim() ||
          ''
      };

    }


    if (
      tipo === 'formas'
    ) {

      action =
        'salvarFormaPagamento';

    }


    await api(
      action,
      dados,
      'POST'
    );


    await atualizarCadastrosDepoisDeSalvar();


    await abrirGerenciadorCadastro(
      tipo
    );

  } catch (error) {

    if (erro) {

      erro.textContent =
        error.message ||
        'Não foi possível salvar.';

    }

  } finally {

    if (
      button &&
      document.body.contains(
        button
      )
    ) {

      button.disabled =
        false;

      button.textContent =
        'Salvar';

    }

  }

}


async function alternarCadastroAjustes(
  tipo,
  id
) {

  if (
    !state.cadastrosGerenciamento
      ?.podeEditar
  ) {
    return;
  }


  const item =
    listaCadastroAtual(
      tipo
    ).find(
      x =>
        String(x.id) ===
        String(id)
    );


  if (!item) {
    return;
  }


  const novaAtiva =
    item.ativa === false;


  try {

    let action =
      '';

    let dados = {
      ...item,

      ativa:
        novaAtiva,

      escopo:
        state.escopo
    };


    if (
      tipo === 'contas'
    ) {
      action =
        'salvarConta';
    }


    if (
      tipo === 'categorias'
    ) {
      action =
        'salvarCategoria';
    }


    if (
      tipo === 'formas'
    ) {
      action =
        'salvarFormaPagamento';
    }


    await api(
      action,
      dados,
      'POST'
    );


    await atualizarCadastrosDepoisDeSalvar();


    await abrirGerenciadorCadastro(
      tipo
    );

  } catch (error) {

    window.alert(
      error.message ||
      'Não foi possível alterar o cadastro.'
    );

  }

}


async function atualizarCadastrosDepoisDeSalvar() {

  await carregarCadastrosDoEscopo(
    false
  );


  state.cadastrosGerenciamento =
    await carregarCadastrosDoEscopo(
      true
    );


  renderResumoCadastrosAjustes(
    state.cadastrosGerenciamento
  );


  if (
    lancamentosPage &&
    !lancamentosPage
      .classList
      .contains('hidden')
  ) {

    atualizarCategoriasFiltro();

  }

}


/* -----------------------------------------------------
   TEMA
   ----------------------------------------------------- */

function aplicarTemaAjustes(
  tema
) {

  if (
    tema ===
    'light'
  ) {

    root.classList.add(
      'light'
    );

    localStorage.setItem(
      'financeiro-theme',
      'light'
    );

  } else {

    root.classList.remove(
      'light'
    );

    localStorage.setItem(
      'financeiro-theme',
      'dark'
    );

  }


  atualizarBotoesTemaAjustes();

}


function atualizarBotoesTemaAjustes() {

  const light =
    root.classList.contains(
      'light'
    );


  document
    .getElementById(
      'settingsThemeDark'
    )
    ?.classList
    .toggle(
      'active',
      !light
    );


  document
    .getElementById(
      'settingsThemeLight'
    )
    ?.classList
    .toggle(
      'active',
      light
    );

}


/* =====================================================
   V5 — PREVISTO X REALIZADO / RECORRENTES
   ===================================================== */

function hojeLocalISO() {

  const agora =
    new Date();

  const ano =
    agora.getFullYear();

  const mes =
    String(
      agora.getMonth() + 1
    ).padStart(
      2,
      '0'
    );

  const dia =
    String(
      agora.getDate()
    ).padStart(
      2,
      '0'
    );

  return `${ano}-${mes}-${dia}`;
}


function situacaoVisualLancamento(
  item
) {

  const status =
    String(
      item?.status ||
      ''
    ).toUpperCase();

  const tipo =
    String(
      item?.tipo ||
      ''
    ).toUpperCase();

  if (
    status ===
    'CANCELADO'
  ) {

    return {
      codigo:
        'cancelado',
      label:
        'Cancelado'
    };
  }

  if (
    status ===
    'REALIZADO'
  ) {

    return {
      codigo:
        'realizado',
      label:
        tipo ===
        'RECEITA'
          ? 'Recebido'
          : 'Pago'
    };
  }

  const data =
    String(
      item?.data ||
      ''
    );

  const hoje =
    hojeLocalISO();

  if (
    data &&
    data < hoje
  ) {

    return {
      codigo:
        'atrasado',
      label:
        tipo ===
        'RECEITA'
          ? 'Em atraso'
          : 'Atrasada'
    };
  }

  if (
    data === hoje
  ) {

    return {
      codigo:
        'hoje',
      label:
        tipo ===
        'RECEITA'
          ? 'Receber hoje'
          : 'Vence hoje'
    };
  }

  return {
    codigo:
      'pendente',
    label:
      tipo ===
      'RECEITA'
        ? 'A receber'
        : 'A vencer'
  };
}


function invalidarCacheLancamentos() {

  state.lancamentos =
    [];

  state.lancamentosCarregados =
    false;

  state.lancamentosCarregando =
    null;

  state.dashboard =
    null;

  state.dashboardCarregado =
    false;
}


async function carregarRecorrentesDoEscopo() {

  if (!state.escopo) {
    return [];
  }

  const lista =
    await api(
      'listarRecorrentes',
      {
        escopo:
          state.escopo
      }
    );

  state.recorrentes =
    Array.isArray(
      lista
    )
      ? lista
      : [];

  return state.recorrentes;
}


async function gerarRecorrentesPlanejamento(
  forcar = false
) {

  if (
    !state.escopo ||
    !podeEditarEscopoAtual()
  ) {
    return 0;
  }

  const agora =
    new Date();

  const chave =
    `${state.escopo}:${
      agora.getFullYear()
    }-${
      String(
        agora.getMonth() + 1
      ).padStart(
        2,
        '0'
      )
    }`;

  if (
    !forcar &&
    state.recorrenciasGeradas?.[
      chave
    ]
  ) {
    return 0;
  }

  let criados = 0;

  const meses = [
    new Date(
      agora.getFullYear(),
      agora.getMonth(),
      1
    ),
    new Date(
      agora.getFullYear(),
      agora.getMonth() + 1,
      1
    )
  ];

  for (
    const referencia of meses
  ) {

    const resposta =
      await api(
        'gerarRecorrentesDoMes',
        {
          ano:
            referencia.getFullYear(),

          mes:
            referencia.getMonth() + 1,

          escopo:
            state.escopo
        },
        'POST'
      );

    criados +=
      Number(
        resposta?.criados ||
        0
      );
  }

  state.recorrenciasGeradas =
    state.recorrenciasGeradas ||
    {};

  state.recorrenciasGeradas[
    chave
  ] =
    true;

  if (
    criados > 0
  ) {
    invalidarCacheLancamentos();
  }

  return criados;
}


async function sincronizarFinanceiroDepoisDeAlteracao(
  incluirRecorrentes = false
) {

  invalidarCacheLancamentos();

  const tarefas = [
    carregarLancamentos(
      {},
      true
    ),
    carregarDashboard()
  ];

  if (
    incluirRecorrentes
  ) {

    tarefas.push(
      carregarRecorrentesDoEscopo()
    );
  }

  await Promise.all(
    tarefas
  );

  preencherFiltroMeses();
  atualizarCategoriasFiltro();

  if (
    lancamentosPage &&
    !lancamentosPage
      .classList
      .contains(
        'hidden'
      )
  ) {

    await atualizarListaLancamentosPage();
  }

  if (
    relatoriosPage &&
    !relatoriosPage
      .classList
      .contains(
        'hidden'
      )
  ) {

    renderPaginaRelatorios();
  }
}


/* =====================================================
   ABRIR PÁGINA DE LANÇAMENTOS — V5
   ===================================================== */

async function abrirPaginaLancamentos(
  abrirFormulario = false,
  abrirRecorrente = false
) {

  criarPaginaLancamentos();

  prepararPaginaInterna(
    1
  );

  lancamentosPage
    .classList
    .remove(
      'hidden'
    );

  state.lancamentosAba =
    abrirRecorrente
      ? 'recorrentes'
      : 'movimentacoes';

  try {

    await gerarRecorrentesPlanejamento();

  } catch (error) {

    console.error(
      'Gerar previsões recorrentes:',
      error
    );
  }

  await Promise.all([
    carregarLancamentos(),
    carregarRecorrentesDoEscopo()
  ]);

  selecionarAbaLancamentos(
    state.lancamentosAba,
    false
  );

  await atualizarListaLancamentosPage();

  if (
    abrirFormulario
  ) {

    abrirFormularioLancamento();
  }
}


/* =====================================================
   PÁGINA DE LANÇAMENTOS — V5
   ===================================================== */

function criarPaginaLancamentos() {

  if (
    lancamentosPage
  ) {
    return;
  }

  lancamentosPage =
    document.createElement(
      'div'
    );

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
          Separe o que já aconteceu do que ainda está por vir
        </p>

      </div>

      <button
        class="finance-back-btn"
        id="backLancamentosBtn"
        aria-label="Voltar"
        type="button"
      >
        ←
      </button>

    </header>


    <nav
      class="launch-view-tabs"
      aria-label="Visualização dos lançamentos"
    >

      <button
        type="button"
        data-launch-tab="movimentacoes"
        class="active"
      >
        Movimentações
      </button>

      <button
        type="button"
        data-launch-tab="pendentes"
      >
        A pagar / receber
        <span
          class="launch-tab-count"
          id="pendentesTabCount"
        ></span>
      </button>

      <button
        type="button"
        data-launch-tab="recorrentes"
      >
        Recorrentes
        <span
          class="launch-tab-count"
          id="recorrentesTabCount"
        ></span>
      </button>

    </nav>


    <section class="launch-summary">

      <div>
        <small id="launchReceitasLabel">
          Recebido
        </small>

        <strong
          id="launchReceitas"
          class="positive"
        >
          R$ 0,00
        </strong>
      </div>

      <div>
        <small id="launchDespesasLabel">
          Pago
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
        type="button"
      >
        <span>＋</span>
        Novo lançamento
      </button>

      <button
        class="secondary-action"
        id="novoRecorrentePageBtn"
        type="button"
      >
        🔄 Nova recorrência
      </button>

    </section>


    <section
      class="launch-filters"
      id="launchFilters"
    >

      <div class="filter-row">

        <select
          id="filtroMesLancamentos"
        >
          <option value="TODOS">
            Todos os meses
          </option>
        </select>

        <select
          id="filtroTipoLancamentos"
        >

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

        <select
          id="filtroCategoriaLancamentos"
        >
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
    .getElementById(
      'app'
    )
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
      () =>
        abrirFormularioLancamento()
    );

  document
    .getElementById(
      'novoRecorrentePageBtn'
    )
    ?.addEventListener(
      'click',
      () =>
        abrirFormularioRecorrente()
    );

  lancamentosPage
    .querySelectorAll(
      '[data-launch-tab]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () =>
            selecionarAbaLancamentos(
              button.dataset.launchTab
            )
        );
      }
    );

  [
    'filtroMesLancamentos',
    'filtroCategoriaLancamentos'
  ].forEach(
    id => {

      document
        .getElementById(
          id
        )
        ?.addEventListener(
          'change',
          atualizarListaLancamentosPage
        );
    }
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
      'buscaLancamentos'
    )
    ?.addEventListener(
      'input',
      atualizarListaLancamentosPage
    );

  preencherFiltroMeses();
  atualizarCategoriasFiltro();
}


function selecionarAbaLancamentos(
  aba,
  atualizar = true
) {

  const permitidas = [
    'movimentacoes',
    'pendentes',
    'recorrentes'
  ];

  state.lancamentosAba =
    permitidas.includes(
      aba
    )
      ? aba
      : 'movimentacoes';

  lancamentosPage
    ?.querySelectorAll(
      '[data-launch-tab]'
    )
    .forEach(
      button => {

        button.classList.toggle(
          'active',
          button.dataset.launchTab ===
            state.lancamentosAba
        );
      }
    );

  document
    .getElementById(
      'launchFilters'
    )
    ?.classList
    .toggle(
      'hidden',
      state.lancamentosAba ===
        'recorrentes'
    );

  if (
    atualizar
  ) {

    atualizarListaLancamentosPage();
  }
}


function atualizarContadoresTabsLancamentos() {

  const pendentes =
    state.lancamentos
      .filter(
        item =>
          item.status ===
          'PENDENTE'
      )
      .length;

  const recorrentes =
    state.recorrentes
      .filter(
        item =>
          item.ativo
      )
      .length;

  const pendentesEl =
    document.getElementById(
      'pendentesTabCount'
    );

  const recorrentesEl =
    document.getElementById(
      'recorrentesTabCount'
    );

  if (
    pendentesEl
  ) {

    pendentesEl.textContent =
      pendentes > 0
        ? String(
            pendentes
          )
        : '';
  }

  if (
    recorrentesEl
  ) {

    recorrentesEl.textContent =
      recorrentes > 0
        ? String(
            recorrentes
          )
        : '';
  }
}


async function atualizarListaLancamentosPage() {

  const lista =
    document.getElementById(
      'listaLancamentosPage'
    );

  if (!lista) {
    return;
  }

  if (
    !state.lancamentosCarregados
  ) {

    lista.innerHTML = `
      <div class="launch-loading">
        Carregando lançamentos...
      </div>
    `;

    await carregarLancamentos();
  }

  if (
    state.lancamentosAba ===
    'recorrentes'
  ) {

    if (
      !Array.isArray(
        state.recorrentes
      )
    ) {
      state.recorrentes = [];
    }

    renderPaginaRecorrentes();
    atualizarContadoresTabsLancamentos();
    return;
  }

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

  let filtrados =
    [
      ...state.lancamentos
    ]
      .filter(
        item => {

          if (
            state.lancamentosAba ===
            'pendentes'
          ) {

            return (
              item.status ===
              'PENDENTE'
            );
          }

          return (
            item.status ===
            'REALIZADO'
          );
        }
      );

  if (
    mes !==
    'TODOS'
  ) {

    filtrados =
      filtrados.filter(
        item =>
          String(
            item.data ||
            ''
          ).startsWith(
            mes
          )
      );
  }

  if (tipo) {

    filtrados =
      filtrados.filter(
        item =>
          item.tipo ===
          tipo
      );
  }

  if (categoria) {

    filtrados =
      filtrados.filter(
        item =>
          item.categoria ===
          categoria
      );
  }

  if (busca) {

    filtrados =
      filtrados.filter(
        item => {

          const texto =
            [
              item.descricao,
              item.categoria,
              item.conta,
              item.formaPagamento
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

  if (
    state.lancamentosAba ===
    'pendentes'
  ) {

    filtrados.sort(
      (a, b) =>
        String(
          a.data ||
          ''
        ).localeCompare(
          String(
            b.data ||
            ''
          )
        )
    );
  }

  renderPaginaLancamentos(
    filtrados
  );

  atualizarContadoresTabsLancamentos();
}


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
        (
          total,
          item
        ) =>
          total +
          Number(
            item.valor ||
            0
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
        (
          total,
          item
        ) =>
          total +
          Number(
            item.valor ||
            0
          ),
        0
      );

  const labelReceitas =
    document.getElementById(
      'launchReceitasLabel'
    );

  const labelDespesas =
    document.getElementById(
      'launchDespesasLabel'
    );

  const receitasEl =
    document.getElementById(
      'launchReceitas'
    );

  const despesasEl =
    document.getElementById(
      'launchDespesas'
    );

  if (
    state.lancamentosAba ===
    'pendentes'
  ) {

    if (labelReceitas) {
      labelReceitas.textContent =
        'A receber';
    }

    if (labelDespesas) {
      labelDespesas.textContent =
        'A pagar';
    }

  } else {

    if (labelReceitas) {
      labelReceitas.textContent =
        'Recebido';
    }

    if (labelDespesas) {
      labelDespesas.textContent =
        'Pago';
    }
  }

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

  if (
    !lancamentos.length
  ) {

    lista.innerHTML = `

      <div class="launch-empty">

        <span>
          ${
            state.lancamentosAba ===
            'pendentes'
              ? '🗓️'
              : '💸'
          }
        </span>

        <strong>
          ${
            state.lancamentosAba ===
            'pendentes'
              ? 'Nada a pagar ou receber'
              : 'Nenhuma movimentação encontrada'
          }
        </strong>

        <small>
          ${
            state.lancamentosAba ===
            'pendentes'
              ? 'Contas futuras e valores a receber aparecerão aqui.'
              : 'Registre uma receita ou despesa para começar.'
          }
        </small>

      </div>

    `;

    return;
  }

  const podeEditar =
    podeEditarEscopoAtual();

  lista.innerHTML =
    lancamentos
      .map(
        item => {

          const despesa =
            item.tipo ===
            'DESPESA';

          const situacao =
            situacaoVisualLancamento(
              item
            );

          const parcelas =
            Number(
              item.parcelas ||
              1
            );

          const parcelaAtual =
            Number(
              item.parcelaAtual ||
              1
            );

          const parcelamento =
            parcelas > 1
              ? `Parcela ${parcelaAtual}/${parcelas}`
              : '';

          let dataTexto;

          if (
            item.status ===
            'REALIZADO'
          ) {

            const verbo =
              item.tipo ===
              'RECEITA'
                ? 'Recebido'
                : 'Pago';

            dataTexto =
              item.dataRealizacao
                ? `${verbo} em ${formatDate(
                    item.dataRealizacao
                  )}`
                : `${verbo}`;

            if (
              item.data &&
              item.dataRealizacao &&
              item.data !==
                item.dataRealizacao
            ) {

              dataTexto +=
                ` · Previsto ${formatDate(
                  item.data
                )}`;
            }

          } else {

            dataTexto =
              item.tipo ===
              'RECEITA'
                ? `Previsto ${formatDate(
                    item.data
                  )}`
                : `Vence ${formatDate(
                    item.data
                  )}`;
          }

          return `

            <article
              class="launch-item launch-item-v5"
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

                <div
                  class="launch-title-line"
                >

                  <strong>
                    ${escapeHtml(
                      item.descricao ||
                      'Sem descrição'
                    )}
                  </strong>

                  <span
                    class="launch-status-badge status-${
                      situacao.codigo
                    }"
                  >
                    ${escapeHtml(
                      situacao.label
                    )}
                  </span>

                </div>


                <small>
                  ${escapeHtml(
                    dataTexto
                  )}

                  ${
                    item.categoria
                      ? ' · ' +
                        escapeHtml(
                          item.categoria
                        )
                      : ''
                  }

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
                  item.formaPagamento
                    ? `
                      <small class="launch-meta">
                        ${escapeHtml(
                          item.formaPagamento
                        )}
                      </small>
                    `
                    : ''
                }


                ${
                  parcelamento
                    ? `
                      <small class="launch-meta">
                        ${parcelamento}
                      </small>
                    `
                    : ''
                }


                ${
                  item.recorrenteId
                    ? `
                      <small class="launch-recurring-tag">
                        🔄 Recorrente
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

              </div>


              ${
                podeEditar
                  ? `
                    <div
                      class="launch-actions-icons"
                    >

                      ${
                        item.status ===
                        'PENDENTE'
                          ? `
                            <button
                              type="button"
                              class="launch-realize-btn"
                              data-action="realize"
                              data-id="${
                                escapeAttribute(
                                  item.id
                                )
                              }"
                              title="${
                                item.tipo ===
                                'RECEITA'
                                  ? 'Marcar como recebido'
                                  : 'Marcar como pago'
                              }"
                            >
                              ✓ ${
                                item.tipo ===
                                'RECEITA'
                                  ? 'Receber'
                                  : 'Pagar'
                              }
                            </button>
                          `
                          : ''
                      }

                      <button
                        type="button"
                        class="launch-icon-btn"
                        data-action="edit"
                        data-id="${
                          escapeAttribute(
                            item.id
                          )
                        }"
                        title="Editar lançamento"
                        aria-label="Editar lançamento"
                      >
                        ✏️
                      </button>

                      <button
                        type="button"
                        class="launch-icon-btn danger"
                        data-action="delete"
                        data-id="${
                          escapeAttribute(
                            item.id
                          )
                        }"
                        title="Excluir lançamento"
                        aria-label="Excluir lançamento"
                      >
                        🗑️
                      </button>

                    </div>
                  `
                  : ''
              }

            </article>

          `;
        }
      )
      .join('');

  lista
    .querySelectorAll(
      '[data-action="realize"]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () =>
            marcarLancamentoRealizado(
              button.dataset.id
            )
        );
      }
    );

  lista
    .querySelectorAll(
      '[data-action="edit"]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () =>
            abrirFormularioLancamento(
              button.dataset.id
            )
        );
      }
    );

  lista
    .querySelectorAll(
      '[data-action="delete"]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () =>
            excluirLancamentoDaPagina(
              button.dataset.id
            )
        );
      }
    );
}


async function marcarLancamentoRealizado(
  id
) {

  if (
    !exigirEdicaoNoFrontend()
  ) {
    return;
  }

  const item =
    state.lancamentos.find(
      x =>
        String(
          x.id
        ) ===
        String(
          id
        )
    );

  if (!item) {
    return;
  }

  const texto =
    item.tipo ===
    'RECEITA'
      ? 'recebido'
      : 'pago';

  const confirmado =
    window.confirm(
      `Marcar "${item.descricao}" como ${texto}?`
    );

  if (!confirmado) {
    return;
  }

  try {

    await api(
      'atualizarStatusLancamento',
      {
        id:
          item.id,

        status:
          'REALIZADO',

        dataRealizacao:
          hojeLocalISO()
      },
      'POST'
    );

    await sincronizarFinanceiroDepoisDeAlteracao();

  } catch (error) {

    console.error(
      'Atualizar status:',
      error
    );

    window.alert(
      error.message ||
      'Não foi possível atualizar o lançamento.'
    );
  }
}


/* =====================================================
   FORMULÁRIO DE LANÇAMENTO — STATUS
   ===================================================== */

function abrirFormularioLancamento(
  id = null
) {

  abrirFormularioLancamentoBaseV4(
    id
  );

  const form =
    document.getElementById(
      'formLancamento'
    );

  if (!form) {
    return;
  }

  const existente =
    id
      ? state.lancamentos.find(
          item =>
            String(
              item.id
            ) ===
            String(
              id
            )
        )
      : null;

  const grids =
    form.querySelectorAll(
      '.form-grid'
    );

  const statusGrid =
    document.createElement(
      'div'
    );

  statusGrid.className =
    'form-grid status-form-grid';

  statusGrid.innerHTML = `

    <label>
      Situação

      <select
        id="lancamentoStatus"
      ></select>

      <small class="field-hint">
        Valores pendentes não alteram o saldo disponível.
      </small>
    </label>

    <label
      id="lancamentoDataRealizacaoWrap"
    >
      <span id="lancamentoDataRealizacaoLabel">
        Data do pagamento
      </span>

      <input
        id="lancamentoDataRealizacao"
        type="date"
      >
    </label>

  `;

  if (
    grids.length >= 2
  ) {

    grids[1]
      .parentNode
      .insertBefore(
        statusGrid,
        grids[1]
      );

  } else {

    const observacao =
      document.getElementById(
        'lancamentoObservacao'
      )
      ?.closest(
        'label'
      );

    form.insertBefore(
      statusGrid,
      observacao ||
      form.lastElementChild
    );
  }

  const statusSelect =
    document.getElementById(
      'lancamentoStatus'
    );

  const dataInput =
    document.getElementById(
      'lancamentoData'
    );

  const dataRealizacao =
    document.getElementById(
      'lancamentoDataRealizacao'
    );

  const statusInicial =
    existente?.status ||
    (
      String(
        dataInput?.value ||
        ''
      ) >
      hojeLocalISO()
        ? 'PENDENTE'
        : 'REALIZADO'
    );

  if (
    statusSelect
  ) {

    statusSelect.dataset.manual =
      existente
        ? '1'
        : '0';
  }

  atualizarOpcoesStatusFormulario(
    statusInicial
  );

  if (
    dataRealizacao
  ) {

    dataRealizacao.value =
      existente?.dataRealizacao ||
      (
        statusInicial ===
        'REALIZADO'
          ? hojeLocalISO()
          : ''
      );
  }

  atualizarVisibilidadeDataRealizacao();

  statusSelect
    ?.addEventListener(
      'change',
      () => {

        statusSelect.dataset.manual =
          '1';

        if (
          statusSelect.value ===
            'REALIZADO' &&
          dataRealizacao &&
          !dataRealizacao.value
        ) {

          dataRealizacao.value =
            hojeLocalISO();
        }

        atualizarVisibilidadeDataRealizacao();
      }
    );

  dataInput
    ?.addEventListener(
      'change',
      () => {

        if (
          !existente &&
          statusSelect?.dataset
            .manual !==
            '1'
        ) {

          const sugerido =
            String(
              dataInput.value ||
              ''
            ) >
            hojeLocalISO()
              ? 'PENDENTE'
              : 'REALIZADO';

          atualizarOpcoesStatusFormulario(
            sugerido
          );

          if (
            sugerido ===
            'REALIZADO' &&
            dataRealizacao &&
            !dataRealizacao.value
          ) {

            dataRealizacao.value =
              hojeLocalISO();
          }

          atualizarVisibilidadeDataRealizacao();
        }
      }
    );

  form
    .querySelectorAll(
      '.type-btn'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            const atual =
              document.getElementById(
                'lancamentoStatus'
              )?.value ||
              'PENDENTE';

            atualizarOpcoesStatusFormulario(
              atual
            );

            atualizarVisibilidadeDataRealizacao();
          }
        );
      }
    );
}


function atualizarOpcoesStatusFormulario(
  valorSelecionado
) {

  const select =
    document.getElementById(
      'lancamentoStatus'
    );

  if (!select) {
    return;
  }

  const tipo =
    document.getElementById(
      'lancamentoTipo'
    )?.value ||
    'DESPESA';

  const pendenteLabel =
    tipo ===
    'RECEITA'
      ? 'A receber'
      : 'A vencer';

  const realizadoLabel =
    tipo ===
    'RECEITA'
      ? 'Recebido'
      : 'Pago';

  select.innerHTML = `
    <option value="PENDENTE">
      ${pendenteLabel}
    </option>
    <option value="REALIZADO">
      ${realizadoLabel}
    </option>
  `;

  if (
    [
      'PENDENTE',
      'REALIZADO'
    ].includes(
      valorSelecionado
    )
  ) {

    select.value =
      valorSelecionado;
  }

  const label =
    document.getElementById(
      'lancamentoDataRealizacaoLabel'
    );

  if (label) {

    label.textContent =
      tipo ===
      'RECEITA'
        ? 'Data do recebimento'
        : 'Data do pagamento';
  }
}


function atualizarVisibilidadeDataRealizacao() {

  const select =
    document.getElementById(
      'lancamentoStatus'
    );

  const wrap =
    document.getElementById(
      'lancamentoDataRealizacaoWrap'
    );

  if (!wrap) {
    return;
  }

  wrap.classList.toggle(
    'hidden',
    select?.value !==
      'REALIZADO'
  );
}


async function salvarLancamentoFormulario(
  event,
  id = null
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

      button.disabled =
        true;

      button.textContent =
        id
          ? 'Salvando alterações...'
          : 'Salvando...';
    }

    const dados = {

      id:
        id ||
        undefined,

      escopo:
        state.escopo,

      tipo:
        document.getElementById(
          'lancamentoTipo'
        ).value,

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
          ).value ||
          1
        ),

      observacao:
        document.getElementById(
          'lancamentoObservacao'
        ).value.trim(),

      status:
        document.getElementById(
          'lancamentoStatus'
        )?.value ||
        (
          String(
            document.getElementById(
              'lancamentoData'
            ).value
          ) >
          hojeLocalISO()
            ? 'PENDENTE'
            : 'REALIZADO'
        ),

      dataRealizacao:
        document.getElementById(
          'lancamentoDataRealizacao'
        )?.value ||
        ''
    };

    if (!dados.descricao) {

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

    if (
      dados.status ===
        'REALIZADO' &&
      !dados.dataRealizacao
    ) {

      dados.dataRealizacao =
        hojeLocalISO();
    }

    const recorrente =
      !id &&
      Boolean(
        document.getElementById(
          'lancamentoRecorrente'
        )?.checked
      );

    if (recorrente) {

      if (
        dados.tipo !==
        'DESPESA'
      ) {

        throw new Error(
          'Dívidas recorrentes devem ser despesas.'
        );
      }

      if (
        dados.parcelas >
        1
      ) {

        throw new Error(
          'Para uma dívida recorrente, deixe o parcelamento em 1.'
        );
      }

      const dia =
        Math.max(
          1,
          Math.min(
            31,
            Number(
              document.getElementById(
                'recorrenciaDia'
              )?.value ||
              1
            )
          )
        );

      const dataFim =
        document.getElementById(
          'recorrenciaFim'
        )?.value ||
        '';

      await api(
        'salvarRecorrente',
        {
          escopo:
            state.escopo,

          descricao:
            dados.descricao,

          tipo:
            dados.tipo,

          categoria:
            dados.categoria,

          valor:
            dados.valor,

          dia:
            dia,

          conta:
            dados.conta,

          formaPagamento:
            dados.formaPagamento,

          cartao:
            '',

          parcelas:
            1,

          dataInicio:
            dados.data,

          dataFim:
            dataFim,

          ativo:
            true,

          observacao:
            dados.observacao
        },
        'POST'
      );

      await carregarRecorrentesDoEscopo();

      await gerarRecorrentesPlanejamento(
        true
      );

    } else {

      const action =
        !id &&
        dados.parcelas >
        1
          ? 'salvarParcelamento'
          : 'salvarLancamento';

      await api(
        action,
        dados,
        'POST'
      );
    }

    fecharModalLancamento();

    await sincronizarFinanceiroDepoisDeAlteracao(
      recorrente
    );

  } catch (error) {

    console.error(
      'Salvar lançamento:',
      error
    );

    if (erro) {

      erro.textContent =
        error.message ||
        'Não foi possível salvar o lançamento.';
    }

  } finally {

    if (button) {

      button.disabled =
        false;

      button.textContent =
        id
          ? 'Salvar alterações'
          : 'Salvar lançamento';
    }
  }
}


/* =====================================================
   RECORRENTES — LISTA / EDIÇÃO
   ===================================================== */

function renderPaginaRecorrentes() {

  const lista =
    document.getElementById(
      'listaLancamentosPage'
    );

  if (!lista) {
    return;
  }

  const recorrentes =
    [
      ...(
        state.recorrentes ||
        []
      )
    ]
      .sort(
        (a, b) => {

          if (
            a.ativo !==
            b.ativo
          ) {

            return a.ativo
              ? -1
              : 1;
          }

          return Number(
            a.dia ||
            1
          ) -
          Number(
            b.dia ||
            1
          );
        }
      );

  const ativos =
    recorrentes.filter(
      item =>
        item.ativo
    );

  const totalMensal =
    ativos
      .filter(
        item =>
          item.tipo ===
          'DESPESA'
      )
      .reduce(
        (
          total,
          item
        ) =>
          total +
          Number(
            item.valor ||
            0
          ),
        0
      );

  const label1 =
    document.getElementById(
      'launchReceitasLabel'
    );

  const label2 =
    document.getElementById(
      'launchDespesasLabel'
    );

  const valor1 =
    document.getElementById(
      'launchReceitas'
    );

  const valor2 =
    document.getElementById(
      'launchDespesas'
    );

  if (label1) {
    label1.textContent =
      'Recorrências ativas';
  }

  if (label2) {
    label2.textContent =
      'Total mensal';
  }

  if (valor1) {

    valor1.textContent =
      String(
        ativos.length
      );

    valor1.className =
      'positive';
  }

  if (valor2) {

    valor2.textContent =
      formatMoney(
        totalMensal
      );

    valor2.className =
      'negative';
  }

  if (
    !recorrentes.length
  ) {

    lista.innerHTML = `

      <div class="launch-empty">

        <span>🔄</span>

        <strong>
          Nenhuma recorrência cadastrada
        </strong>

        <small>
          Cadastre aluguel, faculdade, internet, assinaturas e outras contas mensais.
        </small>

        ${
          podeEditarEscopoAtual()
            ? `
              <button
                class="primary-action"
                type="button"
                onclick="abrirFormularioRecorrente()"
              >
                Nova recorrência
              </button>
            `
            : ''
        }

      </div>

    `;

    return;
  }

  const podeEditar =
    podeEditarEscopoAtual();

  lista.innerHTML =
    recorrentes
      .map(
        item => `

          <article
            class="recurring-manage-card ${
              item.ativo
                ? ''
                : 'is-paused'
            }"
          >

            <div
              class="recurring-manage-main"
            >

              <div
                class="recurring-manage-icon"
              >
                🔄
              </div>

              <div>

                <div
                  class="launch-title-line"
                >

                  <strong>
                    ${escapeHtml(
                      item.descricao ||
                      'Recorrência'
                    )}
                  </strong>

                  <span
                    class="launch-status-badge ${
                      item.ativo
                        ? 'status-realizado'
                        : 'status-cancelado'
                    }"
                  >
                    ${
                      item.ativo
                        ? 'Ativa'
                        : 'Pausada'
                    }
                  </span>

                </div>

                <small>
                  Todo dia ${
                    Number(
                      item.dia ||
                      1
                    )
                  }

                  ${
                    item.categoria
                      ? ' · ' +
                        escapeHtml(
                          item.categoria
                        )
                      : ''
                  }

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
                  item.formaPagamento
                    ? `
                      <small class="launch-meta">
                        ${escapeHtml(
                          item.formaPagamento
                        )}
                      </small>
                    `
                    : ''
                }

              </div>

            </div>


            <div
              class="recurring-manage-side"
            >

              <strong class="negative">
                ${formatMoney(
                  item.valor
                )}/mês
              </strong>

              ${
                podeEditar
                  ? `
                    <div
                      class="recurring-manage-actions"
                    >

                      <button
                        type="button"
                        class="launch-icon-btn"
                        data-rec-action="edit"
                        data-id="${
                          escapeAttribute(
                            item.id
                          )
                        }"
                      >
                        ✏️
                      </button>

                      <button
                        type="button"
                        class="recurring-toggle-btn"
                        data-rec-action="toggle"
                        data-id="${
                          escapeAttribute(
                            item.id
                          )
                        }"
                      >
                        ${
                          item.ativo
                            ? 'Pausar'
                            : 'Ativar'
                        }
                      </button>

                    </div>
                  `
                  : ''
              }

            </div>

          </article>

        `
      )
      .join('');

  lista
    .querySelectorAll(
      '[data-rec-action="edit"]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () =>
            abrirFormularioRecorrente(
              button.dataset.id
            )
        );
      }
    );

  lista
    .querySelectorAll(
      '[data-rec-action="toggle"]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () =>
            alternarRecorrenteAtivo(
              button.dataset.id
            )
        );
      }
    );
}


function abrirFormularioRecorrente(
  id = null
) {

  abrirFormularioRecorrenteBaseV4();

  const modal =
    document.getElementById(
      'modalRecorrente'
    );

  if (!modal) {
    return;
  }

  modal.dataset.recorrenteId =
    id ||
    '';

  const existente =
    id
      ? state.recorrentes.find(
          item =>
            String(
              item.id
            ) ===
            String(
              id
            )
        )
      : null;

  if (!existente) {
    return;
  }

  const eyebrow =
    modal.querySelector(
      '.finance-modal-header .eyebrow'
    );

  const titulo =
    modal.querySelector(
      '.finance-modal-header h2'
    );

  if (eyebrow) {
    eyebrow.textContent =
      'EDITAR RECORRÊNCIA';
  }

  if (titulo) {
    titulo.textContent =
      'Editar conta mensal';
  }

  const atribuir =
    (
      idCampo,
      valor
    ) => {

      const campo =
        document.getElementById(
          idCampo
        );

      if (campo) {
        campo.value =
          valor ??
          '';
      }
    };

  atribuir(
    'recDescricao',
    existente.descricao
  );

  atribuir(
    'recValor',
    existente.valor
  );

  atribuir(
    'recDia',
    existente.dia
  );

  atribuir(
    'recInicio',
    existente.dataInicio
  );

  atribuir(
    'recFim',
    existente.dataFim
  );

  atribuir(
    'recCategoria',
    existente.categoria
  );

  atribuir(
    'recConta',
    existente.conta
  );

  atribuir(
    'recForma',
    existente.formaPagamento
  );

  atribuir(
    'recObservacao',
    existente.observacao
  );

  const submit =
    document
      .getElementById(
        'formRecorrente'
      )
      ?.querySelector(
        'button[type="submit"]'
      );

  if (submit) {
    submit.textContent =
      'Salvar alterações';
  }
}


async function salvarRecorrenteFormulario(
  event
) {

  event.preventDefault();

  const modal =
    document.getElementById(
      'modalRecorrente'
    );

  const id =
    modal?.dataset
      ?.recorrenteId ||
    '';

  const existente =
    id
      ? state.recorrentes.find(
          item =>
            String(
              item.id
            ) ===
            String(
              id
            )
        )
      : null;

  const erro =
    document.getElementById(
      'recFormErro'
    );

  const button =
    document
      .getElementById(
        'formRecorrente'
      )
      ?.querySelector(
        'button[type="submit"]'
      );

  try {

    if (erro) {
      erro.textContent = '';
    }

    if (button) {

      button.disabled =
        true;

      button.textContent =
        'Salvando...';
    }

    const dataInicio =
      document.getElementById(
        'recInicio'
      ).value;

    const dataFim =
      document.getElementById(
        'recFim'
      ).value;

    const dia =
      Number(
        document.getElementById(
          'recDia'
        ).value
      );

    if (
      dia < 1 ||
      dia > 31
    ) {

      throw new Error(
        'Informe um vencimento entre 1 e 31.'
      );
    }

    if (
      dataFim &&
      dataInicio &&
      dataFim < dataInicio
    ) {

      throw new Error(
        'A data final precisa ser posterior ao início.'
      );
    }

    const dados = {

      id:
        id ||
        undefined,

      escopo:
        state.escopo,

      descricao:
        document.getElementById(
          'recDescricao'
        ).value.trim(),

      tipo:
        'DESPESA',

      categoria:
        document.getElementById(
          'recCategoria'
        ).value,

      valor:
        Number(
          document.getElementById(
            'recValor'
          ).value
        ),

      dia:
        dia,

      conta:
        document.getElementById(
          'recConta'
        ).value,

      formaPagamento:
        document.getElementById(
          'recForma'
        )?.value ||
        '',

      cartao:
        '',

      parcelas:
        1,

      dataInicio:
        dataInicio,

      dataFim:
        dataFim,

      ativo:
        existente
          ? Boolean(
              existente.ativo
            )
          : true,

      observacao:
        document.getElementById(
          'recObservacao'
        ).value.trim()
    };

    if (!dados.descricao) {

      throw new Error(
        'Informe a descrição.'
      );
    }

    if (
      !dados.valor ||
      dados.valor <= 0
    ) {

      throw new Error(
        'Informe um valor mensal válido.'
      );
    }

    await api(
      'salvarRecorrente',
      dados,
      'POST'
    );

    await carregarRecorrentesDoEscopo();

    state.recorrenciasGeradas =
      {};

    await gerarRecorrentesPlanejamento(
      true
    );

    modal?.remove();

    await sincronizarFinanceiroDepoisDeAlteracao(
      true
    );

    state.lancamentosAba =
      'recorrentes';

    selecionarAbaLancamentos(
      'recorrentes'
    );

  } catch (error) {

    console.error(
      'Salvar recorrente:',
      error
    );

    if (erro) {

      erro.textContent =
        error.message ||
        'Não foi possível salvar a recorrência.';
    }

  } finally {

    if (
      button &&
      document.body.contains(
        button
      )
    ) {

      button.disabled =
        false;

      button.textContent =
        id
          ? 'Salvar alterações'
          : 'Salvar dívida recorrente';
    }
  }
}


async function alternarRecorrenteAtivo(
  id
) {

  if (
    !exigirEdicaoNoFrontend()
  ) {
    return;
  }

  const item =
    state.recorrentes.find(
      x =>
        String(
          x.id
        ) ===
        String(
          id
        )
    );

  if (!item) {
    return;
  }

  const novoAtivo =
    !item.ativo;

  const verbo =
    novoAtivo
      ? 'ativar'
      : 'pausar';

  const confirmado =
    window.confirm(
      `${verbo === 'ativar' ? 'Ativar' : 'Pausar'} "${item.descricao}"?`
    );

  if (!confirmado) {
    return;
  }

  try {

    await api(
      'atualizarRecorrenteAtivo',
      {
        id:
          item.id,

        ativo:
          novoAtivo
      },
      'POST'
    );

    await carregarRecorrentesDoEscopo();

    if (
      novoAtivo
    ) {

      state.recorrenciasGeradas =
        {};

      await gerarRecorrentesPlanejamento(
        true
      );
    }

    await sincronizarFinanceiroDepoisDeAlteracao(
      true
    );

    state.lancamentosAba =
      'recorrentes';

    selecionarAbaLancamentos(
      'recorrentes'
    );

  } catch (error) {

    console.error(
      'Atualizar recorrência:',
      error
    );

    window.alert(
      error.message ||
      'Não foi possível atualizar a recorrência.'
    );
  }
}
