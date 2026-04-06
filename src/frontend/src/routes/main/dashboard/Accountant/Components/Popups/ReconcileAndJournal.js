import React, { useState } from 'react';
import { Tabs } from 'antd';
import Reconcile from '../../../../../../components/accountant/Reconcile';
import JournalEntries from '../../../../../../components/accountant/JournalEntries';

const { TabPane } = Tabs;

const ReconcileAndJournal = () => {
  const [activeKey, setActiveKey] = useState('reconcile');

  return (
    <div style={{ padding: 24 }}>
      <Tabs activeKey={activeKey} onChange={setActiveKey}>
        <TabPane tab="Reconcile Accounts" key="reconcile">
          <div style={{ paddingTop: 8 }}>
            <Reconcile />
          </div>
        </TabPane>
        <TabPane tab="Journal Entries" key="journal">
          <div style={{ paddingTop: 8 }}>
            <JournalEntries />
          </div>
        </TabPane>
      </Tabs>
    </div>
  );
};

export default ReconcileAndJournal;
