import React from 'react';

interface FlashIconProps {
  size?: number;
  className?: string;
}

export const FlashIcon = ({ size = 24, className = "" }: FlashIconProps) => {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="4" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer Circle */}
      <circle cx="50" cy="50" r="45" />
      
      {/* Stylized geometric structure */}
      <path d="M50 20 L40 40 L60 40 Z" /> {/* Top triangle */}
      <path d="M50 80 L40 60 L60 60 Z" /> {/* Bottom triangle */}
      <path d="M40 40 L40 60" /> {/* Left connecting vertical */}
      <path d="M60 40 L60 60" /> {/* Right connecting vertical */}
      
      {/* Waving line passing through */}
      <path d="M15 45 C 25 35, 35 55, 50 50 C 65 45, 75 65, 85 55" />
    </svg>
  );
};
