/*******************************************************
 * MEU FINANCEIRO — V3
 * GitHub + Cloudflare Worker + Apps Script + Sheets
 *
 * Multiusuário:
 * - Juciara
 * - Igor
 * - Casal
 *
 * A planilha vinculada continua sendo o banco.
 *
 * AUTENTICAÇÃO:
 * Google Identity Token
 *        ↓
 * Cloudflare Worker
 *        ↓
 * Apps Script
 *        ↓
 * validaTokenGoogle_()
 *        ↓
 * aba Usuários
 *******************************************************/

const SHEETS = {
  LANCAMENTOS: 'Lançamentos',
  RECORRENTES: 'Recorrentes',
  OBJETIVOS: 'Objetivos',
  APORTES: 'Aportes',
  CONTAS: 'Contas',
  CATEGORIAS: 'Categorias',
  USUARIOS: 'Usuários',
  COMPARTILHAMENTO: 'Compartilhamento',
  CONFIG: 'Configurações'
};

const ESCOPOS = {
  CASAL: 'CASAL'
};

const GOOGLE_CLIENT_ID =
  '499603195416-5blucsgjuuc22forettuomnu7o2s29cb.apps.googleusercontent.com';

/*
 * O token fica disponível somente durante a execução atual.
 * Não é salvo na planilha nem em propriedades permanentes.
 */
let REQUEST_TOKEN = '';

/* =====================================================
   WEB APP / API
   ===================================================== */

function doGet(e) {

  REQUEST_TOKEN = extrairToken_(e);

  const action =
    e && e.parameter
      ? String(e.parameter.action || '').trim()
      : '';

  // Se acessarem diretamente a URL sem ação,
  // devolvemos uma resposta simples da API.
  if (!action) {
    return jsonResponse_({
      ok: true,
      app: 'Meu Financeiro API',
      versao: 'V3'
    });
  }

  try {
    return executarAcao_(action, e.parameter || {}, null);
  } catch (erro) {
    return erroResponse_(erro);
  }
}


function doPost(e) {

  REQUEST_TOKEN = extrairToken_(e);

  try {

    let dados = {};

    if (e && e.postData && e.postData.contents) {
      try {
        dados = JSON.parse(e.postData.contents);
      } catch (erro) {
        dados = {};
      }
    }

    const action =
      String(
        dados.action ||
        (e.parameter ? e.parameter.action : '') ||
        ''
      ).trim();

    delete dados.action;

    if (!action) {
      throw new Error('Ação não informada.');
    }

    return executarAcao_(action, dados, dados);

  } catch (erro) {
    return erroResponse_(erro);
  }
}


/* =====================================================
   DISPATCHER DA API
   ===================================================== */

function executarAcao_(action, parametros, body) {

  switch (action) {

    case 'usuarioAtual':
      return jsonResponse_(obterUsuarioAtual());

    case 'getInitialData':
      return jsonResponse_(getInitialData());

    case 'listarLancamentos':
      return jsonResponse_(
        listarLancamentos(parametros)
      );

    case 'listarRecorrentes':
      return jsonResponse_(
        listarRecorrentes()
      );

    case 'listarObjetivos':
      return jsonResponse_(
        listarObjetivos()
      );

    case 'listarContas':
      return jsonResponse_(
        listarContas()
      );

    case 'listarCategorias':
      return jsonResponse_(
        listarCategorias()
      );

    case 'obterMeuCompartilhamento':
      return jsonResponse_(
        obterMeuCompartilhamento()
      );

    case 'obterDashboard':
      return jsonResponse_(
        obterDashboard(
          parametros.inicio || '',
          parametros.fim || '',
          parametros.escopo || ''
        )
      );

    case 'obterRelatorio':
      return jsonResponse_(
        obterRelatorio(
          parametros.inicio || '',
          parametros.fim || '',
          parametros.escopo || ''
        )
      );

    case 'obterCompromissos':
      return jsonResponse_(
        obterCompromissos(
          parametros.inicio || '',
          parametros.fim || '',
          parametros.escopo || ''
        )
      );

    case 'salvarLancamento':
      return jsonResponse_(
        salvarLancamento(body || parametros)
      );

    case 'excluirLancamento':
      return jsonResponse_(
        excluirLancamento(
          parametros.id || (body && body.id)
        )
      );

    case 'salvarParcelamento':
      return jsonResponse_(
        salvarParcelamento(body || parametros)
      );

    case 'salvarRecorrente':
      return jsonResponse_(
        salvarRecorrente(body || parametros)
      );

    case 'excluirRecorrente':
      return jsonResponse_(
        excluirRecorrente(
          parametros.id || (body && body.id)
        )
      );

    case 'gerarRecorrentesDoMes':
      return jsonResponse_(
        gerarRecorrentesDoMes(
          Number(parametros.ano),
          Number(parametros.mes),
          parametros.escopo || ''
        )
      );

    case 'salvarObjetivo':
      return jsonResponse_(
        salvarObjetivo(body || parametros)
      );

    case 'adicionarAporte':
      return jsonResponse_(
        adicionarAporte(body || parametros)
      );

    case 'excluirObjetivo':
      return jsonResponse_(
        excluirObjetivo(
          parametros.id || (body && body.id)
        )
      );

    case 'salvarConta':
      return jsonResponse_(
        salvarConta(body || parametros)
      );

    case 'salvarCategoria':
      return jsonResponse_(
        salvarCategoria(body || parametros)
      );

    case 'salvarCompartilhamento':
      return jsonResponse_(
        salvarCompartilhamento(body || parametros)
      );

    case 'setupFinanceiroV2':
      return jsonResponse_(
        setupFinanceiroV2()
      );

    default:
      throw new Error(
        'Ação não reconhecida: ' + action
      );
  }
}


/* =====================================================
   RESPOSTAS
   ===================================================== */

