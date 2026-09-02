import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import styles from "./Footer.module.css";

export default function Footer(): JSX.Element {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        {/* Main Content Grid */}
        <div className={styles.mainGrid}>
          {/* Left Column: Brand, Desc, and Program Badge */}
          <div className={styles.leftCol}>
            {/* Brand Marks */}
            <div className={styles.brandRow}>
              <span className={styles.brandPrimary}>Pdyye Studio</span>
              <span className={styles.brandDivider}></span>
              <span className={styles.brandSecondary}>Pengon</span>
            </div>

            {/* Description */}
            <div className={styles.descBlock}>
              <p className={styles.descLine}>
                Generative AI graphic studio with direct layer editing & vector
                decompose. Built at{" "}
                <a href="#about" className={styles.descLink}>
                  Pdyye Studio
                </a>.
              </p>
              <p className={styles.descSubLine}>
                An independent design & vector engineering platform.
              </p>
            </div>

            <div className={styles.badgeRow}>
              <img
                src="/nvidia-inception-program-badge-rgb-for-screen.png"
                alt="NVIDIA Inception Program"
                className={styles.inceptionBadge}
              />
            </div>
          </div>

          {/* Right Column: Links */}
          <div className={styles.rightCol}>
            <div className={styles.linkGroup}>
              <h4 className={styles.groupHeader}>Product</h4>
              <ul className={styles.linkList}>
                <li><Link to="/editor">Studio Editor</Link></li>
                <li><Link to="/pricing">Pricing</Link></li>
                <li><Link to="/about">About</Link></li>
                <li>
                  <a href="https://github.com" target="_blank" rel="noreferrer" className={styles.extLink}>
                    Pdyye Engine <ArrowUpRight size={13} aria-hidden="true" />
                  </a>
                </li>
              </ul>
            </div>

            <div className={styles.linkGroup}>
              <h4 className={styles.groupHeader}>Legal</h4>
              <ul className={styles.linkList}>
                <li><Link to="/privacy">Privacy</Link></li>
                <li><Link to="/terms">Terms</Link></li>
                <li><Link to="/print-specs">CMYK Specs</Link></li>
                <li><Link to="/dpa">DPA</Link></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Thin Divider */}
        <hr className={styles.divider} />

        {/* Bottom Legal / Status Bar */}
        <div className={styles.statusBar}>
          <div className={styles.statusMeta}>
            <span>© 2026 Pdyye AI</span>
            <span className={styles.dot} aria-hidden="true">•</span>
            <span>Pdyye.AI</span>
            <span className={styles.dot} aria-hidden="true">•</span>
            <a href="mailto:hello@Pdyye.ai" className={styles.emailLink}>
              hello@Pdyye.AI
            </a>
            <span className={styles.dot} aria-hidden="true">•</span>
            <span>Built for creators</span>
            <span className={styles.dot} aria-hidden="true">•</span>
            <span className={styles.operationalStatus}>
              <span className={styles.greenPulse} aria-hidden="true"></span> All systems operational
            </span>
          </div>

          <p className={styles.disclaimerText}>
            Pdyye AI is an independent vector graphic studio. All rights reserved for generated layer architectures.
          </p>
        </div>
      </div>

      {/* Dotted Halftone Landscape Illustration at Bottom */}
      <div className={styles.illustrationWrapper} aria-hidden="true">
        <svg
          viewBox="0 0 1440 320"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={styles.svgLandscape}
          preserveAspectRatio="none"
        >
          <pattern
            id="dotPattern"
            x="0"
            y="0"
            width="12"
            height="12"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="1.5" fill="#a8a39a" />
          </pattern>
          <pattern
            id="dotPatternDark"
            x="0"
            y="0"
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="1.8" fill="#8c867c" />
          </pattern>

          {/* Sun with Halftone Stripes */}
          <circle cx="1100" cy="140" r="70" fill="url(#dotPatternDark)" opacity="0.65" />

          {/* Clouds */}
          <path
            d="M 200 120 Q 240 100 280 120 Q 320 100 360 120 L 360 140 L 200 140 Z"
            fill="url(#dotPattern)"
            opacity="0.5"
          />
          <path
            d="M 500 160 Q 530 145 560 160 Q 590 145 620 160 L 620 175 L 500 175 Z"
            fill="url(#dotPattern)"
            opacity="0.5"
          />

          {/* Flying Birds */}
          <path
            d="M 950 80 Q 958 72 966 80 Q 974 72 982 80"
            stroke="#8c867c"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M 980 65 Q 986 59 992 65 Q 998 59 1004 65"
            stroke="#8c867c"
            strokeWidth="1.8"
            fill="none"
          />

          {/* Background Mountains */}
          <path
            d="M 0 320 L 250 180 L 450 320 L 700 160 L 1000 320 L 1250 140 L 1440 320 Z"
            fill="url(#dotPattern)"
            opacity="0.75"
          />

          {/* Foreground Mountain Range & Pines */}
          <path
            d="M 0 320 L 180 240 L 350 320 L 520 220 L 750 320 L 980 210 L 1200 320 L 1440 230 L 1440 320 Z"
            fill="url(#dotPatternDark)"
            opacity="0.85"
          />
        </svg>

        {/* Bottom Left Logo Mark */}
        <div className={styles.bottomMark}>
          <div className={styles.triangleLogo}>▲</div>
        </div>
      </div>
    </footer>
  );
}