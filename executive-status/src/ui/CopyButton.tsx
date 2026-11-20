import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from './primitives';

/** Copia texto; se o navegador recusar, seleciona o conteúdo do alvo para cópia manual. */
export function CopyButton({ text, label, targetId }: { text: string; label: string; targetId?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'manual'>('idle');
  const onClick = () => {
    const fallback = () => {
      setState('manual');
      const el = targetId ? document.getElementById(targetId) : null;
      if (el) {
        const r = document.createRange();
        r.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
      }
    };
    try {
      navigator.clipboard.writeText(text).then(() => { setState('ok'); setTimeout(() => setState('idle'), 2000); }, fallback);
    } catch {
      fallback();
    }
  };
  return (
    <Button size="sm" variant="outline" onClick={onClick}>
      {state === 'ok' ? <Check size={14} /> : <Copy size={14} />} {state === 'ok' ? 'Copiado' : state === 'manual' ? 'Selecionado: copie (Ctrl+C)' : label}
    </Button>
  );
}
