/**
 * Universal Boilerplate Engine 4.0 — Velo IDE
 * Provides `!` and keyword triggers for ALL languages per spec matrix.
 * Trigger via Tab/Enter, powered by monaco.languages.CompletionItemKind.Snippet
 */

import type * as monaco from 'monaco-editor';

export interface Boilerplate {
  triggers: string[];
  label: string;
  body: string;
  desc: string;
}

const BOILERPLATE_MATRIX: Record<string, Boilerplate[]> = {
  html: [
    {
      triggers: ['!', 'html:5'],
      label: '! — HTML5 Boilerplate',
      body: '<!DOCTYPE html>\n<html lang="en">\n<head>\n\t<meta charset="UTF-8">\n\t<meta name="viewport" content="width=device-width, initial-scale=1.0">\n\t<title>${1:Document}</title>\n</head>\n<body>\n\t${0}\n</body>\n</html>',
      desc: 'HTML5 full structure',
    },
  ],
  c: [
    {
      triggers: ['!', 'main'],
      label: '! — C Boilerplate',
      body: '#include <stdio.h>\n\nint main() {\n\tprintf("Hello, World!\\n");\n\treturn 0;\n}',
      desc: 'C main',
    },
  ],
  cpp: [
    {
      triggers: ['!', 'main', 'cpp'],
      label: '! — C++ Boilerplate',
      body: '#include <iostream>\nusing namespace std;\n\nint main() {\n\tcout << "Hello, World!" << endl;\n\treturn 0;\n}',
      desc: 'C++ iostream main',
    },
  ],
  python: [
    {
      triggers: ['!', 'main', 'def'],
      label: '! — Python Boilerplate',
      body: 'def main():\n\tprint("Hello, World!")\n\nif __name__ == "__main__":\n\tmain()',
      desc: 'Python main + guard',
    },
  ],
  java: [
    {
      triggers: ['!', 'main', 'class'],
      label: '! — Java Boilerplate',
      body: 'public class Main {\n\tpublic static void main(String[] args) {\n\t\tSystem.out.println("Hello, World!");\n\t}\n}',
      desc: 'Java Main class',
    },
  ],
  csharp: [
    {
      triggers: ['!', 'main'],
      label: '! — C# Boilerplate',
      body: 'using System;\n\nnamespace App {\n\tclass Program {\n\t\tstatic void Main(string[] args) {\n\t\t\tConsole.WriteLine("Hello, World!");\n\t\t}\n\t}\n}',
      desc: 'C# Program',
    },
  ],
  javascript: [
    {
      triggers: ['!', 'main', 'node'],
      label: '! — JS Boilerplate',
      body: "'use strict';\n\nfunction main() {\n\tconsole.log(\"Hello, World!\");\n}\n\nmain();",
      desc: 'JS main',
    },
  ],
  typescript: [
    {
      triggers: ['!', 'main'],
      label: '! — TS Boilerplate',
      body: 'export function main(): void {\n\tconsole.log("Hello, World!");\n}\n\nmain();',
      desc: 'TS main',
    },
  ],
  javascriptreact: [
    {
      triggers: ['!', 'rfc', 'rafce'],
      label: '! — React Component',
      body: "import React from 'react';\n\nexport const ${1:ComponentName} = () => {\n\treturn (\n\t\t<div>\n\t\t\t${1:ComponentName} Works!\n\t\t</div>\n\t);\n};\n\nexport default ${1:ComponentName};",
      desc: 'React FC',
    },
  ],
  typescriptreact: [
    {
      triggers: ['!', 'rfc', 'rafce'],
      label: '! — React TS Component',
      body: "import React from 'react';\n\ninterface Props {\n\t${2:prop}: string;\n}\n\nexport const ${1:ComponentName}: React.FC<Props> = () => {\n\treturn (\n\t\t<div>\n\t\t\t${1:ComponentName} Works!\n\t\t</div>\n\t);\n};\n\nexport default ${1:ComponentName};",
      desc: 'React TS FC',
    },
  ],
  rust: [
    {
      triggers: ['!', 'main'],
      label: '! — Rust Boilerplate',
      body: 'fn main() {\n\tprintln!("Hello, World!");\n}',
      desc: 'Rust main',
    },
  ],
  go: [
    {
      triggers: ['!', 'main', 'pkg'],
      label: '! — Go Boilerplate',
      body: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello, World!")\n}',
      desc: 'Go main',
    },
  ],
  php: [
    {
      triggers: ['!', 'php'],
      label: '! — PHP Boilerplate',
      body: '<?php\n\ndeclare(strict_types=1);\n\necho "Hello, World!";\n',
      desc: 'PHP hello',
    },
  ],
  css: [
    {
      triggers: ['!', 'reset'],
      label: '! — CSS Reset',
      body: '* {\n\tmargin: 0;\n\tpadding: 0;\n\tbox-sizing: border-box;\n}\n\nbody {\n\tfont-family: system-ui, sans-serif;\n}',
      desc: 'CSS reset',
    },
  ],
  scss: [
    {
      triggers: ['!', 'reset'],
      label: '! — SCSS Reset',
      body: '* {\n\tmargin: 0;\n\tpadding: 0;\n\tbox-sizing: border-box;\n}\n\nbody {\n\tfont-family: system-ui, sans-serif;\n}',
      desc: 'SCSS reset',
    },
  ],
  sql: [
    {
      triggers: ['!', 'table'],
      label: '! — SQL Table',
      body: 'CREATE TABLE ${1:table_name} (\n\tid INT PRIMARY KEY AUTO_INCREMENT,\n\t${2:name} VARCHAR(255) NOT NULL,\n\tcreated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);',
      desc: 'SQL create table',
    },
    {
      triggers: ['crud'],
      label: 'crud — SQL CRUD',
      body: '-- CREATE\nINSERT INTO ${1:table} (${2:column}) VALUES (${3:value});\n\n-- READ\nSELECT * FROM ${1:table} WHERE id = ${4:1};\n\n-- UPDATE\nUPDATE ${1:table} SET ${2:column} = ${3:value} WHERE id = ${4:1};\n\n-- DELETE\nDELETE FROM ${1:table} WHERE id = ${4:1};',
      desc: 'SQL CRUD',
    },
  ],
};

