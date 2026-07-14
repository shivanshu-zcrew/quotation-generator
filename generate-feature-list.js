const ExcelJS = require('./backend/node_modules/exceljs');
const path = require('path');

const features = [
  {
    section: 'Quotation Creation & Management',
    items: [
      'Generate structured, professional quotations through a guided multi-step creation process',
      'Consolidate all quotation details — company information, customer data, line items, pricing, and commercial terms — within a single unified interface',
      'Automatically assign a unique quotation reference number to every document upon creation',
      'Define quotation validity periods with configurable expiry dates and automated visual alerts upon expiration',
      'Modify any quotation field at any stage prior to final approval, ensuring accuracy before submission',
      'Permanently remove obsolete quotations from the system with a confirmation-protected delete action',
    ],
  },
  {
    section: 'Line Items, Products & Pricing',
    items: [
      'Add detailed line items to each quotation, capturing product or service name, description, unit of measurement (e.g., pcs, kg, box), quantity, and unit price',
      'Attach supporting product images directly to individual line items for enhanced presentation',
      'Apply VAT or applicable tax percentages and discounts with automatic real-time computation of all subtotals and grand totals',
      'Display the final payable amount both numerically and in written form for formal documentation purposes',
      'Issue quotations in multiple international currencies: AED, USD, EUR, GBP, SAR, QAR, KWD, BHD, and OMR',
    ],
  },
  {
    section: 'Professional PDF Generation',
    items: [
      'Produce branded, print-ready PDF quotation documents instantly from any quotation record',
      'Select from two presentation formats: With Grand Total (standard client-facing) or Without Grand Total (for competitive or confidential bidding scenarios)',
      'Generated PDFs include the company letterhead, itemised product list with images, payment and delivery terms, terms & conditions, and a dedicated signature section',
    ],
  },
  {
    section: 'Quotation Status & Approval Workflow',
    items: [
      'Manage quotations through a structured multi-stage approval pipeline: Pending → In Review → Approved → Awarded / Not Awarded',
      'Sales personnel initiate and submit quotations for internal review upon completion',
      'Operations Managers conduct an intermediary review, forwarding approved quotations to the Administrator or returning them with documented feedback',
      'Administrators perform the final review and either approve or reject quotations, providing written justification where applicable',
      'Record deal outcomes by marking approved quotations as Awarded or Not Awarded upon conclusion of negotiations',
      'Deliver automated email notifications to the Operations Manager and Administrator upon quotation submission, approval, rejection, or return, ensuring all stakeholders remain informed at every stage of the workflow',
    ],
  },
  {
    section: 'Quotation Revision & Resubmission',
    items: [
      'When an Operations Manager returns a quotation, the originating creator receives it with the documented return reason, revises the content accordingly, and resubmits it for review',
      'When an Administrator rejects a quotation, the originating creator receives it with the stated rejection reason, makes the necessary amendments, and resubmits it through the approval pipeline',
      'All revised quotations recommence the full approval workflow, beginning with Operations Manager review prior to Administrator sign-off',
    ],
  },
  {
    section: 'Customer Management',
    items: [
      'Maintain a centralised customer repository storing all relevant details, including contact information, company name, trade license number, Tax Registration Number (TRN), tax treatment classification, place of supply, and preferred currency',
      'Utilise advanced search, multi-criteria filtering, and flexible sorting to locate customer records efficiently',
      'Designate customers as Active or Inactive to reflect current engagement status',
      'Synchronise customer records directly from Zoho Books, eliminating the need for manual data re-entry',
      'Automatically identify and deactivate customers with expired Tax Registration Numbers on a daily basis through scheduled system processing',
    ],
  },
  {
    section: 'Data Export & Reporting',
    items: [
      'Export the complete quotation register to Microsoft Excel, with all active filters (status, date range, customer) applied to the exported dataset',
      'Export the customer directory to Excel or CSV format for use in external reporting or analysis',
      'Download any individual quotation as a formatted PDF document at any time',
    ],
  },
  {
    section: 'Role-Based Dashboards & Analytics',
    items: [
      'Sales Users: Access a dedicated dashboard presenting all personal quotations, real-time status tracking, awarded revenue summaries, and comprehensive search and filter capabilities',
      'Operations Managers: Access a focused review panel displaying all quotations pending intermediary approval, with options to approve or return with documented feedback',
      'Administrators: Access a consolidated management dashboard providing visibility across all companies and users, including aggregated quotation volumes, total revenue figures, per-user performance metrics, and final approval controls',
    ],
  },
  {
    section: 'User & Team Management',
    items: [
      'Onboard team members and assign designated system roles: Sales User, Operations Manager, or Administrator',
      'Enforce role-based access controls, ensuring each user can only access data and perform actions appropriate to their designated role',
      'Suspend or deactivate user accounts upon staff departure, preserving all associated records within the system',
      'Issue temporary access credentials for newly onboarded users, with a mandatory password change enforced upon first login',
    ],
  },
  {
    section: 'Multi-Company Management',
    items: [
      'Administer multiple legal entities or business units from a single, unified platform',
      'Maintain fully segregated data environments per company, encompassing dedicated customer directories, quotation records, and currency configurations',
      'Enable Administrator-level consolidated reporting across all registered companies within the platform',
    ],
  },
  {
    section: 'Document Management',
    items: [
      'Attach internal reference documents to any quotation, including cost breakdowns, supplier quotations, and sourcing notes, for centralised record-keeping',
      'Access, preview, and download all attached documents directly from the quotation detail page at any time',
      'Define and store customised Terms & Conditions per quotation, supporting both formatted text content and embedded reference images',
    ],
  },
  {
    section: 'Zoho Books Integration',
    items: [
      'Synchronise the customer directory with Zoho Books via a single-action trigger, ensuring data consistency across platforms without manual intervention',
      'Choose between an incremental synchronisation (retrieving only new or modified records) or a full data refresh, depending on operational requirements',
      'Automatically validate and deactivate customer records with expired Tax Registration Numbers on a daily scheduled basis, maintaining data integrity and regulatory compliance',
    ],
  },
];

