import React, { useState, useEffect } from 'react';
import { Drawer, Input, List, Card, Tag, Button, Tabs, Steps, message, Progress, Badge, Tooltip } from 'antd';
import { QuestionCircleOutlined, BookOutlined, PlayCircleOutlined, SearchOutlined, CheckCircleOutlined } from '@ant-design/icons';

const { TabPane } = Tabs;
const { Step } = Steps;
const { Search } = Input;

const HelpCenter = ({ contextKey }) => {
  const [visible, setVisible] = useState(false);
  const [articles, setArticles] = useState([]);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [trainingModules, setTrainingModules] = useState([]);
  const [trainingSteps, setTrainingSteps] = useState([]);
  const [activeModule, setActiveModule] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [tourActive, setTourActive] = useState(false);
  const [allProgress, setAllProgress] = useState([]);

  useEffect(() => {
    // Listen for F1 key to open help
    const handleF1 = (e) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setVisible(true);
        loadContextHelp();
      }
    };
    document.addEventListener('keydown', handleF1);
    return () => document.removeEventListener('keydown', handleF1);
  }, [contextKey]);

  const loadContextHelp = async () => {
    try {
      if (contextKey) {
        const article = await window.electronAPI.helpContext?.(contextKey);
        if (article) setSelectedArticle(article);
      }
      const all = await window.electronAPI.helpSearch?.('') || [];
      setArticles(Array.isArray(all) ? all : []);
      const modules = await window.electronAPI.trainingModules?.() || [];
      setTrainingModules(Array.isArray(modules) ? modules : []);
      const progress = await window.electronAPI.trainingProgressAll?.('default') || [];
      setAllProgress(Array.isArray(progress) ? progress : []);
    } catch {}
  };

  const handleSearch = async (query) => {
    setSearchQuery(query);
    try {
      const results = await window.electronAPI.helpSearch?.(query) || [];
      setArticles(Array.isArray(results) ? results : []);
    } catch {}
  };

  const viewArticle = async (id) => {
    const article = await window.electronAPI.helpArticle?.(id);
    if (article) setSelectedArticle(article);
  };

  const startTour = async (module) => {
    const steps = await window.electronAPI.trainingSteps?.(module) || [];
    if (!steps.length) { message.info('No steps available for this module'); return; }
    setTrainingSteps(steps);
    setActiveModule(module);
    setCurrentStep(0);
    setTourActive(true);
    setVisible(false);
  };

  const nextTourStep = async () => {
    // Track progress
    await window.electronAPI.trainingProgressUpdate?.('default', activeModule, currentStep + 1);
    if (currentStep < trainingSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setTourActive(false);
      message.success('Training module completed!');
      loadContextHelp();
    }
  };

  const getModuleProgress = (module) => {
    const p = allProgress.find(ap => ap.module === module);
    if (!p) return 0;
    const completed = JSON.parse(p.completed_steps || '[]');
    const modSteps = trainingModules.find(m => m.module === module);
    const total = modSteps?.step_count || 1;
    return Math.round((completed.length / total) * 100);
  };

  const renderContent = (text) => {
    // Simple markdown-like rendering
    if (!text) return null;
    return text.split('\n').map((line, i) => {
      if (line.startsWith('**') && line.endsWith('**')) return <h4 key={i}>{line.replace(/\*\*/g, '')}</h4>;
      const formatted = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');
      return <p key={i} dangerouslySetInnerHTML={{ __html: formatted }} style={{ margin: '4px 0' }} />;
    });
  };

  return (
    <>
      {/* Help Button */}
      <Tooltip title="Help (F1)">
        <Button
          type="text"
          icon={<QuestionCircleOutlined style={{ fontSize: 20 }} />}
          onClick={() => { setVisible(true); loadContextHelp(); }}
          style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000, width: 48, height: 48, borderRadius: '50%', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', background: '#1890ff', color: '#fff' }}
        />
      </Tooltip>

      {/* Help Drawer */}
      <Drawer
        title="Help Center"
        placement="right"
        width={480}
        visible={visible}
        onClose={() => setVisible(false)}
      >
        <Tabs defaultActiveKey="1">
          <TabPane tab={<><BookOutlined /> Articles</>} key="1">
            <Search
              placeholder="Search help articles..."
              onSearch={handleSearch}
              onChange={e => handleSearch(e.target.value)}
              style={{ marginBottom: 16 }}
            />
            {selectedArticle ? (
              <div>
                <Button type="link" onClick={() => setSelectedArticle(null)} style={{ padding: 0, marginBottom: 8 }}>← Back to list</Button>
                <h3>{selectedArticle.title}</h3>
                <Tag color="blue">{selectedArticle.category}</Tag>
                <div style={{ marginTop: 16 }}>
                  {renderContent(selectedArticle.content)}
                </div>
              </div>
            ) : (
              <List
                dataSource={articles}
                renderItem={item => (
                  <List.Item
                    style={{ cursor: 'pointer' }}
                    onClick={() => viewArticle(item.id)}
                  >
                    <List.Item.Meta
                      title={item.title}
                      description={<Tag>{item.category}</Tag>}
                    />
                  </List.Item>
                )}
              />
            )}
          </TabPane>
          <TabPane tab={<><PlayCircleOutlined /> Training</>} key="2">
            <List
              dataSource={trainingModules}
              renderItem={item => {
                const progress = getModuleProgress(item.module);
                return (
                  <List.Item
                    actions={[
                      <Button type="primary" size="small" onClick={() => startTour(item.module)}>
                        {progress > 0 && progress < 100 ? 'Continue' : progress >= 100 ? 'Restart' : 'Start'}
                      </Button>
                    ]}
                  >
                    <List.Item.Meta
                      avatar={progress >= 100 ? <CheckCircleOutlined style={{ fontSize: 24, color: '#52c41a' }} /> : <PlayCircleOutlined style={{ fontSize: 24, color: '#1890ff' }} />}
                      title={item.module.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      description={
                        <div>
                          <span>{item.step_count} steps</span>
                          <Progress percent={progress} size="small" style={{ width: 150, marginLeft: 8 }} />
                        </div>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          </TabPane>
        </Tabs>
      </Drawer>

      {/* Tour Overlay */}
      {tourActive && trainingSteps[currentStep] && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)', zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Card
            style={{ maxWidth: 450, width: '90%' }}
            title={
              <div>
                <span>Step {currentStep + 1} of {trainingSteps.length}</span>
                <Progress percent={Math.round(((currentStep + 1) / trainingSteps.length) * 100)} size="small" style={{ marginLeft: 16, width: 120, display: 'inline-block' }} />
              </div>
            }
            extra={<Button type="text" onClick={() => setTourActive(false)}>✕</Button>}
          >
            <h3>{trainingSteps[currentStep].title}</h3>
            <p style={{ color: '#666', lineHeight: 1.8 }}>{trainingSteps[currentStep].description}</p>
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              {currentStep > 0 && <Button style={{ marginRight: 8 }} onClick={() => setCurrentStep(currentStep - 1)}>Previous</Button>}
              <Button type="primary" onClick={nextTourStep}>
                {currentStep < trainingSteps.length - 1 ? 'Next' : 'Finish'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
};

export default HelpCenter;
