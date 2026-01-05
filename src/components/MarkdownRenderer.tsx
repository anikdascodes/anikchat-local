import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { Copy, Check } from 'lucide-react';
import { useState, memo, useCallback } from 'react';
import 'katex/dist/katex.min.css';

interface MarkdownRendererProps {
  content: string;
}

interface CodeBlockProps {
  language: string;
  value: string;
}

const CodeBlock = memo(function CodeBlock({ language, value }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copyCode = useCallback(async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  return (
    <div className="relative group my-3 rounded-lg overflow-hidden border border-border">
      <div className="flex items-center justify-between bg-muted px-4 py-2">
        <span className="text-xs text-muted-foreground font-mono">{language || 'plaintext'}</span>
        <button
          onClick={copyCode}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language || 'text'}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '0.875rem',
        }}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
});

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        code({ node, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || '');
          const codeString = String(children).replace(/\n$/, '');
          const isInline = !match && !String(children).includes('\n');

          if (isInline) {
            return (
              <code
                className="px-1.5 py-0.5 bg-muted rounded text-sm font-mono text-foreground"
                {...props}
              >
                {children}
              </code>
            );
          }

          return <CodeBlock language={match ? match[1] : ''} value={codeString} />;
        },
        p({ children }: any) {
          return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>;
        },
        h1({ children }: any) {
          return <h1 className="text-2xl font-bold mb-4 mt-6 first:mt-0">{children}</h1>;
        },
        h2({ children }: any) {
          return <h2 className="text-xl font-bold mb-3 mt-5 first:mt-0">{children}</h2>;
        },
        h3({ children }: any) {
          return <h3 className="text-lg font-semibold mb-2 mt-4 first:mt-0">{children}</h3>;
        },
        h4({ children }: any) {
          return <h4 className="text-base font-semibold mb-2 mt-3 first:mt-0">{children}</h4>;
        },
        ul({ children }: any) {
          return <ul className="list-disc pl-6 mb-3 space-y-1">{children}</ul>;
        },
        ol({ children }: any) {
          return <ol className="list-decimal pl-6 mb-3 space-y-1">{children}</ol>;
        },
        li({ children }: any) {
          return <li className="leading-relaxed">{children}</li>;
        },
        blockquote({ children }: any) {
          return (
            <blockquote className="border-l-4 border-primary/30 pl-4 py-1 my-3 text-muted-foreground italic">
              {children}
            </blockquote>
          );
        },
        a({ href, children }: any) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {children}
            </a>
          );
        },
        table({ children }: any) {
          return (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border border-border rounded-lg overflow-hidden">
                {children}
              </table>
            </div>
          );
        },
        thead({ children }: any) {
          return <thead className="bg-muted">{children}</thead>;
        },
        th({ children }: any) {
          return (
            <th className="px-4 py-2 text-left text-sm font-semibold border-b border-border">
              {children}
            </th>
          );
        },
        td({ children }: any) {
          return <td className="px-4 py-2 text-sm border-b border-border">{children}</td>;
        },
        hr() {
          return <hr className="my-6 border-border" />;
        },
        strong({ children }: any) {
          return <strong className="font-semibold">{children}</strong>;
        },
        em({ children }: any) {
          return <em className="italic">{children}</em>;
        },
        pre({ children }: any) {
          return <>{children}</>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
});
