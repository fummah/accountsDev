# Loading massive dummy data

This project can load a large amount of dummy data into **customers**, **invoices**, **quotes**, **entities**, **suppliers**, **employees**, **products**, and **expenses**.

## Option 1: From inside the app (recommended)

1. Start the app: `npm start` (or run the built Electron app).
2. Open DevTools (e.g. **View → Toggle Developer Tools** or the shortcut).
3. In the Console run:

   ```js
   // Full default counts (3000 customers, 15000 invoices, 8000 quotes, etc.)
   await window.electronAPI.seedDummyData();

   // Or pass custom counts (adds this many of each)
   await window.electronAPI.seedDummyData({
     customers: 500,
     invoices: 2000,
     quotes: 1000,
     products: 200,
     suppliers: 100,
     employees: 50,
     expenses: 300
   });
   ```

4. Wait for the promise to resolve. The returned object shows how many records were added.

## Option 2: Command-line script

From the project root:

```bash
npm run seed
```

This uses the same DB file as the app in development (`src/backend/db/accounts.db`). **Note:** If you see a `better-sqlite3` Node version error, use Option 1 (seed from inside the app) or run `npm rebuild` so the native module matches your system Node.

### Custom counts via environment variables

```bash
# Windows (PowerShell)
$env:SEED_CUSTOMERS=500; $env:SEED_INVOICES=2000; $env:SEED_QUOTES=1000; node scripts/seed-dummy-data.js

# Windows (cmd)
set SEED_CUSTOMERS=500
set SEED_INVOICES=2000
set SEED_QUOTES=1000
node scripts/seed-dummy-data.js

# Linux / macOS
SEED_CUSTOMERS=500 SEED_INVOICES=2000 SEED_QUOTES=1000 node scripts/seed-dummy-data.js
```

Supported variables: `SEED_CUSTOMERS`, `SEED_EMPLOYEES`, `SEED_PRODUCTS`, `SEED_SUPPLIERS`, `SEED_INVOICES`, `SEED_QUOTES`, `SEED_EXPENSES`.

## Default counts (when not overridden)

| Entity   | Default count |
|----------|----------------|
| Customers| 30000         |
| Employees| 30000         |
| Products | 800           |
| Suppliers| 500           |
| Invoices| 15000         |
| Quotes   | 8000          |
| Expenses| 2000          |

Tables (customers, employees, expenses, quotes, invoices, suppliers, products) must already exist; the script only inserts data and does not create tables.

Running the seed multiple times **adds more** records; it does not clear existing data.
