/**
 * Velo language map — 300+ file extensions mapped to Monaco language ids.
 * Every known code/config/doc extension opens with proper syntax highlighting.
 */

const M: Record<string, string> = {
  // â”€â”€ JavaScript / TypeScript ecosystem â”€â”€
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'typescript',
  json: 'json', jsonc: 'json', json5: 'json',
  vue: 'html', svelte: 'html', astro: 'html',
  'mjs.map': 'javascript',
  // â”€â”€ Web â”€â”€
  html: 'html', htm: 'html', xhtml: 'html', jsp: 'html', asp: 'html', aspx: 'html',
  ejs: 'html', erb: 'html', mustache: 'handlebars', hbs: 'handlebars', handlebars: 'handlebars',
  twig: 'twig', pug: 'pug', jade: 'pug', liquid: 'liquid',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less', styl: 'stylus',
  'vue.html': 'html', wxss: 'css',
  // â”€â”€ Python â”€â”€
  py: 'python', pyw: 'python', pyi: 'python', pyx: 'python', pxd: 'python',
  ipynb: 'python', rpy: 'python', gyp: 'python', gypi: 'python', smk: 'python',
  // â”€â”€ Systems â”€â”€
  c: 'c', ec: 'c', pgc: 'c',
  h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', 'c++': 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp', ino: 'cpp', pde: 'cpp',
  cs: 'csharp', csx: 'csharp',
  rs: 'rust', rlib: 'rust',
  go: 'go', zig: 'cpp', nim: 'python', v: 'systemverilog', cr: 'ruby',
  swift: 'swift',
  m: 'objective-c', mm: 'objective-c',
  java: 'java', jar: 'java',
  kt: 'kotlin', kts: 'kotlin',
  scala: 'scala', sc: 'scala',
  groovy: 'groovy', gradle: 'groovy', gvy: 'groovy',
  dart: 'dart',
  php: 'php', php3: 'php', php4: 'php', php5: 'php', phtml: 'php',
  rb: 'ruby', rake: 'ruby', gemspec: 'ruby', ru: 'ruby', erb2: 'ruby',
  lua: 'lua',
  pl: 'perl', pm: 'perl', pod: 'perl',
  r: 'r', rmd: 'markdown',
  jl: 'python',
  d: 'cpp',
  pas: 'pascal', pp: 'pascal', lpr: 'pascal',
  asm: 'mips', s: 'c', S: 'c', nasm: 'mips',
  f90: 'cpp', f95: 'cpp', f03: 'cpp', for: 'cpp', f: 'cpp',
  cob: 'ini', cbl: 'ini',
  adb: 'pascal', ads: 'pascal',
  hs: 'scheme', lhs: 'scheme',
  elm: 'javascript', purs: 'javascript', ml: 'fsharp', fs: 'fsharp', fsx: 'fsharp', fsi: 'fsharp',
  ex: 'elixir', exs: 'elixir',
  erl: 'scheme', hrl: 'scheme',
  clj: 'clojure', cljs: 'clojure', cljc: 'clojure', edn: 'clojure',
  lisp: 'scheme', lsp: 'scheme', scm: 'scheme', ss: 'scheme', rkt: 'scheme',
  ml4: 'fsharp',
  tcl: 'tcl', tk: 'tcl',
  pro: 'perl',
  ooc: 'java',
  haxe: 'javascript', hx: 'javascript',
  cypher: 'cypher',
  // â”€â”€ Shell / scripting â”€â”€
  sh: 'shell', bash: 'shell', zsh: 'shell', ksh: 'shell', fish: 'shell',
  bashrc: 'shell', zshrc: 'shell', profile: 'shell',
  ps1: 'powershell', psm1: 'powershell', psd1: 'powershell',
  bat: 'bat', cmd: 'bat', bt: 'bat',
  awk: 'perl', sed: 'perl',
  // â”€â”€ Data / config â”€â”€
  xml: 'xml', svg: 'xml', xsl: 'xml', xslt: 'xml', xsd: 'xml', dtd: 'xml',
  plist: 'xml', resx: 'xml', ui: 'xml', glade: 'xml', project: 'xml', csproj: 'xml',
  vbproj: 'xml', wxs: 'xml', wxi: 'xml', rss: 'xml', atom: 'xml', opml: 'xml',
  yml: 'yaml', yaml: 'yaml', 'yml.dist': 'yaml',
  toml: 'ini', tml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini', config: 'ini',
  properties: 'ini', env: 'ini', dotenv: 'ini', editorconfig: 'ini', gitconfig: 'ini',
  inf: 'ini', reg: 'ini', opt: 'ini',
  hcl: 'hcl', tf: 'hcl', tfvars: 'hcl', hcl2: 'hcl',
  sql: 'sql', ddl: 'sql', dml: 'sql', prc: 'sql', trig: 'sql',
  mysql: 'mysql', pgsql: 'pgsql', plsql: 'sql', tsql: 'sql',
  graphql: 'graphql', gql: 'graphql',
  proto: 'protobuf', protobuf: 'protobuf',
  csv: 'plaintext', tsv: 'plaintext', psv: 'plaintext',
  redis: 'redis',
  sparql: 'sparql',
  sol: 'sol',
  wgsl: 'wgsl',
  iats: 'postiats', dts: 'typescript',
  azcli: 'azcli',
  bicep: 'bicep', bicepparam: 'bicep',
  mmd: 'markdown',
  msdax: 'msdax', dax: 'msdax',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown', mdown: 'markdown',
  rst: 'restructuredtext', rest: 'restructuredtext',
  tex: 'st', latex: 'st', sty: 'st',
  adoc: 'markdown', asciidoc: 'markdown',
  wiki: 'markdown',
  sb: 'sb',
  sophia: 'sophia',
  st: 'st',
  sv: 'systemverilog', svh: 'systemverilog', vh: 'systemverilog', vlg: 'systemverilog',
  typespec: 'typespec', tsp: 'typespec',
  vb: 'vb', vbs: 'vb', bas: 'vb', frm: 'vb', cls: 'apex', trigger: 'apex', apex: 'apex',
  abap: 'abap',
  apex2: 'apex',
  clsp: 'apex',
  ecl: 'ecl',
  flow: 'flow9',
  ftl: 'freemarker2', freemarker: 'freemarker2',
  m3: 'm3', i3: 'm3', mg: 'm3',
  mips: 'mips', s19: 'mips',
  pla: 'pla',
  qsharp: 'qsharp',
  redshift: 'redshift',
  bibtex: 'st', bib: 'st',
  cameligo: 'cameligo', mligo: 'cameligo', pascaligo: 'pascaligo', ligo: 'cameligo',
  // â”€â”€ Docs / misc â”€â”€
  txt: 'plaintext', text: 'plaintext', log: 'plaintext',
  dockerfile: 'dockerfile', containerfile: 'dockerfile',
  makefile: 'shell', mk: 'shell', mak: 'shell',
  cmake: 'shell',
  nsi: 'shell', iss: 'ini',
  gitignore: 'shell', gitattributes: 'shell', gitmodules: 'ini',
  npmrc: 'ini', yarnrc: 'ini', babelrc: 'json', eslintrc: 'json', prettierrc: 'json',
  npmignore: 'shell',
  gemfile: 'ruby', podfile: 'ruby', fastfile: 'ruby', appfile: 'ruby',
  brewfile: 'ruby', vagrantfile: 'ruby',
  psmd: 'markdown',
  srt: 'plaintext', vtt: 'plaintext',
  ics: 'ini',
  htaccess: 'shell', htpasswd: 'shell',
  patch: 'plaintext', diff: 'plaintext',
  lock: 'ini',
  sum: 'plaintext', mod: 'shell',
  work: 'ini',
  tfstate: 'json',
  asar: 'plaintext',
  wasm: 'plaintext',
  pyc: 'plaintext', class: 'plaintext', o: 'plaintext', obj: 'plaintext',
  dll: 'plaintext', exe: 'plaintext', so: 'plaintext', dylib: 'plaintext',
  png: 'plaintext', jpg: 'plaintext', jpeg: 'plaintext', gif: 'plaintext',
  webp: 'plaintext', ico: 'plaintext', bmp: 'plaintext', icns: 'plaintext',
  pdf: 'plaintext', zip: 'plaintext', gz: 'plaintext', tar: 'plaintext',
  rar: 'plaintext', '7z': 'plaintext', mp3: 'plaintext', mp4: 'plaintext',
  woff: 'plaintext', woff2: 'plaintext', ttf: 'plaintext', otf: 'plaintext', eot: 'plaintext',
};

