// Agent tool registry — the reusable capabilities of the Fundir Advisor.
//
// Each tool is provider-agnostic: it takes an AgentContext + validated input and
// returns a plain-text result. Because they're pure functions of the context,
// the SAME executors back the dashboard chat (Route A) and the neutral /api/agent
// endpoint a Teams bot / M365 Copilot plugin will call (Route C). The JSON schema
// on each tool doubles as the OpenAPI operation schema exposed to Copilot.

import type Anthropic from '@anthropic-ai/sdk';
import type { AgentContext } from './context';
import type { Provider } from '@/lib/oauth-tokens';
import {
  listOneDriveFiles,
  extractContent,
  uploadTextFile,
  type GraphFile,
} from '@/lib/microsoft-graph';
import { getOrgFinancialProfile } from '@/lib/org-financials';

export interface AgentTool {
  name:        string;
  description: string;
  /** JSON Schema (object). Doubles as the OpenAPI operation schema for Route C. */
  inputSchema: Record<string, unknown>;
  /** Read-only tools have no side effects — the safe subset to expose externally. */
  readOnly:    boolean;
  /** Cloud provider this tool needs connected, or null if it only reads Fundir data. */
  requires:    Provider | null;
  execute(ctx: AgentContext, input: Record<string, unknown>): Promise<string>;
}

// ── grant pipeline ──────────────────────────────────────────────────────────
const searchGrantPipeline: AgentTool = {
  name: 'search_grant_pipeline',
  description:
    "Get the organization's current grant matches from Fundir's discovery engine — " +
    'grant titles, funding agencies, match scores (0-100), pipeline stage, and close dates. ' +
    'Use this whenever the user asks what to prioritize, what is in the pipeline, what is ' +
    'closing soon, or about specific grants.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'integer', description: 'Max matches to return (default 15, max 40).' },
    },
    additionalProperties: false,
  },
  readOnly: true,
  requires: null,
  async execute(ctx, input) {
    const limit = Math.min(Math.max(Number(input.limit) || 15, 1), 40);
    const { data } = await ctx.db
      .from('match_results')
      .select('composite_score, pipeline_stage, recommendation, grant:grant_opportunities(title, agency_name, close_date)')
      .eq('org_id', ctx.orgId)
      .order('composite_score', { ascending: false })
      .limit(limit);

    if (!data?.length) {
      return 'No grants discovered yet for this organization. Suggest running discovery from the Matches page.';
    }
    return data
      .map((m) => {
        const g = m.grant as { title?: string; agency_name?: string; close_date?: string } | null;
        return `- ${g?.title ?? 'Untitled grant'} (${g?.agency_name ?? 'agency unknown'}) — ` +
          `score ${Math.round(m.composite_score)}/100, stage: ${m.pipeline_stage}` +
          `${m.recommendation ? `, rec: ${m.recommendation}` : ''}` +
          `${g?.close_date ? `, closes ${g.close_date}` : ''}`;
      })
      .join('\n');
  },
};

// ── financial snapshot ──────────────────────────────────────────────────────
const getFinancialSnapshot: AgentTool = {
  name: 'get_financial_snapshot',
  description:
    "Get the organization's financial intelligence — revenue mix, funding-concentration " +
    'risk, months of operating reserves, and grant-readiness signals. Use this when the ' +
    'user asks about financial health, risk, reserves, or funder positioning.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  readOnly: true,
  requires: null,
  async execute(ctx) {
    const fin = await getOrgFinancialProfile(ctx.orgCode);
    const intel = fin?.buildIntelligenceContext?.() ?? '';
    return intel.trim().length > 0
      ? intel
      : 'No detailed financial intelligence profile is loaded for this organization. Base analysis on the grant pipeline and general strategy.';
  },
};

// ── OneDrive: search ────────────────────────────────────────────────────────
const searchDocuments: AgentTool = {
  name: 'search_documents',
  description:
    "Search the organization's Microsoft OneDrive for documents by keyword (e.g. 'board " +
    "minutes', 'FY2025 budget', '990'). Returns file names and IDs. Use the returned id " +
    'with read_document to open a file. Leave the query empty to list recent files.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Keywords to match in file names/content.' },
    },
    additionalProperties: false,
  },
  readOnly: true,
  requires: 'microsoft',
  async execute(ctx, input) {
    const token = await ctx.getToken('microsoft');
    if (!token) return 'Microsoft 365 is not connected for this organization — connect it in Settings to search OneDrive.';
    const query = String(input.query ?? '').trim();
    const files = await listOneDriveFiles(token, query || undefined);
    if (!files.length) return query ? `No OneDrive documents matched "${query}".` : 'No documents found in OneDrive.';
    return files
      .slice(0, 20)
      .map((f) =>
        `- ${f.name} · id=${f.id} · modified ${f.lastModifiedDateTime?.slice(0, 10) ?? '?'}` +
        `${f.size ? ` · ${Math.round(f.size / 1024)}KB` : ''}`,
      )
      .join('\n');
  },
};

