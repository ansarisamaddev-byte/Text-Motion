import React from 'react';

export const SectionTitle: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <p style={{ fontSize: 11, color: '#666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, ...style }}>
    {children}
  </p>
);

export const Divider: React.FC = () => (
  <div style={{ height: 1, background: '#2a2a2e', margin: '14px 0' }} />
);

export const SliderRow: React.FC<{
  label: string;
  min: number;
  max: number;
  value: number;
  unit?: string;
  step?: number;
  onChange: (v: number) => void;
}> = ({ label, min, max, value, unit = '', step = 1, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
    <span style={{ fontSize: 12, color: '#aaa', minWidth: 78, flexShrink: 0 }}>{label}</span>
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(Number(e.target.value))}
      style={{ flex: 1, accentColor: '#6366f1' }}
    />
    <span style={{ fontSize: 12, color: '#6366f1', minWidth: 36, textAlign: 'right' }}>
      {value}{unit}
    </span>
  </div>
);

export const ColorSwatches: React.FC<{
  colors: string[];
  value: string;
  onChange: (c: string) => void;
  showPicker?: boolean;
}> = ({ colors, value, onChange, showPicker = true }) => (
  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
    {colors.map(c => (
      <div
        key={c}
        onClick={() => onChange(c)}
        style={{
          width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer',
          border: value === c ? '2px solid #fff' : '2px solid transparent',
          outline: value === c ? '2px solid #6366f1' : 'none',
          transition: 'all 0.15s', flexShrink: 0,
          boxShadow: c === 'transparent' ? 'inset 0 0 0 1px #555' : undefined,
        }}
      />
    ))}
    {showPicker && (
      <input
        type="color" value={value.startsWith('#') ? value : '#FFD700'}
        onChange={e => onChange(e.target.value)}
        title="Custom color"
        style={{ width: 26, height: 26 }}
      />
    )}
  </div>
);

export const BadgeGroup: React.FC<{
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}> = ({ options, value, onChange }) => (
  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
    {options.map(o => (
      <button
        key={o.value}
        onClick={() => onChange(o.value)}
        style={{
          background: value === o.value ? '#6366f1' : '#1e1e24',
          border: `1px solid ${value === o.value ? '#6366f1' : '#2a2a2e'}`,
          color: value === o.value ? '#fff' : '#aaa',
          borderRadius: 20, padding: '4px 12px', cursor: 'pointer',
          fontSize: 12, fontFamily: 'inherit', transition: 'all 0.15s',
        }}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export const GridButtons: React.FC<{
  options: string[];
  value: string;
  onChange: (v: string) => void;
  columns?: number;
}> = ({ options, value, onChange, columns = 3 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 6 }}>
    {options.map(o => (
      <button
        key={o}
        onClick={() => onChange(o)}
        style={{
          background: value === o ? '#22223a' : '#1e1e24',
          border: `1px solid ${value === o ? '#6366f1' : '#2a2a2e'}`,
          color: value === o ? '#6366f1' : '#aaa',
          borderRadius: 6, padding: '7px 4px', cursor: 'pointer',
          fontSize: 11, fontFamily: 'inherit', transition: 'all 0.15s', textAlign: 'center',
        }}
      >
        {o}
      </button>
    ))}
  </div>
);
