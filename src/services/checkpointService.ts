/**
 * Checkpoint Service — OpenCode-style isolated persistence
 * Handles save/load/delete for Team and Agent without scattering logic in useAIStore
 */

export interface TeamCheckpoint {
  plan: string;
  convo: Array<{ role: string; content: string }>;
  touched: Array<[string, string]>;
  goal: string;
  ts: number;
}

export interface AgentCheckpoint {
  convo: Array<{ role: string; content: string }>;
  goal: string;
  touched: string[];
  ts: number;
}

const TEAM_KEY = 'team-checkpoint';
const AGENT_KEY = 'agent-checkpoint';
const RECENT_MS = 30 * 60 * 1000;

export async function loadTeamCheckpoint(currentGoal: string): Promise<{ plan: string | null; convo: Array<{ role: string; content: string }>; touched: Map<string, string> } | null> {
  try {
    const saved = await window.velo.dbLoad(TEAM_KEY);
    if (!saved || typeof saved !== 'object') return null;
    const d = saved as TeamCheckpoint;
    const isRecent = !d.ts || Date.now() - d.ts < RECENT_MS;
    const goalMatches = !d.goal || d.goal === currentGoal;
    if (!isRecent || !goalMatches) {
      await window.velo.dbDelete(TEAM_KEY).catch(() => undefined);
      return null;
    }
    const touched = new Map<string, string>();
    if (Array.isArray(d.touched)) for (const [k, v] of d.touched) touched.set(k, v);
    return {
      plan: d.plan || null,
      convo: Array.isArray(d.convo) ? d.convo : [],
      touched,
    };
  } catch {
    return null;
  }
}

export async function saveTeamCheckpoint(plan: string, convo: Array<{ role: string; content: string }>, touched: Map<string, string>, goal: string): Promise<void> {
  try {
    const data: TeamCheckpoint = {
      plan: plan.slice(0, 4000),
      convo: convo.map((m) => ({ role: m.role, content: m.content.slice(0, 6000) })),
      touched: Array.from(touched.entries()).map(([k, v]) => [k, v.slice(0, 2000)] as [string, string]),
      goal,
      ts: Date.now(),
    };
    await window.velo.dbSave(TEAM_KEY, data);
  } catch {}
}

export async function clearTeamCheckpoint(): Promise<void> {
  try { await window.velo.dbDelete(TEAM_KEY); } catch {}
}

export async function loadAgentCheckpoint(currentGoal: string): Promise<{ convo: Array<{ role: string; content: string }>; touched: Set<string> } | null> {
  try {
    const saved = await window.velo.dbLoad(AGENT_KEY);
    if (!saved || typeof saved !== 'object') return null;
    const d = saved as AgentCheckpoint;
    const isRecent = !d.ts || Date.now() - d.ts < RECENT_MS;
    const goalMatches = !d.goal || currentGoal.includes(d.goal.slice(0, 120)) || d.goal.includes(currentGoal.slice(0, 120));
    if (!isRecent || !goalMatches || !Array.isArray(d.convo) || d.convo.length < 3) {
      if (!isRecent || !goalMatches) await window.velo.dbDelete(AGENT_KEY).catch(() => undefined);
      return null;
    }
    return {
      convo: d.convo,
      touched: new Set(Array.isArray(d.touched) ? d.touched : []),
    };
  } catch {
    return null;
  }
}

export async function saveAgentCheckpoint(convo: Array<{ role: string; content: string }>, goal: string, touched: Set<string>): Promise<void> {
  try {
    const data: AgentCheckpoint = {
      convo: convo.map((m) => ({ role: m.role, content: m.content.slice(0, 6000) })),
      goal,
      touched: [...touched].map((p) => p.slice(0, 200)),
      ts: Date.now(),
    };
    await window.velo.dbSave(AGENT_KEY, data);
  } catch {}
}

export async function clearAgentCheckpoint(): Promise<void> {
  try { await window.velo.dbDelete(AGENT_KEY); } catch {}
}
