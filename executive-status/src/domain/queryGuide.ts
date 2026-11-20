// Guia da query de extração no Azure Boards: quais colunas incluir e o que cada uma habilita no relatório.
import type { CanonicalField, ProjectConfig } from './types';

export type Need = 'Obrigatório' | 'Hierarquia' | 'Recomendado' | 'Opcional';

export interface FieldGuide {
  key: CanonicalField;
  /** nome da coluna no Azure DevOps em inglês e em português */
  en: string;
  pt: string;
  ref: string;
  need: Need;
  enables: string;
}

export const FIELD_GUIDE: FieldGuide[] = [
  { key: 'id', en: 'ID', pt: 'ID', ref: 'System.Id', need: 'Obrigatório', enables: 'Identifica cada card; elimina duplicados.' },
  { key: 'type', en: 'Work Item Type', pt: 'Tipo de Item de Trabalho', ref: 'System.WorkItemType', need: 'Obrigatório', enables: 'Separa Épicos, Features, PBIs e Bugs.' },
  { key: 'title', en: 'Title', pt: 'Título', ref: 'System.Title', need: 'Obrigatório', enables: 'Nome dos épicos/features na tabela e nos detalhes.' },
  { key: 'state', en: 'State', pt: 'Estado', ref: 'System.State', need: 'Obrigatório', enables: 'Todos os indicadores, a barra de status e as macroetapas.' },
  { key: 'parent', en: 'Parent', pt: 'Pai', ref: 'System.Parent', need: 'Hierarquia', enables: 'Liga PBIs/Bugs a Features e Épicos (análise por épico). Dispensável se a query for do tipo "Árvore de itens de trabalho".' },
  { key: 'areaPath', en: 'Area Path', pt: 'Caminho da Área', ref: 'System.AreaPath', need: 'Recomendado', enables: 'Agrupamento dos épicos por frente/equipe.' },
  { key: 'changedDate', en: 'Changed Date', pt: 'Data de Alteração', ref: 'System.ChangedDate', need: 'Recomendado', enables: 'Cards parados (fallback quando não houver State Change Date).' },
  { key: 'stateChangeDate', en: 'State Change Date', pt: 'Data de Alteração do Estado', ref: 'Microsoft.VSTS.Common.StateChangeDate', need: 'Recomendado', enables: 'Cards parados há mais de N dias (mais preciso que Changed Date).' },
  { key: 'closedDate', en: 'Closed Date', pt: 'Data de Fechamento', ref: 'Microsoft.VSTS.Common.ClosedDate', need: 'Recomendado', enables: 'Entregas por sprint, vazão e projeção da meta.' },
  { key: 'createdDate', en: 'Created Date', pt: 'Data de Criação', ref: 'System.CreatedDate', need: 'Recomendado', enables: 'Crescimento de escopo (criados x concluídos na sprint).' },
  { key: 'targetDate', en: 'Target Date', pt: 'Data de Destino', ref: 'Microsoft.VSTS.Scheduling.TargetDate', need: 'Recomendado', enables: 'Prazo de cada épico/feature (situação Crítico/atrasado).' },
  { key: 'tags', en: 'Tags', pt: 'Marcas', ref: 'System.Tags', need: 'Recomendado', enables: 'Bloqueios por tag e dependências externas.' },
  { key: 'assignedTo', en: 'Assigned To', pt: 'Atribuído a', ref: 'System.AssignedTo', need: 'Recomendado', enables: 'Filtro por responsável e concentração de trabalho.' },
  { key: 'iterationPath', en: 'Iteration Path', pt: 'Caminho da Iteração', ref: 'System.IterationPath', need: 'Opcional', enables: 'Sugestão do nome da sprint na importação; frente por iteração.' },
  { key: 'priority', en: 'Priority', pt: 'Prioridade', ref: 'Microsoft.VSTS.Common.Priority', need: 'Opcional', enables: 'Ordenação por prioridade; bugs prioridade 1 como risco.' },
  { key: 'severity', en: 'Severity', pt: 'Severidade', ref: 'Microsoft.VSTS.Common.Severity', need: 'Opcional', enables: 'Bugs críticos pendentes (quadro de riscos).' },
  { key: 'storyPoints', en: 'Story Points', pt: 'Pontos de História', ref: 'Microsoft.VSTS.Scheduling.StoryPoints', need: 'Opcional', enables: 'Guardado nos dados exportados (processo Agile).' },
  { key: 'effort', en: 'Effort', pt: 'Esforço', ref: 'Microsoft.VSTS.Scheduling.Effort', need: 'Opcional', enables: 'Guardado nos dados exportados (processo Scrum).' },
];

