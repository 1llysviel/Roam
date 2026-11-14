// 从 HTML 中提取与关键词相关的正文段落。去掉脚本、导航、页眉页脚等装饰区域，避免其变化被误判为事实变化。
import { parse } from 'node-html-parser';
import { createHash } from 'node:crypto';

const DROP = 'script,style,noscript,nav,header,footer,aside,form,svg,iframe,[role=navigation],[aria-hidden=true],.cookie,.cookies,#cookie-banner';

export function textBlocks(html: string): string[] {
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false, pre: true } });
  root.querySelectorAll(DROP).forEach((n) => n.remove());
  const blocks = root
    .querySelectorAll('h1,h2,h3,h4,p,li,td,th,dd,dt')
    .map((n) => n.text.replace(/\s+/g, ' ').trim())
    .filter((t) => t.length >= 3);
  return [...new Set(blocks)];
}

export function relevantBlocks(blocks: string[], keywords: string[], maxBlocks: number, maxChars: number): string[] {
  if (keywords.length === 0) return [];
  const kws = keywords.map((k) => k.toLowerCase());
  return blocks
    .filter((b) => { const l = b.toLowerCase(); return kws.some((k) => l.includes(k)); })
    .slice(0, maxBlocks)
    .map((b) => (b.length > maxChars ? b.slice(0, maxChars - 1) + '…' : b));
}

export const hashBlocks = (blocks: string[]) => createHash('sha256').update(blocks.join('\n')).digest('hex').slice(0, 16);

/** 粗略识别验证码/机器人拦截页。 */
export const looksBlocked = (html: string) => /captcha|are you a robot|access denied|cf-chl|attention required/i.test(html.slice(0, 20000));
