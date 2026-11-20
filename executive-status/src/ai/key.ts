// Chave da API guardada apenas na sessão do navegador (sessionStorage).
const KEY = 'es.anthropicKey';
export const getApiKey = () => {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};
export const setApiKey = (k: string) => {
  try {
    sessionStorage.setItem(KEY, k);
  } catch {
    /* ignore */
  }
};

