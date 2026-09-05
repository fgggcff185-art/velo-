/**
 * Velo Featured Extensions catalog — the community-recommended VS Code list.
 * status:
 *  - "native"   → Velo already includes this functionality built-in
 *  - "install"  → installable from Open VSX (themes / snippets / grammars)
 *  - "external" → requires the VS Code extension host; open in Open VSX
 */

export interface FeaturedExtension {
  name: string;
  vsId: string;
  desc: string;
  category: string;
  status: 'native' | 'install' | 'external';
  nativeNote?: string;
}

export const FEATURED_CATEGORIES = [
  'Essentials',
  'Web',
  'Python & Data',
  'Backend & APIs',
  'Languages',
  'DevOps & Cloud',
  'Git & Collaboration',
  'Productivity',
  'Testing',
] as const;

export const FEATURED_EXTENSIONS: FeaturedExtension[] = [
  // ===== Essentials =====
  { name: 'GitHub Copilot', vsId: 'GitHub.copilot', desc: 'AI code completion while you type', category: 'Essentials', status: 'native', nativeNote: 'Ghost Text (Tab to accept) — configure any provider' },
  { name: 'GitHub Copilot Chat', vsId: 'GitHub.copilot-chat', desc: 'Chat with AI inside the editor', category: 'Essentials', status: 'native', nativeNote: 'AI Chat + Agent + Team modes' },
  { name: 'Prettier', vsId: 'esbenp.prettier-vscode', desc: 'Auto format code for any language', category: 'Essentials', status: 'native', nativeNote: 'Format on Save (TS/JS/JSON/CSS/HTML)' },
  { name: 'ESLint', vsId: 'dbaeumer.vscode-eslint', desc: 'JS/TS linting', category: 'Essentials', status: 'native', nativeNote: 'TS language service + Problems panel' },
  { name: 'Error Lens', vsId: 'usernamehw.errorlens', desc: 'Show errors inline next to the line', category: 'Essentials', status: 'native', nativeNote: 'Built-in inline error markers' },
  { name: 'GitLens', vsId: 'eamodio.gitlens', desc: 'Git history and blame for each line', category: 'Essentials', status: 'native', nativeNote: 'Source Control + Timeline + Diff views' },
  { name: 'Path Intellisense', vsId: 'christian-kohler.path-intellisense', desc: 'Autocomplete file paths', category: 'Essentials', status: 'native', nativeNote: 'Built-in path completion' },
  { name: 'Code Spell Checker', vsId: 'streetsidesoftware.code-spell-checker', desc: 'Spelling checker for code', category: 'Essentials', status: 'external' },
  { name: 'Better Comments', vsId: 'aaron-bond.better-comments', desc: 'Colored, clearer comments', category: 'Essentials', status: 'install' },
  { name: 'indent-rainbow', vsId: 'oderwat.indent-rainbow', desc: 'Color indentation levels', category: 'Essentials', status: 'install' },
  { name: 'Bracket Pair Colorizer 2', vsId: 'CoenraadS.bracket-pair-colorizer-2', desc: 'Colorize matching brackets', category: 'Essentials', status: 'native', nativeNote: 'Built-in bracket pair colorization' },
  { name: 'TODO Highlight', vsId: 'wayou.vscode-todo-highlight', desc: 'Highlight TODO / FIXME comments', category: 'Essentials', status: 'native', nativeNote: 'Built-in TODO highlighting + TODO panel' },
  { name: 'Auto Rename Tag', vsId: 'formulahendry.auto-rename-tag', desc: 'Rename HTML/JSX tags automatically', category: 'Essentials', status: 'native', nativeNote: 'Built-in (Rename Tag command)' },
  { name: 'Auto Close Tag', vsId: 'formulahendry.auto-close-tag', desc: 'Auto close HTML/XML tags', category: 'Essentials', status: 'native', nativeNote: 'Built-in (type ">" in HTML)' },
  { name: 'Material Icon Theme', vsId: 'PKief.material-icon-theme', desc: 'Clear file & folder icons', category: 'Essentials', status: 'install' },
  { name: 'Bracket Lens', vsId: 'wix.vscode-bracket-lens', desc: 'Show collapsed bracket content', category: 'Essentials', status: 'external' },
  { name: 'Live Share', vsId: 'MS-vsliveshare.vsliveshare', desc: 'Real-time pair programming', category: 'Essentials', status: 'external' },
  { name: 'Settings Sync', vsId: 'Shan.code-settings-sync', desc: 'Sync settings across machines', category: 'Essentials', status: 'external' },
  { name: 'Project Manager', vsId: 'alefragnani.project-manager', desc: 'Switch between projects quickly', category: 'Essentials', status: 'native', nativeNote: 'Recent folders + Multi-root workspace' },
  { name: 'Peacock', vsId: 'johnpapa.vscode-peacock', desc: 'Color the window per project', category: 'Essentials', status: 'native', nativeNote: '4 built-in themes + extension themes' },

  // ===== Web =====
  { name: 'Live Server', vsId: 'ritwickdey.LiveServer', desc: 'Instant HTML/CSS/JS preview', category: 'Web', status: 'native', nativeNote: 'F5 Run opens HTML in the browser' },
  { name: 'Tailwind CSS IntelliSense', vsId: 'bradlc.vscode-tailwindcss', desc: 'Tailwind class autocomplete', category: 'Web', status: 'install' },
  { name: 'CSS Peek', vsId: 'pranaygp.vscode-css-peek', desc: 'Peek CSS from HTML', category: 'Web', status: 'external' },
  { name: 'HTML CSS Support', vsId: 'ecmel.vscode-html-css', desc: 'CSS completion in HTML', category: 'Web', status: 'native', nativeNote: 'Monaco HTML/CSS language services' },
  { name: 'Vue - Official', vsId: 'Vue.volar', desc: 'Official Vue.js language support', category: 'Web', status: 'install' },
  { name: 'Angular Language Service', vsId: 'Angular.ng-template', desc: 'Angular support', category: 'Web', status: 'install' },
  { name: 'ES7+ React Snippets', vsId: 'dsznajder.es7-react-js-snippets', desc: 'React code snippets', category: 'Web', status: 'install' },
  { name: 'Import Cost', vsId: 'wix.vscode-import-cost', desc: 'Show imported package sizes', category: 'Web', status: 'external' },
  { name: 'JavaScript (ES6) Snippets', vsId: 'xabikos.JavaScriptSnippets', desc: 'JS/ES6 snippets', category: 'Web', status: 'native', nativeNote: 'Built-in snippet system + user snippets' },
  { name: 'Quokka.js', vsId: 'WallabyJs.quokka-vscode', desc: 'Live JS scratchpad', category: 'Web', status: 'external' },
  { name: 'Live Sass Compiler', vsId: 'glenn2223.live-sass', desc: 'Compile SCSS to CSS live', category: 'Web', status: 'external' },
  { name: 'Tailwind Fold', vsId: 'stivo.tailwind-fold', desc: 'Fold long Tailwind classes', category: 'Web', status: 'external' },
  { name: 'Vetur', vsId: 'octref.vetur', desc: 'Vue.js support (legacy)', category: 'Web', status: 'install' },
  { name: 'JSON Crack', vsId: 'AykutSarac.jsoncrack-vscode', desc: 'Visualize JSON interactively', category: 'Web', status: 'external' },
  { name: 'SVG Preview', vsId: 'SimonSiefke.svg-preview', desc: 'Preview SVG files', category: 'Web', status: 'native', nativeNote: 'Built-in image/SVG preview' },
  { name: 'Polacode', vsId: 'pnp.polacode', desc: 'Pretty code screenshots', category: 'Web', status: 'external' },
  { name: 'CSS Modules', vsId: 'clinyong.vscode-css-modules', desc: 'CSS Modules support', category: 'Web', status: 'install' },
  { name: 'Styled Components', vsId: 'styled-components.vscode-styled-components', desc: 'Styled-components support', category: 'Web', status: 'install' },
  { name: 'Webhint', vsId: 'webhint.vscode-webhint', desc: 'Accessibility & best practices linting', category: 'Web', status: 'external' },
  { name: 'Turbo Console Log', vsId: 'ChakrounAnas.turbo-console-log', desc: 'Smart console.log insertion', category: 'Web', status: 'native', nativeNote: 'Insert console.log command' },

  // ===== Python & Data =====
  { name: 'Python', vsId: 'ms-python.python', desc: 'Official Python support', category: 'Python & Data', status: 'native', nativeNote: 'Python highlighting + Run + pdb debugging + AI agent' },
  { name: 'Pylance', vsId: 'ms-python.vscode-pylance', desc: 'Fast Python analysis', category: 'Python & Data', status: 'external' },
  { name: 'Jupyter', vsId: 'ms-toolsai.jupyter', desc: 'Jupyter notebooks in the editor', category: 'Python & Data', status: 'external' },
  { name: 'Python Indent', vsId: 'KevinRose.vsc-python-indent', desc: 'Correct Python indentation', category: 'Python & Data', status: 'external' },
  { name: 'autoDocstring', vsId: 'njpwerner.autodocstring', desc: 'Generate Python docstrings', category: 'Python & Data', status: 'native', nativeNote: 'Generate Docstring command' },
  { name: 'Black Formatter', vsId: 'ms-python.black-formatter', desc: 'Black formatting for Python', category: 'Python & Data', status: 'external' },
  { name: 'Ruff', vsId: 'charliermarsh.ruff', desc: 'Fast Python linter/formatter', category: 'Python & Data', status: 'external' },
  { name: 'Data Wrangler', vsId: 'ms-toolsai.datawrangler', desc: 'Interactive data cleaning', category: 'Python & Data', status: 'external' },
  { name: 'Rainbow CSV', vsId: 'mechatroner.rainbow-csv', desc: 'Colorize CSV columns', category: 'Python & Data', status: 'install' },
  { name: 'Excel Viewer', vsId: 'GrapeCity.gc-excelviewer', desc: 'Preview CSV/Excel files', category: 'Python & Data', status: 'install' },

  // ===== Backend & APIs =====
  { name: 'Thunder Client', vsId: 'rangav.vscode-thunder-client', desc: 'REST API testing', category: 'Backend & APIs', status: 'external' },
  { name: 'REST Client', vsId: 'humao.rest-client', desc: 'Send HTTP requests', category: 'Backend & APIs', status: 'external' },
  { name: 'Docker', vsId: 'ms-azuretools.vscode-docker', desc: 'Manage Docker containers', category: 'Backend & APIs', status: 'native', nativeNote: 'Dockerfile highlighting + terminal' },
  { name: 'Dev Containers', vsId: 'ms-vscode-remote.remote-containers', desc: 'Develop inside containers', category: 'Backend & APIs', status: 'external' },
  { name: 'REST API Client', vsId: 'Huachao.vscode-restclient', desc: 'Postman-like client', category: 'Backend & APIs', status: 'external' },
  { name: 'GraphQL', vsId: 'GraphQL.vscode-graphql', desc: 'GraphQL language support', category: 'Backend & APIs', status: 'native', nativeNote: 'GraphQL syntax highlighting' },
  { name: 'Prisma', vsId: 'Prisma.prisma', desc: 'Prisma ORM support', category: 'Backend & APIs', status: 'install' },
  { name: 'MongoDB for VS Code', vsId: 'mongodb.mongodb-vscode', desc: 'Manage MongoDB', category: 'Backend & APIs', status: 'external' },
  { name: 'SQLTools', vsId: 'mtxr.sqltools', desc: 'SQL database management', category: 'Backend & APIs', status: 'external' },
  { name: 'PostgreSQL', vsId: 'ckolkman.vscode-postgres', desc: 'PostgreSQL client', category: 'Backend & APIs', status: 'external' },
  { name: 'Redis', vsId: 'cweijan.vscode-redis-client', desc: 'Redis client', category: 'Backend & APIs', status: 'external' },
  { name: 'Swagger Viewer', vsId: 'Arjun.swagger-viewer', desc: 'Preview Swagger/OpenAPI', category: 'Backend & APIs', status: 'install' },

  // ===== Languages =====
  { name: 'Extension Pack for Java', vsId: 'vscjava.vscode-java-pack', desc: 'Full Java support', category: 'Languages', status: 'native', nativeNote: 'Java highlighting + Run + AI agent' },
  { name: 'C# Dev Kit', vsId: 'ms-dotnettools.csdevkit', desc: 'C#/.NET development', category: 'Languages', status: 'native', nativeNote: 'C# highlighting + AI agent' },
  { name: 'C/C++', vsId: 'ms-vscode.cpptools', desc: 'C/C++ support', category: 'Languages', status: 'native', nativeNote: 'C/C++ highlighting + gcc/g++ Run' },
  { name: 'Go', vsId: 'golang.go', desc: 'Official Go support', category: 'Languages', status: 'native', nativeNote: 'Go highlighting + go run' },
  { name: 'Rust Analyzer', vsId: 'rust-lang.rust-analyzer', desc: 'Rust support', category: 'Languages', status: 'native', nativeNote: 'Rust highlighting + rustc Run' },
  { name: 'PHP Intelephense', vsId: 'bmewburn.vscode-intelephense-client', desc: 'PHP support', category: 'Languages', status: 'native', nativeNote: 'PHP highlighting + php Run' },
  { name: 'Kotlin Language', vsId: 'mathiasfrohlich.Kotlin', desc: 'Kotlin support', category: 'Languages', status: 'native', nativeNote: 'Kotlin highlighting' },
  { name: 'Ruby LSP', vsId: 'Shopify.ruby-lsp', desc: 'Ruby support', category: 'Languages', status: 'native', nativeNote: 'Ruby highlighting + ruby Run' },
  { name: 'Swift', vsId: 'sswg.swift-lang', desc: 'Swift support', category: 'Languages', status: 'native', nativeNote: 'Swift highlighting' },
  { name: 'Dart', vsId: 'Dart-Code.dart-code', desc: 'Dart support', category: 'Languages', status: 'native', nativeNote: 'Dart highlighting' },
  { name: 'Flutter', vsId: 'Dart-Code.flutter', desc: 'Flutter development', category: 'Languages', status: 'native', nativeNote: 'Dart highlighting + terminal' },

  // ===== DevOps & Cloud =====
  { name: 'Kubernetes', vsId: 'ms-kubernetes-tools.vscode-kubernetes-tools', desc: 'Manage K8s clusters', category: 'DevOps & Cloud', status: 'native', nativeNote: 'YAML highlighting + terminal (kubectl)' },
  { name: 'Remote - SSH', vsId: 'ms-vscode-remote.remote-ssh', desc: 'Work on remote servers', category: 'DevOps & Cloud', status: 'external' },
  { name: 'Terraform', vsId: 'hashicorp.terraform', desc: 'Infrastructure as Code', category: 'DevOps & Cloud', status: 'native', nativeNote: 'HCL/Terraform highlighting' },
  { name: 'AWS Toolkit', vsId: 'amazonwebservices.aws-toolkit-vscode', desc: 'AWS integration', category: 'DevOps & Cloud', status: 'external' },
  { name: 'Azure Tools', vsId: 'ms-vscode.vscode-node-azure-pack', desc: 'Azure integration', category: 'DevOps & Cloud', status: 'external' },
  { name: 'GitLab Workflow', vsId: 'GitLab.gitlab-workflow', desc: 'GitLab integration', category: 'DevOps & Cloud', status: 'external' },
  { name: 'GitHub Actions', vsId: 'github.vscode-github-actions', desc: 'CI/CD workflows', category: 'DevOps & Cloud', status: 'native', nativeNote: 'YAML highlighting + AI agent' },
  { name: 'Snyk Security', vsId: 'snyk-security.snyk-vulnerability-scanner', desc: 'Vulnerability scanning', category: 'DevOps & Cloud', status: 'external' },
  { name: 'SonarLint', vsId: 'SonarSource.sonarlint-vscode', desc: 'Code quality & security', category: 'DevOps & Cloud', status: 'external' },
  { name: 'DotENV', vsId: 'mikestead.dotenv', desc: '.env file support', category: 'DevOps & Cloud', status: 'install' },
  { name: 'YAML', vsId: 'redhat.vscode-yaml', desc: 'YAML support + validation', category: 'DevOps & Cloud', status: 'native', nativeNote: 'Monaco YAML language service' },
  { name: 'Ansible', vsId: 'redhat.ansible', desc: 'Ansible automation', category: 'DevOps & Cloud', status: 'install' },

  // ===== Git & Collaboration =====
  { name: 'GitHub Pull Requests', vsId: 'GitHub.vscode-pull-request-github', desc: 'Manage PRs and Issues', category: 'Git & Collaboration', status: 'external' },
  { name: 'Git Graph', vsId: 'mhutchie.git-graph', desc: 'Visual branch tree', category: 'Git & Collaboration', status: 'native', nativeNote: 'Git panel + visual diff viewer' },
  { name: 'Git History', vsId: 'donjayamanne.githistory', desc: 'Browse commit history', category: 'Git & Collaboration', status: 'native', nativeNote: 'Timeline + git terminal' },
  { name: 'Conventional Commits', vsId: 'vivaxy.vscode-conventional-commits', desc: 'Standardized commit messages', category: 'Git & Collaboration', status: 'native', nativeNote: 'Commit prefix buttons (feat/fix/docs…)' },
  { name: 'GitDoc', vsId: 'vsls-contrib.gitdoc', desc: 'Auto-commit while typing', category: 'Git & Collaboration', status: 'external' },

  // ===== Productivity =====
  { name: 'TODO Tree', vsId: 'Gruntfuggly.todo-tree', desc: 'All TODOs in one tree', category: 'Productivity', status: 'native', nativeNote: 'Built-in TODO panel (sidebar)' },
  { name: 'Bookmarks', vsId: 'alefragnani.Bookmarks', desc: 'Mark lines to jump back to', category: 'Productivity', status: 'native', nativeNote: 'Built-in breakpoints/bookmarks gutter' },
  { name: 'Code Runner', vsId: 'formulahendry.code-runner', desc: 'Run code in many languages', category: 'Productivity', status: 'native', nativeNote: 'Run button (F5) with auto-detection' },
  { name: 'Markdown All in One', vsId: 'yzhang.markdown-all-in-one', desc: 'Markdown editing + preview', category: 'Productivity', status: 'native', nativeNote: 'Built-in Markdown preview' },
  { name: 'Markdown Preview Enhanced', vsId: 'shd101wyy.markdown-preview-enhanced', desc: 'Advanced Markdown preview', category: 'Productivity', status: 'native', nativeNote: 'Built-in Markdown preview' },
  { name: 'Draw.io Integration', vsId: 'hediet.vscode-drawio', desc: 'Diagrams inside the editor', category: 'Productivity', status: 'external' },
  { name: 'Numbered Bookmarks', vsId: 'alefragnani.numbered-bookmarks', desc: 'Numbered bookmarks', category: 'Productivity', status: 'external' },
  { name: 'vscode-icons', vsId: 'vscode-icons-team.vscode-icons', desc: 'Alternative file icons', category: 'Productivity', status: 'install' },
  { name: 'Trailing Spaces', vsId: 'shardulm94.trailing-spaces', desc: 'Remove trailing whitespace', category: 'Productivity', status: 'native', nativeNote: 'Trim Trailing Whitespace command' },
  { name: 'Version Lens', vsId: 'pflannery.vscode-versionlens', desc: 'Latest package versions', category: 'Productivity', status: 'external' },
  { name: 'Output Colorizer', vsId: 'IBM.output-colorizer', desc: 'Colorize terminal output', category: 'Productivity', status: 'native', nativeNote: 'xterm.js with 256-color theme' },

  // ===== Testing =====
  { name: 'Jest', vsId: 'Orta.vscode-jest', desc: 'Run and watch Jest tests', category: 'Testing', status: 'native', nativeNote: 'Tasks (npm scripts) + terminal + AI tests' },
  { name: 'Test Explorer UI', vsId: 'hbenl.vscode-test-explorer', desc: 'Unified test results UI', category: 'Testing', status: 'external' },
  { name: 'Playwright Test', vsId: 'ms-playwright.playwright', desc: 'Browser automation tests', category: 'Testing', status: 'external' },
  { name: 'Cypress Snippets', vsId: 'andrew-codes.cypress-snippets', desc: 'Cypress test snippets', category: 'Testing', status: 'install' },
];

export function searchFeatured(query: string): FeaturedExtension[] {
  const q = query.toLowerCase();
  if (!q) return FEATURED_EXTENSIONS;
  return FEATURED_EXTENSIONS.filter(
    (e) => e.name.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q) || e.vsId.toLowerCase().includes(q)
  );
}
