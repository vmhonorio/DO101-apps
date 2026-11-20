# EXECUTIVE STATUS — Análise, arquitetura e regras

## 1. Análise da imagem de referência

A referência é um **slide executivo 16:9 de alta densidade**, não um dashboard. Lido de cima para baixo:

| Faixa | Conteúdo | Observações para a implementação |
|---|---|---|
| Cabeçalho azul-marinho | Título, projeto, origem dos dados, período (sprint atual e anterior), data da consulta, **saúde geral** à direita | A saúde precisa vir com a justificativa (na referência: "meta 17/11, UAT e bloqueios"). Aqui ela é calculada por regras e as regras disparadas são exibidas. |
| 6 cards de KPI | Features, Total, Concluídos, Em andamento, Aguardando etapa, Bloqueados | As 4 últimas categorias são **mutuamente exclusivas** (367+178+251+10 = 806). "Tag bloqueado" é mostrada *à parte*, sem somar. Cada card tem número, % e um subtítulo de decomposição/comparação. |
| Distribuição por status | Barra segmentada por **estado real**, colorida pela **macroetapa**; legenda de macroetapas em cima e de estados embaixo; nota de mapeamento | Duas camadas: estado (granular) → macroetapa (cor). A nota da referência mostra que o mapeamento é explícito. |
| Análise por Épico/Feature | Tabela em **duas colunas**, agrupada por frente (com totais por grupo), barra por macroetapa por linha, situação; resumo "Situação dos N épicos" | Grupos podem quebrar entre colunas ("SALESFORCE (CONT.)"). "Sem vínculo" é um grupo próprio. Rodapé documenta as regras de situação. |
| 3 quadros | Avanços (verde), Atenção (laranja), Riscos (vermelho, com selo de nível) | Cada item tem número. Riscos trazem nível + ação. |
| Faixa final | Leitura executiva + fonte e transparência ("indicadores = dados; análise = IA") | Separação explícita entre dado e interpretação. |

## 2. Arquitetura

```
┌──────────────── UI (React + Tailwind, componentes estilo shadcn) ────────────────┐
│ pages/ImportPage  pages/ReportPage  pages/HistoryPage  pages/ConfigPage          │
│ ui/report/ExecutiveReport (canvas 1920 px)  ui/report/DrillDown                  │
└───────────────┬──────────────────────────────────────────────┬──────────────────┘
                │ store.tsx (contexto: projeto, snapshots, config)│
┌───────────────▼──────────── Domínio (TypeScript puro, testado) ▼──────────────────┐
│ fieldMapping  → detecção de cabeçalho e sinônimos EN/PT-BR                        │
│ parse         → normalização, validação, árvore Title N, consolidação/duplicados  │
│ config        → configuração padrão + heurística de estados (só sugestão)         │
│ metrics       → hierarquia, categorias, KPIs, grupos, situação, períodos, saúde   │
│ insights      → avanços / atenção / riscos / leitura (regras + evidência)         │
└───────────────┬───────────────────────────────────────────────────────────────────┘
┌───────────────▼──────────── Dados ────────────────────────────────────────────────┐
│ data/excel (SheetJS)  data/repository (IndexedDB, interface Repository)           │
│ data/exporters (Excel consolidado)  data/datasource (ponto de extensão p/ API)    │
└───────────────────────────────────────────────────────────────────────────────────┘
  ai/claude (opcional, carregado sob demanda): só redige a leitura a partir dos fatos.
```

* **Sem backend no MVP**: o arquivo é processado no navegador; snapshots e configuração ficam no IndexedDB. A interface `Repository` permite trocar por uma API/BD de servidor sem tocar na UI.
* **Evolução para integração direta**: `DataSource` define a saída (um `Snapshot`). Um `AzureDevOpsDataSource` executará a query salva (WIQL → `workitemsbatch` com `System.Parent`, `Microsoft.VSTS.Common.StateChangeDate`, `ClosedDate`…) no servidor, com PAT, e produzirá exatamente o mesmo modelo — nenhuma regra muda.

## 3. Modelo de dados

* **WorkItem** — id, type, title, state, assignedTo, areaPath, iterationPath, priority, parentId (+ origem: coluna Parent ou árvore), tags[], createdDate, changedDate, stateChangeDate, closedDate, targetDate, storyPoints, effort, remainingWork, completedWork, severity, team, aba/linha de origem. Campo ausente = `undefined`.
* **Snapshot** — uma importação: projeto, rótulo do período, data/hora da consulta, arquivo, abas, itens, campos disponíveis, origem da hierarquia, avisos, leitura IA opcional. O histórico é a sequência de snapshots do projeto.
* **ProjectConfig** — macroetapas (chave, rótulo, cor, ordem); regra por estado (macroetapa, categoria, ordem, `auto`); tipos de card/bug/épico/feature; nível das linhas (épico ou feature); origem da frente (Area/Iteration Path nível N, tag com prefixo, pai do épico, nenhum); tags de bloqueio e de dependência; severidades críticas; dias para "parado"; meta; sprints (nome, início, fim) e sprint atual; limites de situação, saúde e análise; URL do Azure DevOps; IA.
* **Enriched** (calculado) — WorkItem + macroetapa, categoria, épico/feature ancestral, frente, dias sem mudança.

