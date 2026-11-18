// Blank spreadsheets the Data Hub hands out, so an upload lands in the shape
// the importers read. One header row on the first sheet; how to fill it in on
// a second sheet, so no example row is ever imported by mistake.

import * as XLSX from 'xlsx';

function book(headers: string[], widths: number[], notes: string[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  ws['!cols'] = widths.map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, 'Fill in');
  const help = XLSX.utils.aoa_to_sheet(notes);
  help['!cols'] = [{ wch: 26 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, help, 'How to fill it in');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export const rosterTemplate = () => book(
  ['Name', 'Board', 'Role', 'Company / affiliation', 'Email', 'Status'],
  [28, 24, 18, 34, 30, 16],
  [
    ['Column', 'What to put in it'],
    ['Name', 'Full name, one person per row. Required.'],
    ['Board', 'Board of Directors, Auxiliary Board or Leadership Council. Leave blank if the whole file is the Board of Directors.'],
    ['Role', 'Chair, Vice Chair, Secretary, Treasurer or Member. Blank reads as Member.'],
    ['Company / affiliation', 'Optional. Used until the person\'s LinkedIn profile is read.'],
    ['Email', 'Optional.'],
    ['Status', 'Optional. Write "Rolling off" for someone leaving; anyone on the current roster who is missing from the file is rolled off too.'],
    ['', ''],
    ['Tip', 'Upload the full new roster for each board you include. Boards not in the file are left as they are.'],
  ],
);

export const surveyTemplate = () => book(
  ['Board member', 'Foundation', 'Who you know there', 'How you know them', 'Willing to introduce?', 'Notes'],
  [28, 36, 28, 34, 20, 40],
  [
    ['Column', 'What to put in it'],
    ['Board member', 'The board member answering. Required.'],
    ['Foundation', 'One foundation per row, or several in one cell separated by semicolons. Required.'],
    ['Who you know there', 'Optional: the trustee, officer or staff member they know.'],
    ['How you know them', 'Optional: e.g. close friend, former colleague, served on a board together, acquaintance.'],
    ['Willing to introduce?', 'Yes, No or Maybe.'],
    ['Notes', 'Optional.'],
    ['', ''],
    ['Forms exports', 'A Microsoft Forms or Google Forms export works as is, as long as one question asks for the member\'s name and one for the foundations.'],
  ],
);
