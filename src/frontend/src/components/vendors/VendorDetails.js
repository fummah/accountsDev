import React, { useState } from 'react';
import { Card, Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useParams, useHistory } from 'react-router-dom';
import VendorDetailsContent from './VendorDetailsContent';

/**
 * VendorDetails — PAGE shell for the shared Vendor detail content.
 * Reached from Purchase Order → View Vendor (route /main/vendors/details/:id).
 * The content itself lives in VendorDetailsContent (shared with the drawer).
 */
const VendorDetails = ({ match }) => {
  const params = useParams();
  const history = useHistory();
  const id = params?.id || match?.params?.id;
  const [vendorName, setVendorName] = useState('');

  return (
    <Card
      title={vendorName ? `Vendor: ${vendorName}` : 'Vendor Details'}
      extra={<Button icon={<ArrowLeftOutlined />} onClick={() => history.goBack()}>Back</Button>}
    >
      <VendorDetailsContent vendorId={id} mode="page" onVendorLoaded={(v) => setVendorName(v.display_name || `${v.first_name || ''} ${v.last_name || ''}`.trim())} />
    </Card>
  );
};

export default VendorDetails;
