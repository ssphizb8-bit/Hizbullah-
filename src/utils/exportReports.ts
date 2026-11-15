import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  Customer,
  ExpenseRecord,
  GrindingOrder,
  Language,
  PeriodSummary,
  SaleRecord,
  StockItem,
  WheatPurchase,
} from '../types';
import { EXPENSE_CATEGORY_LABELS } from '../i18n/translations';
import { kgToMannDecimal } from './format';

export async function exportElementToPdf(element: HTMLElement, filename: string): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
  });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const usableWidth = pdfWidth - margin * 2;
  const imgHeight = (canvas.height * usableWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = margin;

  pdf.addImage(imgData, 'PNG', margin, position, usableWidth, imgHeight);
  heightLeft -= pdfHeight - margin * 2;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight + margin;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', margin, position, usableWidth, imgHeight);
    heightLeft -= pdfHeight - margin * 2;
  }

  pdf.save(filename);
}

export function exportFullReportToExcel(params: {
  lang: Language;
  summary: PeriodSummary;
  stock: StockItem[];
  grinding: GrindingOrder[];
  sales: SaleRecord[];
  purchases: WheatPurchase[];
  expenses: ExpenseRecord[];
  customers: Customer[];
  filename: string;
}): void {
  const { summary, stock, grinding, sales, purchases, expenses, customers, filename } = params;
  const wb = XLSX.utils.book_new();

  // Sheet 1: Financial Summary
  const summaryRows = [
    { Metric: 'Report Period From', Value: summary.fromDate },
    { Metric: 'Report Period To', Value: summary.toDate },
    { Metric: 'Grinding Income (PKR)', Value: summary.grindingIncome },
    { Metric: 'Wheat Ground (KG)', Value: summary.grindingWheatKg },
    { Metric: 'Flour Sales Total (PKR)', Value: summary.flourSalesTotal },
    { Metric: 'Flour Sold (KG)', Value: summary.flourSoldKg },
    { Metric: 'Bran Sales Total (PKR)', Value: summary.branSalesTotal },
    { Metric: 'Bran Sold (KG)', Value: summary.branSoldKg },
    { Metric: 'Wheat Purchases Total (PKR)', Value: summary.wheatPurchasesTotal },
    { Metric: 'Wheat Purchased (KG)', Value: summary.wheatPurchasedKg },
    { Metric: 'Operating Expenses Total (PKR)', Value: summary.expensesTotal },
    { Metric: 'Net Operating Profit (PKR)', Value: summary.netOperatingProfit },
    { Metric: 'Cash Collected (PKR)', Value: summary.cashCollected },
    { Metric: 'Cash Paid Out (PKR)', Value: summary.cashPaidOut },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');

  // Sheet 2: Stock
  const stockRows = stock.map((s) => ({
    Item: s.nameEn,
    UrduName: s.nameUr,
    Category: s.category,
    Quantity_KG: s.qtyKg,
    Quantity_Mann: kgToMannDecimal(s.qtyKg),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stockRows), 'Current Stock');

  // Sheet 3: Grinding
  const grindRows = grinding.map((g) => ({
    ReceiptNo: g.receiptNo,
    Date: g.date,
    Mode: g.mode,
    Customer: g.customerName,
    Wheat_KG: g.wheatKg,
    Wheat_Mann: kgToMannDecimal(g.wheatKg),
    Flour_KG: g.flourKg,
    Bran_KG: g.branKg,
    Fee_PKR: g.grindingFee,
    Paid_PKR: g.paidAmount,
    Status: g.status,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(grindRows), 'Grinding');

  // Sheet 4: Sales
  const salesRows = sales.map((s) => ({
    InvoiceNo: s.invoiceNo,
    Date: s.date,
    Type: s.saleType,
    Item: s.stockNameEn || s.stockId,
    Customer: s.customerName,
    Weight_KG: s.weightKg,
    Weight_Mann: kgToMannDecimal(s.weightKg),
    Rate: s.rate,
    RateUnit: s.rateUnit,
    Discount_PKR: s.discount,
    NetAmount_PKR: s.netAmount,
    Paid_PKR: s.paidAmount,
    PaymentMode: s.paymentMode,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesRows), 'Sales');

  // Sheet 5: Wheat Purchases
  const purchRows = purchases.map((p) => ({
    InvoiceNo: p.invoiceNo,
    Date: p.date,
    Supplier: p.supplierName || '',
    Weight_KG: p.weightKg,
    Weight_Mann: kgToMannDecimal(p.weightKg),
    Rate: p.rate,
    RateUnit: p.rateUnit,
    Total_PKR: p.totalAmount,
    Paid_PKR: p.paidAmount,
    PaymentMode: p.paymentMode,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(purchRows), 'Wheat Purchases');

  // Sheet 6: Expenses
  const expRows = expenses.map((e) => ({
    VoucherNo: e.voucherNo,
    Date: e.date,
    Category: EXPENSE_CATEGORY_LABELS[e.category]?.en || e.category,
    Amount_PKR: e.amount,
    Description: e.description,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expRows), 'Expenses');

  // Sheet 7: Customer Dues
  const custRows = customers.map((c) => ({
    Name: c.name,
    Mobile: c.phone,
    Address: c.address,
    OpeningBalance_PKR: c.openingBalance,
    CurrentBalance_PKR: c.balance,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(custRows), 'Customer Dues');

  XLSX.writeFile(wb, filename);
}
