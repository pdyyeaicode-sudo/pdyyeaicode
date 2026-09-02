/* This page needs to be updated with the actual pricing and plan details. 
The grey text also needs to be updated to reflect the actual billing cycle 
and cancellation policy and any other legal statements.
*/

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";
import CenteredTopNav from "../components/CenteredTopNav";
import Footer from "../components/Footer";
import { useReveal } from "../hooks/useReveal";
import styles from "./PricingPage.module.css";

type PlanId = "starter" | "growth" | "enterprise";

interface Plan {
  id: PlanId;
  label: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  unit: string;
  note?: string;
  features: string[];
  cta: string;
  recommended?: boolean;
}

const PLANS: Plan[] = [
  {
    id: "starter",
    label: "Starter",
    monthlyPrice: 0,
    annualPrice: 0,
    unit: "/ forever",
    features: [
      "5 generations per day",
      "Vector layer export",
      "Standard resolution",
      "Community support",
    ],
    cta: "Start for free",
  },
  {
    id: "growth",
    label: "Growth",
    monthlyPrice: 299,
    annualPrice: 239,
    unit: "/ month",
    features: [
      "Unlimited generations",
      "Full layer editing",
      "4K CMYK print export",
      "Priority render queue",
      "Email support",
    ],
    cta: "Start Growth",
    recommended: true,
  },
  {
    id: "enterprise",
    label: "Enterprise",
    monthlyPrice: null,
    annualPrice: null,
    unit: "",
    note: "Custom pricing",
    features: [
      "Everything in Growth",
      "Team seats and roles",
      "Dedicated onboarding",
      "SLA and priority support",
    ],
    cta: "Talk to sales",
  },
];

export default function PricingPage(): JSX.Element {
  const navigate = useNavigate();
  const [isAnnual, setIsAnnual] = useState(true);
  const [checkoutPlan, setCheckoutPlan] = useState<Plan | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const handlePlanClick = (plan: Plan) => {
    if (plan.id === "starter") {
      navigate("/editor?new=1");
      return;
    }
    if (plan.id === "enterprise") {
      window.location.href = "mailto:hello@pdyye.ai?subject=Enterprise%20plan";
      return;
    }
    // Growth plan. Checkout provider wiring lives in src/lib/razorpay.ts
    // and is intentionally not called from here without confirming the
    // live keys and webhook are configured.
    setCheckoutPlan(plan);
  };

  const confirmCheckout = () => {
    setCheckoutPlan(null);
    setShowSuccess(true);
  };

  const cards = useReveal<HTMLDivElement>();

  return (
    <main className={styles.pricingPage}>
      <CenteredTopNav />
      <div className={styles.inkBleed} aria-hidden="true" />

      <div className={styles.container}>
        <section className={styles.heroBlock}>
          <span className={styles.eyebrow}>Pricing</span>
          <h1 className={styles.title}>Plans that scale with what you make.</h1>
          <p className={styles.subtitle}>
            Start free. Upgrade when you need unlimited generations and
            print-ready export.
          </p>
        </section>

        <div className={styles.billingToggleWrapper}>
          <button
            type="button"
            className={`${styles.toggleLabel} ${!isAnnual ? styles.toggleLabelActive : ""}`}
            onClick={() => setIsAnnual(false)}
          >
            Monthly
          </button>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={isAnnual}
              onChange={(e) => setIsAnnual(e.target.checked)}
            />
            <span className={styles.slider} />
          </label>
          <button
            type="button"
            className={`${styles.toggleLabel} ${isAnnual ? styles.toggleLabelActive : ""}`}
            onClick={() => setIsAnnual(true)}
          >
            Annual
          </button>
          <span className={styles.saveBadge}>Save 20%</span>
        </div>

        <section ref={cards.ref} className={styles.cardsRow}>
          {PLANS.map((plan) => {
            const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;
            return (
              <div
                key={plan.id}
                className={`${styles.card} ${plan.recommended ? styles.cardRecommended : ""} ${cards.inView ? styles.inView : ""}`}
              >
                {plan.recommended && (
                  <span className={styles.recommendedTag}>Recommended</span>
                )}

                <div>
                  <p className={styles.planLabel}>{plan.label}</p>

                  <div className={styles.priceRow}>
                    {price !== null ? (
                      <>
                        <span className={styles.priceNum}>
                          {price === 0 ? "\u20b90" : `\u20b9${price}`}
                        </span>
                        <span className={styles.priceUnit}>{plan.unit}</span>
                      </>
                    ) : (
                      <span className={styles.priceNum} style={{ fontSize: 32 }}>
                        Custom
                      </span>
                    )}
                  </div>
                  {plan.note && <p className={styles.planNote}>{plan.note}</p>}

                  <hr className={styles.divider} />

                  <ul className={styles.featureList}>
                    {plan.features.map((feature) => (
                      <li key={feature} className={styles.featureItem}>
                        <Check size={15} className={styles.checkIcon} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  className={plan.recommended ? styles.buttonPrimary : styles.buttonSecondary}
                  onClick={() => handlePlanClick(plan)}
                >
                  {plan.cta}
                </button>
              </div>
            );
          })}
        </section>

        <p className={styles.closingNote}>
          Prices shown in INR. 
        </p>
      </div>

      {checkoutPlan && (
        <div className={styles.modalOverlay} onClick={() => setCheckoutPlan(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalIcon}>
              <Check size={22} />
            </div>
            <h2 className={styles.modalTitle}>Confirm {checkoutPlan.label}</h2>
            <p className={styles.modalDesc}>
              You are about to start the {checkoutPlan.label} plan at{" "}
              {isAnnual ? checkoutPlan.annualPrice : checkoutPlan.monthlyPrice}{" "}
              rupees {isAnnual ? "a month, billed annually" : "a month"}.
            </p>
            <button className={styles.modalClose} onClick={confirmCheckout}>
              Continue to payment
            </button>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className={styles.modalOverlay} onClick={() => setShowSuccess(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button
              aria-label="Close"
              onClick={() => setShowSuccess(false)}
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                background: "none",
                border: "none",
                color: "var(--muted)",
                cursor: "pointer",
              }}
            >
              <X size={18} />
            </button>
            <div className={styles.modalIcon}>
              <Check size={22} />
            </div>
            <h2 className={styles.modalTitle}>You are all set</h2>
            <p className={styles.modalDesc}>
              Your plan is active. Head to the studio to keep working.
            </p>
            <button className={styles.modalClose} onClick={() => navigate("/editor")}>
              Open studio
            </button>
          </div>
        </div>
      )}

      <Footer />
    </main>
  );
}