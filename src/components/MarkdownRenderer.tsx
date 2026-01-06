import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { Copy, Check } from 'lucide-react';
import { useState, memo, useCallback, useMemo, ReactNode } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
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

// Type-safe component props
interface ChildrenProps {
  children?: ReactNode;
}

interface CodeProps extends ChildrenProps {
  className?: string;
}

interface LinkProps extends ChildrenProps {
  href?: string;
}

const components: Components = {
  code({ className, children, ...props }: CodeProps) {
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
  p: ({ children }: ChildrenProps) => (
    <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
  ),
  h1: ({ children }: ChildrenProps) => (
    <h1 className="text-2xl font-bold mb-4 mt-6 first:mt-0">{children}</h1>
  ),
  h2: ({ children }: ChildrenProps) => (
    <h2 className="text-xl font-bold mb-3 mt-5 first:mt-0">{children}</h2>
  ),
  h3: ({ children }: ChildrenProps) => (
    <h3 className="text-lg font-semibold mb-2 mt-4 first:mt-0">{children}</h3>
  ),
  h4: ({ children }: ChildrenProps) => (
    <h4 className="text-base font-semibold mb-2 mt-3 first:mt-0">{children}</h4>
  ),
  ul: ({ children }: ChildrenProps) => (
    <ul className="list-disc pl-6 mb-3 space-y-1">{children}</ul>
  ),
  ol: ({ children }: ChildrenProps) => (
    <ol className="list-decimal pl-6 mb-3 space-y-1">{children}</ol>
  ),
  li: ({ children }: ChildrenProps) => (
    <li className="leading-relaxed">{children}</li>
  ),
  blockquote: ({ children }: ChildrenProps) => (
    <blockquote className="border-l-4 border-primary/30 pl-4 py-1 my-3 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  a: ({ href, children }: LinkProps) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline"
    >
      {children}
    </a>
  ),
  table: ({ children }: ChildrenProps) => (
    <div className="overflow-x-auto my-4">
      <table className="min-w-full border border-border rounded-lg overflow-hidden">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: ChildrenProps) => (
    <thead className="bg-muted">{children}</thead>
  ),
  th: ({ children }: ChildrenProps) => (
    <th className="px-4 py-2 text-left text-sm font-semibold border-b border-border">
      {children}
    </th>
  ),
  td: ({ children }: ChildrenProps) => (
    <td className="px-4 py-2 text-sm border-b border-border">{children}</td>
  ),
  hr: () => <hr className="my-6 border-border" />,
  strong: ({ children }: ChildrenProps) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }: ChildrenProps) => <em className="italic">{children}</em>,
  pre: ({ children }: ChildrenProps) => <>{children}</>,
};

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const sanitizedContent = useMemo(() => sanitizeHtml(content), [content]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={components}
    >
      {sanitizedContent}
    </ReactMarkdown>
  );
});