// Map Monaco language ids to our matrix keys
const LANG_ALIASES: Record<string, string> = {
  html: 'html',
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  python: 'python',
  py: 'python',
  java: 'java',
  csharp: 'csharp',
  cs: 'csharp',
  javascript: 'javascript',
  js: 'javascript',
  typescript: 'typescript',
  ts: 'typescript',
  javascriptreact: 'javascriptreact',
  jsx: 'javascriptreact',
  typescriptreact: 'typescriptreact',
  tsx: 'typescriptreact',
  rust: 'rust',
  rs: 'rust',
  go: 'go',
  golang: 'go',
  php: 'php',
  css: 'css',
  scss: 'scss',
  sql: 'sql',
};

export function getBoilerplatesForLang(lang: string): Boilerplate[] {
  const key = LANG_ALIASES[lang.toLowerCase()] || lang.toLowerCase();
  return BOILERPLATE_MATRIX[key] || [];
}

export function allBoilerplateLanguages(): string[] {
  return Object.keys(BOILERPLATE_MATRIX);
}

// Emmet-like expansions for HTML/CSS (simplified)
const EMMET_SNIPPETS: Record<string, { body: string; desc: string }> = {
  'div.container>ul.nav>li*4>a': {
    body: '<div class="container">\n\t<ul class="nav">\n\t\t<li><a href="${1:#}">${2:Item}</a></li>\n\t\t<li><a href="${1:#}">${2:Item}</a></li>\n\t\t<li><a href="${1:#}">${2:Item}</a></li>\n\t\t<li><a href="${1:#}">${2:Item}</a></li>\n\t</ul>\n</div>',
    desc: 'Emmet: container > nav',
  },
  'link:css': { body: '<link rel="stylesheet" href="${1:style.css}">', desc: 'Emmet: CSS link' },
  'm10-20': { body: 'margin: 10px 20px;', desc: 'Emmet: margin' },
  'p10': { body: 'padding: 10px;', desc: 'Emmet: padding' },
  'd:flex': { body: 'display: flex;', desc: 'Emmet: flex' },
};

export function getEmmetSnippet(abbr: string): { body: string; desc: string } | undefined {
  return EMMET_SNIPPETS[abbr];
}
export function emmetKeys(): string[] {
  return Object.keys(EMMET_SNIPPETS);
}
