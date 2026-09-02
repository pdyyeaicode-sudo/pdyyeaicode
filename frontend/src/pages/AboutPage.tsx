import { useNavigate } from "react-router-dom";
import { Layers, Sparkles } from "lucide-react";
import CenteredTopNav from "../components/CenteredTopNav";
import Footer from "../components/Footer";
import { useReveal } from "../hooks/useReveal";
import styles from "./AboutPage.module.css";

export default function AboutPage(): JSX.Element {
  const navigate = useNavigate();
  const story = useReveal<HTMLDivElement>();
  const pillars = useReveal<HTMLDivElement>();
  const cta = useReveal<HTMLDivElement>();

  return (
    <main className={styles.page}>
      <CenteredTopNav />

      {/* HERO */}
      <section className={styles.hero}>
        <div className={`${styles.heroInner} ${styles.regMark}`}>
          <img src="/logo.png" alt="Pdyye logo mark" className={styles.logoMark} />
          <span className={styles.badge}>About</span>
          <h1 className={styles.title}>
            A print studio,<br />
            running on <span className={styles.serifItalic}>AI</span>.
          </h1>
          <p className={styles.subtitle}>
            Pdyye turns a prompt into layers you can actually edit, not
            pixels you have to regenerate.
          </p>
        </div>
      </section>

      {/* STORY. Same badge-heading-grid rhythm and card chrome as the
          Welcome page's Product Gallery, so this reads as the same site. */}
      <section className={styles.storySection}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionBadge}>Why Pdyye</span>
          <h2 className={styles.sectionTitle}>Built so a fix stays a fix.</h2>
          <p className={styles.sectionSubtitle}>
            A typo in the headline used to mean regenerating the whole
            image and losing the composition you had. Pdyye keeps every
            layer separate from the start.
          </p>
        </div>

        <div
          ref={story.ref}
          className={`${styles.cardGrid} ${styles.scrollReveal} ${story.inView ? styles.inView : ""}`}
        >
          <div className={styles.card}>
            <div className={styles.cardIcon}>
              <Layers size={20} />
            </div>
            <h3 className={styles.cardTitle}>Separated from the start</h3>
            <p className={styles.cardDesc}>
              Every generated image splits into text, subject, and
              background the moment it's made. Nothing has to be
              regenerated to change one part of it.
            </p>
          </div>

          <div className={styles.card}>
            <div className={styles.cardIcon}>
              <Sparkles size={20} />
            </div>
            <h3 className={styles.cardTitle}>Edit any layer on its own</h3>
            <p className={styles.cardDesc}>
              Change the headline, adjust a color, or swap the backdrop.
              Each layer moves independently of the rest.
            </p>
          </div>
        </div>
      </section>

      {/* PILLARS */}
      <section className={styles.pillarsSection}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionBadge}>Production spec</span>
          <h2 className={styles.sectionTitle}>Built for serious work.</h2>
          <p className={styles.sectionSubtitle}>
            Diffusion models generate the image. A vector engine handles
            the parts you still need to touch.
          </p>
        </div>

        <div
          ref={pillars.ref}
          className={`${styles.pillarsGrid} ${styles.scrollReveal} ${pillars.inView ? styles.inView : ""}`}
        >
          <div className={styles.card}>
            <div className={styles.pillarPlate}>PLATE 01 · TEXT</div>
            <h3 className={styles.cardTitle}>Real typography</h3>
            <p className={styles.cardDesc}>
              Every headline is an editable text node with font controls.
            </p>
          </div>

          <div className={styles.card}>
            <div className={styles.pillarPlate}>PLATE 02 · SHAPE</div>
            <h3 className={styles.cardTitle}>Non-destructive</h3>
            <p className={styles.cardDesc}>
              Adjust color and background without touching your subject.
            </p>
          </div>

          <div className={styles.card}>
            <div className={styles.pillarPlate}>PLATE 03 · PRESS</div>
            <h3 className={styles.cardTitle}>Print-ready export</h3>
            <p className={styles.cardDesc}>
              CMYK-safe color, bleed, and trim marks on every export.
            </p>
          </div>

          <div className={styles.card}>
            <div className={styles.pillarPlate}>PLATE 04 · ACCESS</div>
            <h3 className={styles.cardTitle}>India-first pricing</h3>
            <p className={styles.cardDesc}>
              A real free tier, with Starter, Growth, and Enterprise plans.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className={styles.ctaSection}>
        <div
          ref={cta.ref}
          className={`${styles.ctaInner} ${styles.scrollReveal} ${cta.inView ? styles.inView : ""}`}
        >
          <h2 className={styles.ctaTitle}>See it for yourself</h2>
          <p className={styles.ctaDesc}>
            Generate an image, then edit exactly the part you meant to.
          </p>
          <button className={styles.ctaBtn} onClick={() => navigate("/editor")}>
            Open Pdyye
          </button>
        </div>
      </section>

      <Footer />
    </main>
  );
}