// ============================================================================
// Ledgerline — seed data (fictional Australian small business + personal)
// ============================================================================
import { uid, todayISO, addDays, fyOf } from './utils';

export function seed() {
  const today = todayISO();
  const fy = fyOf(today);

  // Users -----------------
  const users = [
    { id: 'u_owner',  name: 'Sarah Whitlock',   email: 'sarah@haymarket-roasters.com.au', role: 'admin' },
    { id: 'u_book',   name: 'David Pham',       email: 'david@accountspartners.com.au',   role: 'accountant' },
    { id: 'u_view',   name: 'Aisha Chowdhury',  email: 'aisha@haymarket-roasters.com.au', role: 'read-only' },
  ];

  // Categories ------------
  const categories = [
    { id: 'cat_grocery',  name: 'Groceries',     kind: 'expense' },
    { id: 'cat_dining',   name: 'Dining out',    kind: 'expense' },
    { id: 'cat_transport',name: 'Transport',     kind: 'expense' },
    { id: 'cat_utilities',name: 'Utilities',     kind: 'expense' },
    { id: 'cat_rent',     name: 'Rent / Mortg.', kind: 'expense' },
    { id: 'cat_insurance',name: 'Insurance',     kind: 'expense' },
    { id: 'cat_fitness',  name: 'Fitness',       kind: 'expense' },
    { id: 'cat_entertain',name: 'Entertainment', kind: 'expense' },
    { id: 'cat_subscr',   name: 'Subscriptions', kind: 'expense' },
    { id: 'cat_health',   name: 'Health',        kind: 'expense' },
    { id: 'cat_clothing', name: 'Clothing',      kind: 'expense' },
    { id: 'cat_education',name: 'Education',     kind: 'expense' },
    { id: 'cat_charity',  name: 'Donations',     kind: 'expense' },
    { id: 'cat_travel',   name: 'Travel',        kind: 'expense' },
    { id: 'cat_other_exp',name: 'Other expense', kind: 'expense' },
    { id: 'cat_salary',   name: 'Salary',        kind: 'income'  },
    { id: 'cat_dividend', name: 'Dividends',     kind: 'income'  },
    { id: 'cat_interest', name: 'Interest',      kind: 'income'  },
    { id: 'cat_other_inc',name: 'Other income',  kind: 'income'  },
  ];

  // Accounts -------------
  const accounts = [
    { id: 'acc_check',  name: 'CommBank — Everyday',     type: 'bank',       currency: 'AUD', balance: 12480.55, lastSynced: today, institution: 'CommBank' },
    { id: 'acc_savings',name: 'CommBank — NetSaver',     type: 'savings',    currency: 'AUD', balance: 38500.00, lastSynced: today, institution: 'CommBank' },
    { id: 'acc_biz',    name: 'NAB — Business Operating',type: 'bank',       currency: 'AUD', balance: 27890.40, lastSynced: today, institution: 'NAB' },
    { id: 'acc_cc',     name: 'Amex Platinum',           type: 'credit',     currency: 'AUD', balance: -2840.18, lastSynced: today, institution: 'American Express' },
    { id: 'acc_cc_biz', name: 'NAB Business Visa',       type: 'credit',     currency: 'AUD', balance: -1456.30, lastSynced: today, institution: 'NAB' },
    { id: 'acc_super',  name: 'AustralianSuper',         type: 'super',      currency: 'AUD', balance: 184230.00, lastSynced: today, institution: 'AustralianSuper' },
    { id: 'acc_inv',    name: 'CommSec — Brokerage',     type: 'investment', currency: 'AUD', balance:  56120.00, lastSynced: today, institution: 'CommSec' },
    { id: 'acc_crypto', name: 'CoinSpot Wallet',         type: 'crypto',     currency: 'AUD', balance:   4220.00, lastSynced: today, institution: 'CoinSpot' },
    { id: 'acc_usd',    name: 'Wise USD',                type: 'bank',       currency: 'USD', balance:    810.00, lastSynced: today, institution: 'Wise' },
  ];

  // Transactions (last ~90 days)
  const txn = [];
  const merchants = [
    ['Woolworths Metro',      'cat_grocery',  -65,  -240, 'acc_check'],
    ['Coles Supermarkets',    'cat_grocery',  -45,  -180, 'acc_check'],
    ['IGA Surry Hills',       'cat_grocery',  -22,  -90,  'acc_check'],
    ['Single Origin Cafe',    'cat_dining',   -8,   -28,  'acc_cc'],
    ['Mr Crackles',           'cat_dining',   -18,  -55,  'acc_cc'],
    ['Opal Travel',           'cat_transport',-3.2, -8.4, 'acc_check'],
    ['Uber Trip',             'cat_transport',-12,  -38,  'acc_cc'],
    ['Caltex Petrol',         'cat_transport',-65,  -110, 'acc_check'],
    ['Origin Energy',         'cat_utilities',-180, -260, 'acc_check'],
    ['Telstra Mobile',        'cat_utilities',-65,  -90,  'acc_check'],
    ['Sydney Water',          'cat_utilities',-110, -180, 'acc_check'],
    ['NRMA Insurance',        'cat_insurance',-95,  -145, 'acc_check'],
    ['F45 Surry Hills',       'cat_fitness',  -65,  -65,  'acc_cc'],
    ['Spotify Premium',       'cat_subscr',   -12.99,-12.99,'acc_cc'],
    ['Netflix',               'cat_subscr',   -16.99,-16.99,'acc_cc'],
    ['Adobe Creative Cloud',  'cat_subscr',   -22,  -22,  'acc_cc'],
    ['Hoyts Cinema',          'cat_entertain',-22,  -56,  'acc_cc'],
    ['Dymocks Books',         'cat_entertain',-25,  -78,  'acc_cc'],
    ['Officeworks Supplies',  'cat_other_exp',-40,  -150, 'acc_biz'],
    ['Adobe Stock (biz)',     'cat_subscr',   -45,  -45,  'acc_biz'],
    ['Canva Pro',             'cat_subscr',   -19.99,-19.99,'acc_biz'],
    ['Westpac Loan Repay',    'cat_rent',     -1850,-1850,'acc_check'],
    ['Strata Levy',           'cat_rent',     -780, -780, 'acc_check'],
    ['Coastal Roastery',      'cat_other_exp',-450, -1850,'acc_biz'],
    ['Café Suppliers Co',     'cat_other_exp',-220, -1100,'acc_biz'],
    ['Square Payments In',    'cat_other_inc', 1200, 6500,'acc_biz'],
    ['Acme Corp Salary',      'cat_salary',    3850, 3850,'acc_check'],
    ['ATO Refund',            'cat_other_inc', 380,  380, 'acc_check'],
    ['BetaShares ASX A200 Div','cat_dividend', 245,  245, 'acc_inv'],
    ['CommBank Interest',     'cat_interest',  86,    86, 'acc_savings'],
  ];

  let dseed = 0;
  for (let day = 90; day >= 0; day--) {
    const d = addDays(today, -day);
    const numTx = Math.random() < 0.7 ? 1 + Math.floor(Math.random() * 3) : 0;
    for (let i = 0; i < numTx; i++) {
      const m = merchants[Math.floor((Math.random() + dseed * 0.137) * merchants.length) % merchants.length];
      dseed++;
      const range = m[3] - m[2];
      const amt = m[2] + Math.random() * range;
      txn.push({
        id: uid('tx'), accountId: m[4], date: d, payee: m[0],
        amount: Number(amt.toFixed(2)),
        category: m[1], memo: '', reconciled: day > 5,
        gst: m[4] === 'acc_biz' ? Number(((amt / 1.1) * 0.1).toFixed(2)) : 0,
      });
    }
  }
  // Salary every 2 weeks for last 90d
  for (let day = 88; day >= 0; day -= 14) {
    txn.push({
      id: uid('tx'), accountId: 'acc_check', date: addDays(today, -day),
      payee: 'Acme Corp Pty Ltd — Payroll', amount: 3850, category: 'cat_salary', memo: 'Net pay',
      reconciled: day > 5, gst: 0,
    });
  }
  txn.sort((a, b) => b.date.localeCompare(a.date));

  // Recurring rules
  const recurring = [
    { id: uid('rec'), accountId: 'acc_check', payee: 'Westpac Loan Repay', amount: -1850, category: 'cat_rent', freq: 'monthly', nextDate: addDays(today, 4) },
    { id: uid('rec'), accountId: 'acc_check', payee: 'Origin Energy',       amount: -210,  category: 'cat_utilities', freq: 'monthly', nextDate: addDays(today, 11) },
    { id: uid('rec'), accountId: 'acc_cc',    payee: 'Spotify Premium',     amount: -12.99,category: 'cat_subscr', freq: 'monthly', nextDate: addDays(today, 6) },
    { id: uid('rec'), accountId: 'acc_check', payee: 'Acme Corp Salary',    amount:  3850, category: 'cat_salary',  freq: 'fortnightly', nextDate: addDays(today, 9) },
  ];

  // Budgets (current and previous month)
  const budgets = {};
  const cm = today.slice(0, 7);
  const pm = (() => { const d = new Date(today); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();
  for (const k of [cm, pm]) {
    budgets[k] = {
      cat_grocery: 600, cat_dining: 250, cat_transport: 320, cat_utilities: 480,
      cat_rent: 2700, cat_insurance: 220, cat_fitness: 80, cat_subscr: 60,
      cat_entertain: 150, cat_health: 80, cat_clothing: 120, cat_travel: 200,
      cat_other_exp: 200,
    };
  }

  // Debts
  const debts = [
    { id: uid('debt'), name: 'Westpac Home Loan',   balance: 412000, apr: 0.0619, min: 2660, type: 'mortgage' },
    { id: uid('debt'), name: 'Amex Platinum',       balance: 2840,   apr: 0.2199, min: 70,   type: 'credit' },
    { id: uid('debt'), name: 'NAB Business Visa',   balance: 1456,   apr: 0.1899, min: 50,   type: 'credit' },
    { id: uid('debt'), name: 'HECS-HELP',           balance: 18450,  apr: 0.040,  min: 0,    type: 'student' },
    { id: uid('debt'), name: 'Subaru Car Loan',     balance: 11200,  apr: 0.0795, min: 380,  type: 'auto' },
  ];

  // Credit scores
  const creditScores = [];
  for (let m = 11; m >= 0; m--) {
    const d = (() => { const x = new Date(); x.setMonth(x.getMonth() - m); return x.toISOString().slice(0, 10); })();
    creditScores.push({ id: uid('cs'), bureau: 'Equifax',     score: 740 + Math.floor(Math.random() * 30) - (m * 1), date: d });
    creditScores.push({ id: uid('cs'), bureau: 'Experian',    score: 760 + Math.floor(Math.random() * 30) - (m * 1), date: d });
    creditScores.push({ id: uid('cs'), bureau: 'illion',      score: 715 + Math.floor(Math.random() * 30) - (m * 1), date: d });
  }

  // Chart of accounts
  const chartOfAccounts = [
    // Assets
    { id: 'coa_1100', code: '1100', name: 'Business Bank Account',   type: 'asset',     subType: 'current', gst: 'BAS Excluded', active: true },
    { id: 'coa_1110', code: '1110', name: 'Petty Cash',              type: 'asset',     subType: 'current', gst: 'BAS Excluded', active: true },
    { id: 'coa_1200', code: '1200', name: 'Accounts Receivable',     type: 'asset',     subType: 'current', gst: 'BAS Excluded', active: true },
    { id: 'coa_1300', code: '1300', name: 'Inventory',               type: 'asset',     subType: 'current', gst: 'BAS Excluded', active: true },
    { id: 'coa_1500', code: '1500', name: 'Equipment',               type: 'asset',     subType: 'fixed',   gst: 'BAS Excluded', active: true },
    { id: 'coa_1510', code: '1510', name: 'Accumulated Depreciation',type: 'asset',     subType: 'fixed',   gst: 'BAS Excluded', active: true },
    // Liabilities
    { id: 'coa_2100', code: '2100', name: 'Accounts Payable',        type: 'liability', subType: 'current', gst: 'BAS Excluded', active: true },
    { id: 'coa_2200', code: '2200', name: 'GST Collected',           type: 'liability', subType: 'current', gst: 'BAS Excluded', active: true },
    { id: 'coa_2210', code: '2210', name: 'GST Paid',                type: 'liability', subType: 'current', gst: 'BAS Excluded', active: true },
    { id: 'coa_2300', code: '2300', name: 'PAYG Withholding Payable',type: 'liability', subType: 'current', gst: 'BAS Excluded', active: true },
    { id: 'coa_2400', code: '2400', name: 'Superannuation Payable',  type: 'liability', subType: 'current', gst: 'BAS Excluded', active: true },
    // Equity
    { id: 'coa_3000', code: '3000', name: "Owner's Equity",          type: 'equity',    subType: '',        gst: 'BAS Excluded', active: true },
    { id: 'coa_3100', code: '3100', name: 'Retained Earnings',       type: 'equity',    subType: '',        gst: 'BAS Excluded', active: true },
    // Revenue
    { id: 'coa_4000', code: '4000', name: 'Sales — Coffee',          type: 'revenue',   subType: 'sales',   gst: 'GST 10%',      active: true },
    { id: 'coa_4010', code: '4010', name: 'Sales — Food',            type: 'revenue',   subType: 'sales',   gst: 'GST 10%',      active: true },
    { id: 'coa_4020', code: '4020', name: 'Sales — Wholesale',       type: 'revenue',   subType: 'sales',   gst: 'GST 10%',      active: true },
    { id: 'coa_4900', code: '4900', name: 'Other Income',            type: 'revenue',   subType: 'other',   gst: 'BAS Excluded', active: true },
    // Expenses
    { id: 'coa_5000', code: '5000', name: 'Cost of Goods Sold',      type: 'expense',   subType: 'cogs',    gst: 'GST 10%',      active: true },
    { id: 'coa_6000', code: '6000', name: 'Wages & Salaries',        type: 'expense',   subType: 'opex',    gst: 'BAS Excluded', active: true },
    { id: 'coa_6100', code: '6100', name: 'Superannuation Expense',  type: 'expense',   subType: 'opex',    gst: 'BAS Excluded', active: true },
    { id: 'coa_6200', code: '6200', name: 'Rent',                    type: 'expense',   subType: 'opex',    gst: 'GST 10%',      active: true },
    { id: 'coa_6210', code: '6210', name: 'Utilities',               type: 'expense',   subType: 'opex',    gst: 'GST 10%',      active: true },
    { id: 'coa_6300', code: '6300', name: 'Marketing',               type: 'expense',   subType: 'opex',    gst: 'GST 10%',      active: true },
    { id: 'coa_6400', code: '6400', name: 'Professional Fees',       type: 'expense',   subType: 'opex',    gst: 'GST 10%',      active: true },
    { id: 'coa_6500', code: '6500', name: 'Depreciation Expense',    type: 'expense',   subType: 'opex',    gst: 'BAS Excluded', active: true },
    { id: 'coa_6900', code: '6900', name: 'Bank Fees',               type: 'expense',   subType: 'opex',    gst: 'BAS Excluded', active: true },
  ];

  // Journal entries (some posted, one draft)
  const journalEntries = [
    {
      id: uid('je'), date: addDays(today, -32), ref: 'INV-1042', memo: 'Wholesale invoice — Bondi Bakery',
      status: 'posted', createdAt: addDays(today, -32), createdBy: 'u_book',
      lines: [
        { accountId: 'coa_1200', debit: 1100, credit: 0,   description: 'AR' },
        { accountId: 'coa_4020', debit: 0,   credit: 1000, description: 'Wholesale sale' },
        { accountId: 'coa_2200', debit: 0,   credit: 100,  description: 'GST 10%' },
      ],
    },
    {
      id: uid('je'), date: addDays(today, -25), ref: 'BILL-238', memo: 'Coastal Roastery — beans',
      status: 'posted', createdAt: addDays(today, -25), createdBy: 'u_book',
      lines: [
        { accountId: 'coa_5000', debit: 800, credit: 0,   description: 'COGS — beans' },
        { accountId: 'coa_2210', debit: 80,  credit: 0,   description: 'GST paid' },
        { accountId: 'coa_2100', debit: 0,   credit: 880, description: 'AP' },
      ],
    },
    {
      id: uid('je'), date: addDays(today, -18), ref: 'PAY-Q1', memo: 'March payroll',
      status: 'posted', createdAt: addDays(today, -18), createdBy: 'u_book',
      lines: [
        { accountId: 'coa_6000', debit: 5800, credit: 0,    description: 'Gross wages' },
        { accountId: 'coa_6100', debit: 667,  credit: 0,    description: 'Super 11.5%' },
        { accountId: 'coa_2300', debit: 0,    credit: 1100, description: 'PAYG withheld' },
        { accountId: 'coa_2400', debit: 0,    credit: 667,  description: 'Super payable' },
        { accountId: 'coa_1100', debit: 0,    credit: 4700, description: 'Net pay' },
      ],
    },
    {
      id: uid('je'), date: addDays(today, -10), ref: 'INV-1043', memo: 'Wholesale — Manly Cafe',
      status: 'posted', createdAt: addDays(today, -10), createdBy: 'u_book',
      lines: [
        { accountId: 'coa_1200', debit: 1320, credit: 0,    description: 'AR' },
        { accountId: 'coa_4020', debit: 0,    credit: 1200, description: 'Wholesale sale' },
        { accountId: 'coa_2200', debit: 0,    credit: 120,  description: 'GST 10%' },
      ],
    },
    {
      id: uid('je'), date: addDays(today, -3), ref: 'JV-001', memo: 'Owner contribution',
      status: 'draft', createdAt: addDays(today, -3), createdBy: 'u_owner',
      lines: [
        { accountId: 'coa_1100', debit: 5000, credit: 0,    description: 'Cash deposit' },
        { accountId: 'coa_3000', debit: 0,    credit: 5000, description: "Owner's equity" },
      ],
    },
  ];

  // BAS quarterly history
  const bas = [
    {
      id: uid('bas'), period: 'Q3 FY24/25 (Jan–Mar)', status: 'lodged',
      lodgedDate: addDays(today, -28),
      fields: { G1: 84200, G2: 0, G3: 1200, G7: 0, G10: 12800, G11: 38400, G20: 8000,
                W1: 24000, W2: 4200, '1A': 7656, '1B': 5145, '7A': 5160, '8A': 7656, '8B': 5145, '9': 2511 },
    },
  ];

  // AP/AR aging
  const ap = [
    { id: uid('ap'), supplier: 'Coastal Roastery',    invoiceNo: 'CR-1244', date: addDays(today, -45), dueDate: addDays(today, -15), amount: 1980, paid: 0,    status: 'overdue' },
    { id: uid('ap'), supplier: 'Café Suppliers Co',   invoiceNo: 'CSC-882', date: addDays(today, -30), dueDate: addDays(today, 0),   amount: 1100, paid: 0,    status: 'current' },
    { id: uid('ap'), supplier: 'Origin Energy',       invoiceNo: 'OE-44102',date: addDays(today, -15), dueDate: addDays(today, 15),  amount: 320,  paid: 0,    status: 'current' },
    { id: uid('ap'), supplier: 'NSW Strata Mgmt',     invoiceNo: 'STR-220', date: addDays(today, -90), dueDate: addDays(today, -65), amount: 780,  paid: 780,  status: 'paid' },
  ];

  const ar = [
    { id: uid('ar'), customer: 'Bondi Bakery',     invoiceNo: 'INV-1042', date: addDays(today, -32), dueDate: addDays(today, -2),  amount: 1100, paid: 0,    status: 'overdue' },
    { id: uid('ar'), customer: 'Manly Cafe',       invoiceNo: 'INV-1043', date: addDays(today, -10), dueDate: addDays(today, 20),  amount: 1320, paid: 0,    status: 'current' },
    { id: uid('ar'), customer: 'Glebe Grocer',     invoiceNo: 'INV-1041', date: addDays(today, -50), dueDate: addDays(today, -20), amount:  860, paid: 0,    status: 'overdue' },
    { id: uid('ar'), customer: 'Newtown Wholefoods',invoiceNo:'INV-1040', date: addDays(today, -75), dueDate: addDays(today, -45), amount: 1540, paid: 1540, status: 'paid' },
  ];

  // Employees
  const employees = [
    { id: 'emp_1', name: 'Marcus Chen',   email: 'marcus@haymarket-roasters.com.au', role: 'Head Barista', type: 'full-time',  startDate: '2022-04-01', baseRate: 35.50, super: 0.115 },
    { id: 'emp_2', name: 'Priya Singh',   email: 'priya@haymarket-roasters.com.au',  role: 'Barista',      type: 'part-time',  startDate: '2023-09-15', baseRate: 30.00, super: 0.115 },
    { id: 'emp_3', name: 'Liam Cooper',   email: 'liam@haymarket-roasters.com.au',   role: 'Barista',      type: 'casual',     startDate: '2024-08-01', baseRate: 32.50, super: 0.115 },
    { id: 'emp_4', name: 'Yuki Tanaka',   email: 'yuki@haymarket-roasters.com.au',   role: 'Roaster',      type: 'full-time',  startDate: '2021-06-10', baseRate: 38.00, super: 0.115 },
  ];

  // PayRuns — last 3 fortnights
  const payRuns = [];
  for (let n = 2; n >= 0; n--) {
    const periodEnd = addDays(today, -14 * n);
    payRuns.push({
      id: uid('pay'), period: `Fortnight ending ${periodEnd}`, periodEnd,
      payslips: employees.map(e => {
        const hours = e.type === 'casual' ? 32 : (e.type === 'part-time' ? 60 : 76);
        const gross = hours * e.baseRate;
        const annual = gross * 26;
        const fortnightlyTax = (annual <= 18200) ? 0 : Math.max(0, ((annual - 18200) * 0.16 + Math.max(0, annual - 45000) * 0.14 + Math.max(0, annual - 135000) * 0.07 + Math.max(0, annual - 190000) * 0.08) / 26);
        const paygWithheld = Math.round(fortnightlyTax * 100) / 100;
        const sup = Math.round(gross * e.super * 100) / 100;
        const net = Math.round((gross - paygWithheld) * 100) / 100;
        return { employeeId: e.id, gross: Math.round(gross * 100) / 100, paygWithheld, super: sup, net, hours };
      }),
    });
  }

  // Super contributions
  const superContribs = [];
  for (const e of employees) {
    for (let m = 6; m >= 0; m--) {
      const d = (() => { const x = new Date(); x.setMonth(x.getMonth() - m); return x.toISOString().slice(0, 10); })();
      const monthlyHrs = e.type === 'casual' ? 64 : (e.type === 'part-time' ? 120 : 152);
      const amt = Math.round(monthlyHrs * e.baseRate * e.super * 100) / 100;
      superContribs.push({ id: uid('sup'), employeeId: e.id, type: 'concessional', amount: amt, date: d });
    }
  }
  // Sarah's personal voluntary contribs
  superContribs.push({ id: uid('sup'), employeeId: 'u_owner', type: 'concessional', amount: 5000, date: addDays(today, -180) });
  superContribs.push({ id: uid('sup'), employeeId: 'u_owner', type: 'non-concessional', amount: 10000, date: addDays(today, -90) });
  superContribs.push({ id: uid('sup'), employeeId: 'u_owner', type: 'fhss', amount: 3000, date: addDays(today, -60) });

  // CGT assets
  const cgtAssets = [
    { id: uid('cgt'), name: 'CSL Limited (CSL)',   kind: 'shares',   qty: 50, costBase: 12500, acquired: '2021-03-12', sold: addDays(today, -40), proceeds: 14750 },
    { id: uid('cgt'), name: 'Wesfarmers (WES)',    kind: 'shares',   qty: 100,costBase: 4200,  acquired: '2024-09-01', sold: addDays(today, -7),  proceeds: 4810 },
    { id: uid('cgt'), name: 'BTC 0.5',             kind: 'crypto',   qty: 0.5,costBase: 32000, acquired: '2023-11-20', sold: '',                  proceeds: 0 },
    { id: uid('cgt'), name: '15 Crown St (rental)',kind: 'property', qty: 1,  costBase: 580000,acquired: '2018-06-15', sold: '',                  proceeds: 0 },
  ];

  // FBT items
  const fbtItems = [
    { id: uid('fbt'), employeeId: 'emp_1', type: 'Car (Statutory)',    description: '2022 Toyota Camry', taxableValue: 4200, type1: true,  fbtYear: fy },
    { id: uid('fbt'), employeeId: 'emp_4', type: 'Entertainment',     description: 'Q4 team dinner',     taxableValue:  650, type1: true,  fbtYear: fy },
    { id: uid('fbt'), employeeId: 'emp_2', type: 'Laptop (exempt)',   description: 'MacBook Pro 14"',    taxableValue:    0, type1: false, fbtYear: fy },
  ];

  // Depreciation assets
  const depAssets = [
    { id: uid('dep'), name: 'La Marzocco Linea PB',     cost: 18500, residual: 1500, lifeYears: 8,  method: 'prime',  acquired: '2022-04-10', bookValue: 11375 },
    { id: uid('dep'), name: 'Probat P12 Roaster',       cost: 42000, residual: 4000, lifeYears: 12, method: 'prime',  acquired: '2021-08-22', bookValue: 30222 },
    { id: uid('dep'), name: 'Office Computers (×3)',    cost:  6300, residual: 0,    lifeYears: 4,  method: 'dimin',  acquired: '2023-07-01', bookValue: 2362 },
    { id: uid('dep'), name: 'Shop Fit-out',             cost: 38500, residual: 0,    lifeYears: 10, method: 'prime',  acquired: '2020-11-15', bookValue: 21175 },
  ];

  // Tax deadlines
  const taxDeadlines = [
    { id: uid('td'), label: 'BAS — Q4 FY24/25',        dueDate: `${fy}-07-28`,   lodged: false, kind: 'BAS' },
    { id: uid('td'), label: 'Income Tax Lodgement',    dueDate: `${fy}-10-31`,   lodged: false, kind: 'Tax' },
    { id: uid('td'), label: 'PAYG Quarterly',          dueDate: `${fy}-07-28`,   lodged: false, kind: 'PAYG' },
    { id: uid('td'), label: 'Super Guarantee Q4',      dueDate: `${fy}-07-28`,   lodged: false, kind: 'Super' },
    { id: uid('td'), label: 'FBT Annual Return',       dueDate: `${fy}-05-21`,   lodged: false, kind: 'FBT' },
    { id: uid('td'), label: 'Payroll Tax Annual',      dueDate: `${fy}-07-21`,   lodged: false, kind: 'Payroll' },
    { id: uid('td'), label: 'BAS — Q3 FY24/25',        dueDate: `${fy}-04-28`,   lodged: true,  kind: 'BAS' },
  ];

  // Leave
  const leaveBalances = {};
  for (const e of employees) {
    leaveBalances[e.id] = {
      annual: 14 + Math.random() * 6,
      personal: 8 + Math.random() * 4,
      longService: e.type === 'full-time' ? Math.random() * 7 : 0,
      compassionate: 2,
    };
  }
  const leaveRequests = [
    { id: uid('lvr'), employeeId: 'emp_1', type: 'annual',   from: addDays(today, 14), to: addDays(today, 21), days: 5, status: 'approved', reason: 'Family holiday' },
    { id: uid('lvr'), employeeId: 'emp_2', type: 'personal', from: addDays(today, -2), to: addDays(today, -2), days: 1, status: 'approved', reason: 'Doctor visit' },
    { id: uid('lvr'), employeeId: 'emp_3', type: 'annual',   from: addDays(today, 30), to: addDays(today, 35), days: 4, status: 'pending',  reason: 'Wedding' },
  ];

  // Timesheets — last 14 days
  const timesheets = [];
  for (let day = 13; day >= 0; day--) {
    const d = addDays(today, -day);
    for (const e of employees) {
      if (e.type === 'casual' && Math.random() < 0.4) continue;
      const reg = e.type === 'part-time' ? 6 : 8;
      const ot = Math.random() < 0.18 ? 1 + Math.floor(Math.random() * 2) : 0;
      timesheets.push({ id: uid('ts'), employeeId: e.id, date: d, regularHrs: reg, otHrs: ot, notes: '' });
    }
  }

  // Alert rules
  const alertRules = [
    { id: uid('alr'), name: 'Low operating account',   kind: 'balance_below', enabled: true, severity: 'warning',  params: { accountId: 'acc_biz',   threshold: 5000 } },
    { id: uid('alr'), name: 'Large transaction',       kind: 'tx_above',       enabled: true, severity: 'info',     params: { threshold: 1000 } },
    { id: uid('alr'), name: 'Credit card high',        kind: 'cc_balance',     enabled: true, severity: 'warning',  params: { accountId: 'acc_cc',    threshold: 2500 } },
    { id: uid('alr'), name: 'Overdue invoice',         kind: 'ar_overdue',     enabled: true, severity: 'critical', params: { days: 14 } },
    { id: uid('alr'), name: 'BAS deadline approaching',kind: 'bas_due_soon',   enabled: true, severity: 'warning',  params: { days: 14 } },
    { id: uid('alr'), name: 'Budget exceeded',         kind: 'budget_over',    enabled: true, severity: 'info',     params: { pct: 100 } },
  ];

  const alertEvents = [
    { id: uid('ale'), ruleId: alertRules[0].id, message: 'NAB Business Operating dipped to $4,890 (threshold $5,000) on ' + addDays(today, -3), severity: 'warning',  createdAt: addDays(today, -3),  dismissed: false },
    { id: uid('ale'), ruleId: alertRules[3].id, message: 'INV-1042 (Bondi Bakery, $1,100.00) overdue by 2 days',  severity: 'critical', createdAt: addDays(today, -2),  dismissed: false },
    { id: uid('ale'), ruleId: alertRules[1].id, message: 'Large transaction: Westpac Loan Repay −$1,850.00',     severity: 'info',     createdAt: addDays(today, -1),  dismissed: false },
  ];

  // Chat history
  const chatHistory = [
    { id: uid('msg'), role: 'bot',  ts: addDays(today, -2) + 'T09:00:00Z', content: "Welcome to your AI Financial Assistant. Ask me anything about your finances — for example, \"What was my biggest expense last month?\" or \"Am I on track to lodge my BAS?\"" },
  ];

  // Audit log
  const audit = [
    { id: uid('aud'), ts: addDays(today, -28) + 'T11:00:00Z', userId: 'u_book', action: 'lodged',  entity: 'BAS',     summary: 'Lodged BAS Q3 FY24/25' },
    { id: uid('aud'), ts: addDays(today, -25) + 'T14:33:00Z', userId: 'u_book', action: 'created', entity: 'JournalEntry', summary: 'BILL-238 — Coastal Roastery' },
    { id: uid('aud'), ts: addDays(today, -10) + 'T10:12:00Z', userId: 'u_book', action: 'created', entity: 'JournalEntry', summary: 'INV-1043 — Manly Cafe' },
    { id: uid('aud'), ts: addDays(today, -3)  + 'T09:01:00Z', userId: 'u_owner',action: 'drafted', entity: 'JournalEntry', summary: 'JV-001 — Owner contribution' },
  ];

  // Portfolio (some held)
  const portfolio = [
    { id: uid('pf'), ticker: 'CBA.AX',  name: 'Commonwealth Bank',   qty: 80,  avgCost: 102.50, currency: 'AUD', type: 'stock' },
    { id: uid('pf'), ticker: 'BHP.AX',  name: 'BHP Group',           qty: 120, avgCost: 41.80,  currency: 'AUD', type: 'stock' },
    { id: uid('pf'), ticker: 'CSL.AX',  name: 'CSL Limited',         qty: 22,  avgCost: 268.40, currency: 'AUD', type: 'stock' },
    { id: uid('pf'), ticker: 'A200.AX', name: 'BetaShares ASX 200',  qty: 350, avgCost: 132.10, currency: 'AUD', type: 'etf'   },
    { id: uid('pf'), ticker: 'VAS.AX',  name: 'Vanguard Australian', qty: 180, avgCost: 95.00,  currency: 'AUD', type: 'etf'   },
    { id: uid('pf'), ticker: 'NDQ.AX',  name: 'BetaShares NDQ',      qty: 60,  avgCost: 38.50,  currency: 'AUD', type: 'etf'   },
    { id: uid('pf'), ticker: 'BTC',     name: 'Bitcoin',             qty: 0.12,avgCost: 64000,  currency: 'AUD', type: 'crypto'},
    { id: uid('pf'), ticker: 'ETH',     name: 'Ethereum',            qty: 1.4, avgCost: 4800,   currency: 'AUD', type: 'crypto'},
  ];

  const watchlist = [
    { id: uid('wl'), ticker: 'WBC.AX', name: 'Westpac Banking' },
    { id: uid('wl'), ticker: 'ANZ.AX', name: 'ANZ Group' },
    { id: uid('wl'), ticker: 'TLS.AX', name: 'Telstra Group' },
    { id: uid('wl'), ticker: 'WES.AX', name: 'Wesfarmers' },
    { id: uid('wl'), ticker: 'FMG.AX', name: 'Fortescue Metals' },
    { id: uid('wl'), ticker: 'XRO.AX', name: 'Xero Limited' },
    { id: uid('wl'), ticker: 'AAPL',   name: 'Apple Inc.' },
  ];

  const tickers = [...portfolio.map(p => p.ticker), ...watchlist.map(w => w.ticker)];
  const seedPrices = {
    'CBA.AX': 118.40, 'BHP.AX': 38.95, 'CSL.AX': 295.10, 'A200.AX': 145.20,
    'VAS.AX': 102.80, 'NDQ.AX': 44.10, 'BTC': 95000, 'ETH': 3450,
    'WBC.AX': 32.10, 'ANZ.AX': 30.25, 'TLS.AX': 4.05, 'WES.AX': 76.50,
    'FMG.AX': 18.20, 'XRO.AX': 168.30, 'AAPL': 232.50,
  };
  const marketPrices = {};
  for (const t of tickers) {
    const base = seedPrices[t] || 50;
    const history = [];
    let p = base * 0.92;
    for (let i = 0; i < 90; i++) {
      p = p * (1 + (Math.random() - 0.48) * 0.018);
      history.push(p);
    }
    history[history.length - 1] = base;
    const openPrice = history[history.length - 2] || base;
    marketPrices[t] = { price: base, openPrice, change: base - openPrice, history };
  }

  const options = [
    { ticker: 'CBA.AX', strike: 120, expiry: addDays(today, 30), type: 'call', bid: 1.85, ask: 1.95 },
    { ticker: 'CBA.AX', strike: 115, expiry: addDays(today, 30), type: 'put',  bid: 0.65, ask: 0.78 },
    { ticker: 'CBA.AX', strike: 125, expiry: addDays(today, 60), type: 'call', bid: 0.95, ask: 1.10 },
    { ticker: 'BHP.AX', strike:  40, expiry: addDays(today, 30), type: 'call', bid: 1.20, ask: 1.30 },
    { ticker: 'BHP.AX', strike:  38, expiry: addDays(today, 30), type: 'put',  bid: 0.55, ask: 0.65 },
    { ticker: 'AAPL',   strike: 230, expiry: addDays(today, 30), type: 'call', bid: 8.10, ask: 8.40 },
    { ticker: 'AAPL',   strike: 240, expiry: addDays(today, 30), type: 'call', bid: 4.20, ask: 4.50 },
    { ticker: 'AAPL',   strike: 220, expiry: addDays(today, 30), type: 'put',  bid: 3.80, ask: 4.10 },
  ];

  const newsFeed = [
    { id: uid('n'), title: 'CBA reports record half-year profit, raises dividend',   source: 'AFR',         ts: addDays(today, -1)+'T08:00:00Z', url: '#', ticker: 'CBA.AX' },
    { id: uid('n'), title: 'BHP announces $4.6B Pilbara expansion plan',             source: 'The Australian', ts: addDays(today, -1)+'T11:30:00Z', url: '#', ticker: 'BHP.AX' },
    { id: uid('n'), title: 'CSL to pause dividend hike amid cost pressures',         source: 'Reuters',     ts: addDays(today, -2)+'T15:00:00Z', url: '#', ticker: 'CSL.AX' },
    { id: uid('n'), title: 'RBA holds cash rate at 4.10%, signals dovish pivot',     source: 'ABC News',    ts: addDays(today, -3)+'T14:30:00Z', url: '#', ticker: '' },
    { id: uid('n'), title: 'Bitcoin tops $95K AUD as ETF flows accelerate',          source: 'CoinTelegraph', ts: addDays(today, -1)+'T22:00:00Z', url: '#', ticker: 'BTC' },
    { id: uid('n'), title: 'Apple unveils new on-device AI features at WWDC',        source: 'TechCrunch',  ts: addDays(today, -4)+'T05:00:00Z', url: '#', ticker: 'AAPL' },
    { id: uid('n'), title: 'Xero adds payroll tax automation for AU customers',      source: 'ITNews',      ts: addDays(today, -5)+'T09:30:00Z', url: '#', ticker: 'XRO.AX' },
  ];

  const profile = {
    businessName: 'Haymarket Roasters Pty Ltd',
    tradingName:  'Haymarket Roasters',
    abn:  '54 782 091 663',
    fyStartMonth: 7,                  // July 1
    currency: 'AUD',
    fontSize: 14,
    smallBusiness: true,
    address: '142 Hay St, Haymarket NSW 2000',
    contact: 'sarah@haymarket-roasters.com.au',
  };

  return {
    profile,
    onboarded: false,
    currentUserId: 'u_owner',
    users,
    accounts,
    transactions: txn,
    recurring,
    budgets,
    categories,
    debts,
    creditScores,
    chartOfAccounts,
    journalEntries,
    bankReconciliations: [],
    bas,
    ap,
    ar,
    employees,
    payRuns,
    superContribs,
    cgtAssets,
    fbtItems,
    depAssets,
    taxDeadlines,
    leaveBalances,
    leaveRequests,
    timesheets,
    alertRules,
    alertEvents,
    chatHistory,
    audit,
    portfolio,
    watchlist,
    marketPrices,
    options,
    newsFeed,
  };
}
