import CenteredTopNav from "../components/CenteredTopNav";
import Footer from "../components/Footer";
import styles from "./DpaPage.module.css";

export default function DpaPage(): JSX.Element {
  return (
    <main className={styles.page}>
      <CenteredTopNav />

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <span className={styles.badge}>Legal</span>
          <h1 className={styles.title}>Data Processing Agreement</h1>
          <p className={styles.updated}>For Enterprise customers</p>
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.prose}>
          <p className={styles.intro}>
            A Data Processing Agreement, or DPA, is a contract that sets
            out how Pdyye handles personal data on behalf of an
            organization using our Enterprise plan. Because a DPA needs
            to reflect each customer's specific processing details and
            jurisdiction, we don't publish a one-size-fits-all version
            here. It's issued directly to Enterprise customers as part
            of onboarding.
          </p>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Who needs one</span>
            <h2 className={styles.blockTitle}>Enterprise teams handling regulated data</h2>
            <p className={styles.blockText}>
              If your organization is subject to GDPR, India's Digital
              Personal Data Protection Act, or a similar framework, and
              you plan to have your team process personal data through
              Pdyye, a signed DPA is typically required before rollout.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>What it covers</span>
            <h2 className={styles.blockTitle}>Standard clauses, your details</h2>
            <p className={styles.blockText}>
              Our DPA is built on standard contractual clauses covering
              the scope of processing, sub-processors we use, security
              commitments, and data subject rights handling, filled in
              with your organization's specific details and countersigned
              on both sides.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.sectionLabel}>How to get one</span>
            <h2 className={styles.blockTitle}>Request through Enterprise onboarding</h2>
            <p className={styles.blockText}>
              Reach out to{" "}
              <a href="mailto:hello@pdyye.ai" className={styles.contactLink}>
                hello@pdyye.ai
              </a>{" "}
              with your organization name and jurisdiction, and we'll send
              a draft DPA as part of setting up your Enterprise plan.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}