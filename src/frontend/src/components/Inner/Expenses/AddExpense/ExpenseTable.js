import React, { useState, useEffect } from 'react';
import { Table, Input, Button, InputNumber, Select, Typography, Divider } from 'antd';
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { Option } = Select;

const ExpenseTable = ({expense, setLines,cats,onSubtotalChange, initialLines=[]}) => {
  const [dataSource, setDataSource] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMergedInitialLines, setHasMergedInitialLines] = useState(false);

  useEffect(() => {
    const populatedLines = dataSource.filter(
      (item) => item.category && item.description && item.amount
    );
    setLines(populatedLines);
  }, [dataSource, setLines]);

  const [editingKey, setEditingKey] = useState('');
  
  const handleAddRow = () => {
    const newKey = dataSource.length + 1;
    setDataSource([...dataSource, { key: newKey, category: '', description: '', amount: 0 }]);
  };

  const handleClearRows = () => {
    setDataSource([]);
  };

  useEffect(() => {    
    if (!hasMergedInitialLines && initialLines.length > 0) {
      setDataSource([]);
      setDataSource(initialLines);
      setHasMergedInitialLines(true); 
    }
    else{
      if(hasMergedInitialLines && initialLines.length < 1)
        {
          setDataSource([]);
          setHasMergedInitialLines(false);
        }
    }   
      
    
  }, [initialLines, hasMergedInitialLines]);

  useEffect(() => {
  
    // Reset the `hasMergedInitialLines` when `item` changes
    setHasMergedInitialLines(false);
  }, [expense]);

  useEffect(() => {
    const populatedLines = dataSource.filter(
      (item) => item.category && item.description && item.amount
    );
    setLines(populatedLines);    
  }, [dataSource, setLines]);

  const formattedNumber = (number) => { return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(number); 
};

  useEffect(() => {
    const subtotal = dataSource.reduce((total, item) => total + (item.amount || 0), 0);
    const calculatedTotal = formattedNumber(subtotal);
    onSubtotalChange(calculatedTotal); 
    setTotal(calculatedTotal);
  }, [dataSource, onSubtotalChange]);

  const isEditing = (record) => record.key === editingKey;

  const edit = (record) => {
    setEditingKey(record.key);
  };

  const save = (key) => {
    setEditingKey('');
  };

  const handleDelete = (key) => {
    setDataSource(dataSource.filter((item) => item.key !== key));
  };

  const columns = [
    {
      title: '#',
      dataIndex: 'key',
      key: 'key',
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      editable: true,
      render: (text, record) =>
        isEditing(record) ? (
          <Select
          style={{width:'80%'}}
          placeholder="select category"
          value={text}
          onChange={(value) => {
            const newData = [...dataSource];
            const itemToUpdate = newData.find((item) => item.key === record.key);
            if (itemToUpdate) {
              itemToUpdate.category = value;
              setDataSource(newData);
            }
          }}
        >
          {cats.map((cat) => (
            <Option key={cat.value} value={cat.value}>
              {cat.label}
            </Option>
          ))}
        </Select>
        ) : (
          <div onDoubleClick={() => edit(record)}>{text || 'Double-click to edit'}</div>
        ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      editable: true,
      render: (text, record) =>
        isEditing(record) ? (
          <Input
            value={text}
            onChange={(e) => {
              const newData = [...dataSource];
              newData.find((item) => item.key === record.key).description = e.target.value;
              setDataSource(newData);
            }}
          />
        ) : (
          <div onDoubleClick={() => edit(record)}>{text || 'What did you pay for?'}</div>
        ),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      editable: true,
      render: (text, record) =>
        isEditing(record) ? (
          <InputNumber
            value={text}
            onChange={(value) => {
              const newData = [...dataSource];
              newData.find((item) => item.key === record.key).amount = value || 0;
              setDataSource(newData);
            }}
          />
        ) : (
          <div onDoubleClick={() => edit(record)}>{text.toFixed(2)}</div>
        ),
    },
    {
      title: '',
      key: 'delete',
      render: (_, record) =>
        dataSource.length > 1 ? (
          <DeleteOutlined onClick={() => handleDelete(record.key)} style={{ color: 'red', cursor: 'pointer' }} />
        ) : null,
    },
  ];

  const mergedColumns = columns.map((col) => {
    if (!col.editable) {
      return col;
    }
    return {
      ...col,
      onCell: (record) => ({
        record,
        editable: col.editable,
        dataIndex: col.dataIndex,
        title: col.title,
        editing: isEditing(record),
      }),
    };
  });

  const subtotal = dataSource.reduce((total, item) => total + (item.amount || 0), 0);

  return (
    <div>
      <Table
        dataSource={dataSource}
        columns={mergedColumns}
        pagination={false}
        rowKey="key"
      />
      <Button onClick={handleAddRow} style={{ marginRight: 8, marginTop: 16 }}>
        Add lines
      </Button>
      <Button onClick={handleClearRows} style={{ marginTop: 16 }}>
        Clear all lines
      </Button>

      <Divider />

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Text>Subtotal</Text>
        <Text>R{subtotal.toFixed(2)}</Text>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
        <Text>Total</Text>
        <Text><Text>${total}</Text></Text>
      </div>

      <Divider />
   
    </div>
  );
};

export default ExpenseTable;
