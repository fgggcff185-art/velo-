import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="code-block">
      <div className="code-block-header">
        <span>{lang || 'code'}</span>
        <div className="code-block-actions">
          <button
            onClick={() => {
              void window.velo.clipboardWrite(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            title="Copy"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderInline(text: string): Array<string | JSX.Element> {
  const parts: Array<string | JSX.Element> = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) parts.push(<code key={key++} className="inline-code">{m[1].slice(1, -1)}</code>);
    else if (m[2]) parts.push(<strong key={key++}>{m[2].slice(2, -2)}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ content }: { content: string }) {
  const blocks: JSX.Element[] = [];
  const segments = content.split(/```/);
  segments.forEach((seg, i) => {
    if (i % 2 === 1) {
      const nl = seg.indexOf('\n');
      const lang = nl > -1 ? seg.slice(0, nl).trim() : '';
      const code = nl > -1 ? seg.slice(nl + 1) : seg;
      blocks.push(<CodeBlock key={`c${i}`} code={code.replace(/\n$/, '')} lang={lang} />);
    } else if (seg.trim()) {
      const lines = seg.split('\n');
      const rendered = lines.map((line, j) => {
        const key = `t${i}-${j}`;
        if (/^#{1,4}\s/.test(line)) {
          const level = line.match(/^#+/)![0].length;
          return (
            <div key={key} className={`md-h md-h${level}`}>
              {renderInline(line.replace(/^#+\s*/, ''))}
            </div>
          );
        }
        if (/^[-*]\s/.test(line)) {
          return (
            <div key={key} className="md-li">
              <span className="md-li-dot">•</span>
              <span>{renderInline(line.replace(/^[-*]\s*/, ''))}</span>
            </div>
          );
        }
        if (/^\d+\.\s/.test(line)) {
          return (
            <div key={key} className="md-li">
              <span className="md-li-num">{line.match(/^\d+/)![0]}.</span>
              <span>{renderInline(line.replace(/^\d+\.\s*/, ''))}</span>
            </div>
          );
        }
        if (!line.trim()) return <div key={key} className="md-spacer" />;
        return (
          <div key={key} className="md-p">
            {renderInline(line)}
          </div>
        );
      });
      blocks.push(<div key={`t${i}`}>{rendered}</div>);
    }
  });
  return <div className="markdown">{blocks}</div>;
}
