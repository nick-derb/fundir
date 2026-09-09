// IRS Form 990 bulk e-file access without bulk downloads.
//
// The IRS publishes, per year, an index CSV (EIN → return type → object id →
// which ~105 MB ZIP holds the XML) and the ZIPs themselves, which accept HTTP
// byte ranges. So instead of pulling multi-gigabyte archives we:
//   1. stream the index and keep only the EINs in scope,
//   2. read each needed ZIP's central directory over a range request,
//   3. range-read and inflate only the members we want.
// A full Chicago-scope pass touches a few dozen ZIPs and a few hundred
// filings at a few hundred KB each. Zero API cost; bandwidth only.
//
// Source URL recorded per filing: `${zipUrl}#${objectId}_public.xml` — a
// stable, re-fetchable citation into the IRS's own publication.

import { inflateRawSync } from 'node:zlib';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createWriteStream, existsSync, statSync, renameSync, readFileSync, unlinkSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';

const BASE = 'https://apps.irs.gov/pub/epostcard/990/xml';
const UA = 'FundirBot/1.0 (+https://www.fundir.ai; nonprofit research)';

export interface IndexRow {
  ein: string;
  taxPeriod: string;       // YYYYMM
  returnType: string;      // 990PF | 990 | 990EZ | 990T …
  objectId: string;
  batchId: string;         // e.g. 2024_TEOS_XML_03A
  taxpayerName: string;
  year: number;            // publication year of the index
}

export const indexUrl = (year: number) => `${BASE}/${year}/index_${year}.csv`;
// The index writes batch ids like "2024_TEOS_XML_06a"; the published files are "…06A.zip".
export const zipUrl = (year: number, batchId: string) => `${BASE}/${year}/${batchId.toUpperCase()}.zip`;
export const memberName = (objectId: string) => `${objectId}_public.xml`;

/** Minimal CSV line parser (quoted fields with commas/quotes). */
function parseCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Stream a year's index and return the rows for the wanted EINs / return
 * types. Cheap pre-filter on the raw line (EIN is the 3rd column) before
 * parsing, so a ~100 MB index costs seconds, not memory.
 */
export async function fetchIndexRows(
  year: number,
  wantedEins: Set<string>,
  types: Set<string> = new Set(['990PF', '990']),
  onProgress?: (lines: number) => void,
): Promise<IndexRow[]> {
  const res = await fetch(indexUrl(year), { headers: { 'User-Agent': UA } });
  if (!res.ok || !res.body) throw new Error(`index ${year}: HTTP ${res.status}`);
  const decoder = new TextDecoder();
  const rows: IndexRow[] = [];
  let header: string[] | null = null, rest = '', lines = 0;
  const col = (h: string[]) => ({ ein: h.indexOf('EIN'), tp: h.indexOf('TAX_PERIOD'), rt: h.indexOf('RETURN_TYPE'), oid: h.indexOf('OBJECT_ID'), b: h.indexOf('XML_BATCH_ID'), nm: h.indexOf('TAXPAYER_NAME') });
  let c: ReturnType<typeof col> | null = null;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    rest += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = rest.indexOf('\n')) >= 0) {
      const line = rest.slice(0, nl).replace(/\r$/, ''); rest = rest.slice(nl + 1);
      if (!line) continue;
      if (!header) { header = parseCsvLine(line); c = col(header); continue; }
      lines++;
      if (onProgress && lines % 200_000 === 0) onProgress(lines);
      // Fast path: EIN is the third column and never quoted.
      const a = line.indexOf(','), b = line.indexOf(',', a + 1), d = line.indexOf(',', b + 1);
      const ein = line.slice(b + 1, d);
      if (!wantedEins.has(ein)) continue;
      const f = parseCsvLine(line);
      const rt = f[c!.rt];
      if (!types.has(rt)) continue;
      rows.push({ ein, taxPeriod: f[c!.tp], returnType: rt, objectId: f[c!.oid], batchId: f[c!.b], taxpayerName: f[c!.nm], year });
    }
  }
  return rows;
}

// ── ZIP over HTTP ranges ────────────────────────────────────────────────────

export interface ZipEntry { name: string; method: number; compSize: number; uncompSize: number; localOffset: number; nameLen: number }

async function rangeGet(url: string, start: number, end: number): Promise<{ buf: Buffer; total: number | null }> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Range: `bytes=${start}-${end}` } });
  if (res.status !== 206 && res.status !== 200) throw new Error(`range ${start}-${end} on ${url}: HTTP ${res.status}`);
  const cr = res.headers.get('content-range');
  const total = cr ? Number(cr.split('/')[1]) || null : null;
  return { buf: Buffer.from(await res.arrayBuffer()), total };
}

async function headSize(url: string): Promise<number> {
  const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA } });
  const len = Number(res.headers.get('content-length'));
  if (!res.ok || !len) throw new Error(`HEAD ${url}: ${res.status}`);
  return len;
}

