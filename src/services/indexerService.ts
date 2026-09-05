import { create } from 'zustand';
import { useFileStore } from '../store/useFileStore';

/**
 * Lightweight local codebase index (RAG-style context retrieval).
 * Chunks every code file, builds an inverted TF index, and answers
 * queries with the most relevant chunks to inject into AI context.
 */

interface IndexChunk {
  path: string;
  startLine: number;
  text: string;
  tokens: Map<string, number>;
  size: number;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out',
  'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who',
  'its', 'did', 'that', 'this', 'with', 'from', 'they', 'have', 'will', 'been', 'were', 'when',
  'what', 'your', 'into', 'than', 'then', 'them', 'these', 'there', 'would', 'could', 'should',
  'const', 'let', 'var', 'function', 'return', 'import', 'export', 'class', 'public', 'private',
]);

const CODE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.kt', '.c', '.h', '.cpp', '.hpp',
  '.cs', '.php', '.rb', '.swift', '.dart', '.lua', '.sql', '.html', '.css', '.scss', '.vue',
  '.svelte', '.md', '.json', '.yml', '.yaml', '.sh', '.ps1', '.toml', '.xml',
]);

const MAX_FILES = 250;
const CHUNK_LINES = 60;
const MAX_INDEXED_SIZE = 150 * 1024; // skip files >150KB for indexing

interface IndexState {
  ready: boolean;
  indexing: boolean;
  fileCount: number;
  chunkCount: number;
  lastBuilt: number;
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z_][a-z0-9_]{2,}/g) || []).filter((w) => !STOP_WORDS.has(w));
}

class CodeIndex {
  private chunks: IndexChunk[] = [];
  private postings = new Map<string, number[]>(); // token -> chunk indices
  private rebuildTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastRebuild = 0;
  status = create<IndexState>(() => ({ ready: false, indexing: false, fileCount: 0, chunkCount: 0, lastBuilt: 0 }));

  /** Debounced rebuild — prevents thrashing on rapid file changes, optimized for large projects */
  debouncedRebuild(delayMs = 2500): void {
    if (this.rebuildTimeout) clearTimeout(this.rebuildTimeout);
    // For large projects, use longer debounce to keep editor snappy
    if (Date.now() - this.lastRebuild < 12000 && !this.status.getState().indexing) {
      delayMs = 7000;
    }
    this.rebuildTimeout = setTimeout(() => void this.rebuild(), delayMs);
  }

  async rebuild(): Promise<void> {
    const st = this.status.getState();
    if (st.indexing) return;
    // Throttle: don't rebuild more than once per 8 seconds (was 5s) — less CPU for big projects
    if (Date.now() - this.lastRebuild < 8000) return;
    this.lastRebuild = Date.now();
    this.status.setState({ indexing: true, fileCount: 0 });
    const { roots } = useFileStore.getState();
    const allRoots = roots.filter(Boolean) as string[];
    this.chunks = [];
    this.postings.clear();

    try {
      let totalFiles = 0;
      for (const root of allRoots) {
        let files: string[] = [];
        try {
          files = await window.velo.listAllFiles(root);
        } catch {
          continue;
        }
        const codeFiles = files.filter((f) => CODE_EXTS.has(f.slice(f.lastIndexOf('.')).toLowerCase()));
        const slice = codeFiles.slice(0, MAX_FILES);
        totalFiles += slice.length;
        // Process in batches of 6 concurrent reads to avoid IPC flood on large projects
        const BATCH = 6;
        for (let b = 0; b < slice.length; b += BATCH) {
          const batch = slice.slice(b, b + BATCH);
          const results = await Promise.allSettled(batch.map((f) => window.velo.readFile(f)));
          for (let i = 0; i < batch.length; i++) {
            const r = results[i];
            if (r.status !== 'fulfilled') continue;
            const res = r.value as { binary: boolean; content: string };
            if ((res as any).binary || !res.content || res.content.length > MAX_INDEXED_SIZE) continue;
            const lines = res.content.split('\n');
            for (let ln = 0; ln < lines.length; ln += CHUNK_LINES) {
              const text = lines.slice(ln, ln + CHUNK_LINES).join('\n');
              if (!text.trim()) continue;
              const tokens = tokenize(text);
              if (tokens.length === 0) continue;
              const tf = new Map<string, number>();
              for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
              const idx = this.chunks.length;
              this.chunks.push({ path: batch[i], startLine: ln + 1, text, tokens: tf, size: tokens.length });
              for (const t of tf.keys()) {
                const list = this.postings.get(t) || [];
                list.push(idx);
                this.postings.set(t, list);
              }
            }
          }
          // Yield to main thread every batch to keep UI responsive
          if (b % 30 === 0) await new Promise((res) => setTimeout(res, 12));
        }
      }
      this.status.setState({
        ready: this.chunks.length > 0,
        indexing: false,
        fileCount: totalFiles,
        chunkCount: this.chunks.length,
        lastBuilt: Date.now(),
      });
    } catch {
      this.status.setState({ indexing: false });
    }
  }

  query(text: string, topK = 6): Array<{ path: string; startLine: number; text: string; score: number }> {
    if (!this.status.getState().ready) return [];
    const tokens = tokenize(text);
    if (tokens.length === 0) return [];
    const scores = new Map<number, number>();
    const N = Math.max(this.chunks.length, 1);
    for (const t of new Set(tokens)) {
      const list = this.postings.get(t);
      if (!list) continue;
      const idf = Math.log(1 + N / list.length);
      for (const idx of list) {
        const chunk = this.chunks[idx];
        const tf = chunk.tokens.get(t) || 0;
        const norm = tf / Math.sqrt(chunk.size || 1);
        scores.set(idx, (scores.get(idx) || 0) + idf * norm);
      }
    }
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([idx, score]) => {
        const c = this.chunks[idx];
        return { path: c.path, startLine: c.startLine, text: c.text, score };
      });
  }
}

export const codeIndex = new CodeIndex();
export const useIndexStatus = codeIndex.status;

export function relevantContextFor(query: string, topK = 6): string {
  const results = codeIndex.query(query, topK);
  if (results.length === 0) return '';
  const parts = ['--- Relevant code from the workspace (auto-retrieved) ---'];
  for (const r of results) {
    parts.push(`${r.path} (from line ${r.startLine}):\n\`\`\`\n${r.text.slice(0, 3000)}\n\`\`\``);
  }
  return parts.join('\n\n');
}
