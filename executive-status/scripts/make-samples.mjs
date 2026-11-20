// Gera planilhas de TESTE (dados fictícios) no formato de exportação do Azure DevOps.
// Uso: node scripts/make-samples.mjs  → arquivos em samples/
// Os dados servem apenas para testar a aplicação; não representam nenhum projeto real.
import * as XLSX from 'xlsx';
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('samples', { recursive: true });
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const REF = new Date('2026-10-10T02:27:00');
const day = 86400000;
const fmt = (d) => (d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '');

const FRENTES = {
  'Cadastro': ['Débitos Técnicos', 'Acessar serviço de cadastro', 'Dados pessoais', 'Endereço', 'Contato', 'Saúde', 'Responsável financeiro', 'Acompanhar solicitação'],
  'Protocolos': ['Categorias de protocolo', 'Criar protocolo', 'Pagar taxa', 'Acompanhar solicitações', 'Interação com solicitações', 'Notificações', 'UX Protocolos'],
  'CRM Core': ['Treinamento e homologações', 'Layout de objetos', 'Renderizar documentos', 'Contas legadas', 'Governança do CRM', 'Console de atendimento', 'Anexos no console'],
  'Plataforma e Dados': ['Carga de dados', 'Observabilidade', 'DevOps', 'Ambiente de produção'],
  'Base Estrutural': ['Arquitetura', 'Barramento', 'Conteúdo técnico transversal', 'Definições de QA', 'Gestão do projeto', 'Licenças', 'Segurança e LGPD', 'Validador'],
};
const PEOPLE = ['Ana Souza', 'Bruno Lima', 'Carla Dias', 'Diego Rocha', 'Elisa Prado', 'Fábio Nunes', 'Gabi Torres', 'Hugo Melo', ''];
// estados do processo customizado, com a macro "posição" (0 = início, 1 = fim)
const FLOW = ['New', 'Escrita', 'UX', 'Backlog para Refinamento', 'Em Ref. Técnico', 'Pronto para Desenvolvimento', 'Em desenvolvimento', 'Code Review', 'Aguardando Deploy QA', 'Para QA', 'Para Testar', 'Em Testes (QA)', 'Aguardando Deploy UAT', 'Para UAT', 'Em Homolog (UAT)', 'Para PROD'];
const BUGFLOW = ['New', 'Em desenvolvimento', 'Para Testar', 'Em Testes (QA)', 'Em Homolog (UAT)'];

let nextId = 1000;
const rows = [];
const sprintStart = (n) => new Date(Date.UTC(2026, 2, 2) + (n - 1) * 14 * day);

for (const [frente, epics] of Object.entries(FRENTES)) {
  for (const epicTitle of epics) {
    const maturity = rnd();
    const epicId = nextId++;
    const target = rnd() < 0.25 ? new Date(2026, 9 + Math.floor(rnd() * 3), 1 + Math.floor(rnd() * 27)) : null;
    rows.push({ id: epicId, type: 'Epic', title: epicTitle.toUpperCase(), state: maturity > 0.95 ? 'Done' : 'In Progress', area: `CRM\\${frente}`, parent: '', prio: 1 + Math.floor(rnd() * 3), target });
    const nFeat = 1 + Math.floor(rnd() * 4);
    for (let f = 0; f < nFeat; f++) {
      const featId = nextId++;
      rows.push({ id: featId, type: 'Feature', title: `${epicTitle} - parte ${f + 1}`, state: 'In Progress', area: `CRM\\${frente}`, parent: epicId });
      const nCards = Math.floor(rnd() * (frente === 'Cadastro' ? 22 : 12)) + 1;
      for (let c = 0; c < nCards; c++) {
        const isBug = rnd() < 0.3;
        const created = new Date(Date.UTC(2026, 2, 1) + rnd() * (REF - Date.UTC(2026, 2, 1)));
        let state;
        let closed = null;
        if (rnd() < maturity) {
          state = 'Done';
          closed = new Date(created.getTime() + rnd() * (REF - created));
        } else if (rnd() < 0.03) state = 'Bloqueado';
        else {
          const flow = isBug ? BUGFLOW : FLOW;
          const pos = Math.min(flow.length - 1, Math.floor(Math.pow(rnd(), 1 - maturity * 0.8) * flow.length));
          state = flow[pos];
        }
        const changed = closed ?? new Date(Math.max(created.getTime(), REF - rnd() * 110 * day));
        const tags = [];
        if (state !== 'Done' && rnd() < 0.03) tags.push('bloqueado');
        if (frente === 'Protocolos' && rnd() < 0.05) tags.push('fornecedor');
        rows.push({
          id: nextId++, type: isBug ? 'Bug' : 'Product Backlog Item', title: `${isBug ? 'Corrigir' : 'Implementar'} item ${c + 1} de ${epicTitle.toLowerCase()}`,
          state, area: `CRM\\${frente}`, parent: featId, prio: 1 + Math.floor(rnd() * 4), assigned: pick(PEOPLE), tags: tags.join('; '),
          created, changed, closed, severity: isBug ? pick(['2 - High', '3 - Medium', '3 - Medium', '1 - Critical', '4 - Low']) : '',
        });
      }
    }
  }
}
// cards sem vínculo
for (let i = 0; i < 25; i++) {
  const created = new Date(REF - rnd() * 120 * day);
  const done = rnd() < 0.45;
  rows.push({ id: nextId++, type: rnd() < 0.4 ? 'Bug' : 'Product Backlog Item', title: `Item avulso ${i + 1}`, state: done ? 'Done' : pick(FLOW), area: 'CRM', parent: '', prio: 2, assigned: pick(PEOPLE), created, changed: new Date(REF - rnd() * 40 * day), closed: done ? new Date(REF - rnd() * 40 * day) : null });
}