export const LANGUAGE_COUNT = new Set(Object.values(M)).size;
export const EXTENSION_COUNT = Object.keys(M).length;

export function languageFromExtension(path: string): string {
  const base = path.split(/[\\/]/).pop() || path;
  const lower = base.toLowerCase();
  // full filename matches (dockerfile, makefile, .gitignore…)
  if (M[lower]) return M[lower];
  if (lower.startsWith('.git') || lower.startsWith('.env')) return 'ini';
  if (lower.startsWith('dockerfile') || lower.startsWith('containerfile')) return 'dockerfile';
  if (lower.startsWith('makefile')) return 'shell';
  if (lower.startsWith('gemfile') || lower.startsWith('rakefile')) return 'ruby';
  if (lower.startsWith('cmakelists')) return 'shell';
  if (lower.startsWith('vagrantfile')) return 'ruby';
  if (lower.startsWith('brewfile')) return 'ruby';
  if (lower.startsWith('procfile')) return 'shell';
  // double extensions (.d.ts, .min.js, .yml.dist…)
  const parts = lower.split('.');
  for (let i = 1; i < parts.length; i++) {
    const candidate = parts.slice(i).join('.');
    if (M[candidate]) return M[candidate];
  }
  // single extension
  const ext = parts[parts.length - 1];
  return M[ext] || 'plaintext';
}
