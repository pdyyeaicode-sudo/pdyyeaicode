import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ShieldCheck } from "lucide-react";
import { openRazorpayCheckout } from "../lib/razorpay";
import CenteredTopNav from "../components/CenteredTopNav";
import Footer from "../components/Footer";
import styles from "./PricingPage.module.css";

export default function PricingPage(): JSX.Element {
  const navigate = useNavigate();
  const [isAnnual, setIsAnnual] = useState(false);
  const [activePlan, setActivePlan] = useState<string | null>(
    localStorage.getItem("pdyee_user_plan") || null
  );
  const [paymentSuccess, setPaymentSuccess] = useState<{
    plan: string;
    paymentId: string;
  } | null>(null);

  const handleSelectPlan = async (planName: "Pro" | "Max") => {
    let amountInPaise = 0;
    if (planName === "Pro") {
      amountInPaise = isAnnual ? 249900 : 29900; // ₹2,499 or ₹299
    } else if (planName === "Max") {
      amountInPaise = isAnnual ? 699900 : 79900; // ₹6,999 or ₹799
    }

    await openRazorpayCheckout({
      planName,
      billingCycle: isAnnual ? "annual" : "monthly",
      amountInPaise,
      onSuccess: (paymentId) => {
        setActivePlan(planName);
        setPaymentSuccess({ plan: planName, paymentId });
      },
      onFailure: (err) => {
        console.error("Payment failed:", err);
      },
    });
  };

  return (
    <main className={styles.page}>
      {/* Top Centered Floating Navbar (No box around app, text logo) */}
      <CenteredTopNav />

      <div className={styles.container}>

        {/* Hero Section */}
        <div className={styles.heroBlock}>
          <h1 className={styles.title}>
            Smart pricing for<br />
            every stage
          </h1>
          <p className={styles.subtitle}>
            Find the perfect balance of features, performance, and affordability.
          </p>
        </div>

        {/* Billing Cycle Toggle */}
        <div className={styles.billingToggleWrapper}>
          <span
            className={`${styles.toggleLabel} ${!isAnnual ? styles.toggleLabelActive : ""}`}
            onClick={() => setIsAnnual(false)}
          >
            Monthly Billing
          </span>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={isAnnual}
              onChange={(e) => setIsAnnual(e.target.checked)}
            />
            <span className={styles.slider}></span>
          </label>
          <span
            className={`${styles.toggleLabel} ${isAnnual ? styles.toggleLabelActive : ""}`}
            onClick={() => setIsAnnual(true)}
          >
            Annual Billing <span className={styles.saveBadge}>Save ~30%</span>
          </span>
        </div>

        {/* 3 Equal Pricing Cards (India 3-Tier Positioning) */}
        <div className={styles.cardsRow}>
          {/* FREE PLAN */}
          <div className={`${styles.card} ${styles.cardStarter}`}>
            <div className={styles.cardHeader}>
              <h3 className={styles.planLabel}>Free</h3>
              <div className={styles.priceRow}>
                <span className={styles.priceNum}>₹0</span>
                <span className={styles.priceUnit}>/month</span>
              </div>
            </div>

            <div>
              <div className={styles.dividerArea}>
                <div className={styles.dividerLine}></div>
                <span className={styles.dividerText}>Features</span>
              </div>

              <ul className={styles.featureList}>
                <li className={styles.featureItem}>
                  <Check className={styles.checkIcon} size={13} /> 30 AI credits/month
                </li>
                <li className={styles.featureItem}>
                  <Check className={styles.checkIcon} size={13} /> Ads enabled
                </li>
                <li className={styles.featureItem}>
                  <Check className={styles.checkIcon} size={13} /> Basic edit tools (bg remove, object remove, expand, relight)
                </li>
                <li className={styles.featureItem}>
                  <Check className={styles.checkIcon} size={13} /> Layer selection on AI-generated images
                </li>
                <li className={styles.featureItem}>
                  <Check className={styles.checkIcon} size={13} /> Normal export quality
                </li>
              </ul>

              <button
                className={styles.buttonSecondary}
                onClick={() => navigate("/editor")}
              >
                Get Started
              </button>
            </div>
          </div>

          {/* PRO PLAN (MAIN MONEY MAKER) */}
          <div className={`${styles.card} ${styles.cardGrowth}`}>
            <div className={styles.cardHeader}>
              <h3 className={styles.planLabel}>Pro</h3>
              <div className={styles.priceRow}>
                <span className={styles.priceNum}>
                  {isAnnual ? "₹2,499" : "₹299"}
                </span>
                <span className={styles.priceUnit}>
                  {isAnnual ? "/year" : "/month"}
                </span>
              </div>
            </div>

            <div>
              <div className={styles.dividerArea}>
                <div className={styles.dividerLine}></div>
                <span className={styles.dividerText}>Features</span>
              </div>

              <ul className={styles.featureList}>
                <li className={styles.featureItem}>
                  <Check className={styles.checkIcon} size={13} /> 400 AI credits/month
                </li>
                <li className={styles.featureItem}>
                  <Check className={styles.checkIcon} size={13} /> No ads & HD exports
                </li>
                <li className={styles.featureItem}>
                  <Check className={styles.checkIcon} size={13} /> Full non-destructive layer editing
                </li>
                <li className={styles.featureItem}>
                  <Check className={styles.checkIcon} size={13} /> Select, move, mask, and relight layers
                </li>
                <li className={styles.featureItem}>
                  <Check className={styles.checkIcon} size={13} /> Edit history / undo timeline
                </li>
                <li className={styles.featureItem}>
                  <Check className={styles.checkIcon} size={13} /> Faster queue & more models
                </li>
                <li className={styles.featureItem}>
                  <Check className={styles.checkIcon} size={13} /> Remove watermark & batch edit
                </li>
              </ul>

              <button
                className={styles.buttonPrimary}
                onClick={() => handleSelectPlan("Pro")}
              >
                {activePlan === "Pro" ? "Current Plan" : "Get Started"}
              </button>
            </div>
          </div>

          {/* MAX PLAN (POWER USERS & CREATORS) */}
          <div className={`${styles.card} ${styles.cardEnterprise}`}>
            <div className={styles.cardHeader}>
              <h3 className={styles.planLabel}>Max</h3>
              <div className={styles.priceRow}>
                <span className={styles.priceNum}>
                  {isAnnual ? "₹6,999" : "₹799"}
                </span>
                <span className={styles.priceUnit}>
                  {isAnnual ? "/year" : "/month"}
                </span>
              </div>
            </div>

            <div>
              <div className={styles.dividerArea}>
                <div className={styles.dividerLine}></div>
                <span className={styles.dividerText}>Features</span>
              </div>

              <ul className={styles.featureList}>
                <li className={styles.featureItem}>
                  <Check className={styles.checkIcon} size={13} /> 1,500 AI credits/month
                </li>
                <li className={styles.featureItem}>
                  <Check className={styles.checkIcon} size={13} /> Priority generation & fastest queue
                </li>
                <li className={styles.featureItem}>
                  <Check className={styles.checkIcon} size={13} /> 4K export quality
                </li>
                <li className={styles.featureItem}>
                  <Check className={styles.checkIcon} size={13} /> Unlimited layer editing & advanced inpainting
                </li>
                <li className={styles.featureItem}>
                  <Check className={styles.checkIcon} size={13} /> Batch workflow & brand presets
                </li>
                <li className={styles.featureItem}>
                  <Check className={styles.checkIcon} size={13} /> Commercial use & team workspace
                </li>
              </ul>

              <button
                className={styles.buttonSecondary}
                onClick={() => handleSelectPlan("Max")}
              >
                {activePlan === "Max" ? "Current Plan" : "Get Started"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      {paymentSuccess && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalIcon}>
              <ShieldCheck size={32} />
            </div>
            <h3 className={styles.modalTitle}>Upgrade Successful!</h3>
            <p className={styles.modalDesc}>
              Welcome to <strong>Pdyee {paymentSuccess.plan}</strong>. Your account has been upgraded with full access.
            </p>
            <p style={{ fontSize: "0.8rem", color: "#71717a", marginBottom: "1.5rem" }}>
              Payment ID: {paymentSuccess.paymentId}
            </p>
            <button
              className={styles.buttonPrimary}
              onClick={() => {
                setPaymentSuccess(null);
                navigate("/editor");
              }}
            >
              Start Designing in Studio
            </button>
          </div>
        </div>
      )}

      {/* Pengon Style Footer */}
      <Footer />
    </main>
  );
}
