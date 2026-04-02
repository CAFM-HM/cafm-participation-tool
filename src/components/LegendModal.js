import React from 'react';
import { LEGEND } from '../data/virtueData';

const SCORE_COLORS = {
  1: '#DC2626',
  2: '#EA580C',
  3: '#CA8A04',
  4: '#16A34A',
  5: '#1B3A5C',
};

export default function LegendModal({ virtue, onClose }) {
  if (!virtue) return null;
  const data = LEGEND[virtue];
  if (!data) return null;

  const label = virtue.charAt(0).toUpperCase() + virtue.slice(1);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{label} Rubric</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 12, color: '#666', fontStyle: 'italic', marginBottom: 12, lineHeight: 1.5 }}>
            Score what you observe, not what you assume. Use these descriptions to calibrate.
          </p>
          {[5, 4, 3, 2, 1].map(score => (
            <div key={score} className="legend-row">
              <div className="legend-badge" style={{ background: SCORE_COLORS[score] }}>
                {score}
              </div>
              <div className="legend-text">
                <div className="legend-title">{data[score].label}</div>
                <div className="legend-desc">{data[score].desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
