import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import type {
  BoeDetails,
  BoeItemInput,
  SavedBoe,
  Shipment,
} from '@/types/boe-entry';

function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(n);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function getLastY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
    .finalY;
}

function drawPageHeader(
  doc: jsPDF,
  _savedBoe: SavedBoe,
  boeDetails: BoeDetails | undefined,
  shipment: Shipment
): void {
  doc.rect(10, 10, 190, 22);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('INDIAN CUSTOMS', 12, 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('PORT : BILL OF ENTRY FOR HOME CONSUMPTION', 12, 22);

  const beNumber = boeDetails?.beNumber ?? '—';
  const beDate = boeDetails?.beDate ? formatDate(boeDetails.beDate) : '—';
  const itemCount = shipment.items.length;
  const iecBar = '—';
  const gstin = '—';
  const cb = '—';
  const pkgNos = '—';
  const gwtKgs = '—';

  const rx = 100;
  doc.setFontSize(6);
  doc.text('Port Code', rx, 14);
  doc.text('BE No', rx + 20, 14);
  doc.text('BE Date', rx + 55, 14);
  doc.text('BE Type', rx + 85, 14);
  doc.text('INMAA1', rx, 18);
  doc.text(beNumber, rx + 20, 18);
  doc.text(beDate, rx + 55, 18);
  doc.text('H', rx + 85, 18);
  doc.text('IEC/Bar', rx, 23);
  doc.text('GSTIN', rx + 40, 23);
  doc.text(iecBar, rx, 27);
  doc.text(gstin, rx + 40, 27);
  doc.text('CB CODE', rx + 80, 23);
  doc.text(cb, rx + 80, 27);
  doc.text(`ITEMS: ${itemCount}`, rx + 100, 23);
  doc.text(`PKG: ${pkgNos}  GWT: ${gwtKgs}`, rx + 100, 27);
}

export async function exportSavedBoeToPdf(
  savedBoe: SavedBoe,
  boeDetails: BoeDetails | undefined,
  shipment: Shipment
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const calcResult = savedBoe.calculationResult;
  const totalAssessableValue = calcResult.calculatedItems.reduce(
    (sum, item) => sum + item.assessableValue,
    0
  );

  drawPageHeader(doc, savedBoe, boeDetails, shipment);
  let yPos = 35;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('PART - I - BILL OF ENTRY SUMMARY', 105, yPos, { align: 'center' });
  yPos += 5;

  autoTable(doc, {
    startY: yPos,
    head: [
      [
        'A. STATUS',
        'BE STATUS',
        'MODE',
        'DEF BE',
        'KACHA',
        'SEC 48',
        'REIMP',
        'ADV BE (Y/N/P)',
        'ASSESS',
        'EXAM',
        'HSS',
        'FIRST CHECK',
        'PROV/FINAL',
      ],
    ],
    body: [
      ['', 'OOC COPY', 'Sea', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N'],
    ],
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 1 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontSize: 6 },
    margin: { left: 10, right: 10 },
  });
  yPos = getLastY(doc) + 2;

  autoTable(doc, {
    startY: yPos,
    body: [
      [
        'B. DECLARANT',
        '1. IMPORTER NAME & ADDRESS',
        '',
        '',
        '2. CB NAME',
        '3. AEO',
        '4. UCR',
      ],
      ['', shipment.supplierName, '', '', '—', '—', '—'],
      [
        '13. COUNTRY OF ORIGIN',
        'KOREA, REPUBLIC OF',
        '',
        '14. COUNTRY OF CONSIGNMENT',
        '',
        'KOREA, REPUBLIC OF',
        '',
      ],
      [
        '15. PORT OF LOADING',
        'Busan (Korea)',
        '',
        '16. PORT OF SHIPMENT',
        '',
        'Busan (Korea)',
        '',
      ],
    ],
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 1 },
    margin: { left: 10, right: 10 },
  });
  yPos = getLastY(doc) + 2;

  autoTable(doc, {
    startY: yPos,
    head: [
      [
        '',
        'BCD',
        'ACD',
        'SWS',
        'NCCD',
        'ADD',
        'CVD',
        'IGST',
        'G.CESS',
        'TOT.ASS VAL',
      ],
    ],
    body: [
      [
        'C. DUTY SUMMARY',
        formatINR(calcResult.bcdTotal),
        '0',
        formatINR(calcResult.swsTotal),
        '0',
        '0',
        '0',
        formatINR(calcResult.igstTotal),
        '0',
        formatINR(totalAssessableValue),
      ],
      [
        '',
        'SG',
        'SAED',
        'GSIA',
        'TTA',
        'HEALTH',
        'TOTAL DUTY',
        'INT',
        'PNLTY',
        'FINE',
        'TOT. AMOUNT',
      ],
      [
        '',
        '0',
        '0',
        '0',
        '0',
        '0',
        formatINR(calcResult.customsDutyTotal),
        formatINR(calcResult.interest),
        '0',
        '0',
        formatINR(calcResult.customsDutyTotal),
      ],
    ],
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 1 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontSize: 6 },
    margin: { left: 10, right: 10 },
  });
  yPos = getLastY(doc) + 2;

  autoTable(doc, {
    startY: yPos,
    head: [
      [
        'D. MANIFEST',
        'IGM NO',
        'IGM DATE',
        'INW DATE',
        'GIGMNO',
        'GIGMDT',
        'MAWB NO',
        'DATE',
        'HAWB NO',
        'DATE',
        'PKG',
        'GW',
      ],
    ],
    body: [['DETAILS', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—']],
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 1 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontSize: 6 },
    margin: { left: 10, right: 10 },
  });
  yPos = getLastY(doc) + 2;

  autoTable(doc, {
    startY: yPos,
    head: [
      ['F. PAYMENT DETAILS', 'SR NO', 'CHALLAN NO', 'PAID ON', 'AMOUNT (Rs.)'],
    ],
    body: [
      [
        '',
        boeDetails?.challanNumber ? '1' : '—',
        boeDetails?.challanNumber ?? '—',
        boeDetails?.paymentDate ?? '—',
        boeDetails?.dutyPaid != null ? formatINR(boeDetails.dutyPaid) : '—',
      ],
    ],
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 1 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontSize: 6 },
    margin: { left: 10, right: 10 },
  });
  yPos = getLastY(doc) + 2;

  autoTable(doc, {
    startY: yPos,
    head: [['G. INVOICE', 'S.NO', 'INVOICE NO', 'INV. AMT', 'CUR']],
    body: [
      [
        '',
        '1',
        savedBoe.invoiceNumber,
        String(shipment.invoiceValue),
        shipment.invoiceCurrency,
      ],
    ],
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 1 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontSize: 6 },
    margin: { left: 10, right: 10 },
  });
  yPos = getLastY(doc) + 2;

  autoTable(doc, {
    startY: yPos,
    head: [['H. PROCESSING DETAILS', 'EVENT', 'DATE', 'TIME', 'EXCHANGE RATE']],
    body: [
      ['', 'Submission', '—', '—', 'INR=INR'],
      [
        '',
        'Assessment',
        boeDetails?.beDate ?? '—',
        '—',
        `1 USD=${savedBoe.formValues.exchangeRate} INR`,
      ],
    ],
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 1 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontSize: 6 },
    margin: { left: 10, right: 10 },
  });

  doc.addPage();
  drawPageHeader(doc, savedBoe, boeDetails, shipment);
  yPos = 35;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('PART - II - INVOICE & VALUATION DETAILS (Invoice 1/1)', 105, yPos, {
    align: 'center',
  });
  yPos += 5;

  autoTable(doc, {
    startY: yPos,
    head: [
      [
        'A. INVOICE',
        'S.NO',
        'INVOICE NO. & DT.',
        'PURCHASE ORDER NO & DT',
        'LC NO & DATE',
        'CONTRACT NO & DATE',
      ],
    ],
    body: [
      [
        '',
        '1',
        `${savedBoe.invoiceNumber} / ${shipment.invoiceDate}`,
        '—',
        '—',
        '—',
      ],
    ],
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 1 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontSize: 6 },
    margin: { left: 10, right: 10 },
  });
  yPos = getLastY(doc) + 2;

  autoTable(doc, {
    startY: yPos,
    body: [
      [
        'B. TRANSACTING PARTIES',
        "1. BUYER'S NAME & ADDRESS",
        '',
        "2. SELLER'S NAME & ADDRESS",
      ],
      ['', '(Importer)', '', savedBoe.supplierName],
      ['', '3. SUPPLIER NAME & ADDRESS', '', '4. THIRD PARTY NAME & ADDRESS'],
      ['', savedBoe.supplierName, '', '—'],
    ],
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 1 },
    margin: { left: 10, right: 10 },
  });
  yPos = getLastY(doc) + 2;

  autoTable(doc, {
    startY: yPos,
    head: [
      [
        'C. VALUATION',
        'INV VALUE',
        'FREIGHT',
        'INSURANCE',
        'HSS',
        'LOADING',
        'COMMN',
        'PAY TERMS',
        'VALUATION METHOD',
      ],
    ],
    body: [
      [
        '',
        String(shipment.invoiceValue),
        String(savedBoe.formValues.freightCost),
        `${savedBoe.formValues.insuranceRate}%`,
        '—',
        '—',
        '—',
        'OTH',
        'Rule 4 - Transaction Value',
      ],
      [
        '',
        '14. Cur',
        shipment.invoiceCurrency,
        '15. Term',
        shipment.incoterm,
        '',
        '',
        '',
        '',
      ],
    ],
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 1 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontSize: 6 },
    margin: { left: 10, right: 10 },
  });
  yPos = getLastY(doc) + 2;

  autoTable(doc, {
    startY: yPos,
    head: [
      [
        'S.NO',
        'CTH (HS Code)',
        'DESCRIPTION',
        'UNIT PRICE',
        'QUANTITY',
        'UQC',
        'AMOUNT',
      ],
    ],
    body: shipment.items.map((item, i) => [
      String(i + 1),
      item.hsCode,
      item.description,
      item.unitPrice.toFixed(3),
      item.qty.toFixed(3),
      'PCS',
      item.lineTotal.toFixed(2),
    ]),
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 1 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontSize: 6 },
    margin: { left: 10, right: 10 },
  });

  const calcItems = calcResult.calculatedItems;
  let itemIndex = 0;

  while (itemIndex < calcItems.length) {
    doc.addPage();
    drawPageHeader(doc, savedBoe, boeDetails, shipment);
    yPos = 35;

    if (itemIndex === 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('PART - III - DUTIES', 105, yPos, { align: 'center' });
      yPos += 5;
    }

    const pageItems = calcItems.slice(itemIndex, itemIndex + 2);

    for (const item of pageItems) {
      const currentItemIndex = calcItems.indexOf(item);
      const boeItemInput: BoeItemInput | undefined = savedBoe.itemInputs.find(
        inp => inp.partNo === item.partNo
      );
      const shipmentItem = shipment.items.find(si => si.partNo === item.partNo);
      const hsCode = shipmentItem?.hsCode ?? '—';
      const unitPrice = shipmentItem?.unitPrice ?? 0;
      const qty = shipmentItem?.qty ?? 0;
      const stdQty = qty;
      const bcdValue = item.bcdValue;
      const swsValue = item.swsValue;
      const igstValue = item.igstValue;
      const totalDuty = bcdValue + swsValue + igstValue;

      autoTable(doc, {
        startY: yPos,
        head: [
          [
            'A. ITEM DETAILS',
            'INVSNO',
            'ITEMSN',
            'CTH',
            'CETH',
            'ITEM DESCRIPTION',
            'FS',
            'PQ',
            'DC',
            'WC',
            'AQ',
          ],
        ],
        body: [
          [
            '',
            '1',
            String(currentItemIndex + 1),
            hsCode,
            'NOEXCISE',
            item.description,
            'N',
            'N',
            'N',
            'N',
            'N',
          ],
          [
            'UPI',
            'COO',
            'C.QTY',
            'C.UQC',
            'S.QTY',
            'S.UQC',
            'SCH',
            'STND/PR',
            'RSP',
            'REIMP',
            'PROV',
            'END USE',
          ],
          [
            String(unitPrice),
            'KR',
            String(qty),
            'PCS',
            String(stdQty),
            'KGS',
            '—',
            'S',
            'N',
            'N',
            'N',
            'GNX200',
          ],
          [
            'PRODN',
            'CNTRL',
            'QUALFR',
            'CONTNT',
            'STMNT',
            'SUP DOCS',
            'ASSESS VALUE',
            '',
            '',
            '',
            'TOTAL DUTY',
            '',
          ],
          [
            'N',
            'N',
            'Y',
            'N',
            'N',
            'N',
            formatINR(item.assessableValue),
            '',
            '',
            '',
            formatINR(totalDuty),
            '',
          ],
        ],
        theme: 'grid',
        styles: { fontSize: 6, cellPadding: 1 },
        headStyles: { fillColor: [41, 128, 185], textColor: 255, fontSize: 6 },
        margin: { left: 10, right: 10 },
      });
      yPos = getLastY(doc) + 2;

      autoTable(doc, {
        startY: yPos,
        head: [
          [
            'B. ITEM DUTY',
            'BCD',
            'CVD_05',
            'SWS',
            'SAD',
            'IGST',
            'CESS',
            'ADD',
            'CVD',
            'SG',
            'T.VALUE',
          ],
        ],
        body: [
          ['Notn No', '009/2025', '', '', '', '001/2017', '', '', '', '', ''],
          [
            'Rate',
            boeItemInput ? String(boeItemInput.boeBcdRate) : '—',
            '',
            boeItemInput ? String(boeItemInput.boeSwsRate) : '—',
            '',
            boeItemInput ? String(boeItemInput.boeIgstRate) : '—',
            '0',
            '',
            '',
            '',
            '',
          ],
          [
            'Amount',
            formatINR(bcdValue),
            '0',
            formatINR(swsValue),
            '0',
            formatINR(igstValue),
            '0',
            '0',
            '0',
            '0',
            formatINR(item.assessableValue),
          ],
          ['Duty Fg', '0', '', '0', '', '0', '', '', '', '', ''],
        ],
        theme: 'grid',
        styles: { fontSize: 6, cellPadding: 1 },
        headStyles: { fillColor: [41, 128, 185], textColor: 255, fontSize: 6 },
        margin: { left: 10, right: 10 },
      });
      yPos = getLastY(doc) + 2;

      autoTable(doc, {
        startY: yPos,
        head: [
          [
            'C. OTHER DUTIES',
            'SP EXD',
            'CHCESS',
            'TTA',
            'CESS',
            'CAIDC',
            'EAIDC',
            'CUS EDC',
            'CUS HEC',
            'NCD',
            'AGGR',
          ],
        ],
        body: [
          ['Notn No', '', '', '', '011/2021', '', '', '', '', '', ''],
          ['Rate', '0', '', '', '17', '', '', '', '', '', ''],
          [
            'Amount',
            '0',
            '0',
            '0',
            '0',
            '0',
            '0',
            '0',
            '0',
            '0',
            formatINR(totalDuty),
          ],
          ['Duty Fg', '', '', '', '', '', '', '', '', '', ''],
        ],
        theme: 'grid',
        styles: { fontSize: 6, cellPadding: 1 },
        headStyles: { fillColor: [41, 128, 185], textColor: 255, fontSize: 6 },
        margin: { left: 10, right: 10 },
      });
      yPos = getLastY(doc) + 4;
    }

    itemIndex += 2;
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.text(
      `Page ${i} of ${totalPages}   Verify using ICETRAK Mobile App (Google Play Store) for authentication & latest version details from ICEGATE Enquiry`,
      105,
      285,
      { align: 'center' }
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const filename = `BOE-CALC-${savedBoe.invoiceNumber}-${today}.pdf`;
  const arrayBuffer = doc.output('arraybuffer');
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
