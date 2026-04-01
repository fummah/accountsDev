import React, { useEffect, useState } from 'react';
import { Card, Button, InputNumber, Form, Row, Col, Statistic, Tag, Space, message, Alert, Divider, Empty, Select, Modal, Input, Table } from 'antd';
import { PlayCircleOutlined, PoweroffOutlined, ClockCircleOutlined, DollarOutlined, UserOutlined, ReloadOutlined, ShoppingCartOutlined, PlusOutlined, HistoryOutlined } from '@ant-design/icons';
import { useHistory } from 'react-router-dom';

const { Option } = Select;

const Session = () => {
  const [openSession, setOpenSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [sales, setSales] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [pastSessions, setPastSessions] = useState([]);
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [closeForm] = Form.useForm();
  const [empForm] = Form.useForm();
  const history = useHistory();

  const fetchEmployees = async () => {
    try {
      const res = await window.electronAPI.getEmployees?.();
      // Backend returns { success, data: [...] } not a plain array
      if (res?.data && Array.isArray(res.data)) setEmployees(res.data);
      else if (Array.isArray(res)) setEmployees(res);
      else setEmployees([]);
    } catch {}
  };

  const load = async () => {
    try {
      const [s, sessions] = await Promise.all([
        window.electronAPI.posGetOpenSession(),
        window.electronAPI.posListSessions?.(20),
      ]);
      setOpenSession(s || null);
      setPastSessions(Array.isArray(sessions) ? sessions.filter(ss => ss.status === 'closed') : []);
      if (s?.id) {
        const sl = await window.electronAPI.posListSales(s.id);
        setSales(Array.isArray(sl) ? sl : []);
      } else {
        setSales([]);
      }
    } catch (e) {
      message.error(String(e?.message || e));
    }
    setPageLoading(false);
  };

  useEffect(() => { load(); fetchEmployees(); }, []);

  const openSession_ = async () => {
    try {
      const vals = await form.validateFields();
      setLoading(true);
      const res = await window.electronAPI.posOpenSession(vals.openedBy || null, Number(vals.openingAmount) || 0);
      if (res?.error) { message.error(res.error); } else { message.success('Session opened'); }
      form.resetFields();
      await load();
    } catch (e) {
      if (!e?.errorFields) message.error(String(e?.message || e));
    } finally { setLoading(false); }
  };

  const closeSession_ = async () => {
    if (!openSession?.id) return;
    try {
      const vals = await closeForm.validateFields();
      setLoading(true);
      const res = await window.electronAPI.posCloseSession(openSession.id, Number(vals.closingAmount) || 0);
      if (res?.error) { message.error(res.error); } else { message.success('Session closed'); }
      closeForm.resetFields();
      await load();
    } catch (e) {
      if (!e?.errorFields) message.error(String(e?.message || e));
    } finally { setLoading(false); }
  };

  const handleAddEmployee = async () => {
    try {
      const vals = await empForm.validateFields();
      await window.electronAPI.insertEmployee?.({
        first_name: vals.first_name || '',
        last_name: vals.last_name || '',
        email: vals.email || '',
        phone: vals.phone || '',
        department: vals.department || '',
        position: vals.position || '',
      });
      message.success('Employee added');
      setEmpModalOpen(false);
      empForm.resetFields();
      await fetchEmployees();
    } catch (e) { if (!e?.errorFields) message.error('Failed to add employee'); }
  };

  const sessionTotal = sales.reduce((s, sl) => s + Number(sl.total || 0), 0);

  const historyColumns = [
    { title: '#', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'Cashier', dataIndex: 'openedBy', key: 'openedBy', render: v => v || 'N/A' },
    { title: 'Opened', dataIndex: 'openedAt', key: 'openedAt', render: v => v || '-' },
    { title: 'Closed', dataIndex: 'closedAt', key: 'closedAt', render: v => v || '-' },
    { title: 'Opening (R)', dataIndex: 'openingAmount', key: 'openingAmount', align: 'right', render: v => Number(v || 0).toFixed(2) },
    { title: 'Closing (R)', dataIndex: 'closingAmount', key: 'closingAmount', align: 'right', render: v => v != null ? Number(v).toFixed(2) : '-' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: v => <Tag color={v === 'open' ? 'green' : 'default'}>{(v || '').toUpperCase()}</Tag> },
  ];

  if (pageLoading) return <div className="gx-p-4"><Card loading /></div>;

  return (
    <div className="gx-p-4">
      <Card title={<span><ShoppingCartOutlined /> Point of Sale</span>}
        extra={<Button icon={<ReloadOutlined />} onClick={load} size="small">Refresh</Button>}>

        {!openSession ? (
          <>
            <Row gutter={24}>
              <Col xs={24} md={12}>
                <Card type="inner" title={<span><PlayCircleOutlined /> Open New Session</span>}
                  style={{ borderColor: '#52c41a' }}>
                  <Form form={form} layout="vertical" onFinish={openSession_}>
                    <Form.Item name="openedBy" label="Cashier / Opened By" rules={[{ required: true, message: 'Please select a cashier' }]}>
                      <Select
                        showSearch optionFilterProp="children" placeholder="Select cashier" size="large"
                        dropdownRender={menu => (
                          <>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setEmpModalOpen(true)} block>Add New Employee</Button></>
                        )}>
                        {employees.map(e => {
                          const name = `${e.first_name || ''} ${e.last_name || ''}`.trim() || e.email || `Employee #${e.id}`;
                          return <Option key={e.id} value={name}>{name}</Option>;
                        })}
                      </Select>
                    </Form.Item>
                    <Form.Item name="openingAmount" label="Opening Float Amount" initialValue={0}>
                      <InputNumber prefix="R" min={0} style={{ width: '100%' }} size="large"
                        formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        parser={v => v.replace(/,/g, '')} />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={loading} icon={<PlayCircleOutlined />}
                      size="large" block style={{ background: '#52c41a', borderColor: '#52c41a' }}>
                      Open Session
                    </Button>
                  </Form>
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Empty description="No active session" style={{ marginTop: 48 }}>
                  <p style={{ color: '#8c8c8c' }}>Open a new session to start processing sales.</p>
                </Empty>
              </Col>
            </Row>

            {pastSessions.length > 0 && (
              <>
                <Divider><HistoryOutlined /> Previous Sessions</Divider>
                <Table dataSource={pastSessions} columns={historyColumns} rowKey="id"
                  size="small" pagination={{ pageSize: 10 }} />
              </>
            )}
          </>
        ) : (
          <>
            <Alert type="success" showIcon icon={<ClockCircleOutlined />} style={{ marginBottom: 16 }}
              message={<span>Session <strong>#{openSession.id}</strong> is active</span>}
              description={`Opened by ${openSession.openedBy || 'N/A'} at ${openSession.openedAt || 'N/A'}`} />

            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col xs={12} sm={6}>
                <Card size="small"><Statistic title="Session #" value={openSession.id} /></Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card size="small"><Statistic title="Opening Float" value={Number(openSession.openingAmount || 0).toFixed(2)} prefix="R" /></Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card size="small"><Statistic title="Sales Count" value={sales.length} /></Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card size="small"><Statistic title="Sales Total" value={sessionTotal.toFixed(2)} prefix="R" valueStyle={{ color: '#1890ff' }} /></Card>
              </Col>
            </Row>

            <Row gutter={24}>
              <Col xs={24} md={12}>
                <Card type="inner" title="Quick Actions" size="small">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Button type="primary" icon={<ShoppingCartOutlined />} size="large" block
                      onClick={() => history.push('/main/pos/sale')}>
                      New Sale
                    </Button>
                    <Button icon={<DollarOutlined />} size="large" block
                      onClick={() => history.push('/main/pos/sales')}>
                      View Sales
                    </Button>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card type="inner" title={<span><PoweroffOutlined /> Close Session</span>}
                  size="small" style={{ borderColor: '#f5222d' }}>
                  <Form form={closeForm} layout="vertical" onFinish={closeSession_}>
                    <Form.Item name="closingAmount" label="Cash in Drawer" initialValue={0}>
                      <InputNumber prefix="R" min={0} style={{ width: '100%' }} size="large"
                        formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        parser={v => v.replace(/,/g, '')} />
                    </Form.Item>
                    <Button danger htmlType="submit" loading={loading} icon={<PoweroffOutlined />}
                      size="large" block>
                      Close Session
                    </Button>
                  </Form>
                </Card>
              </Col>
            </Row>

            {sales.length > 0 && (
              <>
                <Divider>Recent Sales This Session</Divider>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#fafafa' }}>
                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #e8e8e8' }}>#</th>
                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #e8e8e8' }}>Time</th>
                        <th style={{ padding: '8px', textAlign: 'right', borderBottom: '2px solid #e8e8e8' }}>Total</th>
                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '2px solid #e8e8e8' }}>Payment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.slice(0, 10).map(s => (
                        <tr key={s.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '6px 8px' }}>{s.id}</td>
                          <td style={{ padding: '6px 8px' }}>{s.date || s.createdAt || '-'}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>R {Number(s.total || 0).toFixed(2)}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <Tag color={s.paymentType === 'cash' ? 'green' : s.paymentType === 'card' ? 'blue' : 'orange'}>
                              {(s.paymentType || 'N/A').toUpperCase()}
                            </Tag>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </Card>

      {/* Add Employee Modal */}
      <Modal title="Add New Employee" visible={empModalOpen} zIndex={1100}
        onCancel={() => setEmpModalOpen(false)} onOk={handleAddEmployee} okText="Add Employee">
        <Form form={empForm} layout="vertical">
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}><Form.Item name="first_name" label="First Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="last_name" label="Last Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="email" label="Email"><Input type="email" /></Form.Item></Col>
            <Col span={12}><Form.Item name="phone" label="Phone"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="department" label="Department"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="position" label="Position"><Input /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default Session;


