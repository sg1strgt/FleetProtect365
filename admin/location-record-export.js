(() => {
  'use strict';
  const xml = value => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const encoder = new TextEncoder();
  // Uncompressed ZIP keeps these small, text-only Office reports dependency-free.
  function zip(files, type) {
    const parts = [], directory = []; let offset = 0, directorySize = 0;
    for (const [path, text] of Object.entries(files)) {
      const name = encoder.encode(path), data = encoder.encode(text);
      let crc = 0xffffffff;
      for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
      crc = (crc ^ 0xffffffff) >>> 0;
      const header = new Uint8Array(30 + name.length), h = new DataView(header.buffer);
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint16(12, 33, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); header.set(name, 30);
      const central = new Uint8Array(46 + name.length), c = new DataView(central.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint16(14, 33, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true); central.set(name, 46);
      parts.push(header, data); directory.push(central); offset += header.length + data.length; directorySize += central.length;
    }
    const end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, directory.length, true); e.setUint16(10, directory.length, true); e.setUint32(12, directorySize, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...directory, end], {type});
  }
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const rels = (type, target) => `${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/></Relationships>`;
  function contentTypes(overrides) {
    return `${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides.map(([part, type]) => `<Override PartName="/${part}" ContentType="application/vnd.openxmlformats-officedocument.${type}+xml"/>`).join('')}</Types>`;
  }
  function values(rows) { return rows.map(row => [String(row.code_from) + (row.name_from ? ` — ${row.name_from}` : ''), String(row.code_to) + (row.name_to ? ` — ${row.name_to}` : ''), Number(row.miles)]); }
  const title = 'Fleet Protect 365 — Location ID Record', headers = ['From', 'To', 'Miles'];
  function build(rows, format) {
    if (!rows.length) throw new Error('No Location ID records are available.');
    if (rows.some(row => !Number.isFinite(Number(row.miles)) || Number(row.miles) < 0)) throw new Error('Each route must have valid, non-negative miles.');
    const body = values(rows), date = new Date().toLocaleDateString('en-US'); let blob;
    if (format === 'xlsx') {
      const data = [headers, ...body];
      const sheet = data.map((row, r) => `<row r="${r + 1}">${row.map((value, col) => {
        const ref = `${String.fromCharCode(65 + col)}${r + 1}`;
        return typeof value === 'number' ? `<c r="${ref}"><v>${value}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
      }).join('')}</row>`).join('');
      blob = zip({
        '[Content_Types].xml': contentTypes([['xl/workbook.xml','spreadsheetml.sheet.main'],['xl/worksheets/sheet1.xml','spreadsheetml.worksheet']]),
        '_rels/.rels': rels('officeDocument', 'xl/workbook.xml'),
        'xl/workbook.xml': `${declaration}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Location ID Record" sheetId="1" r:id="rId1"/></sheets></workbook>`,
        'xl/_rels/workbook.xml.rels': rels('worksheet', 'worksheets/sheet1.xml'),
        'xl/worksheets/sheet1.xml': `${declaration}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="2" width="42" customWidth="1"/><col min="3" max="3" width="14" customWidth="1"/></cols><sheetData>${sheet}</sheetData><autoFilter ref="A1:C${data.length}"/></worksheet>`
      }, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } else if (format === 'docx') {
      const paragraph = (text, bold = false) => `<w:p><w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
      const table = [headers, ...body].map((row, i) => `<w:tr>${i === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${row.map((value, col) => `<w:tc><w:tcPr><w:tcW w:w="${col === 2 ? 1200 : 4080}" w:type="dxa"/>${i === 0 ? '<w:shd w:fill="E8EDF4"/>' : ''}</w:tcPr>${paragraph(value, i === 0)}</w:tc>`).join('')}</w:tr>`).join('');
      blob = zip({
        '[Content_Types].xml': contentTypes([['word/document.xml','wordprocessingml.document.main']]),
        '_rels/.rels': rels('officeDocument', 'word/document.xml'),
        'word/document.xml': `${declaration}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph(title, true)}${paragraph(`Generated ${date} • ${rows.length} routes`)}<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="4" w:color="CBD5E1"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4080"/><w:gridCol w:w="4080"/><w:gridCol w:w="1200"/></w:tblGrid>${table}</w:tbl><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`
      }, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    } else if (format === 'pdf') {
      const doc = new window.jspdf.jsPDF();
      doc.setFontSize(16); doc.text('Fleet Protect 365 - Location ID Record', 14, 18);
      doc.setFontSize(10); doc.text(`Generated ${date} | ${rows.length} routes`, 14, 25);
      doc.autoTable({startY:31, head:[headers], body, styles:{fontSize:10,cellPadding:3,overflow:'linebreak'}, headStyles:{fillColor:[22,38,63]}, columnStyles:{0:{cellWidth:75},1:{cellWidth:75},2:{halign:'right'}}});
      blob = doc.output('blob');
    } else throw new Error('Choose Excel, Word, or PDF.');
    const stamp = new Date().toISOString().slice(0,10);
    return {blob, fileName:`FleetProtect365_Location_ID_Record_${stamp}.${format}`};
  }
  function print(rows) {
    if (!rows.length) throw new Error('No Location ID records are available.');
    const tab = window.open('about:blank', '_blank');
    if (!tab) throw new Error('Please allow pop-ups to print the Location ID Record.');
    tab.opener = null;
    tab.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font:14px Arial,sans-serif;margin:32px;color:#16263f}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:10px;text-align:left}th{background:#e8edf4}td:last-child{text-align:right}thead{display:table-header-group}tr{break-inside:avoid}button{padding:10px 18px}@media print{button{display:none}body{margin:0}}</style></head><body><button id="print">Print</button><h1>${title}</h1><p>${rows.length} routes</p><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${values(rows).map(row=>`<tr>${row.map(v=>`<td>${xml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`);
    tab.document.close(); tab.document.getElementById('print').onclick = () => tab.print();
    tab.focus(); tab.print();
  }
  window.FP365_LOCATION_REPORT = {build, print};
})();
