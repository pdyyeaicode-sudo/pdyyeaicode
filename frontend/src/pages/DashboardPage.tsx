import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu, Search, Bell, Plus, UploadCloud, Type, Square, Sparkles, LayoutTemplate,
  Home, FolderOpen, User, Image as ImageIcon, Sun, Moon, ArrowRight
} from 'lucide-react';
import styles from './DashboardPage.module.css';
import { Skeleton } from '@astryxdesign/core/Skeleton';

export default function DashboardPage(): JSX.Element {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('home');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [prompt, setPrompt] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`${styles.appContainer} ${!isDarkMode ? styles.lightMode : ''}`}>

      {/* DESKTOP SIDEBAR */}
      <aside className={styles.desktopSidebar}>
        <div className={styles.brandRow}>
          <img src="/logo.png" alt="Pdyye logo mark" className={styles.sidebarLogo} />
          <span className={styles.brandWordmark}>Pdyye</span>
        </div>

        <div className={styles.sidebarHeader}>
          <div className={styles.avatar}></div>
          <span className={styles.userName}>User Workspace</span>
        </div>

        <button className={styles.createDesignBtn} onClick={() => navigate('/editor?new=1')}>
          <Plus size={18} /> Create a design
        </button>

        <span className={styles.navLabel}>Workspace</span>
        <nav className={styles.sidebarNav}>
          <div className={`${styles.sideItem} ${activeTab === 'home' ? styles.sideActive : ''}`} onClick={() => setActiveTab('home')}>
            <Home size={18} /> <span>Home</span>
          </div>
          <div className={`${styles.sideItem} ${activeTab === 'projects' ? styles.sideActive : ''}`} onClick={() => setActiveTab('projects')}>
            <FolderOpen size={18} /> <span>Projects</span>
          </div>
          <div className={`${styles.sideItem} ${activeTab === 'templates' ? styles.sideActive : ''}`} onClick={() => setActiveTab('templates')}>
            <LayoutTemplate size={18} /> <span>Templates</span>
          </div>
          <div className={`${styles.sideItem} ${activeTab === 'brand' ? styles.sideActive : ''}`} onClick={() => setActiveTab('brand')}>
            <Sparkles size={18} /> <span>Brand</span>
          </div>
          <div className={`${styles.sideItem} ${activeTab === 'apps' ? styles.sideActive : ''}`} onClick={() => setActiveTab('apps')}>
            <Menu size={18} /> <span>Apps</span>
          </div>
        </nav>
      </aside>

      {/* RIGHT WORKSPACE AREA */}
      <div className={styles.appRight}>
        <header className={styles.appHeader}>
          <div className={styles.headerLeft}>
            <img src="/logo.png" alt="Pdyye logo" className={styles.headerLogo} />
          </div>
          <div className={styles.headerCenter}>
            <div className={styles.searchBar}>
              <Search size={16} className={styles.searchIcon} />
              <input type="text" placeholder="Search your designs" className={styles.searchInput} />
            </div>
          </div>
          <div className={styles.headerRight}>
            <button className={styles.themeToggle} onClick={() => setIsDarkMode(!isDarkMode)}>
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <Bell size={20} className={styles.bellIcon} color="rgba(246, 242, 233, 0.6)" />
            <div className={styles.avatar}></div>
          </div>
        </header>

        <main className={styles.appMain}>
          <div className={styles.mainContentWrapper}>

            {/* JOB BAR. Prompt-first, the way the product actually works,
                instead of a gradient banner restating the homepage
                headline plus a six-icon tool-picker row. */}
            <section className={styles.jobBarSection}>
              <div className={styles.jobBar}>
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe what you want to create..."
                  className={styles.jobInput}
                />
                <div className={styles.jobActions}>
                  <button className={styles.jobIconBtn} title="Upload a reference" onClick={() => navigate('/editor?new=1')}>
                    <UploadCloud size={17} />
                  </button>
                  <button className={styles.jobIconBtn} title="Start with text" onClick={() => navigate('/editor?new=1')}>
                    <Type size={17} />
                  </button>
                  <button className={styles.jobIconBtn} title="Start with a shape" onClick={() => navigate('/editor?new=1')}>
                    <Square size={17} />
                  </button>
                  <button className={styles.jobGenerateBtn} onClick={() => navigate('/editor?new=1')}>
                    Generate <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </section>

            {/* RECENT / CONTINUE SECTION */}
            <section className={styles.feedSection}>
              <div className={styles.feedHeader}>
                <h2 className={styles.feedTitle}>Recent designs</h2>
                <span className={styles.feedCount}>{isLoading ? '' : '3 documents'}</span>
              </div>
              <div className={styles.recentGrid}>
                {isLoading ? (
                  <>
                    <div className={styles.recentCard} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <Skeleton style={{ width: "100%", height: "130px", borderRadius: "12px" }} />
                      <Skeleton style={{ width: "60%", height: "16px", borderRadius: "4px" }} />
                    </div>
                    <div className={styles.recentCard} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <Skeleton style={{ width: "100%", height: "130px", borderRadius: "12px" }} />
                      <Skeleton style={{ width: "70%", height: "16px", borderRadius: "4px" }} />
                    </div>
                    <div className={styles.recentCard} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <Skeleton style={{ width: "100%", height: "130px", borderRadius: "12px" }} />
                      <Skeleton style={{ width: "50%", height: "16px", borderRadius: "4px" }} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.recentCard} onClick={() => navigate('/editor?new=1')}>
                      <div className={styles.rcImage}>
                        <ImageIcon size={28} opacity={0.3} />
                      </div>
                      <span className={styles.rcTitle}>Untitled Design</span>
                      <span className={styles.rcMeta}>0 layers &middot; Draft</span>
                    </div>
                    <div className={styles.recentCard} onClick={() => navigate('/editor?new=1')}>
                      <div className={styles.rcImage} style={{ backgroundImage: 'url(/galaxy-login-bg.jpg)', backgroundSize: 'cover' }} />
                      <span className={styles.rcTitle}>Galaxy Scene</span>
                      <span className={styles.rcMeta}>4 layers &middot; SVG</span>
                    </div>
                    <div className={styles.recentCard} onClick={() => navigate('/editor?new=1')}>
                      <div className={styles.rcImage} style={{ backgroundImage: 'url(/ui-screenshot.png)', backgroundSize: 'cover', backgroundPosition: 'left' }} />
                      <span className={styles.rcTitle}>UI Mockup</span>
                      <span className={styles.rcMeta}>6 layers &middot; SVG</span>
                    </div>
                  </>
                )}
              </div>
            </section>

            <section className={styles.feedSection}>
              <h2 className={styles.feedTitle}>Recommended templates</h2>
              <div className={styles.templateScroll}>
                <div className={styles.templateCard} onClick={() => navigate('/editor?new=1')}>
                  <span className={styles.templateTag}>Square</span>
                  <span className={styles.templateLabel}>Instagram Post</span>
                </div>
                <div className={styles.templateCard} onClick={() => navigate('/editor?new=1')}>
                  <span className={styles.templateTag}>16:9</span>
                  <span className={styles.templateLabel}>Presentation</span>
                </div>
                <div className={styles.templateCard} onClick={() => navigate('/editor?new=1')}>
                  <span className={styles.templateTag}>A3 · CMYK</span>
                  <span className={styles.templateLabel}>Poster</span>
                </div>
                <div className={styles.templateCard} onClick={() => navigate('/editor?new=1')}>
                  <span className={styles.templateTag}>Vector</span>
                  <span className={styles.templateLabel}>Logo</span>
                </div>
              </div>
            </section>

          </div>
        </main>
      </div>

      {/* BOTTOM NAV (MOBILE ONLY) */}
      <nav className={styles.bottomNav}>
        <div className={`${styles.navItem} ${activeTab === 'home' ? styles.navActive : ''}`} onClick={() => setActiveTab('home')}>
          <Home size={22} />
          <span>Home</span>
        </div>
        <div className={`${styles.navItem} ${activeTab === 'projects' ? styles.navActive : ''}`} onClick={() => setActiveTab('projects')}>
          <FolderOpen size={22} />
          <span>Projects</span>
        </div>
        <div className={styles.navItemCreate} onClick={() => navigate('/editor?new=1')}>
          <div className={styles.createBtn}><Plus size={26} color="#0d0c0b" /></div>
        </div>
        <div className={`${styles.navItem} ${activeTab === 'templates' ? styles.navActive : ''}`} onClick={() => setActiveTab('templates')}>
          <LayoutTemplate size={22} />
          <span>Templates</span>
        </div>
        <div className={`${styles.navItem} ${activeTab === 'account' ? styles.navActive : ''}`} onClick={() => setActiveTab('account')}>
          <User size={22} />
          <span>Account</span>
        </div>
      </nav>

    </div>
  );
}