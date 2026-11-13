#!/usr/bin/env node
// `npm run agent`: regenerates the authoring agent from the vocabulary and schema.
//   agent/org-atlas-agent.md            portable system prompt for any LLM
//   agent/tool.json                     tool / function definition for structured output
//   .claude/agents/org-atlas-author.md  Claude Code subagent
//   AGENTS.md                           instructions for coding agents
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../lib/config.mjs';
import { buildAgent } from '../lib/agent.mjs';

const { body, tool, claudeAgent, agentsMd } = buildAgent();
mkdirSync(join(ROOT, 'agent'), { recursive: true });
mkdirSync(join(ROOT, '.claude', 'agents'), { recursive: true });
writeFileSync(join(ROOT, 'agent', 'org-atlas-agent.md'), body);
writeFileSync(join(ROOT, 'agent', 'tool.json'), JSON.stringify(tool, null, 2) + '\n');
writeFileSync(join(ROOT, '.claude', 'agents', 'org-atlas-author.md'), claudeAgent);
writeFileSync(join(ROOT, 'AGENTS.md'), agentsMd);
console.log('Wrote agent/org-atlas-agent.md, agent/tool.json, .claude/agents/org-atlas-author.md, AGENTS.md');