async function generateExcel() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Quotation Generator';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Feature List', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  });

  // Column widths
  sheet.columns = [
    { key: 'section', width: 32 },
    { key: 'feature', width: 90 },
    { key: 'status', width: 16 },
  ];

  // ── Title row ──
  sheet.mergeCells('A1:C1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'Quotation Generator — Feature List';
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0C405A' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 36;

  // ── Sub-title row ──
  sheet.mergeCells('A2:C2');
  const subCell = sheet.getCell('A2');
  subCell.value = 'Prepared for Client Review — ' + new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF555555' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F4F8' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(2).height = 22;

  // ── Blank spacer ──
  sheet.addRow([]);

  // ── Header row ──
  const headerRow = sheet.addRow(['Feature Area', 'Description', 'Status']);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A6B8A' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFB0C4CE' } },
      bottom: { style: 'thin', color: { argb: 'FFB0C4CE' } },
      left: { style: 'thin', color: { argb: 'FFB0C4CE' } },
      right: { style: 'thin', color: { argb: 'FFB0C4CE' } },
    };
  });

  const sectionColors = [
    'FFEAF6FB', 'FFF0F9EE', 'FFFEF9EC', 'FFFEF2F2', 'FFF5F0FB',
    'FFEFF8F0', 'FFFDF6EC', 'FFEEF5FB', 'FFF9F0FB', 'FFEDF7F4',
    'FFFDF4EC', 'FFECF4FB',
  ];

  features.forEach((section, sIdx) => {
    const bgColor = sectionColors[sIdx % sectionColors.length];
    const sectionBg = 'FF0C405A';

    // Section header row
    const sectionRow = sheet.addRow([section.section, '', '']);
    sheet.mergeCells(`A${sectionRow.number}:C${sectionRow.number}`);
    const sCell = sheet.getCell(`A${sectionRow.number}`);
    sCell.value = `  ${section.section.toUpperCase()}`;
    sCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    sCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sectionBg } };
    sCell.alignment = { vertical: 'middle', horizontal: 'left' };
    sCell.border = {
      top: { style: 'medium', color: { argb: 'FF08304A' } },
      bottom: { style: 'thin', color: { argb: 'FF08304A' } },
      left: { style: 'medium', color: { argb: 'FF08304A' } },
      right: { style: 'medium', color: { argb: 'FF08304A' } },
    };
    sectionRow.height = 22;

    // Feature rows
    section.items.forEach((item, iIdx) => {
      const rowBg = iIdx % 2 === 0 ? bgColor : 'FFFFFFFF';
      const featureRow = sheet.addRow(['', `  ✓  ${item}`, 'Included']);
      featureRow.height = 20;

      const aCell = featureRow.getCell(1);
      aCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
      aCell.border = { left: { style: 'medium', color: { argb: 'FF08304A' } }, bottom: { style: 'hair', color: { argb: 'FFCCCCCC' } } };

      const bCell = featureRow.getCell(2);
      bCell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1F2937' } };
      bCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
      bCell.alignment = { vertical: 'middle', wrapText: true };
      bCell.border = { bottom: { style: 'hair', color: { argb: 'FFCCCCCC' } } };

      const cCell = featureRow.getCell(3);
      cCell.value = '✔ Included';
      cCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF065F46' } };
      cCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
      cCell.alignment = { horizontal: 'center', vertical: 'middle' };
      cCell.border = {
        bottom: { style: 'hair', color: { argb: 'FFCCCCCC' } },
        right: { style: 'medium', color: { argb: 'FF08304A' } },
      };
    });

    // Spacer after section
    const spacer = sheet.addRow(['', '', '']);
    spacer.height = 6;
    ['A', 'B', 'C'].forEach(col => {
      sheet.getCell(`${col}${spacer.number}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    });
  });

  // ── Footer ──
  const footerRow = sheet.addRow(['', 'All features listed above are included in the delivered software.', '']);
  sheet.mergeCells(`A${footerRow.number}:C${footerRow.number}`);
  const fCell = sheet.getCell(`A${footerRow.number}`);
  fCell.value = 'All features listed above are included in the delivered software.';
  fCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF374151' } };
  fCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F4F8' } };
  fCell.alignment = { horizontal: 'center', vertical: 'middle' };
  footerRow.height = 22;

  const outputPath = path.join('/Users/zcrew/Desktop', 'Quotation-Generator-Feature-List.xlsx');
  await workbook.xlsx.writeFile(outputPath);
  console.log(`✅ Excel saved to: ${outputPath}`);
}

generateExcel().catch(console.error);