function jsonResponse_(dados) {

  return ContentService
    .createTextOutput(
      JSON.stringify(dados)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}


function erroResponse_(erro) {

  return jsonResponse_({
    ok: false,
    erro:
      erro && erro.message
        ? erro.message
        : String(erro)
  });
}


/* =====================================================
   TOKEN GOOGLE
   ===================================================== */

function extrairToken_(e) {

  if (!e) return '';

  let token = '';

  if (e.parameter) {

    token =
      e.parameter.token ||
      e.parameter.authorization ||
      '';
  }

  token = String(token || '').trim();

  /*
   * O Worker pode receber:
   *
   * Authorization: Bearer XXXXX
   *
   * ou simplesmente:
   *
   * token=XXXXX
   */

  if (
    token.toLowerCase().indexOf('bearer ') === 0
  ) {
    token = token.substring(7).trim();
  }

  return token;
}


function validarTokenGoogle_(token) {

  if (!token) return '';

  try {

    const url =
      'https://oauth2.googleapis.com/tokeninfo?id_token=' +
      encodeURIComponent(token);

    const resposta =
      UrlFetchApp.fetch(
        url,
        {
          method: 'get',
          muteHttpExceptions: true
        }
      );

    if (resposta.getResponseCode() !== 200) {
      return '';
    }

    const dados =
      JSON.parse(
        resposta.getContentText()
      );

    /*
     * Garante que o token pertence ao
     * nosso Client ID.
     */

    if (
      String(dados.aud || '') !==
      GOOGLE_CLIENT_ID
    ) {
      return '';
    }

    if (!dados.email) {
      return '';
    }

    /*
     * O token precisa representar um
     * e-mail verificado pelo Google.
     */

    if (
      dados.email_verified !== true &&
      String(dados.email_verified) !== 'true'
    ) {
      return '';
    }

    return String(dados.email)
      .trim()
      .toLowerCase();

  } catch (erro) {

    console.error(
      'Erro ao validar token Google:',
      erro
    );

    return '';
  }
}


/* =====================================================
   IDENTIDADE / ACESSO
   ===================================================== */

function obterEmailAtual_() {

  /*
   * Primeiro tentamos a sessão do Apps Script.
   * Isso mantém compatibilidade caso o Web App
   * seja acessado diretamente.
   */

  try {

    const sessao =
      String(
        Session.getActiveUser().getEmail() || ''
      )
      .trim()
      .toLowerCase();

    if (sessao) {
      return sessao;
    }

  } catch (erro) {
    // Continua para o token Google.
  }

  /*
   * Quando vem pelo GitHub + Cloudflare,
   * usamos o token recebido nesta execução.
   */

  if (REQUEST_TOKEN) {
    return validarTokenGoogle_(
      REQUEST_TOKEN
    );
  }

  return '';
}


function obterUsuarioAtual() {

  const email =
    obterEmailAtual_();

  const usuarios =
    getSheetData_(SHEETS.USUARIOS);

  if (!email) {

    return {
      autenticado: false,
      email: '',
      nome: '',
      id: '',
      erro:
        'Não foi possível identificar sua conta Google.'
    };
  }

  const u =
    usuarios.find(x =>
      String(x.Email || '')
        .trim()
        .toLowerCase() === email &&
      String(x.Ativo || 'SIM') === 'SIM'
    );

  if (!u) {

    return {
      autenticado: false,
      email: email,
      nome: '',
      id: '',
      erro:
        'Seu e-mail ainda não foi cadastrado na aba "Usuários": ' +
        email
    };
  }

  const nome =
    String(u.Nome || '').trim();

  const id =
    String(u.ID || '').trim();

  if (!nome || !id) {

    return {
      autenticado: false,
      email: email,
      nome: nome,
      id: id,
      erro:
        'Seu cadastro na aba "Usuários" está incompleto. ' +
        'Preencha Nome e ID.'
    };
  }

  return {

    autenticado: true,

    email: email,

    nome: nome,

    id: id,

    erro: ''
  };
}


function exigirUsuario_() {

  const usuario =
    obterUsuarioAtual();

  if (!usuario.autenticado) {
    throw new Error(
      usuario.erro
    );
  }

  return usuario;
}


/* =====================================================
   ESTRUTURA / DADOS INICIAIS
   ===================================================== */

function setupFinanceiroV2() {

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error(
      'Abra o Apps Script a partir da planilha do financeiro.'
    );
  }

  criarAba_(
    ss,
    SHEETS.LANCAMENTOS,
    [
      'ID',
      'Data',
      'Tipo',
      'Descrição',
      'Categoria',
      'Valor',
      'Conta',
      'Forma Pagamento',
      'Cartão',
      'Parcelas',
      'Parcela Atual',
      'Recorrente ID',
      'Observação',
      'Escopo',
      'Criado por',
      'Criado em'
    ]
  );

  criarAba_(
    ss,
    SHEETS.RECORRENTES,
    [
      'ID',
      'Descrição',
      'Tipo',
      'Categoria',
      'Valor',
      'Dia',
      'Conta',
      'Forma Pagamento',
      'Cartão',
      'Parcelas',
      'Data Início',
      'Data Fim',
      'Ativo',
      'Observação',
      'Escopo',
      'Criado por'
    ]
  );

  criarAba_(
    ss,
    SHEETS.OBJETIVOS,
    [
      'ID',
      'Nome',
      'Meta',
      'Valor Inicial',
      'Data Criação',
      'Prazo',
      'Prioridade',
      'Ativo',
      'Observação',
      'Escopo',
      'Criado por'
    ]
  );

  criarAba_(
    ss,
    SHEETS.APORTES,
    [
      'ID',
      'Objetivo ID',
      'Data',
      'Valor',
      'Observação',
      'Escopo',
      'Criado por'
    ]
  );

  criarAba_(
    ss,
    SHEETS.CONTAS,
    [
      'ID',
      'Banco',
      'Nome',
      'Tipo',
      'Saldo Inicial',
      'Escopo',
      'Ativa',
      'Criado por'
    ]
  );

  criarAba_(
    ss,
    SHEETS.CATEGORIAS,
    [
      'ID',
      'Nome',
      'Tipo',
      'Ativa'
    ]
  );

  criarAba_(
    ss,
    SHEETS.USUARIOS,
    [
      'ID',
      'Nome',
      'Email',
      'Ativo',
      'Data Cadastro'
    ]
  );

  criarAba_(
    ss,
    SHEETS.COMPARTILHAMENTO,
    [
      'ID',
      'Dono Email',
      'Conjuge Email',
      'Nivel',
      'Ativo',
      'Atualizado em'
    ]
  );

  criarAba_(
    ss,
    SHEETS.CONFIG,
    [
      'Chave',
      'Valor'
    ]
  );

  inicializarDadosV2_();

  return {
    ok: true,
    message:
      'Estrutura V2 criada/atualizada.',
    emailAtual:
      obterEmailAtual_()
  };
}


