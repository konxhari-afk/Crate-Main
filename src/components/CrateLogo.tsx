import React from 'react';

export const CRATE_SITE_LOGO_URL =
  '/assets/aistudio/Gemini_Generated_Image_s04of7s04of7s04o_2a86dd05.png';

interface CrateLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'circle' | 'rounded';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<CrateLogoProps['size']>, string> = {
  xs: 'w-6 h-6',
  sm: 'w-8 h-8',
  md: 'w-9 h-9',
  lg: 'w-11 h-11',
  xl: 'w-14 h-14',
};

export const CrateLogo: React.FC<CrateLogoProps> = ({
  size = 'md',
  shape = 'circle',
  className = '',
}) => {
  const shapeClass = shape === 'circle' ? 'rounded-full' : 'rounded-xl';

  return (
    <div
      className={`relative overflow-hidden bg-[#050507] border border-[#E8A849]/40 shadow-[0_0_22px_rgba(232,168,73,0.22)] flex items-center justify-center shrink-0 ${SIZE_CLASSES[size]} ${shapeClass} ${className}`}
    >
      <img
        src={CRATE_SITE_LOGO_URL}
        alt="Crate Logo"
        className="w-full h-full object-cover object-center scale-[1.82] select-none pointer-events-none"
      />
    </div>
  );
};
