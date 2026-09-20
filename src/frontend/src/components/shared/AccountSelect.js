import React, { useMemo } from 'react';
import { Select, Tag, Space } from 'antd';
import { buildAccountLabelMap } from '../../utils/accounts';

const { Option } = Select;

const TYPE_COLORS = {
  Asset: 'blue',
  Bank: 'geekblue',
  Cash: 'cyan',
  Liability: 'volcano',
  'Credit Card': 'magenta',
  Loan: 'purple',
  Equity: 'gold',
  Income: 'green',
  'Other Income': 'lime',
  Expense: 'red',
  'Other Expense': 'orange',
  'Cost of Goods Sold': 'orange',
};

const TYPE_LABELS = {
  Asset: 'Asset',
  Bank: 'Bank',
  Cash: 'Cash',
  Liability: 'Liability',
  'Credit Card': 'Credit Card',
  Loan: 'Loan',
  Equity: 'Equity',
  Income: 'Income',
  'Other Income': 'Other Income',
  Expense: 'Expense',
  'Other Expense': 'Other Expense',
  'Cost of Goods Sold': 'COGS',
};

// Build an alphabetically-sorted hierarchy tree (parents → children).
const buildTree = (accounts) => {
  const byId = new Map();
  accounts.forEach((a, i) => {
    const id = a.id != null && !Number.isNaN(Number(a.id)) ? Number(a.id) : i;
    byId.set(id, {
      id,
      code: a.accountNumber || a.accountCode || a.number || '',
      name: a.accountName || a.name || '',
      type: a.accountType || a.type || '',
      parentId: a.parentId != null ? Number(a.parentId) : null,
      children: [],
    });
  });
  const roots = [];
  byId.forEach((n) => {
    if (n.parentId != null && byId.has(n.parentId) && byId.get(n.parentId) !== n) {
      byId.get(n.parentId).children.push(n);
    } else {
      roots.push(n);
    }
  });
  const sortRec = (list) => {
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
};

const flatten = (nodes, out = [], depth = 0) => {
  nodes.forEach((n) => {
    out.push({ ...n, depth });
    if (n.children.length) flatten(n.children, out, depth + 1);
  });
  return out;
};

const filterOption = (input, option) => {
  const q = String(input || '').toLowerCase().trim();
  if (!q) return true;
  // `option.id` is included deliberately: the ledger deep-links carry an
  // account id (?account=257) and a user pasting one expects the dropdown to
  // find it. Account names repeat across parents, so the id is often the only
  // unambiguous handle a user has.
  const hay = `${option.searchText || ''} ${option.code || ''} ${option.name || ''} ${option.path || ''} ${option.acctId || ''}`.toLowerCase();
  return hay.includes(q);
};

/**
 * QuickBooks-style hierarchical account selector.
 *
 * Renders accounts grouped under their parents (parents bold, children
 * indented), with a two-column look (account type tag + name), alphabetically
 * sorted, searchable by name/code/full path, and selectable for parents OR
 * children.
 *
 * valueMode:
 *   'id'   (default) — value is the unique Account ID (never the name).
 *   'name'           — value is the account name (for legacy name-stored
 *                       payment/bank account fields such as payment_account,
 *                       deposit_to, creditCardAccount).
 */
const AccountSelect = ({
  accounts = [],
  value,
  onChange,
  placeholder = 'Select account',
  allowClear = true,
  disabled = false,
  style,
  size,
  valueMode = 'id',
  dropdownRender,
  ...rest
}) => {
  const tree = useMemo(() => buildTree(accounts || []), [accounts]);
  const labelMap = useMemo(() => buildAccountLabelMap(accounts || []), [accounts]);
  const rows = useMemo(() => flatten(tree), [tree]);

  const toValue = (a) => (valueMode === 'name' ? a.name : a.id);

  return (
    <Select
      showSearch
      allowClear={allowClear}
      disabled={disabled}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      style={style}
      size={size}
      filterOption={filterOption}
      optionFilterProp="children"
      dropdownRender={dropdownRender}
      {...rest}
    >
      {rows.map((a) => (
        <Option
          key={a.id}
          value={toValue(a)}
          searchText={`${labelMap.get(a.id) || ''} ${a.name} ${a.code} ${a.type}`}
          code={a.code}
          name={a.name}
          acctId={String(a.id)}
          path={labelMap.get(a.id) || a.name}
          type={a.type}
        >
          <Space size={6} style={{ width: '100%' }}>
            <Tag
              color={TYPE_COLORS[a.type] || 'default'}
              style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', width: 78, textAlign: 'center', marginRight: 0, flexShrink: 0 }}
            >
              {TYPE_LABELS[a.type] || a.type || '—'}
            </Tag>
            <span
              style={{
                paddingLeft: a.depth * 18,
                fontWeight: a.children.length ? 600 : 400,
                color: a.children.length ? '#111' : '#333',
                whiteSpace: 'nowrap',
              }}
            >
              {a.name || ''}
            </span>
          </Space>
        </Option>
      ))}
    </Select>
  );
};

export default AccountSelect;