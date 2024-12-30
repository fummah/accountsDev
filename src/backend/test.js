// src/backend/test.js
const { Users, Employees,Expenses } = require('./models');

// Test: Insert and retrieve users
Expenses.insertExpense('Dziva', 'Cash and cash equivalents', '2024-11-05', ' Test Debit', '86768', 'customer', '1',[{category:'Bank charges', description:'rtrtr', amount:869690.0}]);