function criarAba_(
  ss,
  nome,
  headers
) {

  let sh =
    ss.getSheetByName(nome);

  if (!sh) {
    sh = ss.insertSheet(nome);
  }

  if (sh.getLastRow() === 0) {

    sh
      .getRange(
        1,
        1,
        1,
        headers.length
      )
      .setValues([headers]);

  } else {

    const atual =
      sh
        .getRange(
          1,
          1,
          1,
          headers.length
        )
        .getValues()[0];

    const diferente =
      headers.some(
        (h, i) =>
          atual[i] !== h
      );

    if (diferente) {

      sh
        .getRange(
          1,
          1,
          1,
          headers.length
        )
        .setValues([headers]);
    }
  }

  sh.setFrozenRows(1);

  sh
    .getRange(
      1,
      1,
      1,
      headers.length
    )
    .setFontWeight('bold');

  sh.autoResizeColumns(
    1,
    headers.length
  );
}


function inicializarDadosV2_() {

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const catSh =
    ss.getSheetByName(
      SHEETS.CATEGORIAS
    );

  if (
    catSh &&
    catSh.getLastRow() === 1
  ) {

    catSh
      .getRange(2, 1, 14, 4)
      .setValues([
        [
          'CAT001',
          'Alimentação',
          'DESPESA',
          'SIM'
        ],
        [
          'CAT002',
          'Mercado',
          'DESPESA',
          'SIM'
        ],
        [
          'CAT003',
          'Moradia',
          'DESPESA',
          'SIM'
        ],
        [
          'CAT004',
          'Educação',
          'DESPESA',
          'SIM'
        ],
        [
          'CAT005',
          'Transporte',
          'DESPESA',
          'SIM'
        ],
        [
          'CAT006',
          'Saúde',
          'DESPESA',
          'SIM'
        ],
        [
          'CAT007',
          'Lazer',
          'DESPESA',
          'SIM'
        ],
        [
          'CAT008',
          'Assinaturas',
          'DESPESA',
          'SIM'
        ],
        [
          'CAT009',
          'Compras',
          'DESPESA',
          'SIM'
        ],
        [
          'CAT010',
          'Contas',
          'DESPESA',
          'SIM'
        ],
        [
          'CAT011',
          'Outros',
          'DESPESA',
          'SIM'
        ],
        [
          'CAT012',
          'Salário',
          'RECEITA',
          'SIM'
        ],
        [
          'CAT013',
          'Renda extra',
          'RECEITA',
          'SIM'
        ],
        [
          'CAT014',
          'Outras receitas',
          'RECEITA',
          'SIM'
        ]
      ]);
  }

  const contaSh =
    ss.getSheetByName(
      SHEETS.CONTAS
    );

  if (
    contaSh &&
    contaSh.getLastRow() === 1
  ) {

    contaSh
      .getRange(2, 1, 3, 8)
      .setValues([
        [
          'CONTA001',
          'Nubank',
          'Conta principal',
          'CONTA',
          0,
          'CASAL',
          'SIM',
          'sistema'
        ],
        [
          'CONTA002',
          'Outros',
          'Dinheiro',
          'DINHEIRO',
          0,
          'CASAL',
          'SIM',
          'sistema'
        ],
        [
          'CONTA003',
          'Outros',
          'Carteira',
          'CARTEIRA',
          0,
          'CASAL',
          'SIM',
          'sistema'
        ]
      ]);
  }
}


/* =====================================================
   ESCOPOS / COMPARTILHAMENTO
   ===================================================== */

function escopoPessoal_(usuario) {
  return usuario.nome;
}


function podeVerEscopo_(
  usuario,
  escopo
) {

  if (
    escopo === ESCOPOS.CASAL
  ) {
    return true;
  }

  if (
    escopo === usuario.nome
  ) {
    return true;
  }

  const alvo =
    buscarUsuarioPorNome_(
      escopo
    );

  if (!alvo) {
    return false;
  }

  return podeAcessarConjuge_(
    usuario.email,
    alvo.Email
  );
}


function podeAcessarConjuge_(
  emailDono,
  emailConjuge
) {

  if (
    !emailDono ||
    !emailConjuge
  ) {
    return false;
  }

  const registros =
    getSheetData_(
      SHEETS.COMPARTILHAMENTO
    );

  const r =
    registros.find(x =>
      String(
        x['Dono Email'] || ''
      )
        .toLowerCase() ===
      String(emailDono)
        .toLowerCase() &&

      String(
        x['Conjuge Email'] || ''
      )
        .toLowerCase() ===
      String(emailConjuge)
        .toLowerCase() &&

      String(
        x.Ativo || 'SIM'
      ) === 'SIM'
    );

  return !!r &&
    [
      'VISUALIZAR',
      'EDITAR'
    ].indexOf(
      String(
        r.Nivel || ''
      ).toUpperCase()
    ) >= 0;
}


function nivelAcessoEscopo_(
  usuario,
  escopo
) {

  if (
    escopo === ESCOPOS.CASAL ||
    escopo === usuario.nome
  ) {
    return 'EDITAR';
  }

  const alvo =
    buscarUsuarioPorNome_(
      escopo
    );

  if (!alvo) {
    return '';
  }

  const registros =
    getSheetData_(
      SHEETS.COMPARTILHAMENTO
    );

  const r =
    registros.find(x =>
      String(
        x['Dono Email'] || ''
      )
        .toLowerCase() ===
      String(
        alvo.Email || ''
      )
        .toLowerCase() &&

      String(
        x['Conjuge Email'] || ''
      )
        .toLowerCase() ===
      String(
        usuario.email
      ).toLowerCase() &&

      String(
        x.Ativo || 'SIM'
      ) === 'SIM'
    );

  return r
    ? String(
        r.Nivel || ''
      ).toUpperCase()
    : '';
}


function exigirPermissaoEdicaoEscopo_(
  usuario,
  escopo
) {

  const nivel =
    nivelAcessoEscopo_(
      usuario,
      escopo
    );

  if (
    nivel !== 'EDITAR'
  ) {
    throw new Error(
      'Você não tem permissão para editar este espaço financeiro.'
    );
  }
}


function buscarUsuarioPorNome_(
  nome
) {

  return getSheetData_(
    SHEETS.USUARIOS
  ).find(
    x =>
      String(x.Nome || '') ===
      String(nome || '')
  );
}


