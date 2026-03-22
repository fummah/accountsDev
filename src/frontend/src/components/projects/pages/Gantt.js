import React, { useEffect, useMemo, useState } from 'react';
import { Card, Select, Space, Table, Input, DatePicker, Button, Progress, message } from 'antd';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

const Gantt = () => {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState();
  const [tasks, setTasks] = useState([]);
  const [name, setName] = useState('');
  const [range, setRange] = useState([]);
  const [progress, setProg] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadProjects = async () => {
    try { const p = await window.electronAPI.getProjects(); setProjects(Array.isArray(p)?p:[]);} catch{}
  };
  const loadTasks = async (pid) => {
    try { const t = await window.electronAPI.projectTaskList(pid); setTasks(Array.isArray(t)?t:[]);} catch{}
  };

  useEffect(() => { loadProjects(); }, []);
  useEffect(() => { if (projectId) loadTasks(projectId); }, [projectId]);

  const addTask = async () => {
    if (!projectId || !name || !range?.length) { message.warning('Project, name and dates required'); return; }
    try {
      setLoading(true);
      await window.electronAPI.projectTaskCreate({
        projectId,
        name,
        startDate: range[0].format('YYYY-MM-DD'),
        endDate: range[1].format('YYYY-MM-DD'),
        progress: Number(progress)||0,
      });
      setName(''); setRange([]); setProg(0);
      await loadTasks(projectId);
    } catch (e) {
      message.error('Failed to add task');
    } finally { setLoading(false); }
  };

  const cols = [
    { title: 'Task', dataIndex: 'name', key: 'name' },
    { title: 'Start', dataIndex: 'startDate', key: 'startDate' },
    { title: 'End', dataIndex: 'endDate', key: 'endDate' },
    { title: 'Progress', key: 'progress', render: (_, r) => <Progress percent={Math.round(Number(r.progress||0))} size="small" /> },
  ];

  // Simple visual timeline bar
  const minDate = useMemo(() => {
    const all = tasks.map(t => t.startDate).filter(Boolean);
    return all.length ? all.reduce((a,b)=> a < b ? a : b) : null;
  }, [tasks]);
  const maxDate = useMemo(() => {
    const all = tasks.map(t => t.endDate).filter(Boolean);
    return all.length ? all.reduce((a,b)=> a > b ? a : b) : null;
  }, [tasks]);

  return (
    <Card title="Project Gantt">
      <Space style={{ marginBottom: 8 }} wrap>
        <Select placeholder="Select project" style={{ width: 260 }} value={projectId} onChange={setProjectId}
          options={projects.map(p => ({ value: p.id, label: `${p.code || p.id} - ${p.name}` }))}
        />
        <Input placeholder="Task name" value={name} onChange={e => setName(e.target.value)} style={{ width: 200 }} />
        <RangePicker value={range} onChange={setRange} />
        <Input type="number" min={0} max={100} value={progress} onChange={e => setProg(e.target.value)} addonAfter="%" style={{ width: 140 }} />
        <Button type="primary" loading={loading} onClick={addTask}>Add Task</Button>
      </Space>
      <Table rowKey="id" dataSource={tasks} columns={cols} pagination={false} size="small" style={{ marginBottom: 16 }} />

      {minDate && maxDate && (
        <div style={{ border: '1px solid #eee', padding: 8 }}>
          {tasks.map(t => {
            const start = dayjs(t.startDate);
            const end = dayjs(t.endDate);
            const span = Math.max(1, end.diff(start, 'day'));
            const total = Math.max(1, dayjs(maxDate).diff(dayjs(minDate), 'day'));
            const offset = Math.max(0, start.diff(dayjs(minDate), 'day'));
            const leftPct = (offset/total)*100;
            const widthPct = (span/total)*100;
            return (
              <div key={t.id} style={{ position:'relative', height: 22, margin: '6px 0', background:'#fafafa' }}>
                <div style={{ position:'absolute', left: `${leftPct}%`, width: `${widthPct}%`, top: 2, bottom: 2, background:'#69c0ff', borderRadius: 3 }} />
                <div style={{ position:'absolute', left: 8, top: 2, fontSize: 12 }}>{t.name}</div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default Gantt;
