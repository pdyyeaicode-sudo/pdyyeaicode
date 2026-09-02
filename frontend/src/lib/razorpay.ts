/**
 * Razorpay Integration Helper
 * Uses credentials from Razorpay Credit.txt
 */

const RAZORPAY_KEY_ID = "rzp_test_pyvRKb9k1Kl6rP";

export interface CheckoutOptions {
  planName: "Pro" | "Max";
  billingCycle: "monthly" | "annual";
  amountInPaise: number;
  userEmail?: string;
  onSuccess: (paymentId: string) => void;
  onFailure?: (error: any) => void;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

/**
 * Dynamically loads the Razorpay checkout script if not already present.
 */
export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Triggers Razorpay Checkout modal for Pdyye AI plan upgrade.
 */
export async function openRazorpayCheckout(options: CheckoutOptions): Promise<void> {
  const isLoaded = await loadRazorpayScript();
  if (!isLoaded) {
    alert("Failed to load Razorpay SDK. Please check your internet connection.");
    return;
  }

  const rzpOptions = {
    key: RAZORPAY_KEY_ID,
    amount: options.amountInPaise, // e.g. 29900 paise = ₹299
    currency: "INR",
    name: "Pdyye AI",
    description: `Upgrade to Pdyye ${options.planName} (${options.billingCycle})`,
    image: "/logo.png",
    handler: function (response: { razorpay_payment_id: string }) {
      // Save subscription info in localStorage
      localStorage.setItem("Pdyye_user_plan", options.planName);
      localStorage.setItem("Pdyye_user_billing", options.billingCycle);
      localStorage.setItem("Pdyye_user_logged_in", "true");
      options.onSuccess(response.razorpay_payment_id);
    },
    prefill: {
      email: options.userEmail || "",
    },
    theme: {
      color: "#000000", // Figma black primary
    },
    modal: {
      ondismiss: function () {
        console.log("Razorpay checkout modal closed by user.");
      },
    },
  };

  const rzp = new window.Razorpay(rzpOptions);
  rzp.open();
}
