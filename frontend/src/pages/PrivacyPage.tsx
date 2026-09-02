import CenteredTopNav from "../components/CenteredTopNav";
import Footer from "../components/Footer";
import styles from "./PrivacyPage.module.css";

export default function PrivacyPage(): JSX.Element {
  return (
    <main className={styles.page}>
      <CenteredTopNav />

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <span className={styles.badge}>Legal</span>
          <h1 className={styles.title}>Privacy Policy</h1>
          <p className={styles.updated}>Last updated: August 30, 2026</p>
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.prose}>
          <p className={styles.intro}>
            This policy explains what information Pdyye collects, how it is
            used, and the choices you have. Pdyye is a generative image
            tool that turns prompts into editable vector and text layers,
            and this policy covers pdyye.ai and the Pdyye Studio editor.
          </p>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Section 01</span>
            <h2 className={styles.blockTitle}>Information we collect</h2>
            <p className={styles.blockText}>
              We collect information you provide directly, information
              generated through your use of the product, and limited
              technical data needed to operate the service.
            </p>
            <ul className={styles.blockList}>
              <li>Account details: name, email address, and authentication data handled through our sign-in provider.</li>
              <li>Content you create: prompts, generated images, uploaded reference files, and edits made in the layer editor.</li>
              <li>Billing information: plan and billing history. Card details are handled directly by our payment processor; we do not store full card numbers.</li>
              <li>Usage data: pages visited, features used, and basic device and browser information collected automatically.</li>
            </ul>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Section 02</span>
            <h2 className={styles.blockTitle}>How we use this information</h2>
            <p className={styles.blockText}>
              We use your information to provide and improve the editor,
              process generations, process payments, respond to support
              requests, and communicate service updates. We do not sell
              your personal information.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Section 03</span>
            <h2 className={styles.blockTitle}>Your generations and prompts</h2>
            <p className={styles.blockText}>
              Prompts and generated content are yours. We do not use
              private prompts or generations from paid plans to train
              underlying models without your explicit consent. Content on
              free-tier plans may be used to improve generation quality
              unless you opt out in account settings; details are provided
              at signup.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Section 04</span>
            <h2 className={styles.blockTitle}>Sharing and disclosure</h2>
            <p className={styles.blockText}>
              We share information with service providers who help us
              operate Pdyye, including authentication, payment processing,
              and cloud hosting providers, each bound by their own data
              protection obligations. We may also disclose information if
              required by law or to protect the rights and safety of
              Pdyye and its users.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Section 05</span>
            <h2 className={styles.blockTitle}>Data retention</h2>
            <p className={styles.blockText}>
              We retain account and content data for as long as your
              account is active. If you delete your account, we delete or
              anonymize your personal data within a reasonable period,
              except where retention is required for legal, billing, or
              security purposes.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Section 06</span>
            <h2 className={styles.blockTitle}>Your rights</h2>
            <p className={styles.blockText}>
              Depending on where you live, you may have rights to access,
              correct, export, or delete your personal data, including
              rights under India's Digital Personal Data Protection Act
              and, where applicable, the EU General Data Protection
              Regulation. You can exercise most of these directly from
              account settings, or by contacting us.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Section 07</span>
            <h2 className={styles.blockTitle}>Cookies</h2>
            <p className={styles.blockText}>
              We use cookies and similar technologies to keep you signed
              in, remember preferences, and understand how the product is
              used. You can control cookies through your browser settings.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Section 08</span>
            <h2 className={styles.blockTitle}>Children's privacy</h2>
            <p className={styles.blockText}>
              Pdyye is not directed at children, and we do not knowingly
              collect personal information from anyone under the age of
              18. If you believe a child has provided us with personal
              information, contact us and we will remove it.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Section 09</span>
            <h2 className={styles.blockTitle}>International transfers</h2>
            <p className={styles.blockText}>
              Pdyye is operated from India and may process data using
              service providers located in other countries. Where we
              transfer personal data internationally, we take steps to
              keep it protected consistent with this policy.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Section 10</span>
            <h2 className={styles.blockTitle}>Security</h2>
            <p className={styles.blockText}>
              We use industry-standard technical and organizational
              measures to protect your information. No method of
              transmission or storage is completely secure, and we cannot
              guarantee absolute security.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Section 11</span>
            <h2 className={styles.blockTitle}>Changes to this policy</h2>
            <p className={styles.blockText}>
              We may update this policy from time to time. Material
              changes will be announced in the product or by email before
              they take effect.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Section 12</span>
            <h2 className={styles.blockTitle}>Contact us</h2>
            <p className={styles.blockText}>
              Questions about this policy or your data can be sent to{" "}
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