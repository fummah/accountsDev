import React, { useState } from 'react';
import { Card, Radio, Switch, Row, Col, Button, message } from 'antd';

const Theme = () => {
  const [theme, setTheme] = useState('light');
  const [accentColor, setAccentColor] = useState('blue');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      // TODO: Implement save theme to backend
      console.log('Theme settings:', { theme, accentColor, isDarkMode });
      message.success('Theme settings saved successfully');
    } catch (error) {
      message.error('Failed to save theme settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Theme Settings">
      <Row gutter={[16, 24]}>
        <Col span={24}>
          <h3>Color Theme</h3>
          <Radio.Group value={theme} onChange={e => setTheme(e.target.value)}>
            <Radio.Button value="light">Light</Radio.Button>
            <Radio.Button value="dark">Dark</Radio.Button>
            <Radio.Button value="system">System</Radio.Button>
          </Radio.Group>
        </Col>

        <Col span={24}>
          <h3>Accent Color</h3>
          <Radio.Group value={accentColor} onChange={e => setAccentColor(e.target.value)}>
            <Radio.Button value="blue">Blue</Radio.Button>
            <Radio.Button value="purple">Purple</Radio.Button>
            <Radio.Button value="red">Red</Radio.Button>
            <Radio.Button value="orange">Orange</Radio.Button>
            <Radio.Button value="green">Green</Radio.Button>
          </Radio.Group>
        </Col>

        <Col span={24}>
          <h3>Dark Mode</h3>
          <Switch
            checked={isDarkMode}
            onChange={setIsDarkMode}
            checkedChildren="On"
            unCheckedChildren="Off"
          />
        </Col>

        <Col span={24}>
          <div style={{ marginTop: '24px' }}>
            <Button type="primary" onClick={handleSave} loading={loading}>
              Save Theme Settings
            </Button>
          </div>
        </Col>

        <Col span={24}>
          <Card title="Preview" style={{ marginTop: '24px' }}>
            <div
              style={{
                padding: '20px',
                background: isDarkMode ? '#141414' : '#ffffff',
                color: isDarkMode ? '#ffffff' : '#000000',
                borderRadius: '4px',
              }}
            >
              <h4>Theme Preview</h4>
              <p>This is how your selected theme will look.</p>
              <Button type="primary" style={{ background: accentColor }}>
                Sample Button
              </Button>
            </div>
          </Card>
        </Col>
      </Row>
    </Card>
  );
};

export default Theme;