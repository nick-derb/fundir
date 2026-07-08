import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  let content = '';

  if (ext === 'csv' || ext === 'txt') {
    content = buffer.toString('utf-8');

  } else if (ext === 'xlsx' || ext === 'xls') {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const parts: string[] = [];
    for (const name of wb.SheetNames.slice(0, 10)) {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
      if (csv.trim()) parts.push(`=== Sheet: ${name} ===\n${csv}`);
    }
    content = parts.join('\n\n');

  } else if (ext === 'docx') {
    const raw = buffer.toString('latin1');
    const matches = raw.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [];
    content = matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ').replace(/\s+/g, ' ').trim();

  } else if (ext === 'pptx') {
    // Best-effort: pptx slide text lives in <a:t> runs (same ZIP-XML trick as docx)
    const raw = buffer.toString('latin1');
    const matches = raw.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) ?? [];
    content = matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ').replace(/\s+/g, ' ').trim();
    if (!content.trim()) {
      return NextResponse.json({ error: 'Could not extract text from this PowerPoint. Try exporting it as PDF and uploading that instead.' }, { status: 400 });
    }

  } else if (ext === 'pdf') {
    // No text extraction — hand the PDF to Claude natively as base64
    if (buffer.byteLength > 4_000_000) {
      return NextResponse.json({ error: 'PDF too large to analyze (max ~4MB). Try exporting the relevant pages, or upload as .docx/.xlsx.' }, { status: 413 });
    }
    return NextResponse.json({
      name: file.name,
      pdfBase64: buffer.toString('base64'),
      chars: buffer.byteLength,
    });

  } else {
    return NextResponse.json({ error: `Unsupported file type: .${ext}. Use .xlsx, .xls, .csv, .docx, .pptx, .pdf, or .txt` }, { status: 400 });
  }

  if (!content.trim()) {
    return NextResponse.json({ error: 'File appears to be empty or could not be read' }, { status: 400 });
  }

  if (content.length > 150_000) {
    content = content.slice(0, 150_000) + '\n\n[Content truncated — 150,000 character limit reached]';
  }

  return NextResponse.json({ name: file.name, content, chars: content.length });
}
