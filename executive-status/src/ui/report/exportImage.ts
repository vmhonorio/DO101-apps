import { toPng } from 'html-to-image';

/** Renderiza o relatório (canvas de 1920 px, sem a escala da tela) em PNG. Controles marcados no-print ficam de fora. */
export function reportToPng(el: HTMLElement, pixelRatio = 2): Promise<string> {
  return toPng(el, {
    pixelRatio,
    backgroundColor: '#ffffff',
    width: el.offsetWidth,
    height: el.offsetHeight,
    filter: (n) => !(n instanceof HTMLElement && n.classList.contains('no-print')),
  });
}
