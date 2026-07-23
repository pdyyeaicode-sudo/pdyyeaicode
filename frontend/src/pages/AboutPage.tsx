import { useNavigate } from "react-router-dom";
import { Layers, Sparkles, Sliders, Printer, ShieldCheck } from "lucide-react";
import CenteredTopNav from "../components/CenteredTopNav";
import styles from "./AboutPage.module.css";

import Footer from "../components/Footer";

export default function AboutPage(): JSX.Element {
  const navigate = useNavigate();

  return (
    <main className={styles.page}>
      {/* Top Centered Floating Navbar (No box around app, text logo) */}
      <CenteredTopNav />

      {/* Atmospheric Top Glow */}
      <div className={styles.glowBackground}></div>

      <div className={styles.container}>
        {/* Hero Section */}
        <section className={styles.heroBlock}>
          <span className={styles.badge}>About Pdyee AI</span>
          <h1 className={styles.title}>
            The Generative AI Studio<br />
            Built on Editable Layers
          </h1>
          <p className={styles.subtitle}>
            Traditional AI tools generate flat, uneditable pixels. Pdyee AI turns your prompts into live, non-destructive vector & text layers—so you generate once and edit forever.
          </p>
        </section>

        {/* Story Grid */}
        <section className={styles.grid}>
          <div className={styles.card}>
            <div className={styles.iconWrapper}>
              <Layers size={24} />
            </div>
            <h2 className={styles.cardTitle}>Why We Built Pdyee AI</h2>
            <p className={styles.cardDesc}>
              Every creator has faced the nightmare of traditional image generation: a typo in the headline or an off-center product forces you to regenerate the whole image, burning credits and losing your exact visual composition. Pdyee AI solves this at the core architecture level.
            </p>
          </div>

          <div className={styles.card}>
            <div className={styles.iconWrapper}>
              <Sparkles size={24} />
            </div>
            <h2 className={styles.cardTitle}>Layer-Based Decomposing</h2>
            <p className={styles.cardDesc}>
              Our AI engine automatically breaks generated visuals into individual semantic groups: editable text elements, hero subjects, backgrounds, shapes, and CTAs. You can select, move, resize, mask, and relight any layer independently.
            </p>
          </div>
        </section>

        {/* Product Pillars */}
        <section className={styles.comparisonBlock}>
          <h2 className={styles.comparisonTitle}>Built for Serious Work & Creative Freedom</h2>
          <p className={styles.comparisonDesc}>
            Combining the intelligence of state-of-the-art diffusion models with the precision of vector graphics engines.
          </p>

          <div className={styles.pillarsGrid}>
            <div className={styles.pillarItem}>
              <div className={styles.pillarNum}>01</div>
              <h3 className={styles.pillarTitle}>Text & Typography</h3>
              <p className={styles.pillarText}>
                No more warped AI lettering. Every headline, subheading, and CTA is a real editable text node with font controls.
              </p>
            </div>

            <div className={styles.pillarItem}>
              <div className={styles.pillarNum}>02</div>
              <h3 className={styles.pillarTitle}>Non-Destructive</h3>
              <p className={styles.pillarText}>
                Tweak colors, gradients, and backgrounds without touching your foreground subject or text hierarchy.
              </p>
            </div>

            <div className={styles.pillarItem}>
              <div className={styles.pillarNum}>03</div>
              <h3 className={styles.pillarTitle}>Print-Ready Export</h3>
              <p className={styles.pillarText}>
                CMYK-safe color mapping, 3mm bleed zones, trim marks, and 4K SVG/PDF output ready for commercial printing.
              </p>
            </div>

            <div className={styles.pillarItem}>
              <div className={styles.pillarNum}>04</div>
              <h3 className={styles.pillarTitle}>India-First Pricing</h3>
              <p className={styles.pillarText}>
                Genuinely useful free tier with high-value Pro (₹299/mo) and Max (₹799/mo) creator plans.
              </p>
            </div>
          </div>
        </section>

        {/* CTA Block */}
        <section className={styles.ctaBlock}>
          <h2 className={styles.ctaTitle}>Experience Layered AI Generation</h2>
          <p className={styles.ctaDesc}>
            Transform your creative workflow today. No more wasted tokens on simple typos.
          </p>
          <button className={styles.ctaBtn} onClick={() => navigate("/editor")}>
            Open Pdyee AI Studio
          </button>
        </section>
      </div>

      {/* Pengon Style Footer */}
      <Footer />
    </main>
  );
}
