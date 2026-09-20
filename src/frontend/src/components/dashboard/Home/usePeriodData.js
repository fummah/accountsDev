import moment from "moment";

const fmt = (m) => (m ? moment(m).format('MMM D, YYYY') : '');

const usePeriodData = (opts) => {
  const {
    period, customRange,
    DailyRevenue, DailyExpenses, DailyCategories,
    MonthlyRevenue = [], MonthlyExpenses = {}, MonthlyCategories = {},
    CurrentBalance = 0, Invoiced = 0, Expensed = 0,
  } = opts;

  const hasDaily = Array.isArray(DailyRevenue) || Array.isArray(DailyExpenses);

  let start = null, end = null, label = '';
  if (period === 'today') {
    start = moment().startOf('day'); end = moment().endOf('day'); label = 'Today';
  } else if (period === 'yesterday') {
    start = moment().subtract(1, 'day').startOf('day'); end = moment().subtract(1, 'day').endOf('day'); label = 'Yesterday';
  } else if (period === 'thisWeek') {
    start = moment().startOf('week'); end = moment().endOf('week'); label = 'This Week';
  } else if (period === 'lastWeek') {
    start = moment().subtract(1, 'week').startOf('week'); end = moment().subtract(1, 'week').endOf('week'); label = 'Last Week';
  } else if (period === 'thisMonth') {
    start = moment().startOf('month'); end = moment().endOf('month'); label = moment().format('MMMM YYYY');
  } else if (period === 'lastMonth') {
    start = moment().subtract(1, 'month').startOf('month'); end = moment().subtract(1, 'month').endOf('month'); label = moment().subtract(1, 'month').format('MMMM YYYY');
  } else if (period === 'custom' && Array.isArray(customRange) && customRange.length === 2 && customRange[0] && customRange[1]) {
    start = moment(customRange[0]).startOf('day'); end = moment(customRange[1]).endOf('day');
    label = `${fmt(customRange[0])} - ${fmt(customRange[1])}`;
  }

  if (!start || !end) {
    return { label: '', revenue: 0, expenses: 0, categories: [], net: 0, startDate: null, endDate: null };
  }

  let revenue = 0, expenses = 0, categories = [];

  if (hasDaily) {
    const s = start.format('YYYY-MM-DD');
    const e = end.format('YYYY-MM-DD');
    (DailyRevenue || []).forEach(r => {
      if (r.day >= s && r.day <= e) revenue += Number(r.revenue) || 0;
    });
    (DailyExpenses || []).forEach(r => {
      if (r.day >= s && r.day <= e) expenses += Number(r.total) || 0;
    });
    const catMap = {};
    (DailyCategories || []).forEach(r => {
      if (r.day >= s && r.day <= e) catMap[r.name] = (catMap[r.name] || 0) + (Number(r.value) || 0);
    });
    categories = Object.entries(catMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  } else if (period === 'thisMonth' || period === 'lastMonth') {
    // Fallback when the backend hasn't been restarted with daily data.
    const key = start.format('YYYY-MM');
    revenue = Number(MonthlyRevenue.find(mt => mt.month === key)?.revenue) || 0;
    expenses = Number(MonthlyExpenses[key]) || 0;
    categories = (MonthlyCategories[key] || []).map(c => ({ ...c }));
    if (MonthlyRevenue.length === 0 && Object.keys(MonthlyExpenses).length === 0) {
      revenue = Number(Invoiced) || 0;
      expenses = Number(Expensed) || 0;
    }
  }

  return {
    label,
    revenue,
    expenses,
    categories,
    net: revenue - expenses,
    startDate: start,
    endDate: end,
  };
};

export default usePeriodData;
