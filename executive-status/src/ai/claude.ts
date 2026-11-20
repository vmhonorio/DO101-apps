// Refinamento OPCIONAL da leitura executiva com Claude.
// A IA recebe apenas os fatos já calculados (indicadores + avanços/atenção/riscos determinísticos) e é instruída
// a não criar números. Nenhum indicador depende desta chamada.
//
// Segurança: no MVP a chave é informada pelo usuário e fica só no navegador (sessionStorage). Em produção,
// mova esta chamada para um endpoint de servidor (proxy) e remova `dangerouslyAllowBrowser`.
import Anthropic from '@anthropic-ai/sdk';
import type { ReportModel } from '../domain/metrics';
import type { Insights } from '../domain/insights';
import { fmtDate } from '../domain/format';

export function factsFor(m: ReportModel, ins: Insights) {
  return {
    projeto: m.cfg.project,
    periodo: m.snapshot.label,
    consolidacao: fmtDate(m.snapshot.referenceDate, true),
    meta: m.cfg.goalDate ? fmtDate(m.cfg.goalDate) : null,
    saude: { valor: m.health.value, regras: m.health.reasons },
    indicadores: m.kpi,
    situacao_epicos: m.rowSummary,
    comparacao: m.comparison,
    periodo_fatos: {
      concluidos_no_periodo: m.period.doneInPeriod,
      criados_no_periodo: m.period.createdInPeriod,
      vazao_por_sprint: m.period.throughput,
      sprints_ate_meta: m.period.sprintsToGoal,
      sprints_necessarias: m.period.sprintsNeeded,
    },
    avancos: ins.advances.map((a) => a.text),
    atencao: ins.attention.map((a) => a.text),
    riscos: ins.risks.map((r) => `${r.level}: ${r.text} ${r.evidence ?? ''}`),
  };
}

const SYSTEM = `Você é um analista de PMO que escreve a "Leitura executiva" de um status report para a diretoria.
Regras:
- Use exclusivamente os números e fatos do JSON fornecido. Não invente números, nomes, datas ou causas.
- Se um dado for null, não o mencione.
- Português do Brasil, tom executivo, objetivo, sem adjetivos vazios.
- No máximo 2 frases e 70 palavras: situação geral com números-chave, principal ponto de atenção/risco e próximo foco recomendado.
- Responda apenas com o texto da leitura, sem títulos, aspas ou marcadores.`;

export async function refineReading(apiKey: string, model: string, m: ReportModel, ins: Insights): Promise<{ text: string; model: string }> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const res = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system: SYSTEM,
    messages: [{ role: 'user', content: `Fatos calculados (JSON):\n${JSON.stringify(factsFor(m, ins))}` }],
  });
  if (res.stop_reason === 'refusal') throw new Error('A IA recusou a solicitação; mantida a leitura determinística.');
  const text = res.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
  if (!text) throw new Error('Resposta vazia da IA.');
  return { text, model: res.model };
}

export function describeAiError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'Chave da API inválida.';
  if (e instanceof Anthropic.RateLimitError) return 'Limite de requisições atingido; tente novamente em instantes.';
  if (e instanceof Anthropic.BadRequestError) return `Requisição inválida: ${e.message}`;
  if (e instanceof Anthropic.APIError) return `Erro da API (${e.status}): ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
