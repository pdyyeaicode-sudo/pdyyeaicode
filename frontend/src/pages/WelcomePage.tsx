import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Layers, Sparkles, Sliders, Printer } from "lucide-react";
import {
  ChatComposer,
  ChatComposerInput,
  type ChatComposerInputHandle,
} from "@astryxdesign/core/Chat";
import { FollowerPointerCard } from "../components/ui/FollowerPointer";
import CenteredTopNav from "../components/CenteredTopNav";
import Footer from "../components/Footer";

import styles from "./WelcomePage.module.css";

export default function WelcomePage(): JSX.Element {
  const navigate = useNavigate();
  const composerInputRef = useRef<ChatComposerInputHandle>(null);

  const handleSubmit = () => {
    navigate("/editor?new=1");
  };

  return (
    <main className={styles.page}>
      {/* Top Centered Floating Navbar (No box around app, text logo) */}
      <CenteredTopNav />
      
      {/* SECTION 1: HERO */}
      <section className={styles.hero}>
        <div className={styles.heroHeader}>
          <img className={styles.logo} src="/logo.png" alt="Dreamer Logo" />
          <h1 className={styles.heroHeadline}>
            Convert your Imagination<br />
            into <span className={styles.serifItalic}>layers</span>
          </h1>
        </div>

        <div className={styles.chatContainer}>
          <ChatComposer
            onSubmit={handleSubmit}
            sendButton={<></>}
            placeholder="Describe what you want to create..."
            input={
              <ChatComposerInput
                handleRef={composerInputRef}
                style={{ minHeight: 80, fontSize: '1.125rem' }}
              />
            }
            sendActions={
              <button className={styles.ctaButton} onClick={handleSubmit}>
                Try it Now
                <ArrowRight size={20} />
              </button>
            }
          />
        </div>
      </section>

      {/* SECTION 2: SHOWCASE / FEATURES */}
      <section id="showcase" className={styles.showcaseWrapper}>
        <div className={styles.showcaseTextPanel}>
          <h2 className={`${styles.showcaseHeadline} ${styles.serifRegular}`}>
            Generate once.<br />
            Instantly edit<br />
            and exactly the<br />
            way you need.
          </h2>
        </div>
        <div className={styles.showcasePreview}>
          <FollowerPointerCard title="Harsh" className={styles.pointerWrapper}>
            <img className={styles.showcaseImage} src="/ui-screenshot.png" alt="Pdyee Editor Interface" />
          </FollowerPointerCard>
        </div>
      </section>

      {/* SECTION 3: TRANSITION */}
      <section className={styles.transition}>
        <h2 className={styles.transitionHeading}>
          Why to waste your Token!
        </h2>
      </section>

      {/* SECTION 4: PRODUCT GALLERY (Astryx Product Gallery Template) */}
      <section className={styles.productGallerySection}>
        <div className={styles.galleryHeader}>
          <span className={styles.galleryBadge}>Layer Decompose Gallery</span>
          <h2 className={styles.galleryTitle}>
            Turn prompt ideas into<br />
            editable layer assets
          </h2>
          <p className={styles.gallerySubtitle}>
            Every generated image comes pre-split into isolated, editable vector SVG nodes, text labels, and foreground subjects.
          </p>
        </div>

        <div className={styles.productGrid}>
          {/* Card 1 */}
          <div className={styles.productCard} onClick={() => navigate("/editor")}>
            <div className={styles.cardImageWrapper}>
              <img
                src="/galaxy-login-bg.jpg"
                alt="Anime Galaxy Vector Scene"
                className={styles.cardImage}
              />
              <span className={styles.cardTag}>Vector SVG</span>
            </div>
            <div className={styles.cardBody}>
              <h3 className={styles.cardTitle}>Anime & Galaxy Artworks</h3>
              <p className={styles.cardDesc}>
                Generates rich anime character wallpapers with isolated background stars and character lineart.
              </p>
            </div>
          </div>

          {/* Card 2 */}
          <div className={styles.productCard} onClick={() => navigate("/editor")}>
            <div className={styles.cardImageWrapper}>
              <img
                src="/ui-screenshot.png"
                alt="Layer Editor Canvas"
                className={styles.cardImage}
              />
              <span className={styles.cardTag}>Text Nodes</span>
            </div>
            <div className={styles.cardBody}>
              <h3 className={styles.cardTitle}>Live Typography Control</h3>
              <p className={styles.cardDesc}>
                Double-click text to fix typos, switch fonts, or adjust size without re-rendering pixels.
              </p>
            </div>
          </div>

          {/* Card 3 */}
          <div className={styles.productCard} onClick={() => navigate("/editor")}>
            <div className={styles.cardImageWrapper}>
              <img
                src="/hero-image.svg"
                alt="Vector Scene Assets"
                className={styles.cardImage}
              />
              <span className={styles.cardTag}>4K CMYK Print</span>
            </div>
            <div className={styles.cardBody}>
              <h3 className={styles.cardTitle}>Print-Ready Export Engine</h3>
              <p className={styles.cardDesc}>
                CMYK-safe color conversion, 3mm bleed support, trim marks, and lossless vector output.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5: SIDE GALLERY (Astryx Side Gallery Template) */}
      <section className={styles.sideGallerySection}>
        <div className={styles.sideContainer}>
          {/* Left Column */}
          <div className={styles.sideLeft}>
            <span className={styles.sideBadge}>CREATIVE PREVIEWS</span>
            <h2 className={styles.sideTitle}>
              Generate once.<br />
              Tweak & refine forever.
            </h2>
            <p className={styles.sideDesc}>
              Traditional AI image tools lock you into flat, static pixels. Pdyee AI preserves every stroke, text node, and background element in editable vector layers.
            </p>

            <div className={styles.statsRow}>
              <div className={styles.statItem}>
                <span className={styles.statVal}>100%</span>
                <span className={styles.statLbl}>Vector SVG Layers</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statVal}>0</span>
                <span className={styles.statLbl}>Wasted Tokens on Typos</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statVal}>4K</span>
                <span className={styles.statLbl}>Print Ready Export</span>
              </div>
            </div>
          </div>

          {/* Right Column Grid */}
          <div className={styles.sideGrid}>
            <img
              src="/galaxy-login-bg.jpg"
              alt="Anime Galaxy Wallpaper"
              className={styles.sideGridImg}
            />
            <img
              src="/ui-screenshot.png"
              alt="Pdyee AI Studio Interface"
              className={styles.sideGridImg}
            />
            <img
              src="/logo.png"
              alt="Pdyee Logo Art"
              className={styles.sideGridImg}
              style={{ objectFit: "contain", background: "rgba(255,255,255,0.05)", padding: "1.5rem" }}
            />
            <img
              src="/hero-image.svg"
              alt="Vector Background Asset"
              className={styles.sideGridImg}
            />
          </div>
        </div>
      </section>

      {/* SECTION 6: PENGON STYLE MINIMAL EDITORIAL FOOTER */}
      <Footer />

    </main>
  );
}
