import { useNavigate, useLocation } from "react-router-dom";
import { useUser, UserButton } from "@clerk/react";
import styles from "./CenteredTopNav.module.css";

export default function CenteredTopNav(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSignedIn } = useUser();

  const handleNavClick = (path: string, hash?: string) => {
    if (location.pathname === "/" && hash) {
      const element = document.getElementById(hash);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }
    navigate(path);
  };

  return (
    <header className={styles.navWrapper}>
      <nav className={styles.navContainer} aria-label="Main Navigation">
        <button
          type="button"
          className={`${styles.navLink} ${location.pathname === "/about" ? styles.activeLink : ""}`}
          onClick={() => handleNavClick("/about", "about")}
        >
          About
        </button>

        <button
          type="button"
          className={`${styles.navLink} ${location.pathname === "/pricing" ? styles.activeLink : ""}`}
          onClick={() => handleNavClick("/pricing")}
        >
          Pricing
        </button>

        <button
          type="button"
          className={styles.navLink}
          onClick={() => handleNavClick("/", "showcase")}
        >
          Features
        </button>

        {!isSignedIn ? (
          <button
            type="button"
            className={styles.loginBtn}
            onClick={() => navigate("/login")}
          >
            Login
          </button>
        ) : (
          <div className={styles.userButtonContainer}>
            <button
              type="button"
              className={styles.studioBtn}
              onClick={() => navigate("/editor")}
            >
              Studio
            </button>
            <UserButton />
          </div>
        )}
      </nav>
    </header>
  );
}
