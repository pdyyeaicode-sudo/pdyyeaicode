import React, { useState, useRef } from "react";
import { motion, AnimatePresence, useMotionValue } from "framer-motion";

interface FollowerPointerCardProps {
  children: React.ReactNode;
  className?: string;
  title?: string | React.ReactNode;
}

export function FollowerPointerCard({
  children,
  className = "",
  title = "Design Studio",
}: FollowerPointerCardProps): JSX.Element {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const ref = useRef<HTMLDivElement>(null);
  const [isInside, setIsInside] = useState<boolean>(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      x.set(e.clientX - rect.left);
      y.set(e.clientY - rect.top);
    }
  };

  const handleMouseEnter = () => {
    setIsInside(true);
  };

  const handleMouseLeave = () => {
    setIsInside(false);
  };

  return (
    <div
      ref={ref}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      className={className}
      style={{
        position: "relative",
        cursor: isInside ? "none" : "auto",
        overflow: "hidden",
        width: "100%",
        height: "100%",
      }}
    >
      <AnimatePresence>
        {isInside && <FollowPointer x={x} y={y} title={title} />}
      </AnimatePresence>
      {children}
    </div>
  );
}

function FollowPointer({
  x,
  y,
  title,
}: {
  x: any;
  y: any;
  title?: string | React.ReactNode;
}): JSX.Element {
  return (
    <motion.div
      style={{
        position: "absolute",
        top: y,
        left: x,
        pointerEvents: "none",
        zIndex: 99,
      }}
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.5, opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* White SVG Arrow Cursor */}
      <svg
        stroke="#ffffff"
        fill="#ffffff"
        strokeWidth="1"
        viewBox="0 0 16 16"
        style={{
          width: "22px",
          height: "22px",
          transform: "translate(-6px, -6px) rotate(-70deg)",
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
        }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M14.082 2.182a.5.5 0 0 1 .103.557L8.528 15.467a.5.5 0 0 1-.917-.007L5.57 10.694.803 8.694a.5.5 0 0 1-.006-.916l12.728-5.657a.5.5 0 0 1 .556.061z" />
      </svg>

      {/* Floating Pointer Badge */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        style={{
          marginTop: "4px",
          marginLeft: "12px",
          backgroundColor: "rgba(18, 18, 18, 0.92)",
          color: "#ffffff",
          padding: "5px 12px",
          borderRadius: "20px",
          fontSize: "12px",
          fontWeight: 600,
          whiteSpace: "nowrap",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
          border: "1px solid rgba(255, 255, 255, 0.18)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          display: "flex",
          alignItems: "center",
          gap: "7px",
          fontFamily: "Inter, sans-serif",
        }}
      >
        <img
          src="/profile-avatar.jpg"
          alt="Harsh Profile"
          style={{
            width: "18px",
            height: "18px",
            borderRadius: "50%",
            objectFit: "cover",
            border: "1px solid rgba(255, 255, 255, 0.8)",
            display: "inline-block",
          }}
        />
        {title}
      </motion.div>
    </motion.div>
  );
}
