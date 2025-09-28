import { config } from "dotenv"
import { Client, isFullDatabase } from "@notionhq/client"

config()

const notion = new Client({ auth: process.env.NOTION_KEY! })
const databseId_TRANSAC = process.env.NOTION_DATABASE_TRANSAC!;
const databseId_ACCOUNTS = process.env.NOTION_DATABASE_ACCOUNTS!;
const databseId_DAILY_BALANCE = process.env.NOTION_DATABASE_DAILY_BALANCE!;
const databseId_BUDGETS = process.env.NOTION_DATABASE_BUDGETS!;

const toPlain = (arr?: any[]) => (arr ?? []).map(t => t.plain_text ?? '').join('');

//helper
function getTodayBoundsLocal() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1);
    const fmt = (d: Date) => d.toISOString().slice(0, 10); //YYYY-MM-DD
    return { today: fmt(start), tomorrow: fmt(next)};
}

function formatDailySummaryName(date: Date): string {
  return `${date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} - Summary`;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

function ym(monthDate: Date): string {
  const y = monthDate.getFullYear();
  const m = String(monthDate.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`; // YYYY-MM
}

// --- performance helpers for Daily Balances ---
type DailyBalanceRow = { id: string; delta: number; closing: number };
function keyAB(account: string, currency: string) { return `${account}||${currency}`; }

async function loadTodayDailyBalanceIndex(): Promise<Record<string, DailyBalanceRow>> {
  const index: Record<string, DailyBalanceRow> = {};
  const { today, tomorrow } = getTodayBoundsLocal();
  const filter = {
    and: [
      { property: 'Date', date: { on_or_after: today } },
      { property: 'Date', date: { before: tomorrow } },
    ],
  } as const;

  for await (const p of iterateQuery(databseId_DAILY_BALANCE, { filter })) {
    const page: any = p;
    const props: any = page.properties;
    const accName = (props?.['Account']?.rich_text && toPlain(props['Account'].rich_text)) || '';
    const ccy = props?.['Currency']?.select?.name || '';
    if (!accName || !ccy) continue;
    const delta = typeof props['Delta']?.number === 'number' ? props['Delta'].number : 0;
    const closing = typeof props['Closing Balance']?.number === 'number' ? props['Closing Balance'].number : 0;
    index[keyAB(accName, ccy)] = { id: page.id, delta, closing };
  }
  return index;
}

async function computeTodayCadExpense(): Promise<number> {
  const { today, tomorrow } = getTodayBoundsLocal();
  let total = 0;
  const filter = {
    and: [
      { property: 'Date', date: { on_or_after: today } },
      { property: 'Date', date: { before: tomorrow } },
      { property: 'Type', select: { equals: 'Expense' } },
    ],
  } as const;

  for await (const p of iterateQuery(databseId_TRANSAC, { filter })) {
    const props: any = (p as any).properties;
    const cad = readNumber(props?.['CAD Amount']);
    if (typeof cad === 'number' && cad > 0) total += cad;
  }
  return total;
}

async function upsertMonthlyBudgetByExpense(expenseCad: number, date: Date = new Date()) {
  const month = ym(date); // YYYY-MM

  // try find row by Month (text) or Name (title)
  const q = await notion.databases.query({
    database_id: databseId_BUDGETS,
    page_size: 1,
    filter: {
      or: [
        { property: 'Month', rich_text: { equals: month } },
        { property: 'Name', title: { equals: month } },
      ],
    },
  });

  const nowIso = new Date().toISOString();

  if (q.results.length === 0) {
    // No budget page for this month → initialize with defaults, then apply today's expense immediately
    const initialBudget = 1000;
    const initialRemaining = initialBudget - expenseCad;

    await notion.pages.create({
      parent: { database_id: databseId_BUDGETS },
      properties: {
        'Name': { title: [{ text: { content: month } }] },
        'Month': { rich_text: [{ text: { content: month } }] },
        'Budget': { number: initialBudget },
        'Remaining': { number: initialRemaining },
        'Last Recalc': { date: { start: nowIso } },
      },
    });
    console.log(`Budgets: created ${month} with Budget = ${initialBudget} and Remaining = ${initialRemaining} (after today's expense -${expenseCad})`);
    return;
  }

  const page = q.results[0] as any;
  const props: any = page.properties;
  const budget = readNumber(props?.['Budget']);
  const remainingProp = props?.['Remaining'];
  const hasRemaining = typeof remainingProp?.number === 'number';
  const currentRemaining = hasRemaining ? (remainingProp.number as number) : null;

  const newRemaining = hasRemaining ? (currentRemaining! - expenseCad) : (budget - expenseCad);

  await notion.pages.update({
    page_id: page.id,
    properties: {
      'Remaining': { number: newRemaining },
      'Last Recalc': { date: { start: nowIso } },
    },
  });

  console.log(`Budgets: ${month} Remaining ${hasRemaining ? currentRemaining : budget} -> ${newRemaining} (expense -${expenseCad})`);
}

/*
    1. load accounts (build a map)
        accountsByName: {
            [Name]:{
                pageId,
                currency,               //'CAD' | 'USD'
                currentBalance: number  //from 'Current Balance'
            }
        }

*/
type AccountRow = {
    id: string,
    name: string,
    currency: 'CAD' | 'USD' | string;
    current: number;
}

async function* iterateQuery(database_id: string, base: any){
    let cursor: string | undefined = undefined;
    do{
        const resp = await notion.databases.query({
            database_id,
            page_size: 100,
            start_cursor: cursor,
            ...base,
        });
        for (const r of resp.results) yield r;
        cursor = resp.has_more ? (resp.next_cursor as string) : undefined;
    } while(cursor);
}

function readAccountName(prop: any): string | null {
    if(prop?.select?.name) return prop.select.name as string;
    if(prop?.rich_text) return toPlain(prop.rich_text);
    if(prop?.title) return toPlain(prop.title);
    return null;
}

function readNumber(prop: any): number {
  return typeof prop?.number === 'number' ? prop.number : 0;
}

function readSelectName(prop: any): string | null {
  return prop?.select?.name ?? null;
}

async function loadAccounts(): Promise<Record<string, AccountRow>> {
    const map: Record<string, AccountRow> = {};
    for await (const p of iterateQuery(databseId_ACCOUNTS, {})){
        const props: any = (p as any).properties;
        const name = readAccountName(props?.Name);
        const currency = readSelectName(props?.Currency) ?? 'CAD';
        const current = readNumber(props?.['Current Balance']);
        if (!name) continue;
        map[name] = { id: (p as any).id, name, currency, current };
    }
    return map;
    
}

async function upsertDailyBalanceRow(opts: {
  accountName: string;
  currency: 'CAD' | 'USD' | string;
  deltaToday: number;      // delta applied to this account now
  closingBalance: number;  // new balance after delta
  date?: Date;             // default: today
  preload?: Record<string, DailyBalanceRow>;
}) {
  const date = opts.date ?? new Date();
  const start = ymd(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
  const key = keyAB(opts.accountName, String(opts.currency));
  const pre = opts.preload?.[key];

  if (pre) {
    // Row exists: only update if something changed
    const newDelta = pre.delta + opts.deltaToday;
    const newClosing = opts.closingBalance;
    const needUpdate = (opts.deltaToday !== 0) || (newClosing !== pre.closing);
    if (!needUpdate) return; // no changes, skip write

    await notion.pages.update({
      page_id: pre.id,
      properties: {
        'Delta': { number: newDelta },
        'Closing Balance': { number: newClosing },
      },
    });
    // keep preload fresh for subsequent calls
    if (opts.preload) opts.preload[key] = { id: pre.id, delta: newDelta, closing: newClosing };
    return;
  }

  // No row for today yet: create once
  await notion.pages.create({
    parent: { database_id: databseId_DAILY_BALANCE },
    properties: {
      'Name': { title: [{ text: { content: formatDailySummaryName(date) } }] },
      'Date': { date: { start } },
      'Account': { rich_text: [{ text: { content: opts.accountName } }] },
      'Currency': { select: { name: String(opts.currency) } },
      'Delta': { number: opts.deltaToday },
      'Closing Balance': { number: opts.closingBalance },
      'Source': { select: { name: 'webhook-adjust' } },
      'Reconciled': { checkbox: false },
    },
  });
  if (opts.preload) {
    // we don't have the real page id without re-query; mark placeholder to avoid duplicate creates within same run
    opts.preload[key] = { id: 'created', delta: opts.deltaToday, closing: opts.closingBalance } as any;
  }
}

type DeltaMap = Record<string, number>; // per account (in that account's own currency)

async function computeTodayDeltas(accounts: Record<string, AccountRow>): Promise<DeltaMap> {
  const deltas: DeltaMap = {};
  const { today, tomorrow } = getTodayBoundsLocal();

  const filter = {
    and: [
      { property: 'Date', date: { on_or_after: today } },
      { property: 'Date', date: { before: tomorrow } },
    ],
  } as const;
  const accountCurrency = (name: string | null): 'CAD' | 'USD' | null => {
    if (!name) return null;
    const acc = accounts[name];
    return acc ? (acc.currency as 'CAD' | 'USD') : null;
  };

  let touchedTx = false; // marks that current transaction produced a delta
  const add = (name: string | null, amount: number) => {
    if (!name || !amount) return;
    deltas[name] = (deltas[name] ?? 0) + amount;
    touchedTx = true;
  };

  for await (const p of iterateQuery(databseId_TRANSAC, { filter })) {
    const page: any = p;
    const props: any = page.properties;

    // reset touched flag for this transaction
    touchedTx = false;

    // Extract normalized fields used for idempotency
    const typeName = (props?.Type?.select?.name || '').trim();
    const typeLc = typeName.toLowerCase();
    const fromAcc = readAccountName(props?.['From Account']);
    const toAcc = readAccountName(props?.['To Account']);
    const cad = readNumber(props?.['CAD Amount']);
    const usd = readNumber(props?.['USD Amount']);
    const dateStr = props?.['Date']?.date?.start || '';

    // Stable idempotency fingerprint (independent of last_edited_time and of this property itself)
    const fp = JSON.stringify({
      type: typeLc,
      from: fromAcc || '',
      to: toAcc || '',
      cad: cad || 0,
      usd: usd || 0,
      date: dateStr
    });

    const existingKey = props?.['Idempotency Key']?.rich_text
      ? toPlain(props['Idempotency Key'].rich_text)
      : '';

    if (existingKey === fp) {
      // already processed for this specific field set, skip
      continue;
    }

    switch (typeLc) {
      case 'expense': {
        // reduce the source account in its own currency
        if (cad > 0 && accountCurrency(fromAcc) === 'CAD') add(fromAcc!, -cad);
        if (usd > 0 && accountCurrency(fromAcc) === 'USD') add(fromAcc!, -usd);
        break;
      }
      case 'income': {
        // increase the target account in its own currency
        if (cad > 0 && accountCurrency(toAcc) === 'CAD') add(toAcc!, +cad);
        if (usd > 0 && accountCurrency(toAcc) === 'USD') add(toAcc!, +usd);
        break;
      }
      case 'transfer': {
        const fromCcy = accountCurrency(fromAcc);
        const toCcy = accountCurrency(toAcc);
        if (!fromCcy || !toCcy) break;

        if (fromCcy === toCcy) {
          // Same-currency transfer: need the matching lane only
          if (fromCcy === 'CAD') {
            if (cad > 0) { add(fromAcc!, -cad); add(toAcc!, +cad); }
          } else {
            if (usd > 0) { add(fromAcc!, -usd); add(toAcc!, +usd); }
          }
          break;
        }

        // Cross-currency transfers require BOTH lanes to be present
        if (fromCcy === 'USD' && toCcy === 'CAD') {
          if (usd > 0 && cad > 0) { add(fromAcc!, -usd); add(toAcc!, +cad); }
          break;
        }
        if (fromCcy === 'CAD' && toCcy === 'USD') {
          if (cad > 0 && usd > 0) { add(fromAcc!, -cad); add(toAcc!, +usd); }
          break;
        }
        break;
      }
      case 'repayment': {
        // treat as asset -> liability, but still per-currency lanes
        if (cad > 0) {
          if (accountCurrency(fromAcc) === 'CAD') add(fromAcc!, -cad);
          if (accountCurrency(toAcc) === 'CAD') add(toAcc!, +cad);
        }
        if (usd > 0) {
          if (accountCurrency(fromAcc) === 'USD') add(fromAcc!, -usd);
          if (accountCurrency(toAcc) === 'USD') add(toAcc!, +usd);
        }
        break;
      }
      default:
        // ignore others
        break;
    }

    // if this transaction produced any delta, mark it as processed by storing the idempotency key
    if (touchedTx) {
      try {
        await notion.pages.update({
          page_id: page.id,
          properties: {
            'Idempotency Key': { rich_text: [{ text: { content: fp } }] },
          },
        });
      } catch (e) {
        console.error('Failed to set Idempotency Key for tx', page.id, e);
      }
    }
  }

  return deltas;
}

async function updateAccounts(accounts: Record<string, AccountRow>, deltas: DeltaMap, todayIndex: Record<string, DailyBalanceRow>) {
  for (const acc of Object.values(accounts)) {
    const name = acc.name;
    const delta = deltas[name] ?? 0;
    const newBalance = (acc.current ?? 0) + delta;

    if (delta !== 0) {
      console.log(`[${acc.currency}] ${name}: ${acc.current} -> ${newBalance} (delta ${delta >= 0 ? '+' : ''}${delta})`);
      await notion.pages.update({
        page_id: acc.id as string,
        properties: {
          'Current Balance': { number: newBalance },
        },
      });
      acc.current = newBalance; // keep local state in sync
    } else {
      console.log(`[${acc.currency}] ${name}: no transactions today (closing ${acc.current})`);
    }

    await upsertDailyBalanceRow({
      accountName: name,
      currency: acc.currency,
      deltaToday: delta,
      closingBalance: delta !== 0 ? newBalance : acc.current,
      preload: todayIndex,
    });
  }
}

export async function runDailyRecalc() {
  try {
    const accounts = await loadAccounts();
    if (!Object.keys(accounts).length) {
      console.error('No accounts found. Check NOTION_DATABASE_ACCOUNTS and property names.');
      return;
    }

    const deltas = await computeTodayDeltas(accounts);
    if (!Object.keys(deltas).length) {
      console.log('No transactions for today. Will still write Daily Balances rows with delta=0.');
    }
    const todayIndex = await loadTodayDailyBalanceIndex();
    await updateAccounts(accounts, deltas, todayIndex);

    // Update Budgets table based on today's CAD expenses
    try {
      const expenseCad = await computeTodayCadExpense();
      await upsertMonthlyBudgetByExpense(expenseCad);
    } catch (e) {
      console.error('Budgets update failed:', e);
    }

    console.log('Accounts updated.');
  } catch (e) {
    console.error(e);
  }
}
