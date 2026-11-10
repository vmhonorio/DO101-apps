# Jornal de Matinhos

Jornal digital da cidade de Matinhos (PR) para publicar serviços, classificados,
vagas de emprego, avisos urgentes e promoções do comércio local, no estilo dos
anúncios divulgados pelo Comunica Matinhos.

## Funcionalidades

- Página principal com os anúncios organizados em cartões, com filtro por
  categoria e busca por texto (empresa, serviço, bairro).
- Anúncios urgentes (animal perdido, emergências) e destaques aparecem primeiro.
- Botão de WhatsApp com mensagem pronta ("Olá! Vi no Jornal de Matinhos...") e
  link para o Instagram do anunciante.
- Formulário para publicar novos anúncios, com validação no servidor.
- API JSON para integrar com outros sistemas.

## Categorias

Avisos e Urgências, Compra e Venda, Empregos, Serviços, Alimentação, Saúde,
Beleza, Pets, Automotivo, Transporte e Entregas, Imóveis e Eventos.

## Como executar

```bash
npm install
npm start
```

A aplicação sobe na porta `8080` (ou na porta definida em `PORT`).
Abra `http://localhost:8080`.

Para rodar os testes:

```bash
npm test
```

## API

| Método | Rota                      | Descrição                                            |
| ------ | ------------------------- | ---------------------------------------------------- |
| GET    | `/health`                 | Estado da aplicação e quantidade de anúncios         |
| GET    | `/api/categorias`         | Categorias com a quantidade de anúncios em cada uma  |
| GET    | `/api/anuncios`           | Lista de anúncios. Filtros: `?categoria=pets&q=banho` |
| GET    | `/api/anuncios/:id`       | Um anúncio                                           |
| POST   | `/api/anuncios`           | Publica um anúncio (JSON)                            |
| DELETE | `/api/anuncios/:id`       | Remove um anúncio                                    |

Exemplo de publicação:

```bash
curl -X POST http://localhost:8080/api/anuncios \
  -H 'Content-Type: application/json' \
  -d '{"categoria":"empregos","titulo":"Vaga de atendente","empresa":"Padaria do Centro","descricao":"Vaga para atendente de balcão, período da manhã.","bairro":"Centro","whatsapp":"41999990000","instagram":"@padariadocentro"}'
```

## Deploy no OpenShift

A pasta inclui um `Dockerfile` baseado na imagem `ubi9/nodejs-22-minimal`,
preparado para rodar com UID arbitrário (padrão do OpenShift), expondo a porta
`8080` e gravando os anúncios em `/opt/app-root/data` (`DATA_DIR`).

### Opção 1: build direto do repositório Git (estratégia Docker)

```bash
oc new-app https://github.com/vmhonorio/DO101-apps \
  --context-dir=matinhos-jornal \
  --strategy=docker \
  --name=matinhos-jornal
oc expose service matinhos-jornal
oc get route matinhos-jornal
```

### Opção 2: build local e push para um registro

```bash
cd matinhos-jornal
podman build -t quay.io/SEU_USUARIO/matinhos-jornal:1.0 .
podman push quay.io/SEU_USUARIO/matinhos-jornal:1.0
oc new-app quay.io/SEU_USUARIO/matinhos-jornal:1.0 --name=matinhos-jornal
oc expose service matinhos-jornal
```

### Persistência e probes

Para manter os anúncios publicados entre reinícios do pod, monte um volume em
`/opt/app-root/data`:

```bash
oc set volume deployment/matinhos-jornal --add --name=dados \
  --type=pvc --claim-size=1Gi --mount-path=/opt/app-root/data
```

Para as probes de disponibilidade, use a rota `/health`:

```bash
oc set probe deployment/matinhos-jornal --readiness --liveness \
  --get-url=http://:8080/health
```

## Dados

Os anúncios iniciais ficam em `data/anuncios.json`. Novos anúncios são salvos em
`data/anuncios.runtime.json` (ou no diretório definido em `DATA_DIR`). Se o
sistema de arquivos for somente leitura, como em alguns contêineres, os anúncios
novos ficam em memória até o reinício. No OpenShift, monte um volume em
`DATA_DIR` para manter os anúncios entre reinícios.
