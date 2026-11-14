import type { ReactNode } from 'react';

export type Tone = 'ok' | 'warn' | 'bad' | 'muted' | 'info' | 'accent';
/** 状态标签：图标 + 文字，不只依赖颜色。 */
export default function Badge({ tone, icon, children, title }: { tone: Tone; icon?: string; children: ReactNode; title?: string }) {
  return (
    <span className={`badge tone-${tone}`} title={title}>
      {icon && <span className="badge-icon" aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}
