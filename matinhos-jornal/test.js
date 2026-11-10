// Testes simples da API (node test.js)
var assert = require('assert');
var http = require('http');
var app = require('./app');

var server = app.listen(0, function () {
  var base = 'http://127.0.0.1:' + server.address().port;

  function req(method, caminho, corpo) {
    return new Promise(function (resolve, reject) {
      var dados = corpo ? JSON.stringify(corpo) : null;
      var r = http.request(base + caminho, {
        method: method,
        headers: dados ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(dados) } : {}
      }, function (res) {
        var chunks = '';
        res.on('data', function (c) { chunks += c; });
        res.on('end', function () { resolve({ status: res.statusCode, body: JSON.parse(chunks || 'null') }); });
      });
      r.on('error', reject);
      if (dados) r.write(dados);
      r.end();
    });
  }

  (async function () {
    var saude = await req('GET', '/health');
    assert.strictEqual(saude.status, 200);
    assert.strictEqual(saude.body.status, 'ok');

    var cats = await req('GET', '/api/categorias');
    assert.ok(cats.body.length >= 10, 'deve listar categorias');

    var todos = await req('GET', '/api/anuncios');
    assert.ok(todos.body.length >= 12, 'deve carregar os anúncios iniciais');
    assert.strictEqual(todos.body[0].urgente, true, 'urgentes vêm primeiro');

    var pets = await req('GET', '/api/anuncios?categoria=pets');
    assert.ok(pets.body.every(function (a) { return a.categoria === 'pets'; }));

    var busca = await req('GET', '/api/anuncios?q=freio');
    assert.strictEqual(busca.body.length, 1);
    assert.strictEqual(busca.body[0].empresa, 'Casa do Freio Maringá');

    var invalido = await req('POST', '/api/anuncios', { titulo: 'x' });
    assert.strictEqual(invalido.status, 400);
    assert.ok(invalido.body.erros.length >= 3);

    var antes = todos.body.length;
    var criado = await req('POST', '/api/anuncios', {
      categoria: 'imoveis', titulo: 'Aluga-se kitnet em Caiobá',
      descricao: 'Kitnet mobiliada a duas quadras da praia.', whatsapp: '(41) 99999-0000', instagram: '@teste'
    });
    assert.strictEqual(criado.status, 201);
    assert.strictEqual(criado.body.anuncio.whatsapp, '41999990000');
    assert.strictEqual(criado.body.anuncio.instagram, 'teste');

    var depois = await req('GET', '/api/anuncios');
    assert.strictEqual(depois.body.length, antes + 1);

    var removido = await req('DELETE', '/api/anuncios/' + criado.body.anuncio.id);
    assert.strictEqual(removido.status, 200);

    var naoExiste = await req('GET', '/api/anuncios/99999');
    assert.strictEqual(naoExiste.status, 404);

    console.log('Todos os testes passaram.');
    server.close();
  })().catch(function (err) {
    console.error(err);
    server.close();
    process.exit(1);
  });
});
