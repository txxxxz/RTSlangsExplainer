import React from 'react';

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
  const style: React.CSSProperties = {
    left: position?.left ?? fallbackLeft,
    top: position?.top ?? fallbackTop
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