function listarUsuarios() {

  return getSheetData_(
    SHEETS.USUARIOS
  )
  .filter(
    x =>
      String(
        x.Ativo || 'SIM'
      ) === 'SIM'
  )
  .map(
    x => ({
      id: x.ID,
      nome: x.Nome,
      email: x.Email
    })
  );
}


function salvarUsuario() {

  throw new Error(
    'Cadastre os usuários diretamente na aba "Usuários".'
  );
}


function salvarCompartilhamento(
  dados
) {

  const usuario =
    exigirUsuario_();

  const donoEmail =
    usuario.email;

  const conjugeEmail =
    String(
      dados.conjugeEmail || ''
    )
      .trim()
      .toLowerCase();

  const nivel =
    String(
      dados.nivel || ''
    ).toUpperCase();

  if (!conjugeEmail) {
    throw new Error(
      'Cônjuge não informado.'
    );
  }

  if (
    [
      'NENHUM',
      'VISUALIZAR',
      'EDITAR'
    ].indexOf(nivel) < 0
  ) {
    throw new Error(
      'Nível de acesso inválido.'
    );
  }

  if (
    conjugeEmail === donoEmail
  ) {
    throw new Error(
      'Você não pode compartilhar consigo mesmo.'
    );
  }

  const alvo =
    getSheetData_(
      SHEETS.USUARIOS
    ).find(
      x =>
        String(
          x.Email || ''
        )
          .toLowerCase() ===
        conjugeEmail
    );

  if (!alvo) {
    throw new Error(
      'O e-mail informado não está cadastrado na aba "Usuários".'
    );
  }

  const sh =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        SHEETS.COMPARTILHAMENTO
      );

  const rows =
    getSheetData_(
      SHEETS.COMPARTILHAMENTO
    );

  const existente =
    rows.findIndex(
      x =>
        String(
          x['Dono Email'] || ''
        )
          .toLowerCase() ===
        donoEmail &&

        String(
          x['Conjuge Email'] || ''
        )
          .toLowerCase() ===
        conjugeEmail
    );

  const linha = [

    existente >= 0
      ? rows[existente].ID
      : novoId_('CMP'),

    donoEmail,

    conjugeEmail,

    nivel,

    nivel === 'NENHUM'
      ? 'NÃO'
      : 'SIM',

    new Date()
  ];

  if (existente >= 0) {

    sh
      .getRange(
        existente + 2,
        1,
        1,
        linha.length
      )
      .setValues([linha]);

  } else {

    sh.appendRow(linha);
  }

  return {
    ok: true
  };
}


function obterMeuCompartilhamento() {

  const usuario =
    exigirUsuario_();

  const users =
    listarUsuarios()
      .filter(
        u =>
          u.email !==
          usuario.email
      );

  if (!users.length) {

    return {
      conjuge: null,
      nivel: 'NENHUM'
    };
  }

  const conjuge =
    users[0];

  const rows =
    getSheetData_(
      SHEETS.COMPARTILHAMENTO
    );

  const r =
    rows.find(
      x =>
        String(
          x['Dono Email'] || ''
        )
          .toLowerCase() ===
        usuario.email &&

        String(
          x['Conjuge Email'] || ''
        )
          .toLowerCase() ===
        String(
          conjuge.email
        ).toLowerCase()
    );

  return {

    conjuge: conjuge,

    nivel:
      r
        ? String(
            r.Nivel || ''
          ).toUpperCase()
        : 'NENHUM'
  };
}


/* =====================================================
   UTILITÁRIOS
   ===================================================== */

function novoId_(prefixo) {

  return (
    prefixo +
    Utilities
      .getUuid()
      .replace(/-/g, '')
      .substring(0, 10)
      .toUpperCase()
  );
}


function numero_(valor) {

  if (
    typeof valor ===
    'number'
  ) {
    return valor;
  }

  if (
    valor === null ||
    valor === ''
  ) {
    return 0;
  }

  const s =
    String(valor)
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.');

  const n =
    Number(s);

  if (isNaN(n)) {
    throw new Error(
      'Valor inválido.'
    );
  }

  return n;
}


function data_(valor) {

  if (
    valor instanceof Date
  ) {
    return valor;
  }

  if (!valor) {
    return new Date();
  }

  if (
    /^\d{4}-\d{2}-\d{2}$/
      .test(String(valor))
  ) {

    const p =
      String(valor)
        .split('-');

    return new Date(
      Number(p[0]),
      Number(p[1]) - 1,
      Number(p[2])
    );
  }

  const d =
    new Date(valor);

  if (
    isNaN(
      d.getTime()
    )
  ) {
    throw new Error(
      'Data inválida.'
    );
  }

  return d;
}


function iso_(d) {

  if (!d) {
    return '';
  }

  const date =
    d instanceof Date
      ? d
      : new Date(d);

  return Utilities
    .formatDate(
      date,
      Session.getScriptTimeZone() ||
        'America/Sao_Paulo',
      'yyyy-MM-dd'
    );
}


function brDate_(d) {

  if (!d) {
    return '';
  }

  const date =
    d instanceof Date
      ? d
      : new Date(d);

  return Utilities
    .formatDate(
      date,
      Session.getScriptTimeZone() ||
        'America/Sao_Paulo',
      'dd/MM/yyyy'
    );
}


function getSheetData_(
  sheetName
) {

  const sh =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        sheetName
      );

  if (!sh) {

    throw new Error(
      'Aba não encontrada: ' +
      sheetName
    );
  }

  const values =
    sh.getDataRange()
      .getValues();

  if (
    values.length < 2
  ) {
    return [];
  }

  const headers =
    values[0];

  return values
    .slice(1)
    .filter(
      r =>
        r.some(
          v =>
            v !== ''
        )
    )
    .map(
      r => {

        const o = {};

        headers.forEach(
          (h, i) => {
            o[h] = r[i];
          }
        );

        return o;
      }
    );
}


function encontrarLinhaPorId_(
  sh,
  id
) {

  if (
    !id ||
    sh.getLastRow() < 2
  ) {
    return null;
  }

  const ids =
    sh
      .getRange(
        2,
        1,
        sh.getLastRow() - 1,
        1
      )
      .getValues();

  for (
    let i = 0;
    i < ids.length;
    i++
  ) {

    if (
      String(ids[i][0]) ===
      String(id)
    ) {
      return i + 2;
    }
  }

  return null;
}


/* =====================================================
   DADOS INICIAIS
   ===================================================== */

