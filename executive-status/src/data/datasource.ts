import type { Snapshot } from '../domain/types';

/**
 * Ponto de extensão para a evolução futura: uma fonte que produz Snapshots.
 * - ExcelDataSource (MVP): o gestor exporta a query e faz upload (ver pages/ImportPage).
 * - AzureDevOpsDataSource (futuro): executa a query salva via REST (WIQL + workitemsbatch, campo System.Parent)
 *   com um PAT guardado no servidor, e devolve o mesmo modelo — nenhuma regra de cálculo muda.
 */
export interface DataSource {
  readonly kind: 'excel' | 'azure-devops';
  load(): Promise<Omit<Snapshot, 'id' | 'importedAt'>>;
}