const iteration = (d) => {
  if (!d) return 'CRM';
  const n = Math.max(1, Math.floor((d - sprintStart(1)) / (14 * day)) + 1);
  return `CRM\\Sprint ${n}`;
};

// ---------------------------------------- 1) flat com Parent, cabeçalhos PT-BR, metadados no topo, 2 planilhas, 1 duplicado
const PT = ['ID', 'Tipo de Item de Trabalho', 'Título', 'Estado', 'Atribuído a', 'Caminho da Área', 'Caminho da Iteração', 'Prioridade', 'Pai', 'Marcas', 'Data de Criação', 'Data de Alteração', 'Data de Fechamento', 'Data Alvo', 'Severidade'];
const toPt = (r) => [r.id, r.type, r.title, r.state, r.assigned ? `${r.assigned} <${r.assigned.split(' ')[0].toLowerCase()}@exemplo.com>` : '', r.area, iteration(r.changed), r.prio ?? '', r.parent, r.tags ?? '', fmt(r.created), fmt(r.changed), fmt(r.closed), r.target ? fmt(r.target).slice(0, 10) : '', r.severity ?? ''];
function flatBook(list, refLabel) {
  const meta = [['Project: CRM (DADOS FICTÍCIOS DE TESTE)'], [`Query: Report Executivo — ${refLabel}`], []];
  const cont = list.filter((r) => r.type === 'Epic' || r.type === 'Feature');
  const cards = list.filter((r) => r.type !== 'Epic' && r.type !== 'Feature');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...meta, PT, ...cont.map(toPt)]), 'Epicos e Features');
  const half = Math.floor(cards.length / 2);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...meta, PT, ...cards.slice(0, half + 1).map(toPt)]), 'Cards A');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...meta, PT, ...cards.slice(half).map(toPt)]), 'Cards B'); // linha half duplicada
  return wb;
}
XLSX.writeFile(flatBook(rows, 'Sprint 16'), 'samples/crm-sprint16-flat-parent.xlsx');

// ---------------------------------------- 2) snapshot anterior (Sprint 15, consolidado em 26/09)
const PREV = new Date('2026-09-26T02:00:00');
const prevRows = rows
  .filter((r) => !r.created || r.created <= PREV)
  .map((r) => {
    const x = { ...r };
    if (x.closed && x.closed > PREV) {
      x.closed = null;
      x.state = rnd() < 0.6 ? 'Em Homolog (UAT)' : 'Em Testes (QA)';
      x.changed = new Date(PREV - rnd() * 20 * day);
    } else if (x.changed && x.changed > PREV && x.state !== 'Done') {
      const i = FLOW.indexOf(x.state);
      x.state = i > 0 ? FLOW[i - 1 - Math.floor(rnd() * Math.min(i, 3))] : x.state;
      x.changed = new Date(PREV - rnd() * 30 * day);
    }
    return x;
  });
XLSX.writeFile(flatBook(prevRows, 'Sprint 15'), 'samples/crm-sprint15-flat-parent.xlsx');

// ---------------------------------------- 3) query em árvore (Title 1/2/3), cabeçalhos EN, sem Parent, poucos campos
const tree = [['ID', 'Work Item Type', 'Title 1', 'Title 2', 'Title 3', 'State', 'Assigned To', 'Changed Date']];
const byParent = new Map();
for (const r of rows) {
  const k = r.parent || 'root';
  if (!byParent.has(k)) byParent.set(k, []);
  byParent.get(k).push(r);
}
const walk = (r, lvl) => {
  const t = ['', '', ''];
  t[lvl] = r.title;
  tree.push([r.id, r.type, ...t, r.state, r.assigned ?? '', r.changed ? r.changed.toISOString() : '']);
  for (const ch of byParent.get(r.id) ?? []) walk(ch, lvl + 1);
};
for (const r of rows.filter((x) => x.type === 'Epic').slice(0, 12)) walk(r, 0);
const wbt = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbt, XLSX.utils.aoa_to_sheet(tree), 'Tree');
XLSX.writeFile(wbt, 'samples/tree-query-en.xlsx');

// ---------------------------------------- 4) CSV mínimo (só campos obrigatórios, sem hierarquia), estados do processo Agile
const AG = ['New', 'Active', 'Resolved', 'Closed', 'Removed'];
const csv = [['ID', 'Work Item Type', 'Title', 'State'], ...Array.from({ length: 60 }, (_, i) => [5000 + i, i % 4 ? 'User Story' : 'Bug', `Story ${i}`, pick(AG)])];
writeFileSync('samples/minimal-agile.csv', csv.map((r) => r.join(',')).join('\n'));
console.log(`samples/: ${rows.length} itens (Sprint 16), ${prevRows.length} (Sprint 15), ${tree.length - 1} (árvore), 60 (csv)`);
