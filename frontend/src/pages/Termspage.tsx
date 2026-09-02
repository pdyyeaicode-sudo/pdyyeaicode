import CenteredTopNav from "../components/CenteredTopNav";
import Footer from "../components/Footer";
import styles from "./TermsPage.module.css";

export default function TermsPage(): JSX.Element {
  return (
    <main className={styles.page}>
      <CenteredTopNav />

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <span className={styles.badge}>Legal</span>
          <h1 className={styles.title}>Terms of Service</h1>
          <p className={styles.updated}>Last updated: August 30, 2026</p>
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.prose}>
          <p className={styles.intro}>
            These terms govern your use of Pdyye, including pdyye.ai and
            the Pdyye Studio editor. By creating an account or using the
            product, you agree to these terms.
          </p>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Section 01</span>
            <h2 className={styles.blockTitle}>Accounts and eligibility</h2>
            <p className={styles.blockText}>
              You must be at least 18 years old, or the age of legal
              majority in your jurisdiction, to create a Pdyye account.
              You are responsible for keeping your account credentials
              secure and for all activity under your account.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Section 02</span>
            <h2 className={styles.blockTitle}>Plans and billing</h2>
            <p className={styles.blockText}>
              Pdyye offers a free Starter plan and paid Growth and
              Enterprise plans. Paid plans are billed monthly or annually
              in advance through our payment processor. Prices are shown
              in INR. You can cancel a paid plan at any time; access
              continues through the end of the current billing period,
              and we do not provide partial refunds for unused time
              except where required by law.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Section 03</span>
            <h2 className={styles.blockTitle}>Acceptable use</h2>
            <p className={styles.blockText}>
              You agree not to use Pdyye to generate, upload, or
              distribute content that is illegal, infringes on someone
              else's rights, or that depicts child sexual abuse, exploits
              minors, promotes violence or hatred, or is intended to
              deceive or harass others. We may suspend or terminate
              accounts that violate this policy.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Section 04</span>
            <h2 className={styles.blockTitle}>Your content</h2>
            <p className={styles.blockText}>
              You retain ownership of the prompts you write and the
              images and layers you generate or upload. By using Pdyye,
              you grant us a limited license to store, process, and
              display that content solely to provide and improve the
              service. You are responsible for having the necessary
              rights to any reference images you upload.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Section 05</span>
            <h2 className={styles.blockTitle}>Our intellectual property</h2>
            <p className={styles.blockText}>
              Pdyye's brand, product design, and underlying software are
              owned by Pdyye Studio. These terms do not grant you rights
              to our trademarks, logos, or source code beyond what is
              needed to use the product as intended.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Section 06</span>
            <h2 className={styles.blockTitle}>Third-party services</h2>
            <p className={styles.blockText}>
              Pdyye relies on third-party providers for authentication,
              payments, and hosting. Your use of those features is also
              subject to the applicable third party's own terms.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Section 07</span>
            <h2 className={styles.blockTitle}>Termination</h2>
            <p className={styles.blockText}>
              You may stop using Pdyye and delete your account at any
              time. We may suspend or terminate accounts that violate
              these terms, with notice where practical. Sections that by
              their nature should survive termination, including
              ownership, liability, and governing law, will continue to
              apply.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Section 08</span>
            <h2 className={styles.blockTitle}>Disclaimers and liability</h2>
            <p className={styles.blockText}>
              Pdyye is provided on an as-is basis without warranties of
              any kind. AI-generated output can be inaccurate or
              unexpected, and you are responsible for reviewing content
              before relying on it or publishing it. To the maximum
              extent permitted by law, Pdyye is not liable for indirect
              or consequential damages arising from your use of the
              service.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Section 09</span>
            <h2 className={styles.blockTitle}>Governing law</h2>
            <p className={styles.blockText}>
              These terms are governed by the laws of India, and any
              disputes will be subject to the exclusive jurisdiction of
              the courts located in India, without regard to conflict of
              law principles.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Section 10</span>
            <h2 className={styles.blockTitle}>Changes to these terms</h2>
            <p className={styles.blockText}>
              We may update these terms from time to time. Material
              changes will be announced in the product or by email before
              they take effect. Continuing to use Pdyye after a change
              takes effect means you accept the updated terms.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Section 11</span>
            <h2 className={styles.blockTitle}>Contact us</h2>
            <p className={styles.blockText}>
              Questions about these terms can be sent to{" "}
              <a href="mailto:hello@pdyye.ai" className={styles.contactLink}>
                hello@pdyye.ai
              </a>.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}