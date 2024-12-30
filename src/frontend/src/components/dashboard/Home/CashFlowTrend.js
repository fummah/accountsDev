import React from "react";
import {Bar, BarChart, ResponsiveContainer, Tooltip, XAxis} from "recharts";
import Widget from "components/Widget/index";
import {Badge} from "antd";

const data = [
  {name: 'DEC', moneyin: 0, moneyout: 0,},
];

const CashFlowTrend = () => {

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
        <BarChart data={data}
                  margin={{top: 0, right: 0, left: 0, bottom: 0}}>
          <Tooltip/>
          <XAxis dataKey="name"/>
          <Bar dataKey="moneyin" stackId="a" fill="#038FDE" barSize={10}/>
          <Bar dataKey="moneyout" stackId="ab" fill="#FE9E15" barSize={10}/>
        </BarChart>
      </ResponsiveContainer>
    </Widget>
  );
};

export default CashFlowTrend;
