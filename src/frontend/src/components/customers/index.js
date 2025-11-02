import React from 'react';
import { Route, Switch } from 'react-router-dom';
import CustomerCenter from './CustomerCenter';
import CreateQuote from './quotes/CreateQuote';
import CreateInvoice from './invoices/CreateInvoice';
import CreateStatement from './statements/CreateStatement';
import ReceivePayments from './payments/ReceivePayments';
import IncomeTracker from './IncomeTracker';
import RecurringTransactions from './RecurringTransactions';
import ItemList from './ItemList';
import QuoteList from './quotes/QuoteList';
import InvoiceList from './invoices/InvoiceList';
import CustomerList from './CustomerList';
import CustomerDetails from './CustomerDetails';

const CustomerRoutes = ({ match }) => {
  return (
    <Switch>
      <Route exact path={`${match.path}/center`} component={CustomerCenter} />
      <Route exact path={`${match.path}/list`} component={CustomerList} />
      <Route exact path={`${match.path}/details/:id`} component={CustomerDetails} />
      <Route exact path={`${match.path}/quotes/list`} component={QuoteList} />
      <Route exact path={`${match.path}/quotes/new`} component={CreateQuote} />
      <Route exact path={`${match.path}/quotes/edit/:id`} component={CreateQuote} />
      <Route exact path={`${match.path}/invoices/list`} component={InvoiceList} />
      <Route exact path={`${match.path}/invoices/new`} component={CreateInvoice} />
      <Route exact path={`${match.path}/invoices/edit/:id`} component={CreateInvoice} />
      <Route exact path={`${match.path}/statements/new`} component={CreateStatement} />
      <Route exact path={`${match.path}/payments`} component={ReceivePayments} />
      <Route exact path={`${match.path}/income-tracker`} component={IncomeTracker} />
      <Route exact path={`${match.path}/recurring`} component={RecurringTransactions} />
      <Route exact path={`${match.path}/items`} component={ItemList} />
    </Switch>
  );
};

export default CustomerRoutes;