# EXECUTIVE STATUS

Transforma a exportação Excel de uma **Query do Azure DevOps** em um **Status Executivo** de uma página (16:9), pronto para apresentar ou exportar em PDF paisagem.

Fluxo: executar a query → exportar para Excel/CSV → **Importar** → o relatório é calculado automaticamente → **Exportar PDF**.

## Executar

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testes do domínio (vitest)
npm run build      # build de produção em dist/
node scripts/make-samples.mjs   # gera planilhas de TESTE (dados fictícios) em samples/
```

## Funcionalidades

* Importação XLSX/XLS/CSV, várias abas, detecção automática de cabeçalho (mesmo após linhas de metadados), sinônimos EN/PT-BR, mapeamento manual de colunas, prévia, validação, duplicados e erros por linha.
* Hierarquia por coluna **Parent** ou por query em **árvore** (Title 1, Title 2…). Nada é presumido.
* Histórico de importações (snapshots) por projeto, comparação entre períodos, seleção de sprint.
* Relatório: cabeçalho com saúde geral justificada, 6 KPIs, distribuição por estado real/macroetapa, análise por épico/feature em duas colunas (ordenação, expandir/recolher, destaque de críticos), avanços, pontos de atenção, riscos e leitura executiva.
* Filtros (frente, responsável, tipo, tag, busca), detalhamento ao clicar em qualquer indicador/linha/segmento, exportação do consolidado em Excel, impressão e PDF.
* Configuração completa: estados → macroetapa/categoria, macroetapas e cores, tipos, agrupamento, bloqueio, atraso, metas, limites de atenção/criticidade, sprints, URL do Azure DevOps.
* Opcional: leitura executiva redigida por Claude a partir dos indicadores já calculados.

Detalhes de arquitetura, modelo de dados, regras de cálculo e riscos técnicos: [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

> As planilhas em `samples/` são **dados fictícios de teste**, usados para validar diferentes formatos (flat com Parent em PT-BR, árvore em EN, CSV mínimo com estados Agile).