function getInitialData() {

  const usuario =
    exigirUsuario_();

  const nomesEscopos = [
    usuario.nome,
    ESCOPOS.CASAL
  ];

  getSheetData_(
    SHEETS.USUARIOS
  ).forEach(
    u => {

      const nomeOutro =
        String(
          u.Nome || ''
        ).trim();

      const emailOutro =
        String(
          u.Email || ''
        )
          .trim()
          .toLowerCase();

      if (
        nomeOutro &&
        emailOutro &&
        emailOutro !==
          usuario.email &&
        podeAcessarConjuge_(
          usuario.email,
          emailOutro
        )
      ) {
        nomesEscopos.push(
          nomeOutro
        );
      }
    }
  );

  const unique =
    [
      ...new Set(
        nomesEscopos
          .filter(Boolean)
      )
    ];

  return {

    ok: true,

    usuario: usuario,

    escopos:
      unique.map(
        nome => ({
          nome: nome,
          nivel:
            nivelAcessoEscopo_(
              usuario,
              nome
            )
        })
      ),

    categorias:
      listarCategorias(),

    contas:
      listarContasVisiveis(),

    objetivos:
      listarObjetivos(),

    recorrentes:
      listarRecorrentes(),

    compartilhamento:
      obterMeuCompartilhamento()
  };
}


/* =====================================================
   LANÇAMENTOS
   ===================================================== */

function listarLancamentos(
  filtros
) {

  const usuario =
    exigirUsuario_();

  filtros =
    filtros || {};

  let dados =
    getSheetData_(
      SHEETS.LANCAMENTOS
    )
    .filter(
      x =>
        podeVerEscopo_(
          usuario,
          String(
            x.Escopo || ''
          )
        )
    );

  if (filtros.escopo) {

    dados =
      dados.filter(
        x =>
          String(
            x.Escopo || ''
          ) ===
          String(
            filtros.escopo
          )
      );
  }

  if (filtros.inicio) {

    dados =
      dados.filter(
        x =>
          iso_(x.Data) >=
          filtros.inicio
      );
  }

  if (filtros.fim) {

    dados =
      dados.filter(
        x =>
          iso_(x.Data) <=
          filtros.fim
      );
  }

  if (filtros.tipo) {

    dados =
      dados.filter(
        x =>
          x.Tipo ===
          filtros.tipo
      );
  }

  if (filtros.categoria) {

    dados =
      dados.filter(
        x =>
          x.Categoria ===
          filtros.categoria
      );
  }

  if (filtros.conta) {

    dados =
      dados.filter(
        x =>
          x.Conta ===
          filtros.conta
      );
  }

  return dados
    .map(
      x => ({

        id: x.ID,

        data:
          iso_(x.Data),

        dataFormatada:
          brDate_(x.Data),

        tipo:
          x.Tipo,

        descricao:
          x['Descrição'],

        categoria:
          x.Categoria,

        valor:
          Number(
            x.Valor || 0
          ),

        conta:
          x.Conta,

        formaPagamento:
          x['Forma Pagamento'],

        cartao:
          x.Cartão,

        parcelas:
          Number(
            x.Parcelas || 1
          ),

        parcelaAtual:
          Number(
            x['Parcela Atual'] || 1
          ),

        recorrenteId:
          x['Recorrente ID'],

        observacao:
          x.Observação,

        escopo:
          x.Escopo
      })
    )
    .sort(
      (a, b) =>
        b.data.localeCompare(
          a.data
        )
    );
}


function salvarLancamento(
  dados
) {

  const usuario =
    exigirUsuario_();

  const escopo =
    String(
      dados.escopo ||
      usuario.nome
    );

  exigirPermissaoEdicaoEscopo_(
    usuario,
    escopo
  );

  if (!dados.descricao) {

    throw new Error(
      'Informe uma descrição.'
    );
  }

  const valor =
    numero_(dados.valor);

  if (valor <= 0) {

    throw new Error(
      'Informe um valor maior que zero.'
    );
  }

  if (
    [
      'RECEITA',
      'DESPESA'
    ].indexOf(
      dados.tipo
    ) === -1
  ) {

    throw new Error(
      'Tipo inválido.'
    );
  }

  const sh =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        SHEETS.LANCAMENTOS
      );

  const id =
    dados.id ||
    novoId_('LAN');

  const linha = [

    id,

    data_(dados.data),

    dados.tipo,

    dados.descricao,

    dados.categoria ||
      'Outros',

    valor,

    dados.conta ||
      '',

    dados.formaPagamento ||
      '',

    dados.cartao ||
      '',

    Number(
      dados.parcelas || 1
    ),

    Number(
      dados.parcelaAtual || 1
    ),

    dados.recorrenteId ||
      '',

    dados.observacao ||
      '',

    escopo,

    usuario.email,

    new Date()
  ];

  if (dados.id) {

    const row =
      encontrarLinhaPorId_(
        sh,
        dados.id
      );

    if (!row) {

      throw new Error(
        'Lançamento não encontrado.'
      );
    }

    sh
      .getRange(
        row,
        1,
        1,
        linha.length
      )
      .setValues([
        linha
      ]);

  } else {

    sh.appendRow(
      linha
    );
  }

  return {
    ok: true,
    id: id
  };
}


function excluirLancamento(
  id
) {

  const usuario =
    exigirUsuario_();

  const sh =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        SHEETS.LANCAMENTOS
      );

  const row =
    encontrarLinhaPorId_(
      sh,
      id
    );

  if (!row) {

    throw new Error(
      'Lançamento não encontrado.'
    );
  }

  const escopo =
    String(
      sh
        .getRange(
          row,
          14
        )
        .getValue() ||
      ''
    );

  exigirPermissaoEdicaoEscopo_(
    usuario,
    escopo
  );

  sh.deleteRow(row);

  return {
    ok: true
  };
}


