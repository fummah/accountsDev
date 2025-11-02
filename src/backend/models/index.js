const Users = require('./users');
const Employees = require('./employees');
const Customers = require('./customers');
const Suppliers = require('./suppliers');
const Expenses = require('./expenses');
const Notes = require('./notes');
const Documents = require('./documents');
const Quotes = require('./quotes');
const Invoices = require('./invoices');
const Products = require('./products');
const Vat = require('./vat');
const CashflowProjections = require('./cashflowProjections');
const Budgets = require('./budgets');
const ChartOfAccounts = require('./chartOfAccounts');
const FixedAssets = require('./fixedAssets');
const Company = require('./company');

const Transactions = require("./transactions");
const Journal = require("./journal");
const Ledger = require("./ledger");
module.exports = {
  Customers,
  Invoices,
  Quotes,
  Products,
  Employees,
  Expenses,
  Notes,
  Suppliers,
  Users,
  Vat,
  CashflowProjections,
  Budgets,
  ChartOfAccounts,
  FixedAssets,
  Company,
  Transactions,
  Journal,
  Ledger
};