import CenteredTopNav from "../components/CenteredTopNav";
import Footer from "../components/Footer";
import styles from "./CmykSpecsPage.module.css";

export default function CmykSpecsPage(): JSX.Element {
  return (
    <main className={styles.page}>
      <CenteredTopNav />

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <span className={styles.badge}>Reference</span>
          <h1 className={styles.title}>CMYK Print Specs</h1>
          <p className={styles.updated}>What Pdyye's print export actually produces</p>
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.prose}>
          <p className={styles.intro}>
            Every Pdyye layer stack can be exported print-ready. This
            page documents exactly what that export contains, so you can
            hand it to a print shop without a back-and-forth.
          </p>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Plate 01</span>
            <h2 className={styles.blockTitle}>Color conversion</h2>
            <p className={styles.blockText}>
              Print exports are converted from RGB to CMYK at export time
              using an ISO Coated v2 profile, the standard for offset and
              digital commercial printing. On-screen colors may shift
              slightly to stay within the printable gamut; the editor
              flags any layer using an out-of-gamut color before export.
            </p>
            <div className={styles.specTable}>
              <div className={styles.specRow}>
                <span className={styles.specKey}>Color profile</span>
                <span className={styles.specVal}>ISO Coated v2 (ECI)</span>
              </div>
              <div className={styles.specRow}>
                <span className={styles.specKey}>Rendering intent</span>
                <span className={styles.specVal}>Relative colorimetric</span>
              </div>
            </div>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Plate 02</span>
            <h2 className={styles.blockTitle}>Resolution and bleed</h2>
            <p className={styles.blockText}>
              Raster layers export at print resolution rather than screen
              resolution, and every export includes a bleed margin so
              trimmed edges don't show a white sliver.
            </p>
            <div className={styles.specTable}>
              <div className={styles.specRow}>
                <span className={styles.specKey}>Raster resolution</span>
                <span className={styles.specVal}>300 DPI</span>
              </div>
              <div className={styles.specRow}>
                <span className={styles.specKey}>Bleed margin</span>
                <span className={styles.specVal}>3mm</span>
              </div>
              <div className={styles.specRow}>
                <span className={styles.specKey}>Safe area margin</span>
                <span className={styles.specVal}>5mm</span>
              </div>
            </div>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Plate 03</span>
            <h2 className={styles.blockTitle}>Trim marks</h2>
            <p className={styles.blockText}>
              Registration and trim marks are added automatically outside
              the bleed area on print exports, positioned the way a print
              shop expects them: four corner crop marks plus center
              marks on each edge for larger formats.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Plate 04</span>
            <h2 className={styles.blockTitle}>File formats</h2>
            <p className={styles.blockText}>
              Choose the export format based on where the file is going
              next. Vector layers stay editable in SVG and PDF; PNG
              flattens everything to pixels.
            </p>
            <div className={styles.specTable}>
              <div className={styles.specRow}>
                <span className={styles.specKey}>SVG</span>
                <span className={styles.specVal}>Vector, layers preserved</span>
              </div>
              <div className={styles.specRow}>
                <span className={styles.specKey}>PDF (print)</span>
                <span className={styles.specVal}>CMYK, bleed, trim marks</span>
              </div>
              <div className={styles.specRow}>
                <span className={styles.specKey}>PNG</span>
                <span className={styles.specVal}>Flattened, RGB, transparent bg optional</span>
              </div>
            </div>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Plate 05</span>
            <h2 className={styles.blockTitle}>Questions for your print shop</h2>
            <p className={styles.blockText}>
              This covers the export itself. Paper stock, spot colors,
              finishing (foil, embossing, die cuts), and exact trim
              dimensions are specific to your print run and should be
              confirmed directly with your printer before sending files.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Plate 06</span>
            <h2 className={styles.blockTitle}>Need something specific</h2>
            <p className={styles.blockText}>
              If your print run needs a color profile or bleed setting
              outside what's listed here, contact us at{" "}
              <a href="mailto:hello@pdyye.ai" className={styles.contactLink}>
                hello@pdyye.ai
              </a>{" "}
              and we'll help you get the right export settings.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}