import React from 'react';
import type { AppType } from '../../utils/constants';

interface AppIconProps {
  app: AppType | string;
  size?: number;
  variant?: 'light' | 'dark' | 'default';
  className?: string;
  style?: React.CSSProperties;
}

export const AppIcon: React.FC<AppIconProps> = ({ 
  app, 
  size = 16, 
  variant = 'default',
  className,
  style
}) => {
  // Normalize app name to lowercase and extract base app type
  const normalizedApp = app.toLowerCase().split('-')[0] as AppType;
  
  // Only show icon if it's a valid *arr app
  const validApps: AppType[] = ['radarr', 'sonarr', 'lidarr', 'readarr'];
  if (!validApps.includes(normalizedApp)) {
    return null;
  }

  const iconName = variant === 'default' ? normalizedApp : `${normalizedApp}-${variant}`;
  const iconUrl = `https://cdn.jsdelivr.net/gh/selfhst/icons/svg/${iconName}.svg`;
  
  return (
    <img 
      src={iconUrl} 
      alt={`${normalizedApp} icon`}
      width={size}
      height={size}
      className={className}
      style={{ 
        display: 'inline-block', 
        verticalAlign: 'middle',
        flexShrink: 0,
        ...style 
      }}
    />
  );
};

