import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ChatComposer,
  ChatComposerInput,
  type ChatComposerInputHandle,
} from "@astryxdesign/core/Chat";
import { FollowerPointerCard } from "../components/ui/FollowerPointer";
import CenteredTopNav from "../components/CenteredTopNav";
import Footer from "../components/Footer";
import { useReveal } from "../hooks/useReveal";

import styles from "./WelcomePage.module.css";

/**
 * Plays once, when scrolled into view: three plates start stacked flat
 * and separate into background / subject / text, then stay put. This is
 * the one job the motion has to do: show a first-time visitor what
 * "arrives already separated into layers" actually means. Not a pinned
 * scroll sequence: normal section height, nothing hijacks scrolling, and
 * everything here is decorative (the real content is the heading and
 * copy beside it), so it's marked aria-hidden rather than competing with
 * a screen reader's reading order. Respects reduced-motion by rendering
 * straight into the final, separated state with no animation at all.
 */
function LayerPeelStage(): JSX.Element {
  const prefersReducedMotion = useReducedMotion();

  const layers = [
    { key: "bg", className: styles.peelLayerBg, label: "Background", final: { x: -78, y: 34, rotate: -11 } },
    { key: "mid", className: styles.peelLayerMid, label: "Subject", final: { x: 66, y: -30, rotate: 9 } },
    { key: "front", className: styles.peelLayerFront, label: "Text", final: { x: 0, y: 0, rotate: 0 } },
  ];

  return (
    <div className={styles.peelStage} aria-hidden="true">
      {layers.map((layer, i) => (
        <motion.div
          key={layer.key}
          className={layer.className}
          initial={prefersReducedMotion ? false : { x: 0, y: 0, rotate: 0 }}
          whileInView={prefersReducedMotion ? undefined : layer.final}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
          style={prefersReducedMotion ? layer.final : undefined}
        >
          {layer.key === "front" ? (
            <>
              <img src="/logo.png" alt="" className={styles.peelLayerFrontImg} />
              <span className={styles.peelLabel}>Text</span>
            </>
          ) : (
            <span className={styles.peelLabel}>{layer.label}</span>
          )}
        </motion.div>
      ))}
    </div>
  );
}

export default function WelcomePage(): JSX.Element {
  const navigate = useNavigate();
  const composerInputRef = useRef<ChatComposerInputHandle>(null);

  const handleSubmit = () => {
    navigate("/editor?new=1");
  };

  const showcase = useReveal<HTMLDivElement>();
  const transition = useReveal<HTMLElement>();
  const galleryHeader = useReveal<HTMLDivElement>();
  const card1 = useReveal<HTMLDivElement>();
  const card2 = useReveal<HTMLDivElement>();
  const card3 = useReveal<HTMLDivElement>();

  return (
    <main className={styles.page}>
      <CenteredTopNav />

      {/* SECTION 1: HERO */}
      <section className={styles.hero}>
        <div className={`${styles.heroHeader} ${styles.reveal}`}>
          <img className={styles.logo} src="/logo.png" alt="Pdyye logo mark" />
          <h1 className={styles.heroHeadline}>
            Convert your imagination<br />
            into <span className={styles.serifItalic}>layers</span>
          </h1>
        </div>

        <div
          className={`${styles.chatContainer} ${styles.cropFrame} ${styles.reveal}`}
          style={{ animationDelay: "0.12s" }}
        >
          <ChatComposer
            onSubmit={handleSubmit}
            sendButton={<></>}
            placeholder="Describe what you want to create..."
            input={
              <ChatComposerInput
                handleRef={composerInputRef}
                style={{ minHeight: 80, fontSize: "1.125rem" }}
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

      {/* SECTION 2: SHOWCASE */}
      <section id="showcase" className={styles.showcaseWrapper}>
        <div
          ref={showcase.ref}
          className={`${styles.showcaseTextPanel} ${styles.scrollReveal} ${showcase.inView ? styles.inView : ""}`}
        >
          <h2 className={`${styles.showcaseHeadline} ${styles.serifRegular}`}>
            Every image arrives<br />
            already broken<br />
            into layers.
          </h2>
        </div>
        <div className={styles.showcasePreview}>
          <FollowerPointerCard title="Open the layers" className={styles.pointerWrapper}>
            <img className={styles.showcaseImage} src="/ui-screenshot.png" alt="Pdyye editor interface" />
          </FollowerPointerCard>
        </div>
      </section>

      {/* SECTION 3: TRANSITION */}
      <section
        ref={transition.ref}
        className={`${styles.transition} ${styles.scrollReveal} ${transition.inView ? styles.inView : ""}`}
      >
        <span className={styles.galleryBadge}>Why waste a token?</span>
        <h2 className={styles.transitionHeading}>
          Fix the typo.<br />
          Not the entire image.
        </h2>
        <div className={styles.correctionMark} aria-hidden="true">
          <span className={styles.correctionOld}>recieve</span>
          <ArrowRight size={14} className={styles.correctionArrow} />
          <span className={styles.correctionNew}>received</span>
        </div>
        <p className={styles.gallerySubtitle}>
          Text, color, and shape stay editable long after the pixels are generated.
        </p>
      </section>

      {/* SECTION 4: PRODUCT GALLERY */}
      <section className={styles.productGallerySection}>
        <div
          ref={galleryHeader.ref}
          className={`${styles.galleryHeader} ${styles.scrollReveal} ${galleryHeader.inView ? styles.inView : ""}`}
        >
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
          <div
            ref={card1.ref}
            className={`${styles.productCard} ${styles.scrollReveal} ${card1.inView ? styles.inView : ""}`}
            onClick={() => navigate("/editor")}
            role="button"
            tabIndex={0}
          >
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

          <div
            ref={card2.ref}
            className={`${styles.productCard} ${styles.scrollReveal} ${card2.inView ? styles.inView : ""}`}
            style={{ transitionDelay: card2.inView ? "0.08s" : "0s" }}
            onClick={() => navigate("/editor")}
            role="button"
            tabIndex={0}
          >
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

          <div
            ref={card3.ref}
            className={`${styles.productCard} ${styles.scrollReveal} ${card3.inView ? styles.inView : ""}`}
            style={{ transitionDelay: card3.inView ? "0.16s" : "0s" }}
            onClick={() => navigate("/editor")}
            role="button"
            tabIndex={0}
          >
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

      {/* SECTION 5: WHY IT MATTERS. The layer-peel illustration is
          decorative (aria-hidden); the actual content is this text. */}
      <section className={styles.sideGallerySection}>
        <div className={styles.sideContainer}>
          <div className={styles.sideLeft}>
            <span className={styles.sideBadge}>The Pdyye Difference</span>
            <h2 className={styles.sideTitle}>
              Built for endless<br />
              iteration, not endless<br />
              regeneration.
            </h2>
            <p className={styles.sideDesc}>
              Traditional AI image tools lock you into flat, static pixels.
              Pdyye preserves every stroke, text node, and background
              element in editable vector layers, the way the illustration
              beside this text separates on scroll.
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

          <LayerPeelStage />
        </div>
      </section>

      <Footer />
    </main>
  );
}