import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import tsx from 'react-syntax-highlighter/dist/cjs/languages/prism/tsx';
import typescript from 'react-syntax-highlighter/dist/cjs/languages/prism/typescript';
import javascript from 'react-syntax-highlighter/dist/cjs/languages/prism/javascript';
import python from 'react-syntax-highlighter/dist/cjs/languages/prism/python';
import json from 'react-syntax-highlighter/dist/cjs/languages/prism/json';
import bash from 'react-syntax-highlighter/dist/cjs/languages/prism/bash';
import markdown from 'react-syntax-highlighter/dist/cjs/languages/prism/markdown';
import { Copy, Check } from 'lucide-react';
import { useState, memo, useCallback, useMemo, HTMLAttributes, ClassAttributes } from 'react';
import { ExtraProps } from 'react-markdown';
import { Button } from '@/components/ui/button';
import 'katex/dist/katex.min.css';

// Register common languages for PrismLight to improve performance
SyntaxHighlighter.registerLanguage('tsx', tsx);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('markdown', markdown);

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

interface CodeBlockProps {
  language: string;
  value: string;
  isStreaming?: boolean;
}

type CodeProps = ClassAttributes<HTMLElement> & HTMLAttributes<HTMLElement> & ExtraProps;

const CodeBlock = memo(function CodeBlock({ language, value, isStreaming }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copyCode = useCallback(async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  // Performance: skip syntax highlighting for large code blocks during streaming
  const shouldHighlight = !isStreaming || value.length < 500;

  return (
    <div className="relative group my-3 rounded-lg overflow-hidden border border-border">
      <div className="flex items-center justify-between bg-muted px-4 py-2">
        <span className="text-xs text-muted-foreground font-mono">{language || 'plaintext'}</span>
        {!isStreaming && (
          <Button
            variant="ghost"
            size="sm"
            onClick={copyCode}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
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
          </Button>
        )}
      </div>
      {shouldHighlight ? (
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
      ) : (
        <pre className="p-4 overflow-x-auto text-sm font-mono bg-[#282c34] text-white">
          <code>{value}</code>
        </pre>
      )}
    </div>
  );
});

const components = (isStreaming?: boolean): Components => ({
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

    return <CodeBlock language={match ? match[1] : ''} value={codeString} isStreaming={isStreaming} />;
  },
  p({ children }) {
    return <p className="mb-4 last:mb-0">{children}</p>;
  },
  ul({ children }) {
    return <ul className="list-disc pl-6 mb-4 space-y-1">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="list-decimal pl-6 mb-4 space-y-1">{children}</ol>;
  },
  li({ children }) {
    return <li className="leading-relaxed">{children}</li>;
  },
  h1({ children }) {
    return <h1 className="text-2xl font-bold mb-4 mt-6 first:mt-0">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="text-xl font-bold mb-3 mt-5 first:mt-0">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="text-lg font-bold mb-2 mt-4 first:mt-0">{children}</h3>;
  },
  h4({ children }) {
    return <h4 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h4>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="border-l-4 border-primary/30 pl-4 italic my-4 text-muted-foreground">
        {children}
      </blockquote>
    );
  },
  a({ href, children }) {
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
  table({ children }) {
    return (
      <div className="overflow-x-auto my-4">
        <table className="min-w-full border-collapse border border-border">
          {children}
        </table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-muted">{children}</thead>;
  },
  th({ children }) {
    return <th className="border border-border px-4 py-2 text-left font-semibold">{children}</th>;
  },
  td({ children }) {
    return <td className="border border-border px-4 py-2">{children}</td>;
  },
  hr() {
    return <hr className="my-6 border-border" />;
  },
  strong({ children }) {
    return <strong className="font-semibold">{children}</strong>;
  },
  em({ children }) {
    return <em className="italic">{children}</em>;
  },
});

export const MarkdownRenderer = memo(function MarkdownRenderer({ content, isStreaming }: MarkdownRendererProps) {

  // Optimization: For extremely large content during streaming, 
  // we use a simplified rendering path to avoid O(N^2) parsing lag.
  // Lowered threshold to 5k characters for better responsiveness.
  const isExtremelyLarge = isStreaming && content.length > 5000;

  // Optimization: Removed sanitizeHtml. ReactMarkdown already handles escaping/sanitization
  // by default, and running DOMPurify on every chunk during streaming is O(N^2) and expensive.
  const sanitizedContent = content;

  // Optimize plugins for streaming: skip heavy ones like KaTeX and GFM if possible
  const remarkPlugins = useMemo(() => [
    ...(isStreaming ? [] : [remarkGfm, remarkMath])
  ], [isStreaming]);

  const rehypePlugins = useMemo(() => [
    ...(isStreaming ? [] : [rehypeKatex])
  ], [isStreaming]);

  // Static components to avoid recreation
  const staticComponents = useMemo(() => components(isStreaming), [isStreaming]);

  if (isExtremelyLarge) {
    return (
      <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed border-l-2 border-primary/20 pl-4 py-2 opacity-90">
        {content}
        <span className="inline-block w-2 h-4 bg-primary/60 animate-pulse ml-0.5 align-middle" />
      </div>
    );
  }

  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={staticComponents}
    >
      {sanitizedContent}
    </ReactMarkdown>
  );
});
