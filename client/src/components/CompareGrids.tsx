import { DataGrid } from '@/components/data-grid';

/**
 * Side-by-side grid comparison — navigate to /#compare
 * Left: branding HTML table (horizontally scrollable) | Right: real DataGrid
 * Both use identical dummy data.
 */

const T = {
  primary: '#2D7D5F',
  green: '#16A249',
  surface: '#F8FAFC',
  borderLight: '#F3F4F6',
  textMuted: '#6B7280',
  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
} as const;

const COLUMNS = [
  { name: 'CustomerID', type: 'nchar' },
  { name: 'CompanyName', type: 'nvarchar' },
  { name: 'ContactName', type: 'nvarchar' },
  { name: 'TotalRevenue', type: 'int' },
  { name: 'OrderCount', type: 'int' },
  { name: 'City', type: 'nvarchar' },
  { name: 'Country', type: 'nvarchar' },
];

const ROWS: Record<string, any>[] = [
  { CustomerID: 'ALFKI', CompanyName: 'Alfreds Futterkiste', ContactName: 'Maria Anders', TotalRevenue: 245000, OrderCount: 6, City: 'Berlin', Country: 'Germany' },
  { CustomerID: 'ANATR', CompanyName: 'Ana Trujillo Emparedados', ContactName: 'Ana Trujillo', TotalRevenue: 189450, OrderCount: 4, City: 'México D.F.', Country: 'Mexico' },
  { CustomerID: 'ANTON', CompanyName: 'Antonio Moreno Taquería', ContactName: 'Antonio Moreno', TotalRevenue: 156800, OrderCount: 7, City: 'México D.F.', Country: 'Mexico' },
  { CustomerID: 'AROUT', CompanyName: 'Around the Horn', ContactName: 'Thomas Hardy', TotalRevenue: 134200, OrderCount: 13, City: 'London', Country: 'UK' },
  { CustomerID: 'BERGS', CompanyName: 'Berglunds snabbköp', ContactName: 'Christina Berglund', TotalRevenue: 98750, OrderCount: 18, City: 'Luleå', Country: 'Sweden' },
  { CustomerID: 'BLAUS', CompanyName: 'Blauer See Delikatessen', ContactName: 'Hanna Moos', TotalRevenue: 87300, OrderCount: 7, City: 'Mannheim', Country: 'Germany' },
  { CustomerID: 'BLONP', CompanyName: 'Blondesddsl père et fils', ContactName: 'Frédérique Citeaux', TotalRevenue: 76100, OrderCount: 11, City: 'Strasbourg', Country: 'France' },
  { CustomerID: 'BOLID', CompanyName: 'Bólido Comidas preparadas', ContactName: 'Martín Sommer', TotalRevenue: 65400, OrderCount: 3, City: 'Madrid', Country: 'Spain' },
];

export function CompareGrids() {
  const bdr = T.borderLight;
  const hdrBg = T.surface;
  const stripeBg = 'rgba(0,0,0,0.022)';
  const hoverBg = 'rgba(0,0,0,0.045)';

  return (
    <div style={{ fontFamily: T.font, background: '#fff', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 24px', borderBottom: `1px solid ${bdr}`, flexShrink: 0 }}>
        <h1 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Grid Comparison</h1>
        <p style={{ fontSize: 12, color: T.textMuted, margin: 0 }}>
          Left: Branding HTML table &nbsp;|&nbsp; Right: Real DataGrid &nbsp;|&nbsp; Same data
        </p>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 10, padding: '0 10px 10px' }}>
        {/* ── LEFT: Branding HTML Table ── */}
        <div style={{ width: '50%', display: 'flex', flexDirection: 'column', border: `1px solid ${bdr}`, borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textMuted, padding: '8px 16px', borderBottom: `1px solid ${bdr}`, background: hdrBg, flexShrink: 0 }}>
            Branding (HTML)
          </div>
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            <table style={{ minWidth: 900, width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: hdrBg }}>
                  {COLUMNS.map((col, idx) => (
                    <th key={col.name} style={{
                      padding: '12px 20px', textAlign: 'left', fontWeight: 600,
                      borderBottom: `1px solid ${bdr}`, fontSize: 11,
                      borderRight: idx < COLUMNS.length - 1 ? `1px solid ${bdr}` : 'none',
                      color: T.textMuted,
                      letterSpacing: '0.03em', textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}>{col.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, i) => {
                  const baseBg = i % 2 === 1 ? stripeBg : 'transparent';
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${bdr}` }}>
                      {COLUMNS.map((col, ci) => (
                        <td
                          key={col.name}
                          style={{
                            padding: '12px 20px',
                            borderRight: ci < COLUMNS.length - 1 ? `1px solid ${bdr}` : 'none',
                            background: baseBg,
                            transition: 'background 0.1s',
                            fontSize: 13,
                            whiteSpace: 'nowrap',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                          onMouseLeave={e => (e.currentTarget.style.background = baseBg)}
                        >
                          {String(row[col.name])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── RIGHT: Real DataGrid ── */}
        <div style={{ width: '50%', display: 'flex', flexDirection: 'column', border: `1px solid ${bdr}`, borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textMuted, padding: '8px 16px', borderBottom: `1px solid ${bdr}`, background: hdrBg, flexShrink: 0 }}>
            DataGrid (Canvas)
          </div>
          <div className="flex flex-col" style={{ flex: 1, minHeight: 0 }}>
            <DataGrid
              columns={COLUMNS}
              rows={ROWS}
              totalRows={ROWS.length}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