function salvarParcelamento(
  dados
) {

  const usuario =
    exigirUsuario_();

  const escopo =
    String(
      dados.escopo ||
      usuario.nome
    );

  exigirPermissaoEdicaoEscopo_(
    usuario,
    escopo
  );

  const parcelas =
    Math.max(
      1,
      Number(
        dados.parcelas || 1
      )
    );

  const total =
    numero_(dados.valor);

  if (parcelas === 1) {

    return salvarLancamento(
      dados
    );
  }

  const valorParcela =
    Math.round(
      (
        total /
        parcelas
      ) * 100
    ) / 100;

  const primeira =
    data_(dados.data);

  for (
    let i = 0;
    i < parcelas;
    i++
  ) {

    const d =
      new Date(
        primeira
      );

    d.setMonth(
      d.getMonth() + i
    );

    let valor =
      valorParcela;

    if (
      i === parcelas - 1
    ) {

      valor =
        Math.round(
          (
            total -
            valorParcela *
              (parcelas - 1)
          ) * 100
        ) / 100;
    }

    salvarLancamento({

      escopo: escopo,

      data: d,

      tipo: dados.tipo,

      descricao:
        dados.descricao +
        ' (' +
        (i + 1) +
        '/' +
        parcelas +
        ')',

      categoria:
        dados.categoria,

      valor: valor,

      conta:
        dados.conta,

      formaPagamento:
        dados.formaPagamento,

      cartao:
        dados.cartao,

      parcelas:
        parcelas,

      parcelaAtual:
        i + 1,

      recorrenteId:
        '',

      observacao:
        dados.observacao
    });
  }

  return {
    ok: true,
    parcelasCriadas:
      parcelas
  };
}


/* =====================================================
   RECORRENTES
   ===================================================== */

function listarRecorrentes() {

  const usuario =
    exigirUsuario_();

  return getSheetData_(
    SHEETS.RECORRENTES
  )
    .filter(
      x =>
        podeVerEscopo_(
          usuario,
          String(
            x.Escopo || ''
          )
        )
    )
    .map(
      x => ({

        id: x.ID,

        descricao:
          x['Descrição'],

        tipo:
          x.Tipo,

        categoria:
          x.Categoria,

        valor:
          Number(
            x.Valor || 0
          ),

        dia:
          Number(
            x.Dia || 1
          ),

        conta:
          x.Conta,

        formaPagamento:
          x['Forma Pagamento'],

        cartao:
          x.Cartão,

        parcelas:
          Number(
            x.Parcelas || 1
          ),

        dataInicio:
          iso_(
            x['Data Início']
          ),

        dataFim:
          x['Data Fim']
            ? iso_(x['Data Fim'])
            : '',

        ativo:
          String(
            x.Ativo || 'SIM'
          ) === 'SIM',

        observacao:
          x.Observação,

        escopo:
          x.Escopo
      })
    );
}


function salvarRecorrente(
  dados
) {

  const usuario =
    exigirUsuario_();

  const escopo =
    String(
      dados.escopo ||
      usuario.nome
    );

  exigirPermissaoEdicaoEscopo_(
    usuario,
    escopo
  );

  if (!dados.descricao) {

    throw new Error(
      'Informe a descrição.'
    );
  }

  if (
    numero_(dados.valor) <= 0
  ) {

    throw new Error(
      'Informe um valor maior que zero.'
    );
  }

  const sh =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        SHEETS.RECORRENTES
      );

  const id =
    dados.id ||
    novoId_('REC');

  const linha = [

    id,

    dados.descricao,

    dados.tipo ||
      'DESPESA',

    dados.categoria ||
      'Outros',

    numero_(dados.valor),

    Number(
      dados.dia || 1
    ),

    dados.conta ||
      '',

    dados.formaPagamento ||
      '',

    dados.cartao ||
      '',

    Number(
      dados.parcelas || 1
    ),

    data_(
      dados.dataInicio ||
      new Date()
    ),

    dados.dataFim
      ? data_(dados.dataFim)
      : '',

    dados.ativo === false
      ? 'NÃO'
      : 'SIM',

    dados.observacao ||
      '',

    escopo,

    usuario.email
  ];

  if (dados.id) {

    const row =
      encontrarLinhaPorId_(
        sh,
        id
      );

    if (!row) {

      throw new Error(
        'Recorrente não encontrado.'
      );
    }

    sh
      .getRange(
        row,
        1,
        1,
        linha.length
      )
      .setValues([
        linha
      ]);

  } else {

    sh.appendRow(
      linha
    );
  }

  return {
    ok: true,
    id: id
  };
}


function excluirRecorrente(
  id
) {

  const usuario =
    exigirUsuario_();

  const sh =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        SHEETS.RECORRENTES
      );

  const row =
    encontrarLinhaPorId_(
      sh,
      id
    );

  if (!row) {

    throw new Error(
      'Recorrente não encontrado.'
    );
  }

  exigirPermissaoEdicaoEscopo_(
    usuario,
    String(
      sh
        .getRange(
          row,
          15
        )
        .getValue() ||
      ''
    )
  );

  sh.deleteRow(row);

  return {
    ok: true
  };
}


function gerarRecorrentesDoMes(
  ano,
  mes,
  escopo
) {

  const usuario =
    exigirUsuario_();

  escopo =
    String(
      escopo ||
      usuario.nome
    );

  exigirPermissaoEdicaoEscopo_(
    usuario,
    escopo
  );

  const recorrentes =
    listarRecorrentes()
      .filter(
        r =>
          r.ativo &&
          r.escopo ===
            escopo
      );

  const inicio =
    ano +
    '-' +
    String(mes)
      .padStart(2, '0') +
    '-01';

  const fim =
    iso_(
      new Date(
        ano,
        mes,
        0
      )
    );

  const lancamentos =
    listarLancamentos({
      inicio: inicio,
      fim: fim,
      escopo: escopo
    });

  let criados = 0;

  recorrentes.forEach(
    r => {

      const dia =
        Math.min(
          r.dia,
          new Date(
            ano,
            mes,
            0
          ).getDate()
        );

      const data =
        new Date(
          ano,
          mes - 1,
          dia
        );

      const existe =
        lancamentos.some(
          l =>
            l.recorrenteId ===
              r.id &&
            l.data ===
              iso_(data)
        );

      if (!existe) {

        salvarLancamento({

          escopo: escopo,

          data: data,

          tipo: r.tipo,

          descricao:
            r.descricao,

          categoria:
            r.categoria,

          valor:
            r.valor,

          conta:
            r.conta,

          formaPagamento:
            r.formaPagamento,

          cartao:
            r.cartao,

          parcelas:
            r.parcelas,

          parcelaAtual:
            1,

          recorrenteId:
            r.id,

          observacao:
            r.observacao
        });

        criados++;
      }
    }
  );

  return {
    ok: true,
    criados: criados
  };
}


/* =====================================================
   OBJETIVOS
   ===================================================== */

