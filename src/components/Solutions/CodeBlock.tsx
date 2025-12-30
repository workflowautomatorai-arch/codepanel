import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { a11yDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';
import { ProgrammingLanguage } from '@shared/api.ts';

interface CodeBlockProps {
  code: string;
  language: ProgrammingLanguage;
  showCopyButton?: boolean;
}

const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language,
  showCopyButton = false,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      // Use copy → hide → wait → show sequence to prevent title bar appearing
      const result = await window.electronAPI.copyAndRefreshWindow(code, 250);

      if (result.success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        console.error('Failed to copy and refresh window:', result.error);
      }
    } catch (error) {
      console.error('Failed to copy and refresh window:', error);
    }
  };

  return (
    <div className="relative code-surface overflow-hidden">
      <SyntaxHighlighter
        showLineNumbers
        language={language === ProgrammingLanguage.Go ? 'go' : language}
        style={a11yDark}
        customStyle={{
          maxWidth: '100%',
          margin: 0,
          padding: '1rem',
          paddingRight: showCopyButton ? '3rem' : '1rem',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          backgroundColor: 'transparent',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '13px',
          lineHeight: '1.5',
        }}
        wrapLongLines={true}
      >
        {code}
      </SyntaxHighlighter>

      {showCopyButton && (
        <button
          onClick={() => {
            handleCopy().catch(console.error);
          }}
          className="absolute top-2 right-2 p-2 rounded-md bg-[var(--border-default)] hover:bg-[var(--border-strong)] transition-colors duration-200 group btn-glass"
          title="Copy code"
        >
          {copied ? (
            <Check size={16} className="text-[var(--status-success)]" />
          ) : (
            <Copy
              size={16}
              className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)]"
            />
          )}
        </button>
      )}
    </div>
  );
};

export default CodeBlock;
