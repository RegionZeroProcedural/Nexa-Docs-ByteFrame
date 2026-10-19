import React from 'react';
export default function DocumentFavorite({ favorite, onToggle, disabled = false }) {
  return (
    <button className={`favorite-button ${favorite ? 'is-favorite' : ''}`} type="button"
      title={favorite ? 'Remove star' : 'Star document'} aria-label={favorite ? 'Remove star' : 'Star document'}
      aria-pressed={favorite} onClick={onToggle} disabled={disabled}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill={favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
        <path d="m12 2.8 2.85 5.8 6.4.93-4.63 4.51 1.1 6.37L12 17.4l-5.72 3.01 1.1-6.37-4.63-4.51 6.4-.93L12 2.8Z"/>
      </svg>
    </button>
  );
}