// ── OneDrive: read ──────────────────────────────────────────────────────────
const readDocument: AgentTool = {
  name: 'read_document',
  description:
    'Read the text of a specific OneDrive document by its id (from search_documents). ' +
    'Works for Excel, Word, PowerPoint, CSV, and text files. For PDFs, direct the user to ' +
    'the Financials → AI Analyzer, which reads PDFs natively.',
  inputSchema: {
    type: 'object',
    properties: {
      fileId:   { type: 'string', description: 'The OneDrive item id from search_documents.' },
      fileName: { type: 'string', description: 'The file name incl. extension, for correct parsing.' },
    },
    required: ['fileId'],
    additionalProperties: false,
  },
  readOnly: true,
  requires: 'microsoft',
  async execute(ctx, input) {
    const token = await ctx.getToken('microsoft');
    if (!token) return 'Microsoft 365 is not connected, so I cannot open OneDrive documents.';
    const fileId = String(input.fileId ?? '').trim();
    const fileName = String(input.fileName ?? 'document');
    if (!fileId) return 'Provide the fileId (from search_documents) of the document to read.';
    if (fileName.toLowerCase().endsWith('.pdf')) {
      return 'This is a PDF. Ask the user to run it through the Financials → AI Analyzer, which reads PDFs natively — I cannot extract PDF text here.';
    }
    const file: GraphFile = { id: fileId, name: fileName, lastModifiedDateTime: '' };
    const text = await extractContent(token, file);
    if (!text.trim()) return 'The document appears to be empty or could not be read.';
    // Keep the tool result bounded so a huge spreadsheet does not blow the context window.
    return text.length > 20_000 ? text.slice(0, 20_000) + '\n\n[Document truncated at 20,000 characters.]' : text;
  },
};

// ── OneDrive: write (side effect — excluded from the read-only external subset) ─
const saveDraftToOneDrive: AgentTool = {
  name: 'save_draft_to_onedrive',
  description:
    'Save drafted content (funder talking points, an LOI outline, a summary) as a new ' +
    'markdown file in the "Fundir Drafts" folder of the organization\'s OneDrive. Always ' +
    'creates a new file — never overwrites. Use only when the user asks to save or export something.',
  inputSchema: {
    type: 'object',
    properties: {
      title:   { type: 'string', description: 'Short title — becomes the file name.' },
      content: { type: 'string', description: 'The full text/markdown to save.' },
    },
    required: ['title', 'content'],
    additionalProperties: false,
  },
  readOnly: false,
  requires: 'microsoft',
  async execute(ctx, input) {
    const token = await ctx.getToken('microsoft');
    if (!token) return 'Microsoft 365 is not connected, so I cannot save to OneDrive.';
    const title = String(input.title ?? '').trim() || 'Fundir draft';
    const content = String(input.content ?? '').trim();
    if (content.length < 10) return 'Nothing to save — provide the draft content.';
    const file = await uploadTextFile(token, `${title}.md`, content, { folderName: 'Fundir Drafts' });
    return `Saved "${file.name}" to the "Fundir Drafts" folder in OneDrive.${file.webUrl ? ` Link: ${file.webUrl}` : ''}`;
  },
};

// ── registry + selectors ────────────────────────────────────────────────────
export const AGENT_TOOLS: AgentTool[] = [
  searchGrantPipeline,
  getFinancialSnapshot,
  searchDocuments,
  readDocument,
  saveDraftToOneDrive,
];

/** Filter the registry — e.g. read-only subset for external (Copilot) exposure. */
export function selectTools(opts?: { readOnlyOnly?: boolean }): AgentTool[] {
  return AGENT_TOOLS.filter((t) => !opts?.readOnlyOnly || t.readOnly);
}

/** Convert registry tools to the Anthropic Messages API tool shape. */
export function toAnthropicTools(tools: AgentTool[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name:         t.name,
    description:  t.description,
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  }));
}
