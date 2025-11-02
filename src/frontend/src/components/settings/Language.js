import React, { useState } from 'react';
import { Card, Radio, Button, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';

const Language = () => {
  const [selectedLanguage, setSelectedLanguage] = useState('en');

  const languages = [
    { label: 'English', value: 'en' },
    { label: 'French', value: 'fr' },
    { label: 'Spanish', value: 'es' },
    { label: 'German', value: 'de' },
    { label: 'Chinese', value: 'zh' },
  ];

  const handleLanguageChange = (e) => {
    setSelectedLanguage(e.target.value);
  };

  const handleSave = async () => {
    try {
      // Save language preference
      // TODO: Implement saving language preference to user settings
      message.success('Language preference saved');
    } catch (error) {
      message.error('Failed to save language preference');
    }
  };

  return (
    <div style={{ padding: '24px' }}>
      <h2>Language Settings</h2>

      <Card style={{ maxWidth: 600 }}>
        <div style={{ marginBottom: '24px' }}>
          <h3>Select Display Language</h3>
          <p>Choose the language for the application interface.</p>
        </div>

        <Radio.Group
          value={selectedLanguage}
          onChange={handleLanguageChange}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          {languages.map(lang => (
            <Radio key={lang.value} value={lang.value}>
              {lang.label}
            </Radio>
          ))}
        </Radio.Group>

        <div style={{ marginTop: '24px' }}>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
          >
            Save Language Preference
          </Button>
        </div>
      </Card>

      <Card style={{ maxWidth: 600, marginTop: '24px' }}>
        <div style={{ marginBottom: '16px' }}>
          <h3>Date and Number Formats</h3>
          <p>The following formats will be used based on your language selection:</p>
        </div>

        <div style={{ marginBottom: '8px' }}>
          <strong>Date Format:</strong>
          <span style={{ marginLeft: '8px' }}>
            {selectedLanguage === 'en' ? 'MM/DD/YYYY' : 'DD/MM/YYYY'}
          </span>
        </div>

        <div style={{ marginBottom: '8px' }}>
          <strong>Number Format:</strong>
          <span style={{ marginLeft: '8px' }}>
            {selectedLanguage === 'en' ? '1,234.56' : '1.234,56'}
          </span>
        </div>

        <div>
          <strong>Currency Format:</strong>
          <span style={{ marginLeft: '8px' }}>
            {selectedLanguage === 'en' ? '$1,234.56' : '1.234,56 €'}
          </span>
        </div>
      </Card>
    </div>
  );
};

export default Language;