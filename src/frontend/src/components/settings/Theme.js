import React, { useEffect, useState } from 'react';
import { Card, Radio, Switch, Row, Col, Button, message, Select } from 'antd';
import { useDispatch } from 'react-redux';
import { setThemeType, setThemeColor } from '../../appRedux/actions/Setting';
import { THEME_TYPE_DARK, THEME_TYPE_LITE } from '../../constants/ThemeSetting';

const COLOR_MAP = { blue: 'blue', purple: 'light_purple', red: 'red', orange: 'orange', green: 'light_blue', corporate: 'dark_blue' };

const Theme = () => {
  const dispatch = useDispatch();
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
      // Apply theme type via Redux (triggers CSS switch in App/index.js)
      const isDark = cfg.theme === 'dark';
      dispatch(setThemeType(isDark ? THEME_TYPE_DARK : THEME_TYPE_LITE));
      // Apply color theme via Redux
      const col = COLOR_MAP[cfg.theme] || COLOR_MAP[cfg.accentColor] || 'blue';
      dispatch(setThemeColor(col));
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