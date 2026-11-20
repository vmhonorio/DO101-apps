// Componentes base no estilo shadcn/ui (Tailwind + Radix), mantidos locais para não depender do CLI.
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { cn } from './cn';

type Variant = 'default' | 'outline' | 'ghost' | 'danger' | 'navy';
const V: Record<Variant, string> = {
  default: 'bg-blue-600 text-white hover:bg-blue-700',
  navy: 'bg-navy-900 text-white hover:bg-navy-800',
  outline: 'border border-slate-300 bg-white hover:bg-slate-50 text-slate-800',
  ghost: 'hover:bg-slate-100 text-slate-700',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};
export function Button({ variant = 'default', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm',
        V[variant],
        className,
      )}
      {...p}
    />
  );
}

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100', className)} {...p} />;
}

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn('h-9 rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-blue-500', className)} {...p}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1 text-sm', className)}>
      <span className="font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Card({ title, children, className, actions }: { title?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn('rounded-lg border border-slate-200 bg-white p-4 shadow-sm', className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-bold text-navy-900">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-bold', className)}>{children}</span>;
}

export function Modal({ open, onOpenChange, title, subtitle, children, actions, wide }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; subtitle?: string; children: ReactNode; actions?: ReactNode; wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-900/50" />
        <Dialog.Content className={cn('fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg bg-white shadow-2xl', wide ? 'max-w-6xl' : 'max-w-2xl')}>
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3">
            <div>
              <Dialog.Title className="text-lg font-bold text-navy-900">{title}</Dialog.Title>
              {subtitle ? <Dialog.Description className="text-sm text-slate-500">{subtitle}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
            </div>
            <div className="flex items-center gap-2">
              {actions}
              <Dialog.Close asChild>
                <button className="rounded p-1 hover:bg-slate-100" aria-label="Fechar"><X size={18} /></button>
              </Dialog.Close>
            </div>
          </div>
          <div className="overflow-auto px-5 py-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto mt-16 max-w-xl rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      <h2 className="text-lg font-bold text-navy-900">{title}</h2>
      <div className="mt-2 text-sm text-slate-600">{children}</div>
    </div>
  );
}
