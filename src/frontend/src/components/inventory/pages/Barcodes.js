import React, { useEffect, useRef, useState } from 'react';
import { Card, Select, Space, Input, Button, Table, message, Modal, Alert } from 'antd';

const Barcodes = () => {
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState('');
  const [itemId, setItemId] = useState('');
  const [barcodes, setBarcodes] = useState([]);
  const [code, setCode] = useState('');
  const [symbology, setSymbology] = useState('CODE128');
  const [lookup, setLookup] = useState('');
  const [found, setFound] = useState(null);

  // Camera scanner state
  const [scanOpen, setScanOpen] = useState(false);
  const [detectorSupported, setDetectorSupported] = useState(false);
  const videoRef = useRef(null);
  const rafRef = useRef(0);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);

  const loadItems = async () => {
    const list = await window.electronAPI.getItems();
    setItems(Array.isArray(list) ? list : []);
  };
  const loadProducts = async () => {
    const list = await window.electronAPI.getAllProducts();
    setProducts(Array.isArray(list) ? list : []);
  };
  const loadForItem = async (id) => {
    const list = await window.electronAPI.getBarcodesByItem(Number(id));
    setBarcodes(Array.isArray(list) ? list : []);
  };
  useEffect(() => { loadItems(); loadProducts(); }, []);
  useEffect(() => { if (itemId) loadForItem(itemId); }, [itemId]);

  useEffect(() => {
    setDetectorSupported(typeof window !== 'undefined' && 'BarcodeDetector' in window);
  }, []);

  const ensureItemForProduct = async (product) => {
    const match = items.find(i => (i.code && product.sku && i.code === product.sku) || (i.name && product.name && i.name === product.name));
    if (match) return match;
    await window.electronAPI.createItem({
      code: product.sku || String(product.id),
      name: product.name || `Product ${product.id}`,
      description: product.description || '',
      category: product.category || '',
      unitPrice: Number(product.price || 0),
      stock: 0
    });
    const it = await window.electronAPI.getItems();
    const refreshed = Array.isArray(it) ? it : [];
    setItems(refreshed);
    return refreshed.find(i => (i.code && product.sku && i.code === product.sku) || (i.name && product.name && i.name === product.name)) || null;
  };
  const onSelectProduct = async (value) => {
    setProductId(value);
    const p = products.find(pp => String(pp.id) === String(value));
    const item = await ensureItemForProduct(p || {});
    if (item?.id) setItemId(item.id);
  };

  const add = async () => {
    if (!itemId || !code) return;
    await window.electronAPI.addBarcode(Number(itemId), code, symbology);
    setCode(''); setSymbology('CODE128');
    await loadForItem(itemId);
    message.success('Barcode added');
  };
  const remove = async (id) => {
    await window.electronAPI.deleteBarcode(id);
    await loadForItem(itemId);
    message.success('Barcode deleted');
  };
  const find = async () => {
    if (!lookup) return;
    const r = await window.electronAPI.findItemByBarcode(lookup);
    setFound(r || null);
    if (!r) message.warning('No item found for scanned code');
  };

  // Camera scanner handlers
  const startScan = async () => {
    try {
      if (!detectorSupported) {
        setScanOpen(true);
        return;
      }
      setScanOpen(true);
      const formats = ['qr_code','ean_13','code_128','upc_a','code_39','ean_8'];
      detectorRef.current = new window.BarcodeDetector({ formats });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        loopDetect();
      }
    } catch (e) {
      message.error(e?.message || 'Unable to access camera');
    }
  };

  const stopScan = () => {
    try {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      if (videoRef.current) {
        try { videoRef.current.pause(); } catch {}
        videoRef.current.srcObject = null;
      }
      if (streamRef.current) {
        try { streamRef.current.getTracks().forEach(t => t.stop()); } catch {}
        streamRef.current = null;
      }
    } catch {}
  };

  useEffect(() => {
    if (!scanOpen) stopScan();
    return () => stopScan();
  }, [scanOpen]);

  const loopDetect = async () => {
    try {
      if (!detectorRef.current || !videoRef.current) return;
      const codes = await detectorRef.current.detect(videoRef.current);
      if (codes && codes.length) {
        const value = codes[0].rawValue || codes[0].rawText || '';
        if (value) {
          setLookup(value);
          setScanOpen(false);
          setTimeout(find, 0);
          return;
        }
      }
    } catch {}
    rafRef.current = requestAnimationFrame(loopDetect);
  };

  return (
    <Card title="Barcodes">
      <div style={{ marginBottom: 10 }}>
        <Select
          showSearch
          placeholder="Select product"
          value={productId || undefined}
          onChange={onSelectProduct}
          optionFilterProp="label"
          style={{ width: 360 }}
          options={products.map(p => ({ value: p.id, label: `${p.sku || p.id} - ${p.name}` }))}
        />
      </div>
      {itemId && (
        <>
          <Space style={{ marginBottom: 8 }}>
            <Input placeholder="Barcode" value={code} onChange={e => setCode(e.target.value)} />
            <Select value={symbology} onChange={v => setSymbology(v)} style={{ width: 160 }}>
              <Select.Option value="CODE128">CODE128</Select.Option>
              <Select.Option value="EAN13">EAN13</Select.Option>
              <Select.Option value="UPC">UPC</Select.Option>
              <Select.Option value="QR">QR</Select.Option>
            </Select>
            <Button onClick={add}>Add</Button>
          </Space>
          <Table
            rowKey="id"
            dataSource={barcodes}
            pagination={false}
            columns={[
              { title: 'Code', dataIndex: 'code', key: 'code' },
              { title: 'Symbology', dataIndex: 'symbology', key: 'symbology' },
              { title: '', key: 'action', width: 100, render: (_, b) => <Button danger size="small" onClick={() => remove(b.id)}>Delete</Button> }
            ]}
          />
        </>
      )}
      <div style={{ marginTop: 16 }}>
        <h3>Lookup</h3>
        <Space>
          <Input placeholder="Scan or enter barcode" value={lookup} onChange={e => setLookup(e.target.value)} />
          <Button onClick={find}>Find</Button>
          <Button type="primary" onClick={startScan}>Open Camera Scanner</Button>
        </Space>
        {found && (
          <div style={{ marginTop: 8 }}>
            Found barcode for itemId: {found.itemId}, code: {found.code}
          </div>
        )}
      </div>

      <Modal
        title="Camera Barcode Scanner"
        open={scanOpen}
        onCancel={() => setScanOpen(false)}
        footer={<Button onClick={() => setScanOpen(false)}>Close</Button>}
        destroyOnClose
      >
        {!detectorSupported && (
          <Alert type="warning" showIcon message="BarcodeDetector API not supported on this system" description="You can still use a USB scanner (acts as keyboard input)." style={{ marginBottom: 8 }} />
        )}
        <video ref={videoRef} style={{ width: '100%', borderRadius: 4 }} muted playsInline />
      </Modal>
    </Card>
  );
};

export default Barcodes;


