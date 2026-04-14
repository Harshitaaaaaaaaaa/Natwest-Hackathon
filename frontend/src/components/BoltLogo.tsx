import React from 'react';
import boltLogoDark from '../assets/bolt-logo-dark.png';

interface BoltLogoProps {
  className?: string;
  alt?: string;
}

export const BoltLogo: React.FC<BoltLogoProps> = ({
  className = '',
  alt = 'Bolt logo',
}) => {
  return (
    <img
      src={boltLogoDark}
      alt={alt}
      className={`block select-none object-contain ${className}`.trim()}
      style={{
        WebkitMaskImage:
          'radial-gradient(ellipse at center, rgba(0,0,0,1) 38%, rgba(0,0,0,0.98) 50%, rgba(0,0,0,0.86) 62%, rgba(0,0,0,0.52) 74%, rgba(0,0,0,0.14) 86%, rgba(0,0,0,0) 100%)',
        maskImage:
          'radial-gradient(ellipse at center, rgba(0,0,0,1) 38%, rgba(0,0,0,0.98) 50%, rgba(0,0,0,0.86) 62%, rgba(0,0,0,0.52) 74%, rgba(0,0,0,0.14) 86%, rgba(0,0,0,0) 100%)',
      }}
      draggable={false}
    />
  );
};
