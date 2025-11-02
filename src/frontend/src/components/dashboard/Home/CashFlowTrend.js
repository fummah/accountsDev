import React, { useState, useEffect } from "react";
import {Bar, BarChart, ResponsiveContainer, Tooltip, XAxis} from "recharts";
import Widget from "components/Widget/index";
import {Badge} from "antd";

const CashFlowTrend = () => {
  const [trendData, setTrendData] = useState([]);

  useEffect(() => {
    const fetchTrendData = async () => {
      try {
        const response = await window.electronAPI.getDashboardSummary();
        if (response && response.invoicetrend) {
          // Map invoice trend data to chart format
          const chartData = response.invoicetrend.map(item => ({
            name: item.name,
            moneyin: Number(item.revenue_total_amount || item.revenue || 0),
            moneyout: 0 // We'll add expense data here
          }));

          // Use either enhanced expenseAnalysis or legacy expenselist
          const expenseList = response.expenseAnalysis || response.expenselist || [];

          // Update with expense data if available
          if (Array.isArray(expenseList) && expenseList.length > 0) {
            chartData.forEach(item => {
              const monthExpenses = expenseList.find(exp => exp.name === item.name || exp.month === item.name);
              if (monthExpenses) {
                item.moneyout = Number(monthExpenses.value || monthExpenses.monthlyAverage || 0);
              }
            });
          }

          setTrendData(chartData);
        }
      } catch (err) {
        console.error('Error fetching cashflow trend data:', err);
      }
    };

    fetchTrendData();
  }, []);

  return (
    <Widget>
      <div className="gx-dealclose-header">
        <div>
          <h2 className="h4 gx-mb-2">CASH FLOW TREND</h2>
          <p className="gx-text-grey">Track how your money is doing</p>
        </div>
        <div className="gx-dealclose-header-right">
          <p className="gx-mb-2"><Badge className="gx-mb-0" status="warning"/> Money In</p>
          <p className="gx-ml-2 gx-mb-2"><Badge className="gx-mb-0" status="processing"/> Money Out</p>
        </div>
      </div>
      <p className="gx-text-primary">Seeing how money flows over time can help you plan for the future. Link your bank account to get started.</p>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={trendData}
                  margin={{top: 0, right: 0, left: 0, bottom: 0}}>
          <Tooltip formatter={(value) => `$${value.toLocaleString()}`}/>
          <XAxis dataKey="name"/>
          <Bar dataKey="moneyin" stackId="a" fill="#038FDE" barSize={10}/>
          <Bar dataKey="moneyout" stackId="ab" fill="#FE9E15" barSize={10}/>
        </BarChart>
      </ResponsiveContainer>
    </Widget>
  );
};

export default CashFlowTrend;