## 4. Regras de cálculo

| Indicador | Regra |
|---|---|
| Card | Item cujo tipo está em "Tipos contados como Card" (padrão: PBI, User Story, Bug…). Épicos/Features são contêineres. |
| Total de cards | Registros **únicos por ID** (duplicados: mantém o de Changed Date mais recente) dos tipos de card, exceto estados de categoria *Excluído* (ex.: Removed). |
| Concluídos / Em andamento / Aguardando etapa / Bloqueados | Contagem pela **categoria do estado** (uma por estado ⇒ sem dupla contagem; a soma é sempre o total). |
| Abertos com tag de bloqueio | Cards não concluídos e não bloqueados por estado com alguma tag de bloqueio — exibido **à parte**. |
| % de conclusão | Concluídos ÷ Total × 100. |
| Bugs (ab.) | Total de bugs (bugs não concluídos). |
| Vínculo | Somente via coluna Parent ou estrutura de árvore. Sobe a cadeia de pais **presentes na exportação** até achar Feature/Épico. Pai fora da exportação ⇒ "Sem vínculo" + aviso. Sem hierarquia ⇒ seção N/D. |
| Frente | Conforme configuração (padrão: 2º nível do Area Path do épico). |
| Card parado | Aberto e `hoje(consulta) − (State Change Date ∥ Changed Date) > staleDays`. Sem datas ⇒ N/D. |
| Concluídos no período | Closed Date dentro das datas da sprint atual; senão transições para concluído desde o snapshot anterior; senão N/D. |
| Criados no período | Created Date na sprint; senão IDs novos vs. snapshot anterior; senão N/D. |
| Vazão | Média de concluídos (Closed Date) das últimas até 3 sprints encerradas. |
| Projeção | Sprints necessárias = abertos ÷ vazão; disponíveis = dias até a meta ÷ duração média da sprint; razão = necessárias ÷ disponíveis. |
| Comparação | Mesmo cálculo, mesma configuração e mesmos filtros aplicados ao snapshot de comparação. Só existe se houver snapshot anterior. |
| Situação da linha | Concluído = 100% done · **Crítico** = data-alvo (Target Date da linha ou meta) vencida com abertos, ou % bloqueados ≥ limite · **Atenção** = ≥ N bloqueados (estado/tag) ou ≥ N parados · senão **No prazo**. |
| Saúde geral | CRÍTICO se qualquer: % bloqueados ≥ X, épicos críticos ≥ N, razão de projeção ≥ Y. Senão ATENÇÃO se qualquer: % épicos em atenção ≥ Z, bloqueados ≥ N, % parados ≥ W, razão de projeção > 1. Senão NO PRAZO. As regras disparadas são exibidas. |

**Avanços, atenção e riscos** são gerados por regras (`domain/insights.ts`), cada uma com limiar configurável e emitida só quando há evidência numérica. Riscos têm nível POTENCIAL/ALTO/CRÍTICO por limiar, evidência, impacto e ação. A **IA é opcional** e apenas redige a leitura executiva a partir do JSON de fatos calculados.

## 5. Desenho da One Page

Canvas fixo de 1920 px de largura (altura mínima 1080), escalado para caber na tela e impresso como **uma única página PDF paisagem** (o tamanho da página acompanha a altura do conteúdo). Ordem: cabeçalho → 6 KPIs → distribuição por status → análise por épico em 2 colunas → 3 quadros → leitura executiva. Tudo é clicável para detalhamento (KPIs, segmentos, legendas, linhas, segmentos das barras); grupos expandem/recolhem; ordenação alfabética, por prioridade, % concluído ou criticidade.

## 6. Riscos técnicos e mitigação

| Risco | Mitigação |
|---|---|
| Formatos de exportação variados (CSV do portal, plugin Excel com linhas de metadados, árvore × flat, cabeçalhos EN/PT) | Detecção de cabeçalho nas 30 primeiras linhas, sinônimos EN/PT-BR, mapeamento manual, colunas Title N. |
| Ausência de Parent na query flat | Seção por épico vira N/D com orientação; nenhum vínculo presumido. |
| Datas ambíguas (dd/mm × mm/dd) | Desambiguação quando dia > 12 + formato escolhido na importação. |
| Changed Date muda com comentários | Preferência por State Change Date; documentado. |
| Processos customizados (estados próprios) | Heurística apenas sugere; tela de mapeamento com selo "auto" até revisão; aviso no relatório. |
| Histórico sem datas de sprint | Calendário de sprints configurável; fallback para comparação entre snapshots. |
| Volume (dezenas de milhares de itens) | Cálculo em memória O(n); para volumes maiores, mover o domínio para Web Worker/servidor. |
| SheetJS do npm (0.18.5) tem avisos de segurança conhecidos (prototype pollution / ReDoS) | Arquivos são do próprio usuário e processados localmente; recomenda-se trocar pela build oficial `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (bloqueada na rede do ambiente de desenvolvimento). |
| Chave de API da IA no navegador | Opcional, só em sessionStorage; em produção usar proxy de servidor. |
| Dados no IndexedDB são por navegador | Interface `Repository` pronta para backend compartilhado. |
