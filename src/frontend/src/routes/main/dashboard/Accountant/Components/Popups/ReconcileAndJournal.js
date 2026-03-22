import React, { useState } from 'react';
import { Tabs } from 'antd';
import Reconcile from '../../../../../../components/accountant/Reconcile';
import JournalEntries from '../../../../../../components/accountant/JournalEntries';

const ReconcileAndJournal = () => {
  const [activeKey, setActiveKey] = useState('reconcile');

  const items = [
    {
      key: 'reconcile',
      label: 'Reconcile Accounts',
      children: (
        <div style={{ paddingTop: 8 }}>
          <Reconcile />
        </div>
      ),
    },
    {
      key: 'journal',
      label: 'Journal Entries',
      children: (
        <div style={{ paddingTop: 8 }}>
          <JournalEntries />
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Tabs activeKey={activeKey} onChange={setActiveKey} items={items} />
    </div>
  );
};

export default ReconcileAndJournal;