function listarObjetivos() {

  const usuario =
    exigirUsuario_();

  const objetivos =
    getSheetData_(
      SHEETS.OBJETIVOS
    )
    .filter(
      x =>
        podeVerEscopo_(
          usuario,
          String(
            x.Escopo || ''
          )
        )
    );

  const aportes =
    getSheetData_(
      SHEETS.APORTES
    );

  return objetivos.map(
    x => {

      const total =
        aportes
          .filter(
            a =>
              a['Objetivo ID'] ===
                x.ID &&
              podeVerEscopo_(
                usuario,
                String(
                  a.Escopo || ''
                )
              )
          )
          .reduce(
            (s, a) =>
              s +
              Number(
                a.Valor || 0
              ),
            0
          );

      const meta =
        Number(
          x.Meta || 0
        );

      const guardado =
        Number(
          x['Valor Inicial'] ||
            0
        ) + total;

      return {

        id: x.ID,

        nome: x.Nome,

        meta: meta,

        valorInicial:
          Number(
            x['Valor Inicial'] ||
              0
          ),

        guardado:
          guardado,

        falta:
          Math.max(
            meta -
              guardado,
            0
          ),

        percentual:
          meta > 0
            ? Math.min(
                guardado /
                  meta *
                  100,
                100
              )
            : 0,

        dataCriacao:
          iso_(
            x['Data Criação']
          ),

        prazo:
          x.Prazo
            ? iso_(x.Prazo)
            : '',

        prioridade:
          x.Prioridade ||
          'Média',

        ativo:
          String(
            x.Ativo || 'SIM'
          ) === 'SIM',

        observacao:
          x.Observação,

        escopo:
          x.Escopo
      };
    }
  );
}


function salvarObjetivo(
  dados
) {

  const usuario =
    exigirUsuario_();

  const escopo =
    String(
      dados.escopo ||
      usuario.nome
    );

  exigirPermissaoEdicaoEscopo_(
    usuario,
    escopo
  );

  if (!dados.nome) {

    throw new Error(
      'Informe o nome do objetivo.'
    );
  }

  if (
    numero_(dados.meta) <= 0
  ) {

    throw new Error(
      'Informe uma meta maior que zero.'
    );
  }

  const sh =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        SHEETS.OBJETIVOS
      );

  const id =
    dados.id ||
    novoId_('OBJ');

  const linha = [

    id,

    dados.nome,

    numero_(dados.meta),

    numero_(
      dados.valorInicial ||
        0
    ),

    dados.id
      ? data_(
          dados.dataCriacao ||
            new Date()
        )
      : new Date(),

    dados.prazo
      ? data_(dados.prazo)
      : '',

    dados.prioridade ||
      'Média',

    dados.ativo === false
      ? 'NÃO'
      : 'SIM',

    dados.observacao ||
      '',

    escopo,

    usuario.email
  ];

  if (dados.id) {

    const row =
      encontrarLinhaPorId_(
        sh,
        id
      );

    if (!row) {

      throw new Error(
        'Objetivo não encontrado.'
      );
    }

    sh
      .getRange(
        row,
        1,
        1,
        linha.length
      )
      .setValues([
        linha
      ]);

  } else {

    sh.appendRow(
      linha
    );
  }

  return {
    ok: true,
    id: id
  };
}


function adicionarAporte(
  dados
) {

  const usuario =
    exigirUsuario_();

  if (!dados.objetivoId) {

    throw new Error(
      'Objetivo não informado.'
    );
  }

  if (
    numero_(dados.valor) <= 0
  ) {

    throw new Error(
      'Informe um valor maior que zero.'
    );
  }

  const obj =
    listarObjetivos()
      .find(
        o =>
          o.id ===
          dados.objetivoId
      );

  if (!obj) {

    throw new Error(
      'Objetivo não encontrado.'
    );
  }

  exigirPermissaoEdicaoEscopo_(
    usuario,
    obj.escopo
  );

  SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(
      SHEETS.APORTES
    )
    .appendRow([

      novoId_('APO'),

      dados.objetivoId,

      data_(
        dados.data ||
          new Date()
      ),

      numero_(
        dados.valor
      ),

      dados.observacao ||
        '',

      obj.escopo,

      usuario.email
    ]);

  return {
    ok: true
  };
}


function excluirObjetivo(
  id
) {

  const usuario =
    exigirUsuario_();

  const sh =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        SHEETS.OBJETIVOS
      );

  const row =
    encontrarLinhaPorId_(
      sh,
      id
    );

  if (!row) {

    throw new Error(
      'Objetivo não encontrado.'
    );
  }

  exigirPermissaoEdicaoEscopo_(
    usuario,
    String(
      sh
        .getRange(
          row,
          10
        )
        .getValue() ||
      ''
    )
  );

  sh.deleteRow(row);

  return {
    ok: true
  };
}


/* =====================================================
   CONTAS
   ===================================================== */

function listarContasVisiveis() {

  const usuario =
    exigirUsuario_();

  return getSheetData_(
    SHEETS.CONTAS
  )
  .filter(
    x =>
      String(
        x.Ativa || 'SIM'
      ) === 'SIM' &&
      podeVerEscopo_(
        usuario,
        String(
          x.Escopo || ''
        )
      )
  )
  .map(
    x => ({

      id: x.ID,

      banco: x.Banco,

      nome: x.Nome,

      tipo: x.Tipo,

      saldoInicial:
        Number(
          x['Saldo Inicial'] ||
            0
        ),

      escopo:
        x.Escopo,

      ativa: true
    })
  );
}


function listarContas() {

  return listarContasVisiveis();
}


function salvarConta(
  dados
) {

  const usuario =
    exigirUsuario_();

  const escopo =
    String(
      dados.escopo ||
      usuario.nome
    );

  exigirPermissaoEdicaoEscopo_(
    usuario,
    escopo
  );

  if (!dados.nome) {

    throw new Error(
      'Informe o nome da conta.'
    );
  }

  const sh =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        SHEETS.CONTAS
      );

  const id =
    dados.id ||
    novoId_('CON');

  const linha = [

    id,

    dados.banco ||
      'Outros',

    dados.nome,

    dados.tipo ||
      'CONTA',

    numero_(
      dados.saldoInicial ||
        0
    ),

    escopo,

    dados.ativa === false
      ? 'NÃO'
      : 'SIM',

    usuario.email
  ];

  if (dados.id) {

    const row =
      encontrarLinhaPorId_(
        sh,
        id
      );

    if (!row) {

      throw new Error(
        'Conta não encontrada.'
      );
    }

    sh
      .getRange(
        row,
        1,
        1,
        linha.length
      )
      .setValues([
        linha
      ]);

  } else {

    sh.appendRow(
      linha
    );
  }

  return {
    ok: true,
    id: id
  };
}


