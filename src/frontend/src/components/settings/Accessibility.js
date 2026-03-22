import React, { useState, useEffect } from 'react';
import { Card, Slider, Switch, Select, Button, Divider, message } from 'antd';
import { FontSizeOutlined, EyeOutlined, SoundOutlined } from '@ant-design/icons';

const defaults = {
  fontSize: 14,
  highContrast: false,
  reducedMotion: false,
  focusIndicators: true,
  screenReaderHints: false,
  colorBlindMode: 'none',
  lineHeight: 1.5,
  cursorSize: 'default'
};

const Accessibility = () => {
  const [settings, setSettings] = useState(defaults);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    applyToDOM(settings);
  }, [settings]);

  const loadSettings = async () => {
    try {
      const stored = await window.electronAPI.settingsGet?.('accessibility');
      if (stored && typeof stored === 'object') {
        setSettings(prev => ({ ...prev, ...stored }));
      }
    } catch {}
  };

  const applyToDOM = (s) => {
    const root = document.documentElement;
    root.style.fontSize = `${s.fontSize}px`;
    root.style.lineHeight = String(s.lineHeight);

    if (s.highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }

    if (s.reducedMotion) {
      root.style.setProperty('--animation-duration', '0s');
      root.classList.add('reduced-motion');
    } else {
      root.style.removeProperty('--animation-duration');
      root.classList.remove('reduced-motion');
    }

    if (s.focusIndicators) {
      root.classList.add('focus-visible');
    } else {
      root.classList.remove('focus-visible');
    }

    if (s.screenReaderHints) {
      root.setAttribute('role', 'application');
      root.setAttribute('aria-label', 'Accounting Application');
    }

    root.setAttribute('data-colorblind', s.colorBlindMode || 'none');

    if (s.cursorSize === 'large') {
      root.style.cursor = 'default';
      root.classList.add('large-cursor');
    } else {
      root.classList.remove('large-cursor');
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await window.electronAPI.settingsSet?.('accessibility', settings);
      message.success('Accessibility settings saved');
    } catch (e) {
      message.error(e?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const reset = () => {
    setSettings(defaults);
    message.info('Reset to defaults (save to persist)');
  };

  const update = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

  return (
    <div className="gx-p-4">
      <h2><EyeOutlined /> Accessibility Settings</h2>

      <Card size="small" title={<span><FontSizeOutlined /> Text & Display</span>} style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <label>Font Size: <strong>{settings.fontSize}px</strong></label>
          <Slider min={10} max={24} value={settings.fontSize} onChange={v => update('fontSize', v)} marks={{ 10: '10', 14: '14', 18: '18', 24: '24' }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>Line Height: <strong>{settings.lineHeight}</strong></label>
          <Slider min={1} max={2.5} step={0.1} value={settings.lineHeight} onChange={v => update('lineHeight', v)} marks={{ 1: '1', 1.5: '1.5', 2: '2', 2.5: '2.5' }} />
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <span>High Contrast Mode: </span>
            <Switch checked={settings.highContrast} onChange={v => update('highContrast', v)} />
          </div>
          <div>
            <span>Reduced Motion: </span>
            <Switch checked={settings.reducedMotion} onChange={v => update('reducedMotion', v)} />
          </div>
        </div>
      </Card>

      <Card size="small" title={<span><SoundOutlined /> Screen Reader & Navigation</span>} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <span>Screen Reader Hints (ARIA): </span>
            <Switch checked={settings.screenReaderHints} onChange={v => update('screenReaderHints', v)} />
          </div>
          <div>
            <span>Enhanced Focus Indicators: </span>
            <Switch checked={settings.focusIndicators} onChange={v => update('focusIndicators', v)} />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <span>Cursor Size: </span>
          <Select value={settings.cursorSize} onChange={v => update('cursorSize', v)} style={{ width: 150 }}>
            <Select.Option value="default">Default</Select.Option>
            <Select.Option value="large">Large</Select.Option>
          </Select>
        </div>
      </Card>

      <Card size="small" title="Color Vision" style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <span>Color Blind Assistance: </span>
          <Select value={settings.colorBlindMode} onChange={v => update('colorBlindMode', v)} style={{ width: 220 }}>
            <Select.Option value="none">None</Select.Option>
            <Select.Option value="protanopia">Protanopia (Red-blind)</Select.Option>
            <Select.Option value="deuteranopia">Deuteranopia (Green-blind)</Select.Option>
            <Select.Option value="tritanopia">Tritanopia (Blue-blind)</Select.Option>
          </Select>
        </div>
        <div style={{ fontSize: 12, color: '#888' }}>
          Adjusts chart colors and status indicators to be distinguishable for users with color vision deficiencies.
        </div>
      </Card>

      <Divider />
      <div style={{ display: 'flex', gap: 12 }}>
        <Button type="primary" loading={saving} onClick={save}>Save Settings</Button>
        <Button onClick={reset}>Reset to Defaults</Button>
      </div>
    </div>
  );
};

export default Accessibility;
