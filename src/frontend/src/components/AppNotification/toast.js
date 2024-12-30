import React, { useEffect } from 'react';
import { notification } from 'antd';

const Toast = ({ title, message, show,setShowError }) => {
  const [api, contextHolder] = notification.useNotification();
  useEffect(() => {
    if (show) {
      api.open({
        message: title,
        description: message,
        duration: 8, 
        placement: 'topRight',
        showProgress: true,
      });
    }
  
  }, [show, api, title, message]);
  setShowError(false);
  return <>{contextHolder}</>;
};

export default Toast;