/* =====================================================
   CATEGORIAS
   ===================================================== */

function listarCategorias() {

  return getSheetData_(
    SHEETS.CATEGORIAS
  )
  .filter(
    x =>
      String(
        x.Ativa || 'SIM'
      ) === 'SIM'
  )
  .map(
    x => ({

      id: x.ID,

      nome: x.Nome,

      tipo: x.Tipo
    })
  );
}


function salvarCategoria(
  dados
) {

  if (!dados.nome) {

    throw new Error(
      'Informe o nome da categoria.'
    );
  }

  const sh =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        SHEETS.CATEGORIAS
      );

  sh.appendRow([
    novoId_('CAT'),
    dados.nome,
    dados.tipo ||
      'DESPESA',
    'SIM'
  ]);

  return {
    ok: true
  };
}


/* =====================================================
   DASHBOARD
   ===================================================== */

function obterDashboard(
  inicio,
  fim,
  escopo
) {

  const usuario =
    exigirUsuario_();

  escopo =
    String(
      escopo ||
      usuario.nome
    );

  if (
    !podeVerEscopo_(
      usuario,
      escopo
    )
  ) {

    throw new Error(
      'Você não tem acesso a este espaço.'
    );
  }

  const lancamentos =
    listarLancamentos({

      inicio:
        inicio || '',

      fim:
        fim || '',

      escopo:
        escopo
    });

  const receitas =
    lancamentos
      .filter(
        x =>
          x.tipo ===
          'RECEITA'
      )
      .reduce(
        (s, x) =>
          s + x.valor,
        0
      );

  const despesas =
    lancamentos
      .filter(
        x =>
          x.tipo ===
          'DESPESA'
      )
      .reduce(
        (s, x) =>
          s + x.valor,
        0
      );

  const porCategoria = {};

  lancamentos
    .filter(
      x =>
        x.tipo ===
        'DESPESA'
    )
    .forEach(
      x => {

        porCategoria[
          x.categoria
        ] =
          (
            porCategoria[
              x.categoria
            ] || 0
          ) + x.valor;
      }
    );

  return {

    ok: true,

    receitas:
      receitas,

    despesas:
      despesas,

    resultado:
      receitas -
      despesas,

    categorias:
      Object.keys(
        porCategoria
      )
      .map(
        k => ({
          categoria: k,
          valor:
            porCategoria[k]
        })
      )
      .sort(
        (a, b) =>
          b.valor -
          a.valor
      ),

    maiores:
      lancamentos
        .filter(
          x =>
            x.tipo ===
            'DESPESA'
        )
        .sort(
          (a, b) =>
            b.valor -
            a.valor
        )
        .slice(0, 8),

    objetivos:
      listarObjetivos()
        .filter(
          o =>
            o.ativo &&
            o.escopo ===
              escopo
        ),

    contas:
      calcularSaldosContas_(
        lancamentos,
        escopo
      ),

    totalLancamentos:
      lancamentos.length
  };
}


function calcularSaldosContas_(
  lancamentos,
  escopo
) {

  const contas =
    listarContasVisiveis()
      .filter(
        c =>
          c.escopo ===
          escopo
      );

  return contas.map(
    c => {

      const movimentos =
        lancamentos
          .filter(
            l =>
              l.conta ===
              c.nome
          )
          .reduce(
            (s, l) =>
              s +
              (
                l.tipo ===
                'RECEITA'
                  ? l.valor
                  : -l.valor
              ),
            0
          );

      return {

        id: c.id,

        banco: c.banco,

        nome: c.nome,

        saldo:
          c.saldoInicial +
          movimentos
      };
    }
  );
}


/* =====================================================
   RELATÓRIOS
   ===================================================== */

function obterRelatorio(
  inicio,
  fim,
  escopo
) {

  const usuario =
    exigirUsuario_();

  escopo =
    String(
      escopo ||
      usuario.nome
    );

  if (
    !podeVerEscopo_(
      usuario,
      escopo
    )
  ) {

    throw new Error(
      'Você não tem acesso a este espaço.'
    );
  }

  const lancamentos =
    listarLancamentos({

      inicio:
        inicio || '',

      fim:
        fim || '',

      escopo:
        escopo
    });

  const despesas =
    lancamentos.filter(
      x =>
        x.tipo ===
        'DESPESA'
    );

  const receitas =
    lancamentos.filter(
      x =>
        x.tipo ===
        'RECEITA'
    );

  const agrupar =
    (
      arr,
      campo
    ) => {

      const o = {};

      arr.forEach(
        x => {

          const chave =
            x[campo] ||
            'Não informado';

          o[chave] =
            (
              o[chave] ||
              0
            ) +
            Number(
              x.valor || 0
            );
        }
      );

      return Object.keys(o)
        .map(
          k => ({
            nome: k,
            valor: o[k]
          })
        )
        .sort(
          (a, b) =>
            b.valor -
            a.valor
        );
    };

  return {

    ok: true,

    receitas:
      receitas.reduce(
        (s, x) =>
          s + x.valor,
        0
      ),

    despesas:
      despesas.reduce(
        (s, x) =>
          s + x.valor,
        0
      ),

    saldo:
      receitas.reduce(
        (s, x) =>
          s + x.valor,
        0
      ) -
      despesas.reduce(
        (s, x) =>
          s + x.valor,
        0
      ),

    porCategoria:
      agrupar(
        despesas,
        'categoria'
      ),

    porForma:
      agrupar(
        despesas,
        'formaPagamento'
      ),

    maiores:
      despesas
        .sort(
          (a, b) =>
            b.valor -
            a.valor
        )
        .slice(0, 20)
  };
}


/* =====================================================
   COMPROMISSOS
   ===================================================== */

function obterCompromissos(
  inicio,
  fim,
  escopo
) {

  return listarLancamentos({

    inicio:
      inicio || '',

    fim:
      fim || '',

    escopo:
      escopo || ''
  })
  .filter(
    x =>
      x.tipo ===
      'DESPESA'
  );
}