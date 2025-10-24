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
      <svg width="24" height="24" viewBox="0 0 986 942" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" clipRule="evenodd" d="M806.154 0H928.827C940.626 0 950.195 9.58515 950.195 21.4099C950.195 24.7334 949.424 28.0098 947.937 30.983L915.379 96.2223C908.141 110.729 893.343 119.893 877.154 119.893L819.03 119.89C768.447 119.89 723.438 152.054 706.971 199.972L580.901 566.793C577.057 577.973 582.988 590.157 594.149 594.005C596.386 594.779 598.737 595.173 601.104 595.173H943.261C966.866 595.173 986 614.343 986 637.99C986 642.432 985.308 646.848 983.954 651.078L945.995 769.555C913.074 872.31 817.688 942 709.973 942H21.3694C9.56743 942 0 932.415 0 920.59C0 917.69 0.587765 914.823 1.72799 912.159L29.147 848.059C35.8816 832.316 51.3338 822.11 68.4284 822.11L125.92 822.107C144.159 822.107 160.388 810.509 166.328 793.232L366.536 210.705C378.83 174.929 359.852 135.942 324.141 123.623C316.98 121.153 309.457 119.89 301.881 119.89L73.7293 119.893C61.9267 119.893 52.361 110.305 52.361 98.4832C52.361 95.3687 53.038 92.2924 54.3477 89.4664L84.3221 24.7864C91.3272 9.67021 106.45 0 123.085 0H332.144C424.198 0 498.822 74.7654 498.822 166.99C498.822 185.518 495.746 203.914 489.715 221.429L292.736 793.72C288.889 804.898 294.814 817.085 305.972 820.938C308.212 821.712 310.566 822.107 312.939 822.107H744.348C778.157 822.107 808.237 800.612 819.245 768.587L827.887 743.441C831.728 732.264 825.797 720.079 814.636 716.229C812.399 715.458 810.048 715.063 807.681 715.063H463.885C440.283 715.063 421.149 695.894 421.149 672.247C421.149 667.401 421.967 662.594 423.574 658.025L604.592 142.984C634.701 57.3119 715.495 0 806.154 0Z" fill="currentColor"/>
      </svg>
    </button>
  );
};