/** Read a ZIP's central directory (ZIP64-aware) with two or three range requests. */
export async function readZipEntries(url: string): Promise<{ size: number; entries: Map<string, ZipEntry> }> {
  const size = await headSize(url);
  const tailLen = Math.min(size, 65_557 + 20 + 56);
  const { buf: tail } = await rangeGet(url, size - tailLen, size - 1);

  // End of central directory record.
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error(`no EOCD in ${url}`);
  let count = tail.readUInt16LE(eocd + 10);
  let cdSize = tail.readUInt32LE(eocd + 12);
  let cdOffset = tail.readUInt32LE(eocd + 16);

  // ZIP64 (entries ≥ 65535 or sizes/offsets ≥ 4 GB).
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const loc = eocd - 20;
    if (loc >= 0 && tail.readUInt32LE(loc) === 0x07064b50) {
      const z64Off = Number(tail.readBigUInt64LE(loc + 8));
      const { buf: z } = await rangeGet(url, z64Off, z64Off + 55);
      if (z.readUInt32LE(0) !== 0x06064b50) throw new Error(`bad ZIP64 EOCD in ${url}`);
      count = Number(z.readBigUInt64LE(32));
      cdSize = Number(z.readBigUInt64LE(40));
      cdOffset = Number(z.readBigUInt64LE(48));
    }
  }

  const { buf: cd } = await rangeGet(url, cdOffset, cdOffset + cdSize - 1);
  const entries = new Map<string, ZipEntry>();
  let p = 0;
  while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
    const method = cd.readUInt16LE(p + 10);
    let compSize = cd.readUInt32LE(p + 20), uncompSize = cd.readUInt32LE(p + 24);
    const nameLen = cd.readUInt16LE(p + 28), extraLen = cd.readUInt16LE(p + 30), commentLen = cd.readUInt16LE(p + 32);
    let localOffset = cd.readUInt32LE(p + 42);
    const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
    // ZIP64 extra field carries whichever of (uncomp, comp, offset) overflowed, in that order.
    if (uncompSize === 0xffffffff || compSize === 0xffffffff || localOffset === 0xffffffff) {
      let q = p + 46 + nameLen; const end = q + extraLen;
      while (q + 4 <= end) {
        const id = cd.readUInt16LE(q), len = cd.readUInt16LE(q + 2); let r = q + 4;
        if (id === 0x0001) {
          if (uncompSize === 0xffffffff) { uncompSize = Number(cd.readBigUInt64LE(r)); r += 8; }
          if (compSize === 0xffffffff) { compSize = Number(cd.readBigUInt64LE(r)); r += 8; }
          if (localOffset === 0xffffffff) { localOffset = Number(cd.readBigUInt64LE(r)); r += 8; }
          break;
        }
        q += 4 + len;
      }
    }
    entries.set(name, { name, method, compSize, uncompSize, localOffset, nameLen });
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (entries.size === 0) throw new Error(`empty central directory in ${url} (expected ~${count})`);
  return { size, entries };
}

/** Members are "<objectId>_public.xml", sometimes under a folder ("2024_TEOS_XML_06A/…"). */
export function findEntry(entries: Map<string, ZipEntry>, objectId: string): ZipEntry | undefined {
  const exact = entries.get(memberName(objectId));
  if (exact) return exact;
  for (const [name, e] of entries) if (name.endsWith(memberName(objectId))) return e;
  return undefined;
}

/**
 * Read one member. Method 8 (Deflate — the 2024 archives) is range-read and
 * inflated in-process: one request. Method 9 (Deflate64 — the 2025 archives)
 * has no Node decoder, so the archive is downloaded ONCE to a local cache and
 * the member is extracted with PowerShell 7's .NET ZipArchive, which does
 * support Deflate64. Same bytes, same citation; just a slower first touch.
 */
export async function readZipMember(url: string, e: ZipEntry): Promise<string> {
  if (e.method === 9) return readViaDotNet(url, e);
  const guess = 30 + e.nameLen + 512 + e.compSize;
  const { buf } = await rangeGet(url, e.localOffset, e.localOffset + guess - 1);
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error(`bad local header for ${e.name}`);
  const nameLen = buf.readUInt16LE(26), extraLen = buf.readUInt16LE(28);
  const dataStart = 30 + nameLen + extraLen;
  let data = buf.subarray(dataStart, dataStart + e.compSize);
  if (data.length < e.compSize) {
    const { buf: more } = await rangeGet(url, e.localOffset + dataStart, e.localOffset + dataStart + e.compSize - 1);
    data = more;
  }
  const out = e.method === 8 ? inflateRawSync(data) : e.method === 0 ? data : null;
  if (!out) throw new Error(`unsupported compression ${e.method} for ${e.name}`);
  return out.toString('utf8');
}

// ── Deflate64 fallback: cached archive + .NET extraction ───────────────────

const CACHE_DIR = process.env.IRS_ZIP_CACHE || join(process.cwd(), '.cache', 'irs-zips');
const PWSH = process.env.PWSH_PATH || 'pwsh';

async function ensureCachedZip(url: string): Promise<string> {
  await mkdir(CACHE_DIR, { recursive: true });
  const file = join(CACHE_DIR, url.split('/').pop()!);
  if (existsSync(file) && statSync(file).size > 0) return file;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok || !res.body) throw new Error(`download ${url}: HTTP ${res.status}`);
  const tmp = `${file}.part`;
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp));
  renameSync(tmp, file);
  return file;
}

async function readViaDotNet(url: string, e: ZipEntry): Promise<string> {
  const zip = await ensureCachedZip(url);
  const out = join(CACHE_DIR, `${e.name.split('/').pop()}.tmp`);
  const script = [
    "Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem",
    `$z=[System.IO.Compression.ZipFile]::OpenRead('${zip.replace(/'/g, "''")}')`,
    `$e=$z.GetEntry('${e.name.replace(/'/g, "''")}'); if(-not $e){ $z.Dispose(); throw 'entry not found' }`,
    `$s=$e.Open(); $f=[System.IO.File]::Create('${out.replace(/'/g, "''")}'); $s.CopyTo($f); $f.Close(); $s.Close(); $z.Dispose()`,
  ].join('; ');
  const r = spawnSync(PWSH, ['-NoProfile', '-Command', script], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`.NET extraction failed for ${e.name}: ${(r.stderr || r.stdout).slice(0, 300)}`);
  const xml = readFileSync(out, 'utf8');
  try { unlinkSync(out); } catch { /* ignore */ }
  return xml;
}
