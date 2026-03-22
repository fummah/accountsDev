import React, { useEffect, useState } from 'react';
import { Card, Radio, Switch, Row, Col, Button, message, Select } from 'antd';

const Theme = () => {
  const [theme, setTheme] = useState('light'); // light | dark | blue | corporate | system
  const [accentColor, setAccentColor] = useState('blue');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [contrastHigh, setContrastHigh] = useState(false);
  const [fontScale, setFontScale] = useState('normal'); // normal | large
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      const cfg = await window.electronAPI.settingsGet?.('ui.theme');
      if (cfg) {
        setTheme(cfg.theme || 'light');
        setAccentColor(cfg.accentColor || 'blue');
        setIsDarkMode(cfg.theme === 'dark');
        setContrastHigh(!!cfg.contrastHigh);
        setFontScale(cfg.fontScale || 'normal');
      }
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const applyToDom = (cfg) => {
    try {
      const body = document.body;
      body.classList.toggle('contrast-high', !!cfg.contrastHigh);
      body.classList.toggle('font-large', cfg.fontScale === 'large');
      // legacy theme system hooks
      if (cfg.theme === 'dark' || isDarkMode) {
        body.classList.add('dark-theme');
      } else {
        body.classList.remove('dark-theme');
      }
    } catch {}
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const cfg = { theme, accentColor, contrastHigh, fontScale };
      await window.electronAPI.settingsSet?.('ui.theme', cfg);
      applyToDom(cfg);
      message.success('Theme settings saved');
    } catch (error) {
      message.error('Failed to save theme settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Theme & Accessibility">
      <Row gutter={[16, 24]}>
        <Col span={24}>
          <h3>Color Theme</h3>
          <Radio.Group value={theme} onChange={e => { setTheme(e.target.value); setIsDarkMode(e.target.value==='dark'); }}>
            <Radio.Button value="light">Light</Radio.Button>
            <Radio.Button value="dark">Dark</Radio.Button>
            <Radio.Button value="blue">Blue</Radio.Button>
            <Radio.Button value="corporate">Corporate</Radio.Button>
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
            onChange={(v) => { setIsDarkMode(v); setTheme(v ? 'dark' : (theme==='dark' ? 'light' : theme)); }}
            checkedChildren="On"
            unCheckedChildren="Off"
          />
        </Col>

        <Col span={24}>
          <h3>Accessibility</h3>
          <div style={{ display:'flex', alignItems:'center', gap: 16 }}>
            <span>High Contrast</span>
            <Switch checked={contrastHigh} onChange={setContrastHigh} />
            <span>Font Size</span>
            <Select value={fontScale} onChange={setFontScale} style={{ width: 140 }} options={[{ value:'normal', label:'Normal' }, { value:'large', label:'Large' }]} />
          </div>
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