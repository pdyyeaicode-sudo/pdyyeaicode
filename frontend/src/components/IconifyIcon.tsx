import React from "react";
import { Icon as Iconify } from "@iconify/react";

export interface IconifyIconProps {
  icon: string; // e.g. "lucide:home" or "mdi:account"
  width?: number;
  height?: number;
  className?: string;
  label?: string;
}

export function IconifyIcon({ icon, width = 18, height = 18, className, label }: IconifyIconProps) {
  return (
    <Iconify
      icon={icon}
      width={width}
      height={height}
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    />
  );
}

export default IconifyIcon;
