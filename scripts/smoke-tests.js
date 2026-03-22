// Simple smoke tests for core accounting flows
// Run with: node scripts/smoke-tests.js

const ChartOfAccounts = require('../src/backend/models/chartOfAccounts');
const Transactions = require('../src/backend/models/transactions');
const Journal = require('../src/backend/models/journal');
const db = require('../src/backend/models/dbmgr');

async function run() {
  console.log('Running smoke tests...');

  try {
    // Ensure tables/migrations
    ChartOfAccounts.createTable && ChartOfAccounts.createTable();
    Transactions.createTable && Transactions.createTable();

    // Create a test account
    const accRes = ChartOfAccounts.insertAccount('SMOKE Test Account', 'Asset', 'SMK-001', 'smoke');
    console.log('Created account id:', accRes.id);
    const accountId = accRes.id;

    // Insert a transaction
    const txRes = Transactions.insert({
      date: new Date().toISOString().slice(0,10),
      type: 'journal',
      amount: 100.00,
      description: 'Smoke test transaction',
      accountId,
      reference: 'SMK-REF',
      debit: 100.00,
      credit: null,
      entered_by: 'smoke'
    });

    console.log('Inserted transaction, changes:', txRes.changes, 'lastId:', txRes.lastInsertRowid);
    const txId = txRes.lastInsertRowid;

    // Get trial balance for today
    const today = new Date().toISOString().slice(0,10);
    const tb = Transactions.getTrialBalance(today, today);
    console.log('Trial balance rows (today):', tb.length);
    const found = tb.find(r => r.accountId === accountId);
    if (found) console.log('Found account in trial balance, debit:', found.debit, 'credit:', found.credit);
    else console.error('Account not found in trial balance result');

    // Reconcile the transaction
    const rec = Transactions.reconcileTransactions({ accountId, statementDate: today, statementBalance: 100.00, transactions: [txId] });
    console.log('Reconcile result:', rec);

    // Void the transaction
    const v = Transactions.voidTransaction(txId);
    console.log('Void transaction changes:', v.changes);

    // --- Journal: suggestions and reversal ---
    console.log('Testing journal suggestions and reversal...');
    const draft = {
      date: today,
      description: 'Imbalanced draft',
      lines: [
        { account: 'Cash', debit: 150, credit: 0 },
        { account: 'Revenue', debit: 0, credit: 100 },
      ],
      entered_by: 'smoke'
    };
    const suggested = Journal.suggestCorrective(draft);
    console.log('Suggestion result:', suggested);
    if (!suggested || suggested.balanced === undefined) throw new Error('Suggestion did not return expected structure');

    // Create a balanced entry and then reverse it
    const realId = Journal.insert({
      date: today,
      description: 'Balanced entry for reversal test',
      lines: [
        { account: 'Cash', debit: 200, credit: 0 },
        { account: 'Revenue', debit: 0, credit: 200 },
      ],
      entered_by: 'smoke'
    });
    console.log('Inserted journal entry id:', realId);

    const revId = Journal.createReversalEntry({ originalEntryId: realId, date: today, entered_by: 'smoke' });
    console.log('Created reversal entry id:', revId);

    console.log('Smoke tests completed successfully.');
  } catch (err) {
    console.error('Smoke tests failed', err);
    process.exitCode = 1;
  }
}

run();
