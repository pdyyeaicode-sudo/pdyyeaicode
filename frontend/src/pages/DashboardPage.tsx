import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Menu, Search, Bell, Plus, UploadCloud, Type, Square, Sparkles, LayoutTemplate,
  Home, FolderOpen, User, MoreHorizontal, Image as ImageIcon, Play, FileText, Sun, Moon
} from 'lucide-react';
import styles from './DashboardPage.module.css';
import { Skeleton } from '@astryxdesign/core/Skeleton';

export default function DashboardPage(): JSX.Element {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('home');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate slow internet loading
    const timer = setTimeout(() => setIsLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`${styles.appContainer} ${!isDarkMode ? styles.lightMode : ''}`}>
      
      {/* DESKTOP SIDEBAR */}
      <aside className={styles.desktopSidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.avatar}></div>
          <span className={styles.userName}>User Workspace</span>
        </div>
        
        <button className={styles.createDesignBtn} onClick={() => navigate('/editor?new=1')}>
          <Plus size={18} /> Create a design
        </button>
        
        <nav className={styles.sidebarNav}>
           <div className={`${styles.sideItem} ${activeTab === 'home' ? styles.sideActive : ''}`} onClick={() => setActiveTab('home')}>
             <Home size={20} /> <span>Home</span>
           </div>
           <div className={`${styles.sideItem} ${activeTab === 'projects' ? styles.sideActive : ''}`} onClick={() => setActiveTab('projects')}>
             <FolderOpen size={20} /> <span>Projects</span>
           </div>
           <div className={`${styles.sideItem} ${activeTab === 'templates' ? styles.sideActive : ''}`} onClick={() => setActiveTab('templates')}>
             <LayoutTemplate size={20} /> <span>Templates</span>
           </div>
           <div className={`${styles.sideItem} ${activeTab === 'brand' ? styles.sideActive : ''}`} onClick={() => setActiveTab('brand')}>
             <Sparkles size={20} /> <span>Brand</span>
           </div>
           <div className={`${styles.sideItem} ${activeTab === 'apps' ? styles.sideActive : ''}`} onClick={() => setActiveTab('apps')}>
             <Menu size={20} /> <span>Apps</span>
           </div>
        </nav>
      </aside>

      {/* RIGHT WORKSPACE AREA */}
      <div className={styles.appRight}>
        {/* HEADER */}
      <header className={styles.appHeader}>
        <div className={styles.headerLeft}>
          <img src="/logo.png" alt="Logo" className={styles.headerLogo} />
        </div>
        <div className={styles.headerCenter}>
          <div className={styles.searchBar}>
            <Search size={16} className={styles.searchIcon} />
            <input type="text" placeholder="Search your content or Canva's" className={styles.searchInput} />
          </div>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.themeToggle} onClick={() => setIsDarkMode(!isDarkMode)}>
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <Bell size={20} color="var(--p-fg-1, #e0e0e0)" className={styles.bellIcon} />
          <div className={styles.avatar}></div>
        </div>
      </header>

      {/* SCROLLABLE MAIN CONTENT */}
      <main className={styles.appMain}>
        <div className={styles.mainContentWrapper}>
        
        {/* HERO CARD */}
        <section className={styles.heroSection}>
          <div className={styles.heroCard}>
            <h1 className={styles.heroHeadline}>Convert your Imagination into layers</h1>
            <p className={styles.heroSub}>Generate once. Instantly edit exactly the way you need.</p>
            <button className={styles.heroCta} onClick={() => navigate('/editor?new=1')}>
              Try it Now <Sparkles size={16} />
            </button>
          </div>
        </section>

        {/* QUICK ACTIONS ROW */}
        <section className={styles.quickActions}>
          <div className={styles.quickActionItem} onClick={() => navigate('/editor?new=1')}>
            <div className={`${styles.qaIcon} ${styles.qaAccent}`}><Plus size={24} /></div>
            <span>New design</span>
          </div>
          <div className={styles.quickActionItem} onClick={() => navigate('/editor?new=1')}>
            <div className={styles.qaIcon}><UploadCloud size={24} /></div>
            <span>Upload</span>
          </div>
          <div className={styles.quickActionItem} onClick={() => navigate('/editor?new=1')}>
            <div className={styles.qaIcon}><Type size={24} /></div>
            <span>Text</span>
          </div>
          <div className={styles.quickActionItem} onClick={() => navigate('/editor?new=1')}>
            <div className={styles.qaIcon}><Square size={24} /></div>
            <span>Shape</span>
          </div>
          <div className={styles.quickActionItem} onClick={() => navigate('/editor?new=1')}>
            <div className={styles.qaIcon}><Sparkles size={24} /></div>
            <span>AI create</span>
          </div>
          <div className={styles.quickActionItem} onClick={() => navigate('/editor?new=1')}>
            <div className={styles.qaIcon}><LayoutTemplate size={24} /></div>
            <span>Templates</span>
          </div>
        </section>

        {/* RECENT / CONTINUE SECTION */}
        <section className={styles.feedSection}>
          <h2 className={styles.feedTitle}>Recent designs</h2>
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
                  <div className={styles.rcImage} style={{ background: 'linear-gradient(45deg, #2b2b36, #1e1e24)' }}>
                     <ImageIcon size={32} opacity={0.3} color="#fff" />
                  </div>
                  <span className={styles.rcTitle}>Untitled Design</span>
                </div>
                <div className={styles.recentCard} onClick={() => navigate('/editor?new=1')}>
                  <div className={styles.rcImage} style={{ backgroundImage: 'url(/galaxy-login-bg.jpg)', backgroundSize: 'cover' }} />
                  <span className={styles.rcTitle}>Galaxy Scene</span>
                </div>
                <div className={styles.recentCard} onClick={() => navigate('/editor?new=1')}>
                  <div className={styles.rcImage} style={{ backgroundImage: 'url(/ui-screenshot.png)', backgroundSize: 'cover', backgroundPosition: 'left' }} />
                  <span className={styles.rcTitle}>UI Mockup</span>
                </div>
              </>
            )}
          </div>
        </section>

        <section className={styles.feedSection}>
          <h2 className={styles.feedTitle}>Recommended templates</h2>
          <div className={styles.templateScroll}>
             <div className={`${styles.templateCard} ${styles.tcInsta}`} onClick={() => navigate('/editor?new=1')}>
               <span className={styles.tcLabel}>Instagram Post</span>
             </div>
             <div className={`${styles.templateCard} ${styles.tcPres}`} onClick={() => navigate('/editor?new=1')}>
               <span className={styles.tcLabel}>Presentation</span>
             </div>
             <div className={`${styles.templateCard} ${styles.tcPoster}`} onClick={() => navigate('/editor?new=1')}>
               <span className={styles.tcLabel}>Poster</span>
             </div>
             <div className={`${styles.templateCard} ${styles.tcLogo}`} onClick={() => navigate('/editor?new=1')}>
               <span className={styles.tcLabel}>Logo</span>
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
          <div className={styles.createBtn}><Plus size={26} color="#fff" /></div>
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
