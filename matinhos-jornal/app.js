// Jornal de Matinhos - servidor Express
// Publica classificados, serviços, empregos e avisos da cidade de Matinhos (PR).

var express = require('express');
var fs = require('fs');
var path = require('path');

var app = express();
var PORT = process.env.PORT || 8080;

// Dados iniciais (versionados) e arquivo de persistência (opcional).
var SEED_FILE = path.join(__dirname, 'data', 'anuncios.json');
var DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
var DATA_FILE = path.join(DATA_DIR, 'anuncios.runtime.json');

var CATEGORIAS = [
  { id: 'avisos', nome: 'Avisos e Urgências', icone: '📢' },
  { id: 'classificados', nome: 'Compra e Venda', icone: '🏷️' },
  { id: 'empregos', nome: 'Empregos', icone: '💼' },
  { id: 'servicos', nome: 'Serviços', icone: '🛠️' },
  { id: 'alimentacao', nome: 'Alimentação', icone: '🍽️' },
  { id: 'saude', nome: 'Saúde', icone: '🩺' },
  { id: 'beleza', nome: 'Beleza', icone: '💇' },
  { id: 'pets', nome: 'Pets', icone: '🐾' },
  { id: 'automotivo', nome: 'Automotivo', icone: '🚗' },
  { id: 'transporte', nome: 'Transporte e Entregas', icone: '📦' },
  { id: 'imoveis', nome: 'Imóveis', icone: '🏠' },
  { id: 'eventos', nome: 'Eventos', icone: '🎉' }
];

var categoriaIds = CATEGORIAS.map(function (c) { return c.id; });

function carregarAnuncios() {
  // Se existir um arquivo salvo em runtime, ele tem prioridade sobre os dados iniciais.
  if (fs.existsSync(DATA_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (err) {
      console.error('Não foi possível ler ' + DATA_FILE + ', usando dados iniciais.', err.message);
    }
  }
  return JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
}

var anuncios = carregarAnuncios();

function salvarAnuncios() {
  // Em contêineres o sistema de arquivos pode ser somente leitura; nesse caso
  // os anúncios ficam apenas em memória até o pod reiniciar.
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(anuncios, null, 2));
    return true;
  } catch (err) {
    console.warn('Não foi possível salvar em ' + DATA_FILE + ': ' + err.message);
    return false;
  }
}

function proximoId() {
  return anuncios.reduce(function (max, a) { return Math.max(max, a.id); }, 0) + 1;
}

function somenteDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function texto(valor, max) {
  return String(valor || '').trim().slice(0, max || 500);
}

function validarAnuncio(corpo) {
  var erros = [];
  var titulo = texto(corpo.titulo, 120);
  var descricao = texto(corpo.descricao, 1000);
  var categoria = texto(corpo.categoria, 40);
  var whatsapp = somenteDigitos(corpo.whatsapp);
  var instagram = texto(corpo.instagram, 60).replace(/^@/, '');

  if (titulo.length < 5) erros.push('Informe um título com pelo menos 5 caracteres.');
  if (descricao.length < 10) erros.push('Informe uma descrição com pelo menos 10 caracteres.');
  if (categoriaIds.indexOf(categoria) === -1) erros.push('Categoria inválida.');
  if (!whatsapp && !instagram) erros.push('Informe um WhatsApp ou um Instagram para contato.');
  if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 13)) erros.push('WhatsApp inválido. Use DDD + número, por exemplo 41999990000.');

  return {
    erros: erros,
    anuncio: {
      categoria: categoria,
      titulo: titulo,
      empresa: texto(corpo.empresa, 120),
      descricao: descricao,
      preco: texto(corpo.preco, 40),
      bairro: texto(corpo.bairro, 60),
      endereco: texto(corpo.endereco, 160),
      whatsapp: whatsapp,
      instagram: instagram,
      urgente: corpo.urgente === true || corpo.urgente === 'true' || corpo.urgente === 'on',
      destaque: false,
      publicadoEm: new Date().toISOString().slice(0, 10)
    }
  };
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', function (req, res) {
  res.json({ status: 'ok', anuncios: anuncios.length });
});

app.get('/api/categorias', function (req, res) {
  var contagem = {};
  anuncios.forEach(function (a) { contagem[a.categoria] = (contagem[a.categoria] || 0) + 1; });
  res.json(CATEGORIAS.map(function (c) {
    return { id: c.id, nome: c.nome, icone: c.icone, total: contagem[c.id] || 0 };
  }));
});

app.get('/api/anuncios', function (req, res) {
  var lista = anuncios.slice();
  var categoria = req.query.categoria;
  var busca = (req.query.q || '').toLowerCase();

  if (categoria) lista = lista.filter(function (a) { return a.categoria === categoria; });
  if (busca) {
    lista = lista.filter(function (a) {
      return [a.titulo, a.empresa, a.descricao, a.bairro, a.endereco]
        .join(' ').toLowerCase().indexOf(busca) !== -1;
    });
  }

  // Urgentes primeiro, depois destaques, depois os mais recentes.
  lista.sort(function (a, b) {
    if (a.urgente !== b.urgente) return a.urgente ? -1 : 1;
    if (a.destaque !== b.destaque) return a.destaque ? -1 : 1;
    if (a.publicadoEm !== b.publicadoEm) return a.publicadoEm < b.publicadoEm ? 1 : -1;
    return b.id - a.id;
  });

  res.json(lista);
});

app.get('/api/anuncios/:id', function (req, res) {
  var anuncio = anuncios.find(function (a) { return a.id === Number(req.params.id); });
  if (!anuncio) return res.status(404).json({ erro: 'Anúncio não encontrado.' });
  res.json(anuncio);
});

app.post('/api/anuncios', function (req, res) {
  var resultado = validarAnuncio(req.body || {});
  if (resultado.erros.length) return res.status(400).json({ erros: resultado.erros });

  var anuncio = resultado.anuncio;
  anuncio.id = proximoId();
  anuncios.push(anuncio);
  var persistido = salvarAnuncios();
  res.status(201).json({ anuncio: anuncio, persistido: persistido });
});

app.delete('/api/anuncios/:id', function (req, res) {
  var indice = anuncios.findIndex(function (a) { return a.id === Number(req.params.id); });
  if (indice === -1) return res.status(404).json({ erro: 'Anúncio não encontrado.' });
  var removido = anuncios.splice(indice, 1)[0];
  salvarAnuncios();
  res.json({ removido: removido });
});

app.use(function (req, res) {
  res.status(404).json({ erro: 'Rota não encontrada.' });
});

if (require.main === module) {
  app.listen(PORT, function () {
    console.log('Jornal de Matinhos rodando na porta ' + PORT + ' com ' + anuncios.length + ' anúncios.');
  });
}

module.exports = app;
