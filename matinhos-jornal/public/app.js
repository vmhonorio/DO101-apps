// Front-end do Jornal de Matinhos: carrega categorias e anúncios da API e trata o formulário.
(function () {
  var estado = { categoria: '', busca: '', categorias: [] };

  var $ = function (id) { return document.getElementById(id); };

  function escapar(texto) {
    return String(texto == null ? '' : texto).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatarTelefone(numero) {
    var n = String(numero || '').replace(/\D/g, '');
    if (n.length === 11) return '(' + n.slice(0, 2) + ') ' + n.slice(2, 7) + '-' + n.slice(7);
    if (n.length === 10) return '(' + n.slice(0, 2) + ') ' + n.slice(2, 6) + '-' + n.slice(6);
    return n;
  }

  function linkWhatsapp(numero, titulo) {
    var n = String(numero || '').replace(/\D/g, '');
    if (n && n.indexOf('55') !== 0) n = '55' + n;
    var msg = encodeURIComponent('Olá! Vi no Jornal de Matinhos: ' + titulo);
    return 'https://wa.me/' + n + '?text=' + msg;
  }

  function formatarData(iso) {
    if (!iso) return '';
    var partes = iso.split('-');
    return partes[2] + '/' + partes[1] + '/' + partes[0];
  }

  function categoriaPorId(id) {
    return estado.categorias.find(function (c) { return c.id === id; }) || { nome: id, icone: '' };
  }

  function renderCard(a) {
    var cat = categoriaPorId(a.categoria);
    var contatos = '';
    if (a.whatsapp) {
      contatos += '<a class="btn-zap" target="_blank" rel="noopener" href="' + linkWhatsapp(a.whatsapp, a.titulo) + '">💬 ' + escapar(formatarTelefone(a.whatsapp)) + '</a>';
    }
    if (a.whatsapp2) {
      contatos += '<a class="btn-zap" target="_blank" rel="noopener" href="' + linkWhatsapp(a.whatsapp2, a.titulo) + '">💬 ' + escapar(formatarTelefone(a.whatsapp2)) + '</a>';
    }
    if (a.instagram) {
      contatos += '<a class="btn-insta" target="_blank" rel="noopener" href="https://instagram.com/' + encodeURIComponent(a.instagram) + '">📷 @' + escapar(a.instagram) + '</a>';
    }

    var classes = 'card' + (a.urgente ? ' urgente' : '') + (a.destaque ? ' destaque' : '');
    return '<article class="' + classes + '">' +
      '<div class="card-topo"><span class="card-categoria">' + escapar(cat.icone + ' ' + cat.nome) + '</span>' +
      (a.urgente ? '<span class="selo">Urgente</span>' : '') + '</div>' +
      '<h3>' + escapar(a.titulo) + '</h3>' +
      (a.empresa ? '<p class="card-empresa">' + escapar(a.empresa) + '</p>' : '') +
      '<p class="card-descricao">' + escapar(a.descricao) + '</p>' +
      (a.preco ? '<p class="card-preco">' + escapar(a.preco) + '</p>' : '') +
      (a.endereco || a.bairro ? '<p class="card-local">📍 ' + escapar(a.endereco || a.bairro) + '</p>' : '') +
      '<div class="card-contato">' + contatos + '</div>' +
      '<span class="card-data">' + escapar(formatarData(a.publicadoEm)) + '</span>' +
      '</article>';
  }

  function carregarAnuncios() {
    var params = [];
    if (estado.categoria) params.push('categoria=' + encodeURIComponent(estado.categoria));
    if (estado.busca) params.push('q=' + encodeURIComponent(estado.busca));
    return fetch('/api/anuncios' + (params.length ? '?' + params.join('&') : ''))
      .then(function (r) { return r.json(); })
      .then(function (lista) {
        $('lista').innerHTML = lista.map(renderCard).join('');
        $('vazio').hidden = lista.length > 0;
        $('contador').textContent = lista.length + (lista.length === 1 ? ' anúncio' : ' anúncios');
        $('titulo-lista').textContent = estado.categoria
          ? categoriaPorId(estado.categoria).nome
          : 'Todos os anúncios';
      });
  }

  function renderCategorias() {
    var html = '<button class="chip' + (estado.categoria ? '' : ' ativo') + '" data-id="">Todos</button>';
    estado.categorias.forEach(function (c) {
      html += '<button class="chip' + (estado.categoria === c.id ? ' ativo' : '') + '" data-id="' + c.id + '">' +
        escapar(c.icone + ' ' + c.nome) + '<small>' + c.total + '</small></button>';
    });
    $('categorias').innerHTML = html;

    var select = $('f-categoria');
    select.innerHTML = '<option value="">Escolha uma categoria</option>' + estado.categorias.map(function (c) {
      return '<option value="' + c.id + '">' + escapar(c.icone + ' ' + c.nome) + '</option>';
    }).join('');
  }

  function carregarCategorias() {
    return fetch('/api/categorias')
      .then(function (r) { return r.json(); })
      .then(function (categorias) {
        estado.categorias = categorias;
        renderCategorias();
      });
  }

  $('categorias').addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    estado.categoria = chip.getAttribute('data-id');
    renderCategorias();
    carregarAnuncios();
  });

  var debounce;
  $('busca').addEventListener('input', function (e) {
    clearTimeout(debounce);
    debounce = setTimeout(function () {
      estado.busca = e.target.value.trim();
      carregarAnuncios();
    }, 250);
  });

  $('form-anuncio').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    var msg = $('form-msg');
    var dados = {
      categoria: form.categoria.value,
      titulo: form.titulo.value,
      empresa: form.empresa.value,
      descricao: form.descricao.value,
      preco: form.preco.value,
      bairro: form.bairro.value,
      endereco: form.endereco.value,
      whatsapp: form.whatsapp.value,
      instagram: form.instagram.value,
      urgente: form.urgente.checked
    };
    msg.className = 'form-msg';
    msg.textContent = 'Publicando...';

    fetch('/api/anuncios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados)
    })
      .then(function (r) { return r.json().then(function (corpo) { return { ok: r.ok, corpo: corpo }; }); })
      .then(function (resp) {
        if (!resp.ok) {
          msg.className = 'form-msg erro';
          msg.textContent = (resp.corpo.erros || ['Não foi possível publicar.']).join(' ');
          return;
        }
        msg.className = 'form-msg sucesso';
        msg.textContent = 'Anúncio publicado com sucesso!';
        form.reset();
        estado.categoria = '';
        estado.busca = '';
        $('busca').value = '';
        carregarCategorias().then(carregarAnuncios).then(function () {
          document.getElementById('anuncios').scrollIntoView({ behavior: 'smooth' });
        });
      })
      .catch(function () {
        msg.className = 'form-msg erro';
        msg.textContent = 'Erro de conexão. Tente novamente.';
      });
  });

  $('data-hoje').textContent = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  carregarCategorias().then(carregarAnuncios);
})();
