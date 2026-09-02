import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import styles from "./CenteredTopNav.module.css";

/**
 * Two behaviors beyond the basic floating nav:
 *
 * 1. Theme (onLight/onDark): tracked only on the home route, since
 *    that's the only page with a light hero at the top.
 * 2. Footer avoidance: the nav is position: fixed, so without this it
 *    sits on top of the footer's own links once you scroll to the
 *    bottom of any page. Watches for the page's <footer> via
 *    IntersectionObserver and fades the nav out (and disables its
 *    clicks) while the footer is on screen, since there is no page
 *    content left underneath it to navigate away from at that point.
 */
export default function CenteredTopNav(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/";
  const [onLight, setOnLight] = useState(isHome);
  const [nearFooter, setNearFooter] = useState(false);

  useEffect(() => {
    if (!isHome) {
      setOnLight(false);
      return;
    }

    setOnLight(window.scrollY < window.innerHeight * 0.72);

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setOnLight(window.scrollY < window.innerHeight * 0.72);
        ticking = false;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isHome]);

  useEffect(() => {
    setNearFooter(false);

    if (typeof IntersectionObserver === "undefined") return;

    // Footer mounts after this effect runs on route change, so poll
    // briefly for it instead of assuming it's already in the DOM.
    let observer: IntersectionObserver | null = null;
    let attempts = 0;

    const tryObserve = () => {
      const footer = document.querySelector("footer");
      if (footer) {
        observer = new IntersectionObserver(
          ([entry]) => setNearFooter(entry.isIntersecting),
          { rootMargin: "0px 0px -15% 0px" }
        );
        observer.observe(footer);
        return;
      }
      attempts += 1;
      if (attempts < 10) setTimeout(tryObserve, 150);
    };

    tryObserve();
    return () => observer?.disconnect();
  }, [location.pathname]);

  return (
    <nav
      className={`${styles.navWrapper} ${onLight ? styles.onLight : styles.onDark} ${nearFooter ? styles.hidden : ""}`}
      aria-hidden={nearFooter}
    >
      <div className={styles.navLinks}>
        <NavLink
          to="/about"
          tabIndex={nearFooter ? -1 : 0}
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
        >
          About
        </NavLink>
        <NavLink
          to="/pricing"
          tabIndex={nearFooter ? -1 : 0}
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
        >
          Pricing
        </NavLink>
      </div>
      <button
        className={styles.loginBtn}
        tabIndex={nearFooter ? -1 : 0}
        onClick={() => navigate("/login")}
      >
        Login
      </button>
    </nav>
  );
}