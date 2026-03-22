import React, { useEffect, useState } from 'react';
import { Card, Table, message } from 'antd';

const ItemList = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      setLoading(true);
      if (!window.electronAPI || !window.electronAPI.getAllProducts) {
        setItems([]);
        return;
      }
      const res = await window.electronAPI.getAllProducts();
      const list = Array.isArray(res) ? res : (res && res.data) ? res.data : [];
      setItems(list);
    } catch (err) {
      console.error('Failed to load items', err);
      message.error('Failed to load items');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { title: 'SKU', dataIndex: 'sku', key: 'sku' },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Category', dataIndex: 'category', key: 'category' },
    { title: 'Price', dataIndex: 'price', key: 'price', render: p => `$${Number(p||0).toFixed(2)}` },
  ];

  return (
    <Card title="Item List">
      <Table dataSource={items} columns={columns} rowKey={r => r.id || r.sku} loading={loading} />
    </Card>
  );
};

export default ItemList;
