import type { Snippet } from '../types';
import { useSettingsStore } from '../store/useSettingsStore';

const BUILTIN_SNIPPETS: Record<string, Snippet[]> = {
  javascript: [
    { prefix: 'for', body: 'for (let i = 0; i < ${1:array}.length; i++) {\n\t${2:// code}\n}', desc: 'for loop' },
    { prefix: 'forof', body: 'for (const ${1:item} of ${2:iterable}) {\n\t${3:// code}\n}', desc: 'for..of loop' },
    { prefix: 'foreach', body: '${1:array}.forEach((${2:item}) => {\n\t${3:// code}\n});', desc: 'forEach' },
    { prefix: 'arrow', body: 'const ${1:name} = (${2:params}) => {\n\t${3:// code}\n};', desc: 'arrow function' },
    { prefix: 'tryc', body: 'try {\n\t${1:// code}\n} catch (error) {\n\tconsole.error(error);\n}', desc: 'try/catch' },
    { prefix: 'log', body: 'console.log(${1:value});', desc: 'console.log' },
    { prefix: 'timeout', body: 'setTimeout(() => {\n\t${1:// code}\n}, ${2:1000});', desc: 'setTimeout' },
    { prefix: 'promise', body: 'new Promise((resolve, reject) => {\n\t${1:// code}\n});', desc: 'new Promise' },
    { prefix: 'asyncfunc', body: 'async function ${1:name}() {\n\t${2:// code}\n}', desc: 'async function' },
  ],
  typescript: [
    { prefix: 'interface', body: 'interface ${1:Name} {\n\t${2:prop}: ${3:string};\n}', desc: 'interface' },
    { prefix: 'type', body: 'type ${1:Name} = {\n\t${2:prop}: ${3:string};\n};', desc: 'type alias' },
    { prefix: 'generic', body: 'function ${1:name}<T>(${2:arg}: T): T {\n\treturn ${2:arg};\n}', desc: 'generic function' },
  ],
  python: [
    { prefix: 'def', body: 'def ${1:name}(${2:args}):\n    ${3:pass}', desc: 'function' },
    { prefix: 'main', body: 'if __name__ == "__main__":\n    ${1:main()}', desc: 'main guard' },
    { prefix: 'for', body: 'for ${1:item} in ${2:iterable}:\n    ${3:pass}', desc: 'for loop' },
    { prefix: 'class', body: 'class ${1:Name}:\n    def __init__(self${2:, args}):\n        ${3:pass}', desc: 'class' },
    { prefix: 'try', body: 'try:\n    ${1:pass}\nexcept ${2:Exception} as e:\n    print(e)', desc: 'try/except' },
  ],
  html: [
    { prefix: 'html5', body: '<!DOCTYPE html>\n<html lang="en">\n<head>\n\t<meta charset="UTF-8">\n\t<meta name="viewport" content="width=device-width, initial-scale=1.0">\n\t<title>${1:Document}</title>\n</head>\n<body>\n\t${2:content}\n</body>\n</html>', desc: 'HTML5 boilerplate' },
    { prefix: 'link', body: '<link rel="stylesheet" href="${1:style.css}">', desc: 'stylesheet link' },
    { prefix: 'script', body: '<script src="${1:script.js}"></script>', desc: 'script tag' },
  ],
  css: [
    { prefix: 'flex', body: 'display: flex;\nalign-items: center;\njustify-content: ${1:center};', desc: 'flex center' },
    { prefix: 'grid', body: 'display: grid;\ngrid-template-columns: ${1:repeat(3, 1fr)};\ngap: ${2:16px};', desc: 'grid' },
  ],
  markdown: [
    { prefix: 'table', body: '| ${1:Header} | ${2:Header} |\n| --- | --- |\n| ${3:Cell} | ${4:Cell} |', desc: 'table' },
    { prefix: 'code', body: '```${1:js}\n${2:code}\n```', desc: 'code block' },
  ],
};

export function snippetsFor(language: string): Snippet[] {
  const user = useSettingsStore.getState().settings.snippets || {};
  return [...(BUILTIN_SNIPPETS[language] || []), ...(user[language] || [])];
}

export function snippetLanguages(): string[] {
  const user = useSettingsStore.getState().settings.snippets || {};
  return [...new Set([...Object.keys(BUILTIN_SNIPPETS), ...Object.keys(user)])];
}
