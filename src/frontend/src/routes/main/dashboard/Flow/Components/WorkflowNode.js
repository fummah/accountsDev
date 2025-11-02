import { Card } from 'antd';

export default function WorkflowNode({ id, icon, label, style, onClick }) {
    return (
      <div id={id} onClick={onClick} style={{ position: 'absolute', width: 100, textAlign: 'center', ...style }}>
        <Card hoverable style={{ borderRadius: 12, padding: 8 }}>
          <img src={icon} alt={label} style={{ width: 32, height: 32, marginBottom: 6 }} />
          <div style={{ fontSize: 12 }}>{label}</div>
        </Card>
      </div>
    );
  }