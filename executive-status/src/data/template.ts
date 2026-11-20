import * as XLSX from 'xlsx';
import { buildWiql, FIELD_GUIDE, QUERY_STEPS, templateRows } from '../domain/queryGuide';
import type { ProjectConfig } from '../domain/types';

/** Modelo de planilha de importação: colunas esperadas + guia dos campos + passo a passo da query. */
export function downloadTemplate(cfg: Pick<ProjectConfig, 'epicTypes' | 'featureTypes' | 'cardTypes'>) {
  const wb = XLSX.utils.book_new();
  const modelo = XLSX.utils.json_to_sheet(templateRows());
  modelo['!cols'] = FIELD_GUIDE.map((f) => ({ wch: Math.max(14, f.en.length + 2) }));
  XLSX.utils.book_append_sheet(wb, modelo, 'Modelo');
  const campos = XLSX.utils.json_to_sheet(
    FIELD_GUIDE.map((f) => ({ 'Coluna (inglês)': f.en, 'Coluna (português)': f.pt, 'Nome de referência': f.ref, Necessidade: f.need, 'O que habilita no relatório': f.enables })),
  );
  campos['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 40 }, { wch: 14 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, campos, 'Campos da query');
  const passos = XLSX.utils.aoa_to_sheet([
    ['Como montar a query no Azure Boards'],
    [],
    ...QUERY_STEPS.map((s, i) => [`${i + 1}. ${s}`]),
    [],
    ['WIQL de referência — lista simples com coluna Parent:'],
    ...buildWiql(cfg).split('\n').map((l) => [l]),
    [],
    ['WIQL de referência — árvore de itens de trabalho:'],
    ...buildWiql(cfg, true).split('\n').map((l) => [l]),
    [],
    ['As linhas da aba "Modelo" são exemplos fictícios (título começa com EXEMPLO) e servem só para mostrar o formato.'],
  ]);
  passos['!cols'] = [{ wch: 140 }];
  XLSX.utils.book_append_sheet(wb, passos, 'Como montar a query');
  XLSX.writeFile(wb, 'modelo-importacao-executive-status.xlsx');
}
