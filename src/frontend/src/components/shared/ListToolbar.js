import React from 'react';
import { Input, Select, Button } from 'antd';
import { SearchOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';

/**
 * ListToolbar — the ONE toolbar for list/table screens (Customers, Suppliers /
 * Vendors, Employees, Invoices, Quotes, Bills, …).
 *
 * Layout is exactly two flex groups so the two sides can never drift apart:
 *
 *   <row>  display:flex; align-items:center; justify-content:space-between
 *     <search>   grows (min 200 / max 420)
 *     <actions>  display:flex; align-items:center; gap:12
 *                status Select · Export · Refresh · children · primaryAction
 *
 * Every control is an antd control at the SAME height — the project's 36px
 * control token, enforced for `.al-list-toolbar` in public/css/custom.css — so
 * the status Select can never sit lower (or higher) than the search box and the
 * buttons beside it. The row wraps cleanly on narrow screens (no horizontal
 * scrolling, no absolute positioning, no negative margins).
 */
const ListToolbar = ({
  searchPlaceholder = 'Search...',
  searchValue = '',
  onSearchChange,
  onSearch,
  statusValue,
  onStatusChange,
  statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'Active', label: 'Active' },
    { value: 'Inactive', label: 'Inactive' },
  ],
  onExport,
  exportLoading = false,
  exportDisabled = false,
  onRefresh,
  refreshLoading = false,
  primaryAction = null,
  children = null,
  style,
}) => (
  <div
    className="al-list-toolbar"
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: 16,
      borderBottom: '1px solid #f0f0f0',
      ...(style || {}),
    }}
  >
    {/* Left: search — grows to fill the space, pushing the actions right. */}
    <div
      className="al-list-toolbar__search"
      style={{ flex: '1 1 240px', minWidth: 160, maxWidth: 420, display: 'flex', alignItems: 'center' }}
    >
      <Input.Search
        allowClear
        placeholder={searchPlaceholder}
        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
        value={searchValue}
        onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
        onSearch={(v) => onSearch && onSearch(v)}
        style={{ width: '100%' }}
      />
    </div>

    {/* Right: filter + actions, all vertically centred on one line. */}
    <div
      className="al-list-toolbar__actions"
      style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '0 0 auto' }}
    >
      {onStatusChange ? (
        <Select value={statusValue} onChange={onStatusChange} style={{ width: 150 }} options={statusOptions} />
      ) : null}

      {onExport ? (
        <Button icon={<DownloadOutlined />} loading={exportLoading} disabled={exportDisabled} onClick={onExport}>
          Export
        </Button>
      ) : null}

      {onRefresh ? (
        <Button icon={<ReloadOutlined />} loading={refreshLoading} onClick={onRefresh}>
          Refresh
        </Button>
      ) : null}

      {children}

      {primaryAction}
    </div>
  </div>
);

export default ListToolbar;
