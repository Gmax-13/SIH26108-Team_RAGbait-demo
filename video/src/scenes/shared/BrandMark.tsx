import React from "react";

/** The ManakSetu mark from the dashboard sidebar (frontend/src/components/Sidebar.jsx). */
export const BrandMark: React.FC<{ size?: number }> = ({ size = 64 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.26,
      background: "linear-gradient(145deg, #3b8cf0 0%, #1c5cab 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 14px 44px rgba(42, 120, 214, 0.45)",
      flexShrink: 0,
    }}
  >
    <svg
      viewBox="0 0 24 24"
      width={size * 0.58}
      height={size * 0.58}
      fill="none"
      stroke="#ffffff"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 18V7l8-4 8 4v11 M4 12h16 M12 3v15" />
    </svg>
  </div>
);