export const QUERY_STEPS = [
  'Em Boards > Consultas, crie uma Nova consulta.',
  'Tipo de consulta: "Lista simples de itens de trabalho" (incluindo a coluna Parent/Pai) ou "Árvore de itens de trabalho" (a hierarquia vem das colunas Title 1, Title 2…).',
  'Filtros: Projeto = @Project; Tipo de Item de Trabalho em Épico, Feature, Product Backlog Item (ou User Story) e Bug; opcionalmente Estado <> Removed e Caminho da Área sob o seu produto.',
  'Em Opções de coluna, adicione as colunas da tabela abaixo (no mínimo as obrigatórias; as recomendadas habilitam prazos, cards parados e entregas por sprint).',
  'Salve a consulta (ex.: "Report Executivo") em Consultas Compartilhadas para reutilizar a cada sprint.',
  'Execute e exporte: botão "…" > Exportar para CSV (ou Abrir no Excel). Importe o arquivo aqui.',
];

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** WIQL de referência, montado a partir dos tipos configurados no projeto. */
export function buildWiql(cfg: Pick<ProjectConfig, 'epicTypes' | 'featureTypes' | 'cardTypes'>, tree = false): string {
  const types = [...new Set([cfg.epicTypes[0], cfg.featureTypes[0], ...cfg.cardTypes.filter((t) => /^[\x20-\x7e]+$/.test(t))])].filter(Boolean);
  const cols = FIELD_GUIDE.filter((f) => f.need !== 'Opcional' || ['iterationPath', 'priority', 'severity'].includes(f.key))
    .filter((f) => !(tree && f.key === 'parent'))
    .map((f) => `[${f.ref}]`);
  const typeList = types.map(q).join(', ');
  if (tree)
    return `SELECT ${cols.join(', ')}
FROM WorkItemLinks
WHERE ([Source].[System.TeamProject] = @project AND [Source].[System.WorkItemType] IN (${typeList}) AND [Source].[System.State] <> 'Removed')
  AND ([System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward')
  AND ([Target].[System.WorkItemType] IN (${typeList}) AND [Target].[System.State] <> 'Removed')
MODE (Recursive)`;
  return `SELECT ${cols.join(', ')}
FROM WorkItems
WHERE [System.TeamProject] = @project
  AND [System.WorkItemType] IN (${typeList})
  AND [System.State] <> 'Removed'
ORDER BY [System.Id]`;
}

/** Linhas de exemplo (fictícias) para o modelo de planilha, uma por nível da hierarquia. */
export function templateRows(): Record<string, string | number>[] {
  const base = (id: number, type: string, title: string, state: string, parent: number | '', extra: Partial<Record<CanonicalField, string | number>> = {}) => {
    const r: Record<string, string | number> = {};
    for (const f of FIELD_GUIDE) r[f.en] = '';
    Object.assign(r, { ID: id, 'Work Item Type': type, Title: `EXEMPLO — ${title}`, State: state, Parent: parent });
    for (const [k, v] of Object.entries(extra)) r[FIELD_GUIDE.find((f) => f.key === k)!.en] = v;
    return r;
  };
  return [
    base(1001, 'Epic', 'Épico de exemplo', 'In Progress', '', { areaPath: 'Projeto\\Frente A', targetDate: '17/11/2026', priority: 1 }),
    base(1002, 'Feature', 'Feature de exemplo', 'In Progress', 1001, { areaPath: 'Projeto\\Frente A' }),
    base(1003, 'Product Backlog Item', 'PBI concluído', 'Done', 1002, { areaPath: 'Projeto\\Frente A', assignedTo: 'Nome Sobrenome', createdDate: '01/09/2026', changedDate: '02/10/2026', stateChangeDate: '02/10/2026', closedDate: '02/10/2026', iterationPath: 'Projeto\\Sprint 16', priority: 2 }),
    base(1004, 'Bug', 'Bug bloqueado', 'Bloqueado', 1002, { areaPath: 'Projeto\\Frente A', assignedTo: 'Nome Sobrenome', tags: 'bloqueado; fornecedor', createdDate: '15/09/2026', changedDate: '20/09/2026', stateChangeDate: '20/09/2026', severity: '2 - High', priority: 1 }),
  ];
}
