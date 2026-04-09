import React, { useMemo } from 'react';
import { useFinancialPlanning, useBudget } from '../hooks/useFirestore';

const YEARS = ['2025-26', '2026-27', '2027-28', '2028-29', '2029-30', '2030-31'];
const C = { navy: '#1B3A5C', gold: '#C9A227', green: '#16A34A', red: '#DC2626', blue: '#3B82F6', purple: '#8B5CF6', teal: '#0D9488', orange: '#EA580C' };
const PALETTE = [C.navy, C.gold, C.green, C.blue, C.purple, C.teal, C.orange];

function fmt(n) { return n != null && !isNaN(n) ? '$' + Math.round(n).toLocaleString() : '—'; }
function fmtK(n) {
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return '$' + Math.round(n / 1000) + 'k';
  return '$' + Math.round(n);
}

function getCurrentSchoolYear() {
  const now = new Date();
  const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}-${(startYear + 1).toString().slice(2)}`;
}

// ══════════════════════════════════════════════════════════════
// SVG CHART COMPONENTS
// ══════════════════════════════════════════════════════════════

function DonutChart({ segments, size = 180, centerValue, centerLabel }) {
  const filtered = segments.filter(s => s.value > 0);
  const total = filtered.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return <div style={{ height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 13 }}>No data</div>;

  const r = 65, circumference = 2 * Math.PI * r;
  let cum = 0;

  return (
    <div>
      <svg viewBox="0 0 200 200" width={size} height={size} style={{ display: 'block', margin: '0 auto' }}>
        {filtered.map((seg, i) => {
          const pct = seg.value / total;
          const dash = pct * circumference;
          const rot = -90 + cum * 360;
          cum += pct;
          return <circle key={i} cx="100" cy="100" r={r} fill="none" stroke={seg.color} strokeWidth="26"
            strokeDasharray={`${dash} ${circumference - dash}`} transform={`rotate(${rot} 100 100)`} />;
        })}
        {centerValue && <>
          <text x="100" y={centerLabel ? 96 : 104} textAnchor="middle" fontSize="18" fontWeight="700" fill="#1B3A5C" fontFamily="'Libre Baskerville',serif">{centerValue}</text>
          {centerLabel && <text x="100" y="114" textAnchor="middle" fontSize="10" fill="#9CA3AF" fontFamily="'DM Sans',sans-serif">{centerLabel}</text>}
        </>}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', justifyContent: 'center', marginTop: 8 }}>
        {filtered.map((seg, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6B7280' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
            {seg.label} ({Math.round((seg.value / total) * 100)}%)
          </div>
        ))}
      </div>
    </div>
  );
}

function BarGroupChart({ groups, height = 260, legend }) {
  const allVals = groups.flatMap(g => g.values);
  const maxVal = Math.max(...allVals, 1);
  const pad = { top: 16, right: 16, bottom: 44, left: 58 };
  const W = 520, H = height;
  const iW = W - pad.left - pad.right, iH = H - pad.top - pad.bottom;
  const groupW = iW / groups.length;
  const numBars = groups[0]?.values.length || 2;
  const barW = groupW * 0.32;
  const barGap = 3;
  const step = maxVal > 500000 ? 100000 : maxVal > 100000 ? 50000 : maxVal > 50000 ? 25000 : 10000;
  const niceMax = Math.ceil(maxVal / step) * step || step;
  const ticks = 5;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const val = (i / ticks) * niceMax;
          const y = pad.top + iH - (i / ticks) * iH;
          return (
            <g key={i}>
              <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke="#F3F4F6" strokeWidth="1" />
              <text x={pad.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#9CA3AF" fontFamily="'DM Sans',sans-serif">{fmtK(val)}</text>
            </g>
          );
        })}
        {groups.map((group, gi) => {
          const gx = pad.left + gi * groupW;
          const totalBW = numBars * barW + (numBars - 1) * barGap;
          const sx = gx + (groupW - totalBW) / 2;
          return (
            <g key={gi}>
              {group.values.map((val, bi) => {
                const bH = Math.max((val / niceMax) * iH, 1);
                return <rect key={bi} x={sx + bi * (barW + barGap)} y={pad.top + iH - bH} width={barW} height={bH} fill={group.colors?.[bi] || PALETTE[bi]} rx="3" />;
              })}
              <text x={gx + groupW / 2} y={H - pad.bottom + 16} textAnchor="middle" fontSize="10" fill="#6B7280" fontFamily="'DM Sans',sans-serif">{group.label}</text>
            </g>
          );
        })}
      </svg>
      {legend && (
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 4 }}>
          {legend.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6B7280' }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: item.color }} /> {item.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LineChartSVG({ points, height = 220, color = '#1B3A5C' }) {
  if (!points.length) return null;
  const vals = points.map(p => p.value);
  const maxVal = Math.max(...vals, 1);
  const pad = { top: 24, right: 30, bottom: 44, left: 58 };
  const W = 520, H = height;
  const iW = W - pad.left - pad.right, iH = H - pad.top - pad.bottom;
  const step = maxVal > 50000 ? 25000 : maxVal > 20000 ? 10000 : 5000;
  const niceMax = Math.ceil(maxVal * 1.1 / step) * step || step;

  const coords = points.map((p, i) => ({
    x: pad.left + (points.length > 1 ? (i / (points.length - 1)) * iW : iW / 2),
    y: pad.top + iH - (p.value / niceMax) * iH, ...p
  }));
  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const area = line + ` L ${coords[coords.length - 1].x} ${pad.top + iH} L ${coords[0].x} ${pad.top + iH} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {Array.from({ length: 5 }, (_, i) => {
        const val = ((i + 1) / 5) * niceMax;
        const y = pad.top + iH - ((i + 1) / 5) * iH;
        return (
          <g key={i}>
            <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke="#F3F4F6" strokeWidth="1" />
            <text x={pad.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#9CA3AF">{fmtK(val)}</text>
          </g>
        );
      })}
      <line x1={pad.left} y1={pad.top + iH} x2={W - pad.right} y2={pad.top + iH} stroke="#E5E7EB" strokeWidth="1" />
      <path d={area} fill={color} opacity="0.07" />
      <path d={line} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((c, i) => (
        <g key={i}>
          <circle cx={c.x} cy={c.y} r="5" fill={color} />
          <circle cx={c.x} cy={c.y} r="3" fill="#fff" />
          <text x={c.x} y={c.y - 12} textAnchor="middle" fontSize="9" fontWeight="600" fill="#1B3A5C">{fmt(c.value)}</text>
          <text x={c.x} y={H - pad.bottom + 16} textAnchor="middle" fontSize="10" fill="#6B7280">{c.label}</text>
        </g>
      ))}
    </svg>
  );
}

