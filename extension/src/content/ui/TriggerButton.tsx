import * as React from 'react';

interface TriggerButtonProps {
  visible: boolean;
  position?: {
    left: number;
    top: number;
  } | null;
  disabled?: boolean;
  onClick(): void;
}

export const TriggerButton: React.FC<TriggerButtonProps> = ({
  visible,
  position,
  disabled,
  onClick
}) => {
  if (!visible) {
    return null;
  }

  const fallbackLeft = typeof window !== 'undefined' ? window.innerWidth / 2 - 24 : 0;
  const fallbackTop = typeof window !== 'undefined' ? window.innerHeight - 180 : 0;
  const scrollTop = typeof window !== 'undefined' ? window.scrollY : 0;
  const scrollLeft = typeof window !== 'undefined' ? window.scrollX : 0;
  const style: React.CSSProperties = {
    left: (position?.left ?? fallbackLeft) + scrollLeft,
    top: (position?.top ?? fallbackTop) + scrollTop,
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer'
  };

  return (
    <button
      type="button"
      className="lingualens-trigger"
      style={style}
      onClick={onClick}
      disabled={disabled}
      title="Explain this line"
    >
      ?
    </button>
  );
};
