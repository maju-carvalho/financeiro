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

  recorrentes: [],

  /*
   * Cache mantido durante a sessão.
   */
  lancamentosCarregados: false,

  lancamentosCarregando: null,

  dashboardCarregado: false

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

function abrirFormularioLancamento(
  id = null
) {

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
            Data

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

  }


  const forma =
    document.getElementById(
      'lancamentoForma'
    );


  if (forma && existente) {

    forma.value =
      existente.formaPagamento ||
      '';

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
          categoria.nome;


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

function abrirFormularioRecorrente() {

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
        'listarRecorrentes'
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
      'listarObjetivos'
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
        ]
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

function abrirPaginaAjustes() {

  criarPaginaAjustes();

  prepararPaginaInterna(4);

  ajustesPage
    .classList
    .remove('hidden');


  preencherPaginaAjustes();

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
          Personalize o aplicativo do seu jeito
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
      class="settings-card"
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
            Escolha de qual espaço você quer ver os dados
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
            Meu Financeiro · versão 1.0
          </small>

        </div>

      </div>


      <div
        class="settings-about"
      >

        <span>
          Seus dados financeiros continuam vinculados à sua planilha.
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
      event =>
        trocarEscopo(
          event.target.value
        )
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
          escopo => `

            <option
              value="${
                escapeAttribute(
                  escopo.nome
                )
              }"
            >
              ${
                escapeHtml(
                  escopo.nome
                )
              }
            </option>

          `
        )
        .join('');


    if (
      state.escopo
    ) {

      select.value =
        state.escopo;

    }

  }


  atualizarBotoesTemaAjustes();

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