function GaugeChart({ value, label, color = '#1B3A5C', size = 160 }) {
  const pct = Math.min(Math.max(value / 100, 0), 1);
  const r = 55, arc = Math.PI * r, filled = pct * arc;
  return (
    <svg viewBox="0 0 160 100" width={size} height={size * 0.625} style={{ display: 'block', margin: '0 auto' }}>
      <path d="M 25 80 A 55 55 0 0 1 135 80" fill="none" stroke="#E5E7EB" strokeWidth="12" strokeLinecap="round" />
      <path d="M 25 80 A 55 55 0 0 1 135 80" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={`${filled} ${arc}`} />
      <text x="80" y="72" textAnchor="middle" fontSize="22" fontWeight="700" fill="#1B3A5C" fontFamily="'Libre Baskerville',serif">{Math.round(value)}%</text>
      {label && <text x="80" y="92" textAnchor="middle" fontSize="10" fill="#9CA3AF">{label}</text>}
    </svg>
  );
}

function HorizontalBars({ bars }) {
  const maxVal = Math.max(...bars.map(b => b.max || b.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {bars.map((bar, i) => (
        <div key={i}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#6B7280' }}>{bar.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1B3A5C', fontFamily: "'Libre Baskerville',serif" }}>{bar.value}</span>
          </div>
          <div style={{ height: 20, background: '#F3F4F6', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min((bar.value / maxVal) * 100, 100)}%`, height: '100%', background: bar.color, borderRadius: 4, transition: 'width 0.5s' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// KPI CARD
// ══════════════════════════════════════════════════════════════

function KPICard({ label, value, subtitle, color = '#1B3A5C' }) {
  return (
    <div style={{
      background: 'linear-gradient(to bottom, #fff, #F9FAFB)',
      border: '1px solid #E5E7EB', borderTop: `3px solid ${color}`,
      borderRadius: 10, padding: '16px 12px', textAlign: 'center',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    }}>
      <div style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 }}>{label}</div>
      {subtitle && <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 4, lineHeight: 1.3 }}>{subtitle}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SECTION WRAPPER
// ══════════════════════════════════════════════════════════════

function ChartCard({ title, children, style }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10,
      padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', ...style
    }}>
      <div style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 14, color: '#1B3A5C', marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

export default function BoardAnalytics({ enrollment }) {
  const { data: finData, loading: finLoading } = useFinancialPlanning();
  const { data: budgetData, loading: budgetLoading } = useBudget();

  const currentYear = getCurrentSchoolYear();
  const nextYear = YEARS[YEARS.indexOf(currentYear) + 1] || YEARS[1];

  const analytics = useMemo(() => {
    if (!finData || !finData.projections) return null;

    const projections = finData.projections || [];
    const revenue = finData.revenue || {};
    const aid = finData.aid || {};

    // ── Per-year computations ──
    const yearlyData = YEARS.map(yr => {
      const enr = parseFloat(revenue.enrollment?.[yr]) || 0;
      const tps = parseFloat(revenue.tuitionPerStudent?.[yr]) || 0;
      const tuitionRev = enr * tps;
      const surplus = parseFloat(revenue.previousYearSurplus?.[yr]) || 0;
      const gala = parseFloat(revenue.galaEarnings?.[yr]) || 0;
      const other = parseFloat(revenue.otherRevenue?.[yr]) || 0;
      const aidDed = parseFloat(revenue.financialAid?.[yr]) || 0;
      const totalRev = tuitionRev + surplus + gala + other - aidDed;

      let totalExp = 0;
      projections.forEach(item => { totalExp += parseFloat(item.values?.[yr]) || 0; });

      return {
        year: yr, enrollment: enr, tuitionPerStudent: tps,
        tuitionRevenue: tuitionRev, surplus, gala, other, aidDeduction: aidDed,
        totalRevenue: totalRev, totalExpenses: totalExp,
        costPerStudent: enr > 0 ? totalExp / enr : 0,
        fundraisingGap: totalExp - tuitionRev,
        tuitionCoverage: totalExp > 0 ? (tuitionRev / totalExp) * 100 : 0,
        breakEven: tps > 0 ? Math.ceil(totalExp / tps) : 0,
      };
    });

    const current = yearlyData.find(y => y.year === currentYear) || yearlyData[0];

    // ── Revenue breakdown ──
    const revBreakdown = [
      { label: 'Tuition', value: current.tuitionRevenue, color: C.navy },
      { label: 'Fundraising', value: current.gala, color: C.gold },
      { label: 'Prior Surplus', value: current.surplus, color: C.green },
      { label: 'Other Revenue', value: current.other, color: C.blue },
    ].filter(s => s.value > 0);

    // ── Expenses by owner ──
    const byOwner = {};
    projections.forEach(item => {
      const owner = item.owner || 'Other';
      const val = parseFloat(item.values?.[current.year]) || 0;
      if (val > 0) byOwner[owner] = (byOwner[owner] || 0) + val;
    });
    const ownerColors = { HM: C.navy, Treasurer: C.gold, ED: C.green, Secretary: C.blue };
    const expByOwner = Object.entries(byOwner).map(([owner, val]) => ({
      label: owner, value: val, color: ownerColors[owner] || C.purple
    }));

    // ── Financial Aid ──
    const aidBudget = parseFloat(aid.aidBudget) || 0;
    const aidPct = current.tuitionRevenue > 0 ? (aidBudget / current.tuitionRevenue) * 100 : 0;

    // ── Budget analytics ──
    let budgetAnalytics = null;
    if (budgetData?.publishedBudget?.items) {
      let totalBudget = 0, totalSpent = 0;
      budgetData.publishedBudget.items.forEach(item => {
        totalBudget += parseFloat(item.amount) || 0;
        (budgetData.spending || []).filter(s => s.categoryId === item.id).forEach(s => {
          totalSpent += parseFloat(s.amount) || 0;
        });
      });
      const month = new Date().getMonth();
      const fiscalMonth = month >= 7 ? month - 6 : month + 6;
      const pctYear = Math.round((fiscalMonth / 12) * 100);
      const pctSpent = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
      budgetAnalytics = { totalBudget, totalSpent, remaining: totalBudget - totalSpent, pctSpent, pctYear };
    }

    return { yearlyData, current, revBreakdown, expByOwner, aidPct, aidBudget, budgetAnalytics };
  }, [finData, budgetData, currentYear]);

  // ── Loading / Empty states ──
  if (finLoading || budgetLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading analytics...</div>;

  if (!analytics) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>{'\u{1F4CA}'}</div>
        <h3 style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 18, color: '#1B3A5C', marginBottom: 8 }}>Set Up Financial Planning First</h3>
        <p style={{ fontSize: 14, color: '#9CA3AF' }}>Go to the Financial Planning tab to enter your projections.<br />Analytics will populate automatically.</p>
      </div>
    );
  }

  const { yearlyData, current, revBreakdown, expByOwner, aidPct, aidBudget, budgetAnalytics } = analytics;
  const enr = enrollment || { current: 0, nextYear: { confirmed: 0, pipeline: 0, target: 30 } };

  return (
    <div>
      <h3 style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 20, color: '#1B3A5C', marginBottom: 4 }}>Financial Analytics</h3>
      <p style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 20 }}>Based on your 6-year projections and budget data &bull; {current.year} school year</p>

      {/* ── KPI ROW ── */}
      <div className="analytics-kpi-row">
        <KPICard label="Break-Even Enrollment" value={current.breakEven}
          subtitle={`Need ${current.breakEven} students at ${fmt(current.tuitionPerStudent)}/yr`} color={C.navy} />
        <KPICard label="Tuition Coverage" value={`${Math.round(current.tuitionCoverage)}%`}
          subtitle="of expenses covered by tuition alone"
          color={current.tuitionCoverage >= 80 ? C.green : current.tuitionCoverage >= 50 ? C.gold : C.red} />
        <KPICard label="Cost Per Student" value={fmt(current.costPerStudent)}
          subtitle={`${current.year} \u2022 ${current.enrollment} enrolled`} color={C.navy} />
        <KPICard label="Financial Aid" value={`${Math.round(aidPct)}%`}
          subtitle={`${fmt(aidBudget)} of tuition revenue`} color={C.gold} />
      </div>

      {/* ── Revenue vs Expenses + Breakdown ── */}
      <div className="analytics-row">
        <ChartCard title={`Revenue vs Expenses (6-Year)`} style={{ flex: 3 }}>
          <BarGroupChart
            groups={yearlyData.map(yr => ({ label: yr.year, values: [yr.totalRevenue, yr.totalExpenses], colors: [C.navy, C.gold] }))}
            legend={[{ label: 'Revenue', color: C.navy }, { label: 'Expenses', color: C.gold }]}
          />
        </ChartCard>
        <ChartCard title={`Revenue Breakdown (${current.year})`} style={{ flex: 2 }}>
          <DonutChart segments={revBreakdown} centerValue={fmtK(current.totalRevenue)} centerLabel="Total Revenue" />
        </ChartCard>
      </div>

      {/* ── Cost Per Student + Fundraising Gap ── */}
      <div className="analytics-row">
        <ChartCard title="Cost Per Student (6-Year Trend)" style={{ flex: 3 }}>
          <LineChartSVG
            points={yearlyData.filter(y => y.enrollment > 0).map(y => ({ label: y.year, value: y.costPerStudent }))}
            color={C.navy}
          />
        </ChartCard>
        <ChartCard title={`Fundraising Gap (${current.year})`} style={{ flex: 2 }}>
          <div style={{ marginBottom: 8 }}>
            <GaugeChart value={current.tuitionCoverage}
              label="Tuition covers"
              color={current.tuitionCoverage >= 80 ? C.green : current.tuitionCoverage >= 50 ? C.gold : C.red} />
          </div>
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Must raise through fundraising:</div>
            <div style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 24, fontWeight: 700,
              color: current.fundraisingGap > 0 ? C.red : C.green }}>
              {current.fundraisingGap > 0 ? fmt(current.fundraisingGap) : 'Fully covered'}
            </div>
            {current.fundraisingGap > 0 && current.gala > 0 && (
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>
                Gala target covers {Math.round((current.gala / current.fundraisingGap) * 100)}% of the gap
              </div>
            )}
          </div>
        </ChartCard>
      </div>

      {/* ── Budget Burn Rate + Expenses by Owner ── */}
      <div className="analytics-row">
        <ChartCard title="Budget Burn Rate" style={{ flex: 3 }}>
          {budgetAnalytics ? (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Budgeted', value: fmt(budgetAnalytics.totalBudget), color: C.navy },
                  { label: 'Spent', value: fmt(budgetAnalytics.totalSpent), color: C.gold },
                  { label: 'Remaining', value: fmt(budgetAnalytics.remaining), color: budgetAnalytics.remaining >= 0 ? C.green : C.red },
                ].map((s, i) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 2 }}>{s.label}</div>
                    <div style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280', marginBottom: 4 }}>
                  <span>Budget used: {budgetAnalytics.pctSpent}%</span>
                  <span>Fiscal year: {budgetAnalytics.pctYear}%</span>
                </div>
                <div style={{ position: 'relative', height: 18, background: '#F3F4F6', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(budgetAnalytics.pctSpent, 100)}%`,
                    background: budgetAnalytics.pctSpent > budgetAnalytics.pctYear ? C.red : C.green,
                    borderRadius: 8, transition: 'width 0.5s' }} />
                  <div style={{ position: 'absolute', top: 0, left: `${budgetAnalytics.pctYear}%`, width: 2, height: '100%', background: C.navy }} />
                </div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6, textAlign: 'center' }}>
                  {budgetAnalytics.pctSpent <= budgetAnalytics.pctYear
                    ? `On track \u2014 spending is ${budgetAnalytics.pctYear - budgetAnalytics.pctSpent}% below fiscal pace`
                    : `Watch closely \u2014 spending is ${budgetAnalytics.pctSpent - budgetAnalytics.pctYear}% ahead of fiscal pace`}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF' }}>
              <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>{'\u{1F4CB}'}</div>
              <div style={{ fontSize: 13, fontStyle: 'italic' }}>Approve a budget to see burn rate analytics</div>
            </div>
          )}
        </ChartCard>
        <ChartCard title={`Expenses by Owner (${current.year})`} style={{ flex: 2 }}>
          <DonutChart segments={expByOwner} centerValue={fmtK(current.totalExpenses)} centerLabel="Total Expenses" />
        </ChartCard>
      </div>

      {/* ── Enrollment Pipeline ── */}
      <ChartCard title="Enrollment Pipeline" style={{ marginTop: 16 }}>
        <div className="analytics-enrollment-grid">
          <HorizontalBars bars={[
            { label: 'Target', value: enr.nextYear?.target || 30, color: '#E5E7EB' },
            { label: 'Confirmed', value: enr.nextYear?.confirmed || 0, color: C.green },
            { label: 'Pipeline', value: enr.nextYear?.pipeline || 0, color: C.gold },
            { label: 'Current Year', value: enr.current || 0, color: C.navy },
          ]} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 4 }}>Seats to Fill</div>
            <div style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 40, fontWeight: 700,
              color: ((enr.nextYear?.target || 30) - (enr.nextYear?.confirmed || 0)) > 0 ? C.gold : C.green }}>
              {Math.max((enr.nextYear?.target || 30) - (enr.nextYear?.confirmed || 0), 0)}
            </div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
              {enr.nextYear?.confirmed || 0} confirmed of {enr.nextYear?.target || 30} target
            </div>
            {current.breakEven > 0 && (
              <div style={{ fontSize: 11, color: C.navy, marginTop: 10, padding: '6px 12px', background: '#EFF6FF', borderRadius: 6, display: 'inline-block' }}>
                Break-even needs {current.breakEven} students
              </div>
            )}
          </div>
        </div>
      </ChartCard>
    </div>
  );
}
