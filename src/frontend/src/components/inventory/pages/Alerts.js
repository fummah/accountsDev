import React, { useEffect, useState } from 'react';
import { Card, Table, Space, Typography, Select, message } from 'antd';

const { Title, Text } = Typography;

const Alerts = () => {
  const [reorder, setReorder] = useState([]);
  const [expiring, setExpiring] = useState([]);
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);

  const loadRefs = async () => {
    const [it, wh] = await Promise.all([
      window.electronAPI.getItems(),
      window.electronAPI.getWarehouses(),
    ]);
    setItems(Array.isArray(it) ? it : []);
    setWarehouses(Array.isArray(wh) ? wh : []);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [rl, el] = await Promise.all([
        window.electronAPI.getReorderList(),
        window.electronAPI.listExpiringLots(days),
      ]);
      setReorder(Array.isArray(rl) ? rl : []);
      setExpiring(Array.isArray(el) ? el : []);
    } catch (e) {
      message.error(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRefs(); }, []);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [days]);

  const nameOfItem = (id) => {
    const m = items.find(i => String(i.id) === String(id));
    return m ? `${m.code ? `${m.code} - ` : ''}${m.name}` : id;
  };
  const nameOfWh = (id) => {
    const w = warehouses.find(x => String(x.id) === String(id));
    return w ? (w.name || w.code || id) : id;
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Title level={4}>Inventory Alerts</Title>
        <Card size="small" title="Low Stock (<= Reorder Point)" loading={loading}>
          <Table
            rowKey={r => `${r.itemId}-${r.warehouseId}`}
            dataSource={reorder}
            pagination={{ pageSize: 10 }}
            columns={[
              { title: 'Item', key: 'item', render: (_, r) => <Text>{nameOfItem(r.itemId)}</Text> },
              { title: 'Warehouse', key: 'wh', render: (_, r) => <Text>{nameOfWh(r.warehouseId)}</Text> },
              { title: 'Quantity', dataIndex: 'quantity', key: 'qty' },
              { title: 'Reorder Point', dataIndex: 'reorderPoint', key: 'rp' },
            ]}
          />
        </Card>

        <Card
          size="small"
          title={<Space><span>Lots Near Expiry</span><Text type="secondary">(within)</Text></Space>}
          extra={
            <Space>
              <Text type="secondary">Window:</Text>
              <Select
                value={days}
                onChange={setDays}
                options={[
                  { value: 7, label: '7 days' },
                  { value: 14, label: '14 days' },
                  { value: 30, label: '30 days' },
                  { value: 60, label: '60 days' },
                  { value: 90, label: '90 days' },
                ]}
              />
            </Space>
          }
          loading={loading}
        >
          <Table
            rowKey={r => r.id}
            dataSource={expiring}
            pagination={{ pageSize: 10 }}
            columns={[
              { title: 'Item', key: 'item', render: (_, r) => <Text>{nameOfItem(r.itemId)}</Text> },
              { title: 'Lot', dataIndex: 'lot', key: 'lot' },
              { title: 'Warehouse', key: 'wh', render: (_, r) => <Text>{nameOfWh(r.warehouseId)}</Text> },
              { title: 'Quantity', dataIndex: 'quantity', key: 'qty' },
              { title: 'Expiry Date', dataIndex: 'expiryDate', key: 'exp' },
            ]}
          />
        </Card>
      </Space>
    </Card>
  );
};

export default Alerts;


